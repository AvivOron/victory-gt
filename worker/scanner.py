"""
Victory Ganei Tikva Price Scanner — Raspberry Pi Worker
Fetches price & promo XML files from Israel's price transparency database
(laibcatalog.co.il) and upserts to Neon (Postgres).

Run once:
  python scanner.py

Run continuously (scans at 08:00 and 14:00 daily):
  python scanner.py --watch

Cron alternative:
  0 8,14 * * * cd /home/pi/victory-gt/worker && source venv/bin/activate && python scanner.py >> /var/log/victory.log 2>&1
"""

from __future__ import annotations

import os
import gzip
import re
import logging
import argparse
import time
import json
from io import BytesIO
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml.etree import ElementTree as ET

import subprocess

import requests
import schedule
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]
GANEI_TIKVA_BRANCH_ID: str = os.environ.get("GANEI_TIKVA_BRANCH_ID", "")

CHAIN_ID = "7290696200003"
BASE_URL = "https://laibcatalog.co.il/CompetitionRegulationsFiles/latest/"
API_URL = "https://laibcatalog.co.il/NBCompetitionRegulations.aspx"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Referer": "https://laibcatalog.co.il/NBCompetitionRegulations",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
SESSION.mount("https://", requests.adapters.HTTPAdapter(pool_connections=8, pool_maxsize=8))

_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_CACHE = os.path.join(_DIR, "filelist_cache.json")
CATEGORY_CACHE = os.path.join(_DIR, "category_cache.json")
LAST_FILES_CACHE = os.path.join(_DIR, "last_files_cache.json")
IMAGE_404_CACHE = os.path.join(_DIR, "image_404_cache.json")
IMAGE_404_TTL_DAYS = 7

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

PRICEZ_IMAGE_URL = "https://m.pricez.co.il/ProductPictures/{item_code}.jpg"
IMAGE_BATCH = 8

IMAGES_DIR = os.path.join(_DIR, "images")
PUBLIC_DIR = os.path.join(_DIR, "..", "public", "products")
REPO_DIR = os.path.join(_DIR, "..")
IMAGE_SIZE = 300
IMAGE_QUALITY = 70


