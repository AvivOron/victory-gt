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
  max_qty          TEXT,
  min_purchase_amount TEXT,
  discounted_price TEXT,
  start_date       TEXT,
  end_date         TEXT,
  item_codes       TEXT,  -- JSON array stored as string
  last_updated     TEXT,
  PRIMARY KEY (promotion_id, branch_id)
);

CREATE TABLE IF NOT EXISTS favourites (
  user_id    TEXT,
  user_email TEXT,
  item_code  TEXT,
  branch_id  TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_code, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_name   ON products(item_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_promos_branch   ON promos(branch_id);
CREATE INDEX IF NOT EXISTS idx_favourites_user_branch ON favourites(user_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_favourites_item_code   ON favourites(item_code);

CREATE TABLE IF NOT EXISTS households (
  household_id        TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  invite_code         TEXT NOT NULL UNIQUE,
  created_by_user_id  TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  user_email   TEXT,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (household_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  household_id     TEXT NOT NULL,
  item_code        TEXT NOT NULL,
  item_name        TEXT,
  item_price       REAL,
  category         TEXT,
  quantity         INTEGER DEFAULT 1,
  checked          INTEGER DEFAULT 0,
  added_by_user_id TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (household_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_household ON shopping_list_items(household_id, created_at);

CREATE TABLE IF NOT EXISTS email_opt_out (
  user_id      TEXT PRIMARY KEY,
  opted_out_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_email_log (
  user_id      TEXT NOT NULL,
  promotion_id TEXT NOT NULL,
  sent_at      TEXT NOT NULL,
  PRIMARY KEY (user_id, promotion_id)
);
