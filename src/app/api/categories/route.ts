import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";

export async function GET() {
  const conditions = ["category IS NOT NULL", "category != ''"];
  const args: string[] = [];

  if (BRANCH) {
    conditions.push("branch_id = ?");
    args.push(BRANCH);
  }

  const result = await db.execute({
    sql: `SELECT category, COUNT(*) as total
          FROM products
          WHERE ${conditions.join(" AND ")}
          GROUP BY category
          ORDER BY total DESC, category ASC`,
    args,
  });
  return NextResponse.json(
    {
      categories: result.rows.map(row => ({
        name: String(row.category),
        total: Number(row.total ?? 0),
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=10800, stale-while-revalidate=3600" } }
  );
}