MAX_WORKERS = 4  # conservative for Raspberry Pi
BATCH = 200      # rows per INSERT batch (SQLite has 999-param limit; 200*8cols=1600 — use individual upserts)
CATEGORY_BATCH = 80
DEFAULT_CATEGORY = "אחר"
CATEGORIES = [
    "פירות וירקות",
    "חלב ביצים ומעדנים",
    "בשר עוף ודגים",
    "מאפייה ולחמים",
    "קפואים",
    "מזווה ובישול",
    "חטיפים ומתוקים",
    "משקאות",
    "פארם וטיפוח",
    "ניקיון וחד פעמי",
    "תינוקות",
    "חיות מחמד",
    "אחר",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Neon / Postgres client ────────────────────────────────────────────────────

def get_conn():
    url = DATABASE_URL
    # Neon requires SNI; old libpq versions lack it, so pass the endpoint ID
    # as a query parameter instead: ?options=endpoint%3D<endpoint-id>
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    parsed = urlparse(url)
    endpoint_id = parsed.hostname.split(".")[0] if parsed.hostname else None
    if endpoint_id:
        qs = parse_qs(parsed.query)
        qs.setdefault("options", [])
        opts = qs["options"][0] if qs["options"] else ""
        if "endpoint=" not in opts:
            opts = (opts + f" endpoint={endpoint_id}").strip()
        qs["options"] = [opts]
        url = urlunparse(parsed._replace(query=urlencode(qs, doseq=True)))
    return psycopg2.connect(url)


def db_execute(statements: list[dict]) -> None:
    """Execute a batch of {sql, args} statements in a single transaction."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            for s in statements:
                cur.execute(s["sql"], s["args"])


def db_query(sql: str, args: list = []) -> list[dict]:
    """Run a SELECT and return rows as list of dicts."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]


def db_execute_ignore_errors(statements: list[dict]) -> None:
    for statement in statements:
        try:
            db_execute([statement])
        except Exception as e:
            log.debug("Ignoring schema statement failure for %s: %s", statement["sql"], e)


def ensure_schema() -> None:
    """Create tables and indexes if they don't exist."""
    db_execute([
        {"sql": """CREATE TABLE IF NOT EXISTS branches (
            branch_id TEXT PRIMARY KEY,
            chain_id TEXT,
            store_name TEXT,
            city TEXT,
            address TEXT,
            zip_code TEXT,
            last_updated TEXT
        )""", "args": []},
        {"sql": """CREATE TABLE IF NOT EXISTS products (
            item_code TEXT,
            branch_id TEXT,
            item_name TEXT,
            item_price REAL,
            unit_of_measure TEXT,
            quantity TEXT,
            category TEXT,
            manufacturer_name TEXT,
            last_updated TEXT,
            PRIMARY KEY (item_code, branch_id)
        )""", "args": []},
        {"sql": """CREATE TABLE IF NOT EXISTS promos (
            promotion_id TEXT,
            branch_id TEXT,
            description TEXT,
            discount_rate TEXT,
            min_qty TEXT,
            max_qty TEXT,
            min_purchase_amount TEXT,
            discounted_price TEXT,
            start_date TEXT,
            end_date TEXT,
            item_codes TEXT,
            last_updated TEXT,
            PRIMARY KEY (promotion_id, branch_id)
        )""", "args": []},
        {"sql": "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)", "args": []},
        {"sql": "CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id)", "args": []},
        {"sql": "CREATE INDEX IF NOT EXISTS idx_promos_branch ON promos(branch_id)", "args": []},
    ])
    # Migrate: add columns if they don't exist yet (existing DBs)
    db_execute_ignore_errors([
        {"sql": "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE", "args": []},
    ])


# ── Fetch helpers ─────────────────────────────────────────────────────────────
def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    r = SESSION.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def parse_xml_gz(data: bytes) -> ET.Element:
    with gzip.GzipFile(fileobj=BytesIO(data)) as f:
        content = f.read()
    return ET.fromstring(content)


def get_text(el: ET.Element, tag: str, default: str = "") -> str:
    child = el.find(tag)
    return child.text.strip() if child is not None and child.text else default


# ── AI categorization ─────────────────────────────────────────────────────────
def load_category_cache() -> dict[str, str]:
    if not os.path.exists(CATEGORY_CACHE):
        return {}
    try:
      with open(CATEGORY_CACHE) as fh:
          data = json.load(fh)
      return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_category_cache(cache: dict[str, str]) -> None:
    with open(CATEGORY_CACHE, "w") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2, sort_keys=True)


def normalize_category(value: str) -> str:
    return value if value in CATEGORIES else DEFAULT_CATEGORY


