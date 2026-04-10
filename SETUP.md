# Victory Ganei Tikva — Setup Guide

## Architecture

```
Raspberry Pi (Python worker)
  └── Downloads XML.gz from laibcatalog.co.il twice daily
  └── Parses prices + promos
  └── Upserts to Turso (libSQL cloud)
        │
        └──► Next.js app (Vercel)
               └── Reads from Turso
               └── Renders price table
```

## 1. Turso DB

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Log in
turso auth login

# Create DB
turso db create victory-gt

# Get connection URL and token
turso db show victory-gt --url     # → libsql://victory-gt-xxxx.turso.io
turso db tokens create victory-gt  # → auth token

# Create tables
turso db shell victory-gt < turso_schema.sql
```

## 2. Raspberry Pi worker

```bash
cd victory-gt/worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — add TURSO_DB_URL and TURSO_AUTH_TOKEN
# Optional: add GEMINI_API_KEY to categorize products during scans

# First run — discovers branch ID
python scanner.py

# Check the discovered branch ID
cat branch_id.txt   # e.g. "074"

# Add it to .env
echo "GANEI_TIKVA_BRANCH_ID=$(cat branch_id.txt)" >> .env

# Run continuously (scans at 08:00 + 14:00 daily)
python scanner.py --watch
```

### Cron alternative

```
0 8,14 * * * cd /home/pi/victory-gt/worker && source venv/bin/activate && python scanner.py >> /var/log/victory.log 2>&1
```

## 3. Next.js app (Vercel)

```bash
cp .env.local.example .env.local
# Fill in TURSO_DB_URL, TURSO_AUTH_TOKEN, GANEI_TIKVA_BRANCH_ID

npm run dev        # local dev
vercel deploy      # deploy to Vercel
```

Add these env vars in the Vercel dashboard (Settings → Environment Variables):
- `TURSO_DB_URL`
- `TURSO_AUTH_TOKEN`
- `GANEI_TIKVA_BRANCH_ID`

## AI product categories

Set `GEMINI_API_KEY` in `worker/.env` to let the scanner categorize products. The scanner stores results in `worker/category_cache.json`, so existing products are not re-sent to Gemini on every scan.

```bash
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
```

For an existing database created before categories, run this once:

```sql
ALTER TABLE products ADD COLUMN category TEXT;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
```

## Table schema

| Table | Primary key | Notes |
|-------|-------------|-------|
| `branches` | `branch_id` | Store metadata |
| `products` | `item_code, branch_id` | All prices, optional AI `category` |
| `promos` | `promotion_id, branch_id` | Active promotions, `item_codes` is a JSON array stored as text |
