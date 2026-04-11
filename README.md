# Victory Ganei Tikva

Price and promotions viewer for the Victory branch in Ganei Tikva. The app reads branch data from Postgres, renders a searchable price table and promo explorer, and lets signed-in users save favourites, scan barcodes from a phone camera, and manage a shared household shopping list.

## Current product behavior

- Search by product name, barcode, or manufacturer
- Scan a barcode with the mobile camera and jump straight to the matching product
- Filter by AI-generated category
- Browse active promos and inspect all products in a promo modal
- Save favourites and a shopping list with Google sign-in
- Share a household shopping list with an invite code
- Show promo labels inside the shopping list
- Fade unavailable products and block adding them to the cart with an out-of-stock warning

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Neon Postgres via `@neondatabase/serverless`
- NextAuth v4 with Google OAuth
- Python worker for price and promo ingestion

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create local env:

```bash
cp .env.local.example .env.local
```

3. Fill in:

```bash
DATABASE_URL=
GANEI_TIKVA_BRANCH_ID=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000/victory-gt/api/auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
VERCEL=
```

4. Run the app:

```bash
npm run dev
```

Then open `http://localhost:3000/victory-gt`.

## Data flow

```text
Worker -> downloads official XML files -> parses products and promos -> upserts Postgres
Next.js app -> reads products/promos/favourites/household shopping list -> renders landing + prices UI
```

## Key paths

- `src/app/page.tsx` and `src/components/LandingHero.tsx`: landing page
- `src/app/prices/page.tsx`: main prices page
- `src/components/PriceTable.tsx`: prices, promos, favourites, shopping list, promo modal
- `src/app/api/household/route.ts` and `src/lib/households.ts`: household invite-code sharing and shared cart storage
- `src/app/api/products/route.ts`: products API with promo enrichment
- `src/app/api/promos/route.ts`: promos API with enriched promo items and availability
- `src/app/api/shopping-list/route.ts`: signed-in shopping list API
- `src/lib/db.ts`: shared DB client and TypeScript interfaces
- `worker/scanner.py`: ingestion worker

## Notes

- The app is mounted under `/victory-gt`.
- Product availability comes from `products.is_available`.
- Promo modal items now include availability and use the same out-of-stock handling as the main table.
- Barcode scanning is currently exposed in the mobile prices UI and resolves exact `item_code` matches.
- Signed-in users get a household invite code so multiple people can share the same shopping list.
- For full setup and deployment details, see [SETUP.md](./SETUP.md).

## Deployment

The app is intended for Vercel deployment with a Neon database and a separately scheduled worker process.

Use `npm run build` before deploying production changes.
