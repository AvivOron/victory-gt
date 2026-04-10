import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DB_URL || "file:placeholder.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export interface Product {
  item_code: string;
  item_name: string;
  item_price: number;
  unit_of_measure: string;
  quantity: string;
  manufacturer_name: string;
  discount_promos?: Promo[];
  branch_id: string;
  last_updated: string;
}

export interface Promo {
  promotion_id: string;
  description: string;
  discount_rate: string;
  min_qty: string;
  discounted_price: string;
  start_date: string;
  end_date: string;
  item_codes: string; // stored as JSON string in SQLite
  original_items?: PromoOriginalItem[];
  branch_id: string;
  last_updated: string;
}

export interface PromoOriginalItem {
  item_code: string;
  item_name: string;
  item_price: number;
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
