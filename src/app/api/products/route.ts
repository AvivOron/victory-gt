import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Product, Promo } from "@/lib/db";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";
const PAGE_SIZE = 20;

interface PriceRow {
  item_code: string;
  item_name: string;
  item_price: number;
  category: string;
}

function searchTokens(query: string) {
  return query.split(/\s+/).map(token => token.trim()).filter(Boolean);
}

function parseItemCodes(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string" && code.length > 0) : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";
  const itemCodes = searchParams.getAll("itemCode").map(code => code.trim()).filter(Boolean);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const sort = searchParams.get("sort") || "item_name";
  const dir = searchParams.get("dir") === "desc" ? "DESC" : "ASC";
  const offset = (page - 1) * PAGE_SIZE;

  const allowed = new Set(["item_name", "item_price", "manufacturer_name", "item_code"]);
  const sortCol = allowed.has(sort) ? sort : "item_name";

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (BRANCH) { conditions.push("branch_id = ?"); args.push(BRANCH); }
  if (q) {
    const tokens = searchTokens(q);
    for (const token of tokens) {
      conditions.push("(item_name LIKE ? OR item_code LIKE ? OR manufacturer_name LIKE ?)");
      args.push(`%${token}%`, `%${token}%`, `%${token}%`);
    }
  }
  if (category) {
    conditions.push("category = ?");
    args.push(category);
  }
  if (itemCodes.length > 0) {
    const placeholders = itemCodes.map(() => "?").join(",");
    conditions.push(`item_code IN (${placeholders})`);
    args.push(...itemCodes);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [dataResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT item_code,item_name,item_price,unit_of_measure,quantity,category,manufacturer_name,branch_id,last_updated,COALESCE(is_available,TRUE) as is_available
            FROM products ${where} ORDER BY COALESCE(is_available,TRUE) DESC, ${sortCol} ${dir} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      args,
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total FROM products ${where}`,
      args,
    }),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const products = dataResult.rows.map(r => ({ ...r })) as unknown as Product[];
  const productCodes = products.map(product => product.item_code).filter(Boolean);
  const promosByCode = new Map<string, Promo[]>();
  let filteredPromoTotal: number | null = null;

  if (productCodes.length > 0) {
    const itemCodeConditions = productCodes.map(() => "item_codes LIKE ?");
    const promoConditions = [`(${itemCodeConditions.join(" OR ")})`];
    const promoArgs: string[] = productCodes.map(code => `%\"${code}\"%`);

    if (BRANCH) {
      promoConditions.push("branch_id = ?");
      promoArgs.push(BRANCH);
    }

    const promoResult = await db.execute({
      sql: `SELECT promotion_id,description,discount_rate,min_qty,max_qty,min_purchase_amount,discounted_price,start_date,end_date,item_codes,branch_id,last_updated
            FROM promos WHERE ${promoConditions.join(" AND ")}`,
      args: promoArgs,
    });

    const promos = promoResult.rows.map(r => ({ ...r })) as unknown as Promo[];
    const promoItemCodes = Array.from(new Set(promos.flatMap(promo => parseItemCodes(promo.item_codes))));
    const productsByCode = new Map<string, PriceRow>();

    if (promoItemCodes.length > 0) {
      const placeholders = promoItemCodes.map(() => "?").join(",");
      const productConditions = [`item_code IN (${placeholders})`];
      const productArgs: string[] = [...promoItemCodes];

      if (BRANCH) {
        productConditions.push("branch_id = ?");
        productArgs.push(BRANCH);
      }

      const sharedProductsResult = await db.execute({
        sql: `SELECT item_code,item_name,item_price,category FROM products WHERE ${productConditions.join(" AND ")}`,
        args: productArgs,
      });

      for (const row of sharedProductsResult.rows as unknown as PriceRow[]) {
        productsByCode.set(row.item_code, row);
      }
    }

    const enrichedPromos = promos.map(promo => ({
      ...promo,
      original_items: parseItemCodes(promo.item_codes)
        .map(code => productsByCode.get(code))
        .filter((item): item is PriceRow => Boolean(item)),
    }));

    for (const promo of enrichedPromos) {
      for (const code of parseItemCodes(promo.item_codes)) {
        if (!productCodes.includes(code)) continue;
        promosByCode.set(code, [...(promosByCode.get(code) ?? []), promo]);
      }
    }
  }

  if (q || category) {
    const promoConditions: string[] = [];
    const promoArgs: string[] = [];
    if (BRANCH) { promoConditions.push("branch_id = ?"); promoArgs.push(BRANCH); }
    if (q) {
      const tokens = searchTokens(q);
      for (const token of tokens) {
        promoConditions.push("(description LIKE ? OR promotion_id LIKE ?)");
        promoArgs.push(`%${token}%`, `%${token}%`);
      }
    }
    const promoWhere = promoConditions.length ? `WHERE ${promoConditions.join(" AND ")}` : "";

    if (!category) {
      const promoCountResult = await db.execute({
        sql: `SELECT COUNT(*) as total FROM promos ${promoWhere}`,
        args: promoArgs,
      });
      filteredPromoTotal = Number(promoCountResult.rows[0]?.total ?? 0);
    } else {
      const filteredProductResult = await db.execute({
        sql: `SELECT item_code FROM products ${where}`,
        args,
      });
      const filteredCodes = new Set(filteredProductResult.rows.map(row => String(row.item_code)).filter(Boolean));

      if (filteredCodes.size === 0) {
        filteredPromoTotal = 0;
      } else {
        const promoResult = await db.execute({
          sql: `SELECT item_codes FROM promos ${promoWhere}`,
          args: promoArgs,
        });
        filteredPromoTotal = promoResult.rows.filter(row =>
          parseItemCodes(row.item_codes).some(code => filteredCodes.has(code))
        ).length;
      }
    }
  }

  return NextResponse.json(
    {
      products: products.map(product => ({
        ...product,
        discount_promos: promosByCode.get(product.item_code) ?? [],
      })),
      total,
      promoTotal: filteredPromoTotal,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
    },
    { headers: { "Cache-Control": "public, s-maxage=10800, stale-while-revalidate=3600" } }
  );
}
