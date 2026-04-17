import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/households";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  // Find the user's household
  const memberResult = await db.execute({
    sql: `SELECT household_id FROM household_members WHERE user_id = ? LIMIT 1`,
    args: [user.userId],
  });

  const householdId = memberResult.rows[0]?.household_id;
  if (!householdId) {
    return Response.json({ favourites: [] });
  }

  // Get all other members in the household
  const othersResult = await db.execute({
    sql: `SELECT user_id FROM household_members WHERE household_id = ? AND user_id != ?`,
    args: [householdId, user.userId],
  });

  const otherUserIds = othersResult.rows.map(r => String(r.user_id ?? "")).filter(Boolean);
  if (otherUserIds.length === 0) {
    return Response.json({ favourites: [] });
  }

  // Get their favourites, excluding items the current user already has
  const placeholders = otherUserIds.map(() => "?").join(", ");
  const args: (string)[] = [...otherUserIds, user.userId];
  if (BRANCH) args.push(BRANCH);

  const result = await db.execute({
    sql: `SELECT DISTINCT f.item_code
          FROM favourites f
          WHERE f.user_id IN (${placeholders})
            AND f.item_code NOT IN (
              SELECT item_code FROM favourites WHERE user_id = ?
            )
            ${BRANCH ? "AND f.branch_id = ?" : ""}
          ORDER BY f.item_code`,
    args,
  });

  return Response.json({
    favourites: result.rows.map(row => String(row.item_code ?? "")),
  });
}
