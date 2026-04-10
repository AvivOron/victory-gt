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
}

interface EnrichedPromo extends PromoRow {
  original_items: PriceRow[];
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

function positiveNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function discountValue(promo: EnrichedPromo): number {
  const minQty = positiveNumber(promo.min_qty);
  const discountedPrice = positiveNumber(promo.discounted_price);

  if (minQty && discountedPrice && promo.original_items.length > 0) {
    return Math.max(
      ...promo.original_items.map(item => Math.max(0, Number(item.item_price) * minQty - discountedPrice))
    );
  }

  return positiveNumber(promo.discount_rate) ?? 0;
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
      sql: `SELECT item_code,item_name,item_price FROM products WHERE ${productConditions.join(" AND ")}`,
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
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
  const sort = req.nextUrl.searchParams.get("sort") === "biggest_discount" ? "biggest_discount" : "latest";
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: string[] = [];
  const args: string[] = [];

  if (BRANCH) { conditions.push("branch_id = ?"); args.push(BRANCH); }
  if (q) {
    conditions.push("(description LIKE ? OR promotion_id LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResultPromise = db.execute({
    sql: `SELECT COUNT(*) as total FROM promos ${where}`,
    args,
  });

  if (sort === "biggest_discount") {
    const [result, countResult] = await Promise.all([
      db.execute({
        sql: `SELECT promotion_id,description,discount_rate,min_qty,discounted_price,start_date,end_date,item_codes,last_updated
              FROM promos ${where} ORDER BY start_date DESC`,
        args,
      }),
      countResultPromise,
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    const enrichedPromos = await enrichPromos(result.rows.map(r => ({ ...r })) as unknown as PromoRow[]);
    const sortedPromos = enrichedPromos
      .sort((a, b) => discountValue(b) - discountValue(a))
      .slice(offset, offset + PAGE_SIZE);

    return NextResponse.json({
      promos: sortedPromos,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
    });
  }

  const [result, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT promotion_id,description,discount_rate,min_qty,discounted_price,start_date,end_date,item_codes,last_updated
            FROM promos ${where} ORDER BY start_date DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      args,
    }),
    countResultPromise,
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const promos = result.rows.map(r => ({ ...r })) as unknown as PromoRow[];

  return NextResponse.json({
    promos: await enrichPromos(promos),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
  });
}
