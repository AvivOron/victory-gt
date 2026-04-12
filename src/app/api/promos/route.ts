import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";
const PAGE_SIZE = 20;
const PRICE_LOOKUP_CHUNK_SIZE = 400;

interface PromoRow {
  promotion_id: string;
  description: string;
  discount_rate: string;
  min_qty: string;
  max_qty: string;
  min_purchase_amount: string;
  discounted_price: string;
  start_date: string;
  end_date: string;
  item_codes: string;
  last_updated: string;
}

interface PriceRow {
  item_code: string;
  item_name: string;
  item_price: number;
  category: string;
  is_available: boolean;
}

interface EnrichedPromo extends PromoRow {
  original_items: PriceRow[];
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

async function enrichPromos(promos: PromoRow[]): Promise<EnrichedPromo[]> {
  const uniqueCodes = Array.from(new Set(promos.flatMap(promo => parseItemCodes(promo.item_codes))));
  const pricesByCode = new Map<string, PriceRow>();

  for (let i = 0; i < uniqueCodes.length; i += PRICE_LOOKUP_CHUNK_SIZE) {
    const codes = uniqueCodes.slice(i, i + PRICE_LOOKUP_CHUNK_SIZE);
    const placeholders = codes.map(() => "?").join(",");
    const productConditions = [`item_code IN (${placeholders})`];
    const productArgs: string[] = [...codes];

    if (BRANCH) {
      productConditions.push("branch_id = ?");
      productArgs.push(BRANCH);
    }

    const priceResult = await db.execute({
      sql: `SELECT item_code,item_name,item_price,category,COALESCE(is_available,TRUE) as is_available FROM products WHERE ${productConditions.join(" AND ")}`,
      args: productArgs,
    });

    for (const row of priceResult.rows as unknown as PriceRow[]) {
      pricesByCode.set(row.item_code, row);
    }
  }

  return promos.map(promo => ({
    ...promo,
    original_items: parseItemCodes(promo.item_codes)
      .map(code => pricesByCode.get(code))
      .filter((item): item is PriceRow => Boolean(item)),
  }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
  const offset = (page - 1) * PAGE_SIZE;
  let productTotal: number | null = null;

  const conditions: string[] = [];
  const args: string[] = [];

  if (BRANCH) { conditions.push("branch_id = ?"); args.push(BRANCH); }
  if (q) {
    const tokens = searchTokens(q);
    for (const token of tokens) {
      conditions.push("(description LIKE ? OR promotion_id LIKE ?)");
      args.push(`%${token}%`, `%${token}%`);
    }
  }
  if (q || category) {
    const productConditions: string[] = [];
    const productArgs: string[] = [];
    if (q) {
      const tokens = searchTokens(q);
      for (const token of tokens) {
        productConditions.push("(item_name LIKE ? OR item_code LIKE ? OR manufacturer_name LIKE ?)");
        productArgs.push(`%${token}%`, `%${token}%`, `%${token}%`);
      }
    }
    if (category) {
      productConditions.push("category = ?");
      productArgs.push(category);
    }
    if (BRANCH) { productConditions.push("branch_id = ?"); productArgs.push(BRANCH); }
    const productWhere = productConditions.length ? `WHERE ${productConditions.join(" AND ")}` : "";
    const productCountResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM products ${productWhere}`,
      args: productArgs,
    });
    productTotal = Number(productCountResult.rows[0]?.total ?? 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  if (category) {
    const result = await db.execute({
      sql: `SELECT promotion_id,description,discount_rate,min_qty,max_qty,min_purchase_amount,discounted_price,start_date,end_date,item_codes,last_updated
            FROM promos ${where} ORDER BY end_date ASC, promotion_id ASC`,
      args,
    });

    const enrichedPromos = await enrichPromos(result.rows.map(r => ({ ...r })) as unknown as PromoRow[]);
    const categoryPromos = enrichedPromos.filter(promo =>
      promo.original_items.some(item => item.category === category)
    );
    const total = categoryPromos.length;

    return NextResponse.json(
      { promos: categoryPromos.slice(offset, offset + PAGE_SIZE), total, productTotal, page, pages: Math.ceil(total / PAGE_SIZE) },
      { headers: { "Cache-Control": "public, s-maxage=10800, stale-while-revalidate=3600" } }
    );
  }

  const [result, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT promotion_id,description,discount_rate,min_qty,max_qty,min_purchase_amount,discounted_price,start_date,end_date,item_codes,last_updated
            FROM promos ${where} ORDER BY end_date ASC, promotion_id ASC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      args,
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total FROM promos ${where}`,
      args,
    }),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const promos = result.rows.map(r => ({ ...r })) as unknown as PromoRow[];

  return NextResponse.json(
    { promos: await enrichPromos(promos), total, productTotal, page, pages: Math.ceil(total / PAGE_SIZE) },
    { headers: { "Cache-Control": "public, s-maxage=10800, stale-while-revalidate=3600" } }
  );
}
