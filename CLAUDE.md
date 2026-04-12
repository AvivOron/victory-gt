@AGENTS.md

# Project: victory-gt

A Next.js 16 grocery price comparison app (Israeli market). TypeScript + Tailwind v4 + Neon (Postgres) + NextAuth (Google OAuth).

## Key paths
- `src/app/` — App Router pages and API routes
- `src/components/` — UI components (Header, PriceTable, LandingHero, SignInButton, SignOutButton, Providers)
- `src/lib/db.ts` — DB client + core TypeScript interfaces (Product, Promo, Branch, PromoOriginalItem)
- `src/lib/auth.ts` — NextAuth config (Google provider, JWT strategy)
- `turso_schema.sql` — canonical DB schema (tables: branches, products, promos, favourites, email_opt_out, promo_email_log)

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

## Email notifications
- Sent via Resend from `discount@avivo.dev` when a favourited product goes on sale (PromoFull scans only)
- `promo_email_log(user_id, promotion_id)` prevents duplicate emails within a promotion window
- `email_opt_out(user_id)` — users added here are skipped; populated via `GET /api/unsubscribe?uid=`
- One digest email per user per scan, not one per promo

## Recipe Finder
- Entry point: 🍳 button in Header → `RecipeModal` inside `PriceTable.tsx`
- `POST /api/recipe` — accepts `{ url?, text? }`, fetches URL text if given, calls Gemini 2.5 Flash to extract Hebrew ingredient hints `{term, category}[]`, runs 4-pass SQL per ingredient (all-tokens+category → all-tokens → first-token+category → first-token), scores candidates locally, returns `{ results, ingredients, recipe }`
- `POST /api/recipe/email` — auth-protected; sends a generated recipe as styled HTML to the signed-in user's email via Resend from `recipe@avivo.dev`; requires `RESEND_API_KEY`
- Env vars required: `GEMINI_API_KEY` (recipe route), `RESEND_API_KEY` (email route)
- Hebrew normalization: `יי→י`, `וו→ו` applied to both search tokens (SQL OR variants) and scoring
- Scoring: name-start match +6, whole-word +3, substring +1, category match +2, tiebreak by price asc

## Conventions
- All new API routes go under `src/app/api/`
- Tailwind v4 (PostCSS plugin) — no `tailwind.config.js`; config is in CSS
- Do NOT use `turso` or `@libsql/client` — the project migrated to Neon
