import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { db } from "@/lib/db";

interface SessionUser {
  userId: string;
  email: string | null;
}

export interface HouseholdInfo {
  householdId: string;
  householdName: string;
  inviteCode: string;
  role: string;
  memberCount: number;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function getSessionUser(session: Session | null): SessionUser | null {
  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  const userId = user?.id ?? user?.email;
  return userId ? { userId, email: user?.email ?? null } : null;
}

export async function ensureHouseholdSchema() {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS households (
            household_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            invite_code TEXT NOT NULL UNIQUE,
            created_by_user_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
  });

  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS household_members (
            household_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_email TEXT,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (household_id, user_id)
          )`,
  });

  await db.execute({
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id)`,
  });

  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS shopping_list_items (
            household_id TEXT NOT NULL,
            item_code TEXT NOT NULL,
            item_name TEXT,
            item_price REAL,
            quantity INTEGER DEFAULT 1,
            checked INTEGER DEFAULT 0,
            added_by_user_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (household_id, item_code)
          )`,
  });

  await db.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_shopping_list_items_household ON shopping_list_items(household_id, created_at)`,
  });
}

async function getHouseholdByUserId(userId: string): Promise<HouseholdInfo | null> {
  const result = await db.execute({
    sql: `SELECT h.household_id, h.name, h.invite_code, hm.role,
                 (SELECT COUNT(*) FROM household_members member WHERE member.household_id = h.household_id) AS member_count
          FROM household_members hm
          JOIN households h ON h.household_id = hm.household_id
          WHERE hm.user_id = ?
          LIMIT 1`,
    args: [userId],
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    householdId: String(row.household_id ?? ""),
    householdName: String(row.name ?? "My household"),
    inviteCode: String(row.invite_code ?? ""),
    role: String(row.role ?? "member"),
    memberCount: Number(row.member_count ?? 1),
  };
}

async function createHouseholdForUser(user: SessionUser): Promise<HouseholdInfo> {
  const householdId = randomUUID();
  let inviteCode = randomCode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await db.execute({
        sql: `INSERT INTO households (household_id, name, invite_code, created_by_user_id, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [householdId, "My household", inviteCode, user.userId],
      });
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      inviteCode = randomCode();
    }
  }

  await db.execute({
    sql: `INSERT INTO household_members (household_id, user_id, user_email, role, joined_at)
          VALUES (?, ?, ?, 'owner', CURRENT_TIMESTAMP)
          ON CONFLICT (household_id, user_id) DO UPDATE SET
            user_email = EXCLUDED.user_email`,
    args: [householdId, user.userId, user.email],
  });

  return {
    householdId,
    householdName: "My household",
    inviteCode,
    role: "owner",
    memberCount: 1,
  };
}

export async function getOrCreateCurrentHousehold(user: SessionUser) {
  await ensureHouseholdSchema();

  let household = await getHouseholdByUserId(user.userId);
  if (!household) {
    household = await createHouseholdForUser(user);
  }

  return household;
}

export async function joinHouseholdByInviteCode(user: SessionUser, inviteCodeRaw: string) {
  await ensureHouseholdSchema();

  const inviteCode = inviteCodeRaw.trim().toUpperCase();
  if (!inviteCode) {
    throw new Error("Invite code is required");
  }

  const targetResult = await db.execute({
    sql: `SELECT household_id, name, invite_code,
                 (SELECT COUNT(*) FROM household_members member WHERE member.household_id = households.household_id) AS member_count
          FROM households
          WHERE invite_code = ?
          LIMIT 1`,
    args: [inviteCode],
  });

  const target = targetResult.rows[0];
  if (!target) {
    throw new Error("Invite code not found");
  }

  const targetHouseholdId = String(target.household_id ?? "");
  const current = await getHouseholdByUserId(user.userId);

  if (current?.householdId === targetHouseholdId) {
    return {
      householdId: targetHouseholdId,
      householdName: String(target.name ?? "My household"),
      inviteCode: String(target.invite_code ?? inviteCode),
      role: current.role,
      memberCount: Number(target.member_count ?? current.memberCount),
    };
  }

  if (current) {
    const currentMemberCountResult = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM household_members WHERE household_id = ?`,
      args: [current.householdId],
    });

    const currentMemberCount = Number(currentMemberCountResult.rows[0]?.total ?? 0);
    if (currentMemberCount > 1) {
      throw new Error("Leave household flow is not supported yet");
    }

    const currentCart = await db.execute({
      sql: `SELECT item_code, item_name, item_price, quantity, checked, created_at, added_by_user_id
            FROM shopping_list_items
            WHERE household_id = ?`,
      args: [current.householdId],
    });

    for (const row of currentCart.rows) {
      await db.execute({
        sql: `INSERT INTO shopping_list_items
                (household_id, item_code, item_name, item_price, quantity, checked, added_by_user_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
              ON CONFLICT (household_id, item_code) DO UPDATE SET
                item_name = EXCLUDED.item_name,
                item_price = EXCLUDED.item_price,
                quantity = shopping_list_items.quantity + EXCLUDED.quantity,
                checked = CASE WHEN shopping_list_items.checked = 1 AND EXCLUDED.checked = 1 THEN 1 ELSE 0 END,
                updated_at = CURRENT_TIMESTAMP`,
        args: [
          targetHouseholdId,
          String(row.item_code ?? ""),
          String(row.item_name ?? ""),
          Number(row.item_price ?? 0),
          Math.max(1, Number(row.quantity ?? 1)),
          row.checked === 1 || row.checked === true ? 1 : 0,
          String(row.added_by_user_id ?? user.userId),
          row.created_at ? String(row.created_at) : null,
        ],
      });
    }

    await db.execute({
      sql: `DELETE FROM shopping_list_items WHERE household_id = ?`,
      args: [current.householdId],
    });

    await db.execute({
      sql: `DELETE FROM household_members WHERE household_id = ? AND user_id = ?`,
      args: [current.householdId, user.userId],
    });
  }

  await db.execute({
    sql: `INSERT INTO household_members (household_id, user_id, user_email, role, joined_at)
          VALUES (?, ?, ?, 'member', CURRENT_TIMESTAMP)
          ON CONFLICT (household_id, user_id) DO UPDATE SET
            user_email = EXCLUDED.user_email`,
    args: [targetHouseholdId, user.userId, user.email],
  });

  const updatedTarget = await getHouseholdByUserId(user.userId);
  if (!updatedTarget) {
    throw new Error("Failed to load joined household");
  }

  return updatedTarget;
}
