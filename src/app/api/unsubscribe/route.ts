import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");

  if (!uid) {
    return Response.json({ error: "Missing uid" }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT INTO email_opt_out (user_id, opted_out_at)
          VALUES (?, ?)
          ON CONFLICT (user_id) DO NOTHING`,
    args: [uid, new Date().toISOString()],
  });

  return Response.redirect(new URL("/victory-gt/unsubscribe?done=1", req.nextUrl.origin));
}
