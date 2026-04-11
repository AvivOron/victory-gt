import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Neon returns rows as plain objects — wrap in the same interface as before
export const db = {
  async execute({ sql: query, args }: { sql: string; args?: unknown[] }): Promise<{ rows: Record<string, unknown>[] }> {
    // Convert SQLite ? placeholders to Postgres $1, $2, ...
    let i = 0;
    const pgQuery = query.replace(/\?/g, () => `$${++i}`);
    const rows = await sql.query(pgQuery, args ?? []);
    return { rows: rows as Record<string, unknown>[] };
  },
};

export interface Product {
  item_code: string;
  item_name: string;
  item_price: number;
  unit_of_measure: string;
  quantity: string;
  category?: string;
  manufacturer_name: string;
  discount_promos?: Promo[];
  branch_id: string;
  last_updated: string;
  is_available: boolean;
  image_url?: string;
}

export interface Promo {
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
  original_items?: PromoOriginalItem[];
  branch_id: string;
  last_updated: string;
}

export interface PromoOriginalItem {
  item_code: string;
  item_name: string;
  item_price: number;
  category?: string;
  is_available?: boolean;
}

export interface Branch {
  branch_id: string;
  chain_id: string;
  store_name: string;
  city: string;
  address: string;
  zip_code: string;
  last_updated: string;
}
