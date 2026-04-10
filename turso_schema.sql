-- Run once with: turso db shell <your-db-name> < turso_schema.sql

CREATE TABLE IF NOT EXISTS branches (
  branch_id    TEXT PRIMARY KEY,
  chain_id     TEXT,
  store_name   TEXT,
  city         TEXT,
  address      TEXT,
  zip_code     TEXT,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS products (
  item_code         TEXT,
  branch_id         TEXT,
  item_name         TEXT,
  item_price        REAL,
  unit_of_measure   TEXT,
  quantity          TEXT,
  category          TEXT,
  manufacturer_name TEXT,
  last_updated      TEXT,
  PRIMARY KEY (item_code, branch_id)
);

CREATE TABLE IF NOT EXISTS promos (
  promotion_id     TEXT,
  branch_id        TEXT,
  description      TEXT,
  discount_rate    TEXT,
  min_qty          TEXT,
  min_purchase_amount TEXT,
  discounted_price TEXT,
  start_date       TEXT,
  end_date         TEXT,
  item_codes       TEXT,  -- JSON array stored as string
  last_updated     TEXT,
  PRIMARY KEY (promotion_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_name   ON products(item_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_promos_branch   ON promos(branch_id);
