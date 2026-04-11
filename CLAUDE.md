@AGENTS.md

# Project: victory-gt

A Next.js 16 grocery price comparison app (Israeli market). TypeScript + Tailwind v4 + Neon (Postgres) + NextAuth (Google OAuth).

## Key paths
- `src/app/` — App Router pages and API routes
- `src/components/` — UI components (Header, PriceTable, LandingHero, SignInButton, SignOutButton, Providers)
- `src/lib/db.ts` — DB client + core TypeScript interfaces (Product, Promo, Branch, PromoOriginalItem)
- `src/lib/auth.ts` — NextAuth config (Google provider, JWT strategy)
- `turso_schema.sql` — canonical DB schema (tables: branches, products, promos, favourites)

## Database
- Driver: `@neondatabase/serverless` (Neon/Postgres), accessed via `db` from `src/lib/db.ts`
- `db.execute({ sql, args })` — use `?` placeholders (auto-converted to `$1`, `$2`, ...)
- Primary keys: `products(item_code, branch_id)`, `promos(promotion_id, branch_id)`, `favourites(user_id, item_code, branch_id)`
- `promos.item_codes` is a JSON string — parse with `JSON.parse()`
- `products.is_available` is the source of truth for faded unavailable items and add-to-cart blocking
- `src/app/api/promos/route.ts` enriches promo modal items with availability as well

## Auth
- Session via JWT; `session.user.id` holds the Google `providerAccountId`
- Protected API routes: retrieve session with `getServerSession(authOptions)` from `src/lib/auth.ts`

## Product images
- Static `.jpg` files under `public/products/{item_code}.jpg`, served at `/victory-gt/products/{item_code}.jpg`
- Synced by the worker via `scripts/sync_images.sh`; missing images are fetched and committed to the repo
- All image tags use `next/image` (`NextImage`) — never raw `<img>` for product images
- Cache-Control set to `public, max-age=604800, stale-while-revalidate=86400` via `next.config.ts` headers

## Conventions
- All new API routes go under `src/app/api/`
- Tailwind v4 (PostCSS plugin) — no `tailwind.config.js`; config is in CSS
- Do NOT use `turso` or `@libsql/client` — the project migrated to Neon
