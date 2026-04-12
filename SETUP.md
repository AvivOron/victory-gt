# Victory Ganei Tikva — Setup Guide

## Architecture

```
Python worker
  └── Downloads XML.gz from laibcatalog.co.il twice daily
  └── Parses prices + promos
  └── Upserts to Neon Postgres
        │
        └──► Next.js app (Vercel)
               └── Reads from Neon
               └── Renders landing page, price table, promo modal, barcode scanner, favourites, household shopping list
```

## 1. Database

Provision a Postgres database, for example in Neon, and apply `turso_schema.sql` with your preferred SQL client.

Required application env:

- `DATABASE_URL`
- `GANEI_TIKVA_BRANCH_ID`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `VERCEL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The app expects `DATABASE_URL` to be a Postgres connection string.

## 2. Worker

```bash
cd victory-gt/worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — add DATABASE_URL
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
# Fill in DATABASE_URL, GANEI_TIKVA_BRANCH_ID, NEXTAUTH_SECRET,
# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_URL, and VERCEL

npm run dev        # local dev
vercel deploy      # deploy to Vercel
```

Add these env vars in the Vercel dashboard (Settings → Environment Variables):
- `DATABASE_URL`
- `GANEI_TIKVA_BRANCH_ID`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `VERCEL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GEMINI_API_KEY` — required for Recipe Finder (`POST /api/recipe`)
- `RESEND_API_KEY` — required for recipe email delivery (`POST /api/recipe/email`)

For Google OAuth, add an authorized redirect URI for each environment:

- Local: `http://localhost:3000/victory-gt/api/auth/callback/google`
- Production: `https://your-domain.example/victory-gt/api/auth/callback/google`

Use the same convention as `tails-and-choices`: `NEXTAUTH_URL` should be the full auth endpoint, including the base path and `/api/auth`.

Examples:
- Local: `NEXTAUTH_URL=http://localhost:3000/victory-gt/api/auth`
- Production: `NEXTAUTH_URL=https://www.avivo.dev/victory-gt/api/auth`

If local dev starts on a different port, update the same full path, for example `http://localhost:3001/victory-gt/api/auth`.

Important: for this app on Vercel, set `VERCEL` to an empty value. With `next-auth` v4 and a `basePath`, leaving `VERCEL` populated can make the OAuth callback drop `/victory-gt` and fall back to `/api/auth`.

## 4. Current UX behavior

- Products and promo items with `is_available=false` are visually faded.
- Trying to add an unavailable product to the shopping list shows an out-of-stock warning instead of adding it.
- The same out-of-stock behavior applies in the main price table and inside the promo modal.
- Shopping list and favourites require Google authentication.
- Authenticated users get a household invite code and can join another household cart by entering its code.
- Mobile users can open the barcode scanner, grant camera access, and resolve a barcode directly to a product card.

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
| `products` | `item_code, branch_id` | All prices, optional AI `category`, `is_available` drives fade/out-of-stock UX |
| `promos` | `promotion_id, branch_id` | Active promotions, `item_codes` is a JSON array stored as text |
| `households` | `household_id` | Shared household carts with invite codes |
| `household_members` | `household_id, user_id` | Household membership and roles |
| `shopping_list_items` | `household_id, item_code` | Shared cart items keyed by household |
| `favourites` | `user_id, item_code, branch_id` | Google-authenticated saved products |
