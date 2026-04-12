# Victory GT Worker

Raspberry Pi worker that syncs Victory Ganei Tikva prices and promos to the Neon database.

## Run

```bash
# Once
python scanner.py

# Continuously (08:00 and 14:00 daily)
python scanner.py --watch

# Cron alternative
0 8,14 * * * cd /home/pi/victory-gt/worker && source venv/bin/activate && python scanner.py >> /var/log/victory.log 2>&1
```

## Scan flow

1. **Fetch file index** — GET `laibcatalog.co.il/NBCompetitionRegulations.aspx?code=7290696200003&fileType=all`. Parses all `Price`/`PriceFull`/`Promo`/`PromoFull`/`Stores` `.xml.gz` filenames from the response. No caching — fetched fresh every run so new hourly files are always visible.

2. **Fetch & upsert branches** — downloads the `StoresFull` file, parses all branches, upserts to the `branches` table.

3. **Resolve branch ID** — uses `GANEI_TIKVA_BRANCH_ID` from `.env`, or auto-detects Ganei Tikva by name from the parsed branches.

4. **Filter new files** — loads `last_files_cache.json` (a persistent set of already-processed filenames). Only files whose names are not in that set are processed. Files are never reprocessed once recorded, regardless of date.

5. **Process new files** — fetches and parses the new `Price`/`PriceFull`/`Promo`/`PromoFull` XML files for branch 028:
   - Upserts products to the `products` table
   - Categorizes products via Gemini if category is missing
   - Upserts promos to the `promos` table
   - Marks products not in the feed as unavailable — **only when a `PriceFull` file is present** in the new batch (incremental `Price` files are partial and would wrongly mark in-stock products as unavailable)
   - Deletes stale promos no longer in the feed — **only when a `PromoFull` file is present** (same reasoning as above)
   - Appends the newly processed filenames to `last_files_cache.json`

6. **Sync images** — fetches missing product images from `pricez.co.il`, compresses them, saves to `public/products/`, and commits to the repo.

## State files

| File | Purpose |
|------|---------|
| `last_files_cache.json` | Persistent set of already-processed XML filenames — prevents reprocessing |
| `category_cache.json` | Gemini category assignments cache |
| `image_404_cache.json` | Product image codes that returned 404 (TTL: 7 days) |