def categorize_with_gemini(rows: list[dict]) -> dict[str, str]:
    if not GEMINI_API_KEY or not rows:
        return {}

    prompt_rows = [
        {
            "item_code": r["item_code"],
            "item_name": r.get("item_name", ""),
            "manufacturer_name": r.get("manufacturer_name", ""),
        }
        for r in rows
    ]
    prompt = (
        "Categorize these Israeli supermarket products into exactly one category each. "
        "Return only a JSON object whose keys are item_code and values are categories. "
        f"Allowed categories: {', '.join(CATEGORIES)}.\n\n"
        f"Products:\n{json.dumps(prompt_rows, ensure_ascii=False)}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }
    response = SESSION.post(
        GEMINI_API_URL,
        params={"key": GEMINI_API_KEY},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        parsed = json.loads(match.group(0)) if match else {}

    return {
        str(code): normalize_category(str(category))
        for code, category in parsed.items()
        if isinstance(code, str)
    }


def categorize_products(products: list[dict]) -> list[dict]:
    if not products:
        return products

    cache = load_category_cache()
    uncached = [p for p in products if p["item_code"] not in cache]

    if not GEMINI_API_KEY:
        for product in products:
            product["category"] = cache.get(product["item_code"], DEFAULT_CATEGORY)
        log.info("Gemini key not set; using cached/default categories")
        return products

    log.info("Categorizing %d uncached products with Gemini", len(uncached))
    for i in range(0, len(uncached), CATEGORY_BATCH):
        batch = uncached[i : i + CATEGORY_BATCH]
        try:
            cache.update(categorize_with_gemini(batch))
            save_category_cache(cache)
            time.sleep(0.2)
        except Exception as e:
            log.warning("Gemini categorization failed for batch %d: %s", i // CATEGORY_BATCH + 1, e)
            for product in batch:
                cache.setdefault(product["item_code"], DEFAULT_CATEGORY)

    for product in products:
        product["category"] = cache.get(product["item_code"], DEFAULT_CATEGORY)
    return products


# ── File index ────────────────────────────────────────────────────────────────
def _scrape_file_list() -> list[str]:
    """Hit the index page and return filenames. Returns [] if blocked."""
    r = SESSION.get(API_URL, params={"code": CHAIN_ID, "fileType": "all"}, timeout=30)
    r.raise_for_status()
    html = r.text
    # Files appear as plain text references like Price7290696200003-028-202604100820-001.xml.gz
    files = re.findall(
        r'(?:Price|PriceFull|Promo|PromoFull|Stores|StoresFull)'
        r'\d{13}-\d{3}-\d{12}-\d{3}\.xml\.gz',
        html, re.IGNORECASE
    )
    return list(dict.fromkeys(files))  # deduplicate


def fetch_file_list() -> list[str]:
    """Return file list, using a same-day cache to avoid hammering the site."""
    today = datetime.now().strftime("%Y-%m-%d")

    # Load cache if it's from today
    if os.path.exists(FILE_CACHE):
        try:
            with open(FILE_CACHE) as fh:
                cached = json.load(fh)
            if cached.get("date") == today and cached.get("files"):
                log.info("Using cached file list (%d files from today)", len(cached["files"]))
                return cached["files"]
        except Exception:
            pass

    log.info("Fetching file index from site...")
    names = _scrape_file_list()
    log.info("Found %d files", len(names))

    if names:
        with open(FILE_CACHE, "w") as fh:
            json.dump({"date": today, "files": names}, fh)
    else:
        log.warning("No files returned — site may be rate-limiting. Will use direct URL construction.")

    return names


def build_branch_urls(branch_id: str) -> list[str]:
    """Construct file URLs directly without the index, using today's date."""
    today = datetime.now().strftime("%Y%m%d")
    # Each file type may have multiple time variants; we try common hour slots
    types = [
        ("Price", ""),
        ("PriceFull", "Full"),
        ("Promo", ""),
        ("PromoFull", "Full"),
    ]
    candidates = []
    for hours in ["0500", "0600", "0800", "0900", "1000", "1021", "1200"]:
        for prefix, _ in types:
            fname = f"{prefix}{CHAIN_ID}-{branch_id}-{today}{hours}-001.xml.gz"
            candidates.append(fname)
    return candidates


def file_url(fname: str) -> str:
    return f"{BASE_URL}{CHAIN_ID}/{fname}"


# ── Branches ──────────────────────────────────────────────────────────────────
KNOWN_STORES_FILE = f"StoresFull{CHAIN_ID}-000-{datetime.now().strftime('%Y%m%d')}0600-000.xml.gz"

def fetch_branches(files: list[str]) -> list[dict]:
    store_files = [f for f in files if "stores" in f.lower()]
    # Always include the known direct URL as fallback
    if not store_files:
        store_files = [KNOWN_STORES_FILE]
    for fname in store_files:
        try:
            log.info("Fetching stores file: %s", fname)
            data = fetch_bytes(file_url(fname))
            root = parse_xml_gz(data)
            branches = []
            for store in root.iter("Branch"):
                bid = get_text(store, "StoreID") or get_text(store, "StoreId") or get_text(store, "BranchNumber")
                if not bid:
                    continue
                branches.append({
                    "branch_id": bid,
                    "chain_id": CHAIN_ID,
                    "store_name": get_text(store, "StoreName") or get_text(store, "ChainName"),
                    "city": get_text(store, "City"),
                    "address": get_text(store, "Address"),
                    "zip_code": get_text(store, "ZIPCode") or get_text(store, "ZipCode"),
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                })
            log.info("Parsed %d branches", len(branches))
            return branches
        except Exception as e:
            log.warning("Failed to parse %s: %s", fname, e)
    return []


def find_ganei_tikva(branches: list[dict]) -> str | None:
    for b in branches:
        vals = " ".join([b.get("city", ""), b.get("address", ""), b.get("store_name", "")]).strip()
        if "גני תקווה" in vals or "גני-תקווה" in vals or "ganei tikva" in vals.lower():
            log.info("Found Ganei Tikva branch: %s (%s)", b["branch_id"], b["city"])
            return b["branch_id"]
    return None


# ── Price / promo parsers ─────────────────────────────────────────────────────
def parse_prices(data: bytes, branch_id: str) -> list[dict]:
    root = parse_xml_gz(data)
    now = datetime.now(timezone.utc).isoformat()
    products = []
    # Support both <Item> (standard) and <Product> (Victory PriceFull)
    items = list(root.iter("Item")) or list(root.iter("Product"))
    for item in items:
        code = get_text(item, "ItemCode")
        price_str = get_text(item, "ItemPrice")
        if not code or not price_str:
            continue
        try:
            price = float(price_str)
        except ValueError:
            continue
        products.append({
            "item_code": code,
            "item_name": get_text(item, "ItemName") or get_text(item, "ManufacturerItemDescription"),
            "item_price": price,
            # UnitQty / UnitOfMeasureName / UnitOfMeasure / UnitMeasure
            "unit_of_measure": (get_text(item, "UnitOfMeasureName")
                                or get_text(item, "UnitQty")
                                or get_text(item, "UnitMeasure")
                                or get_text(item, "UnitOfMeasure")),
            "quantity": get_text(item, "Quantity") or "1",
            "category": DEFAULT_CATEGORY,
            # ManufactureName (Victory) vs ManufacturerName (other chains)
            "manufacturer_name": get_text(item, "ManufacturerName") or get_text(item, "ManufactureName"),
            "branch_id": branch_id,
            "last_updated": now,
        })
    return products


def parse_promos(data: bytes, branch_id: str) -> list[dict]:
    root = parse_xml_gz(data)
    now = datetime.now(timezone.utc).isoformat()
    promos = []
    promotion_els = list(root.iter("Promotion"))
    sale_els = list(root.iter("Sale"))

    if promotion_els:
        # Standard format: one <Promotion> per promo, items nested inside
        for promo in promotion_els:
            pid = get_text(promo, "PromotionId") or get_text(promo, "PromotionID")
            if not pid:
                continue
            item_codes = [el.text.strip() for el in promo.iter("ItemCode") if el.text]
            promos.append({
                "promotion_id": pid,
                "description": get_text(promo, "PromotionDescription") or get_text(promo, "RewardDescription"),
                "discount_rate": get_text(promo, "DiscountRate"),
                "min_qty": get_text(promo, "MinQty"),
                "max_qty": get_text(promo, "MaxQty"),
                "min_purchase_amount": get_text(promo, "MinPurchaseAmnt") or get_text(promo, "MinPurchaseAmount"),
                "discounted_price": get_text(promo, "DiscountedPrice"),
                "start_date": get_text(promo, "PromotionStartDate"),
                "end_date": get_text(promo, "PromotionEndDate"),
                "item_codes": json.dumps(item_codes, ensure_ascii=False),
                "branch_id": branch_id,
                "last_updated": now,
            })
    elif sale_els:
        # Victory format: one <Sale> per item — group by PromotionID
        grouped: dict[str, dict] = {}
        for sale in sale_els:
            pid = get_text(sale, "PromotionID") or get_text(sale, "PromotionId")
            if not pid:
                continue
            code = get_text(sale, "ItemCode")
            if pid not in grouped:
                grouped[pid] = {
                    "promotion_id": pid,
                    "description": get_text(sale, "PromotionDescription") or get_text(sale, "RewardDescription"),
                    "discount_rate": get_text(sale, "DiscountRate"),
                    "min_qty": get_text(sale, "MinQty"),
                    "max_qty": get_text(sale, "MaxQty"),
                    "min_purchase_amount": get_text(sale, "MinPurchaseAmnt") or get_text(sale, "MinPurchaseAmount"),
                    "discounted_price": get_text(sale, "DiscountedPrice"),
                    "start_date": get_text(sale, "PromotionStartDate"),
                    "end_date": get_text(sale, "PromotionEndDate"),
                    "item_codes": [],
                    "branch_id": branch_id,
                    "last_updated": now,
                }
            if code:
                grouped[pid]["item_codes"].append(code)
        for p in grouped.values():
            p["item_codes"] = json.dumps(p["item_codes"], ensure_ascii=False)
            promos.append(p)

    return promos


def fetch_branch_data(branch_id: str, files: list[str]) -> tuple[list[dict], list[dict]]:
    branch_files = [f for f in files if f"-{branch_id}-" in f]
    if not branch_files:
        log.info("No files from index for branch %s — trying direct URL construction", branch_id)
        branch_files = build_branch_urls(branch_id)
    log.info("Branch %s: trying %d files", branch_id, len(branch_files))

    all_products: list[dict] = []
    all_promos: list[dict] = []

    def fetch_one(fname: str):
        try:
            data = fetch_bytes(file_url(fname))
            if "promo" in fname.lower():
                return "promo", parse_promos(data, branch_id)
            else:
                return "price", parse_prices(data, branch_id)
        except Exception as e:
            log.warning("Failed %s: %s", fname, e)
            return None, []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        for kind, rows in pool.map(fetch_one, branch_files):
            if kind == "price":
                all_products.extend(rows)
            elif kind == "promo":
                all_promos.extend(rows)

    log.info("Branch %s: %d products, %d promos", branch_id, len(all_products), len(all_promos))
    return all_products, all_promos


# ── Neon upsert ───────────────────────────────────────────────────────────────
def upsert_branches(rows: list[dict]) -> None:
    if not rows:
        return
    log.info("Upserting %d branches...", len(rows))
    stmts = [
        {"sql": """INSERT INTO branches (branch_id,chain_id,store_name,city,address,zip_code,last_updated)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (branch_id) DO UPDATE SET
                     chain_id=EXCLUDED.chain_id, store_name=EXCLUDED.store_name,
                     city=EXCLUDED.city, address=EXCLUDED.address,
                     zip_code=EXCLUDED.zip_code, last_updated=EXCLUDED.last_updated""",
         "args": [r["branch_id"], r["chain_id"], r["store_name"], r["city"], r["address"], r["zip_code"], r["last_updated"]]}
        for r in rows
    ]
    for i in range(0, len(stmts), BATCH):
        db_execute(stmts[i : i + BATCH])
    log.info("Branches done")


def upsert_products(rows: list[dict]) -> None:
    if not rows:
        return
    log.info("Upserting %d products...", len(rows))
    stmts = [
        {"sql": """INSERT INTO products (item_code,branch_id,item_name,item_price,unit_of_measure,quantity,category,manufacturer_name,last_updated,is_available)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE)
                   ON CONFLICT (item_code, branch_id) DO UPDATE SET
                     item_name=EXCLUDED.item_name, item_price=EXCLUDED.item_price,
                     unit_of_measure=EXCLUDED.unit_of_measure, quantity=EXCLUDED.quantity,
                     category=EXCLUDED.category, manufacturer_name=EXCLUDED.manufacturer_name,
                     last_updated=EXCLUDED.last_updated, is_available=TRUE""",
         "args": [r["item_code"], r["branch_id"], r["item_name"], r["item_price"], r["unit_of_measure"], r["quantity"], r.get("category", DEFAULT_CATEGORY), r["manufacturer_name"], r["last_updated"]]}
        for r in rows
    ]
    for i in range(0, len(stmts), BATCH):
        db_execute(stmts[i : i + BATCH])
    log.info("Products done")


def upsert_promos(rows: list[dict]) -> None:
    if not rows:
        return
    log.info("Upserting %d promos...", len(rows))
    stmts = [
        {"sql": """INSERT INTO promos (promotion_id,branch_id,description,discount_rate,min_qty,max_qty,min_purchase_amount,discounted_price,start_date,end_date,item_codes,last_updated)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (promotion_id, branch_id) DO UPDATE SET
                     description=EXCLUDED.description, discount_rate=EXCLUDED.discount_rate,
                     min_qty=EXCLUDED.min_qty, max_qty=EXCLUDED.max_qty,
                     min_purchase_amount=EXCLUDED.min_purchase_amount, discounted_price=EXCLUDED.discounted_price,
                     start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
                     item_codes=EXCLUDED.item_codes, last_updated=EXCLUDED.last_updated""",
         "args": [r["promotion_id"], r["branch_id"], r["description"], r["discount_rate"], r["min_qty"], r["max_qty"], r["min_purchase_amount"], r["discounted_price"], r["start_date"], r["end_date"], r["item_codes"], r["last_updated"]]}
        for r in rows
    ]
    for i in range(0, len(stmts), BATCH):
        db_execute(stmts[i : i + BATCH])
    log.info("Promos done")


def mark_unavailable_products(branch_id: str, fresh_item_codes: set[str]) -> None:
    if not fresh_item_codes:
        log.warning("No fresh products — skipping unavailability marking to avoid wiping DB.")
        return
    existing = db_query("SELECT item_code FROM products WHERE branch_id = %s AND is_available = TRUE", [branch_id])
    stale = [r["item_code"] for r in existing if r["item_code"] not in fresh_item_codes]
    if not stale:
        log.info("No products to mark unavailable.")
        return
    log.info("Marking %d products unavailable for branch %s", len(stale), branch_id)
    db_execute([{"sql": "UPDATE products SET is_available = FALSE WHERE branch_id = %s AND item_code = ANY(%s)", "args": [branch_id, stale]}])
    log.info("Products marked unavailable.")


def delete_stale_promos(branch_id: str, fresh_promo_ids: set[str]) -> None:
    if not fresh_promo_ids:
        log.warning("No fresh promos — skipping stale promo deletion to avoid wiping DB.")
        return
    existing = db_query("SELECT promotion_id FROM promos WHERE branch_id = %s", [branch_id])
    stale = [r["promotion_id"] for r in existing if r["promotion_id"] not in fresh_promo_ids]
    if not stale:
        log.info("No stale promos to delete.")
        return
    log.info("Deleting %d stale promos for branch %s", len(stale), branch_id)
    db_execute([{"sql": "DELETE FROM promos WHERE branch_id = %s AND promotion_id = ANY(%s)", "args": [branch_id, stale]}])
    log.info("Stale promos deleted.")


# ── Image fetch + compress ────────────────────────────────────────────────────

def load_404_cache() -> dict[str, str]:
    try:
        with open(IMAGE_404_CACHE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_404_cache(cache: dict[str, str]) -> None:
    with open(IMAGE_404_CACHE, "w") as f:
        json.dump(cache, f)

def fetch_image(item_code: str) -> str:
    """Download raw image from pricez to IMAGES_DIR. Returns 'ok', 'skip', or 'err'."""
    dest = os.path.join(IMAGES_DIR, f"{item_code}.jpg")
    if os.path.exists(dest):
        return "ok"
    url = PRICEZ_IMAGE_URL.format(item_code=item_code)
    for attempt in range(3):
        try:
            r = SESSION.get(url, timeout=15)
            if r.status_code == 404:
                return "skip"
            if r.status_code == 403:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            with open(dest, "wb") as f:
                f.write(r.content)
            return "ok"
        except Exception as e:
            log.warning("Image fetch failed %s (attempt %d): %s", item_code, attempt + 1, e)
            time.sleep(2 ** attempt)
    return "err"


def compress_image(item_code: str) -> bool:
    """Compress raw image and copy to PUBLIC_DIR. Returns True if newly copied."""
    from PIL import Image as PILImage
    src = os.path.join(IMAGES_DIR, f"{item_code}.jpg")
    dst = os.path.join(PUBLIC_DIR, f"{item_code}.jpg")
    if not os.path.exists(src) or os.path.exists(dst):
        return False
    try:
        img = PILImage.open(src)
        if img.mode in ("RGBA", "LA", "P"):
            bg = PILImage.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = bg
        else:
            img = img.convert("RGB")
        img.thumbnail((IMAGE_SIZE, IMAGE_SIZE))
        img.save(dst, "JPEG", quality=IMAGE_QUALITY, optimize=True)
        return True
    except Exception as e:
        log.warning("Compress failed %s: %s", item_code, e)
        return False


def git_sync_images() -> None:
    """Pull latest, commit new product images, and push."""
    def run(cmd: str) -> str:
        return subprocess.check_output(cmd.split(), cwd=REPO_DIR, stderr=subprocess.STDOUT).decode().strip()
    try:
        log.info("git pull...")
        run("git pull --rebase")
        status = run("git status --short public/products")
        if not status:
            log.info("No new images to commit.")
            return
        new_count = len(status.strip().splitlines())
        run("git add public/products")
        run(f'git commit -m "add {new_count} product images [ci skip]"')
        log.info("git push...")
        run("git push")
        log.info("Pushed %d new images to git.", new_count)
    except subprocess.CalledProcessError as e:
        log.warning("git sync failed: %s", e.output.decode())


def sync_images(branch_id: str) -> None:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    all_codes = [r["item_code"] for r in db_query(
        "SELECT DISTINCT item_code FROM products WHERE branch_id = %s AND is_available = TRUE", [branch_id]
    )]
    missing = [c for c in all_codes if not os.path.exists(os.path.join(PUBLIC_DIR, f"{c}.jpg"))]

    log.info("Images missing from repo: %d", len(missing))
    if not missing:
        return

    # Filter out codes that returned 404 recently
    cache_404 = load_404_cache()
    cutoff = (datetime.now(timezone.utc).timestamp()) - IMAGE_404_TTL_DAYS * 86400
    to_fetch = [c for c in missing if cache_404.get(c, 0) < cutoff]
    skipped_404 = len(missing) - len(to_fetch)
    if skipped_404:
        log.info("Skipping %d codes with recent 404 (within %d days)", skipped_404, IMAGE_404_TTL_DAYS)

    log.info("Fetching %d images from pricez...", len(to_fetch))
    ok = err = 0
    new_404s: list[str] = []
    with ThreadPoolExecutor(max_workers=IMAGE_BATCH) as pool:
        for i, (code, result) in enumerate(zip(to_fetch, pool.map(fetch_image, to_fetch)), 1):
            if result == "ok": ok += 1
            elif result == "skip": new_404s.append(code)
            else: err += 1
            if i % 100 == 0 or i == len(to_fetch):
                log.info("%d/%d processed (ok=%d, 404=%d, err=%d)", i, len(to_fetch), ok, len(new_404s), err)

    if new_404s:
        now_ts = datetime.now(timezone.utc).timestamp()
        for code in new_404s:
            cache_404[code] = now_ts
        save_404_cache(cache_404)

    log.info("Image fetch done. ok=%d, 404=%d, err=%d", ok, len(new_404s), err)

    copied = sum(1 for c in missing if compress_image(c))
    log.info("Images compressed and ready: %d", copied)

    if copied:
        git_sync_images()


# ── Main scan ─────────────────────────────────────────────────────────────────
def run_scan() -> None:
    log.info("=== Starting Victory GT scan ===")
    start = time.time()
    ensure_schema()

    files = fetch_file_list()
    branches = fetch_branches(files)

    if branches:
        upsert_branches(branches)

    branch_id = GANEI_TIKVA_BRANCH_ID or find_ganei_tikva(branches)
    if not branch_id:
        ids = list({
            re.search(r"-(\d+)-\d{12}", f).group(1)
            for f in files
            if re.search(r"-(\d+)-\d{12}", f)
        })
        log.warning("Could not find Ganei Tikva branch. Available IDs: %s", ids)
        log.warning("Set GANEI_TIKVA_BRANCH_ID in .env and rerun.")
        return

    with open("branch_id.txt", "w") as fh:
        fh.write(branch_id)
    log.info("Using branch ID: %s", branch_id)

    branch_files = sorted(f for f in files if f"-{branch_id}-" in f)

    # Skip upsert if source files haven't changed since last successful scan
    skip_upsert = False
    try:
        with open(LAST_FILES_CACHE) as fh:
            last_files = json.load(fh)
        if last_files == branch_files:
            log.info("Source files unchanged — skipping upsert.")
            skip_upsert = True
    except Exception:
        pass

    if not skip_upsert:
        products, promos = fetch_branch_data(branch_id, files)
        products = categorize_products(products)
        upsert_products(products)
        upsert_promos(promos)
        mark_unavailable_products(branch_id, {p["item_code"] for p in products})
        delete_stale_promos(branch_id, {p["promotion_id"] for p in promos})
        with open(LAST_FILES_CACHE, "w") as fh:
            json.dump(branch_files, fh)

    sync_images(branch_id)

    log.info("=== Scan complete in %.1fs ===", time.time() - start)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Victory GT price scanner")
    parser.add_argument("--watch", action="store_true", help="Run on schedule instead of once")
    args = parser.parse_args()

    if args.watch:
        log.info("Watch mode: scanning now, then daily at 08:00 and 14:00")
        run_scan()
        schedule.every().day.at("08:00").do(run_scan)
        schedule.every().day.at("14:00").do(run_scan)
        while True:
            schedule.run_pending()
            time.sleep(60)
    else:
        run_scan()
