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
  const promoConditions: string[] = [];
  const promoArgs: string[] = [];

  if (BRANCH) {
    promoConditions.push("p.branch_id = ?");
    promoArgs.push(BRANCH);
  }

  const promoResult = await db.execute({
    sql: `SELECT pr.category, COUNT(DISTINCT p.promotion_id) as total
          FROM promos p
          JOIN products pr
            ON p.item_codes LIKE ('%"' || pr.item_code || '"%')
            ${BRANCH ? "AND pr.branch_id = p.branch_id" : ""}
          ${promoConditions.length ? `WHERE ${promoConditions.join(" AND ")}` : ""}
          GROUP BY pr.category`,
    args: promoArgs,
  });
  const promoTotals = new Map(
    promoResult.rows.map(row => [String(row.category), Number(row.total ?? 0)])
  );

  return NextResponse.json({
    categories: result.rows.map(row => ({
      name: String(row.category),
      total: Number(row.total ?? 0),
      promoTotal: promoTotals.get(String(row.category)) ?? 0,
    })),
  });
}
