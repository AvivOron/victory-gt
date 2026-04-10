import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";

function getSessionUser(session: Session | null) {
  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  const userId = user?.id ?? user?.email;
  return userId ? { userId, email: user?.email ?? null } : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const args = BRANCH ? [user.userId, BRANCH] : [user.userId];
  const result = await db.execute({
    sql: `SELECT item_code FROM favourites WHERE user_id = ?${BRANCH ? " AND branch_id = ?" : ""} ORDER BY created_at DESC`,
    args,
  });

  return Response.json({
    favourites: result.rows.map(row => String(row.item_code ?? "")),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { itemCode?: unknown } | null;
  const itemCode = typeof body?.itemCode === "string" ? body.itemCode.trim() : "";
  if (!itemCode) {
    return Response.json({ error: "itemCode is required" }, { status: 400 });
  }

  await db.execute({
    sql: `
      INSERT INTO favourites (user_id, user_email, item_code, branch_id, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, item_code, branch_id) DO UPDATE SET
        user_email = EXCLUDED.user_email,
        created_at = EXCLUDED.created_at
    `,
    args: [user.userId, user.email, itemCode, BRANCH],
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { itemCode?: unknown } | null;
  const itemCode = typeof body?.itemCode === "string" ? body.itemCode.trim() : "";
  if (!itemCode) {
    return Response.json({ error: "itemCode is required" }, { status: 400 });
  }

  await db.execute({
    sql: "DELETE FROM favourites WHERE user_id = ? AND item_code = ? AND branch_id = ?",
    args: [user.userId, itemCode, BRANCH],
  });

  return Response.json({ ok: true });
}
