"""
Fetch new product images from pricez, compress, and copy to public/products/.
Run from the worker directory:
  source venv/bin/activate && python upload_images.py

After running, commit and push public/products/ to deploy new images.
"""

import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor

import requests
import psycopg2
import psycopg2.extras
from PIL import Image
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")

DATABASE_URL = os.environ["DATABASE_URL"]
GANEI_TIKVA_BRANCH_ID = os.environ.get("GANEI_TIKVA_BRANCH_ID", "")

PRICEZ_IMAGE_URL = "https://m.pricez.co.il/ProductPictures/{item_code}.jpg"
WORKERS = 2
IMAGE_SIZE = 300
IMAGE_QUALITY = 70

_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(_DIR, "images")
PUBLIC_DIR = os.path.join(_DIR, "..", "public", "products")

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://m.pricez.co.il/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
})
session.mount("https://", requests.adapters.HTTPAdapter(pool_connections=WORKERS, pool_maxsize=WORKERS))


def get_all_item_codes() -> list[str]:
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    url = DATABASE_URL
    parsed = urlparse(url)
    endpoint_id = parsed.hostname.split(".")[0] if parsed.hostname else None
    if endpoint_id:
        qs = parse_qs(parsed.query)
        opts = qs.get("options", [""])[0]
        if "endpoint=" not in opts:
            opts = (opts + f" endpoint={endpoint_id}").strip()
        qs["options"] = [opts]
        url = urlunparse(parsed._replace(query=urlencode(qs, doseq=True)))
    with psycopg2.connect(url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT DISTINCT item_code FROM products WHERE branch_id = %s AND is_available = TRUE",
                [GANEI_TIKVA_BRANCH_ID],
            )
            return [r["item_code"] for r in cur.fetchall()]


def fetch_image(item_code: str) -> str:
    """Download raw image to IMAGES_DIR. Returns 'ok', 'skip' (404), or 'err'."""
    dest = os.path.join(IMAGES_DIR, f"{item_code}.jpg")
    if os.path.exists(dest):
        return "ok"
    url = PRICEZ_IMAGE_URL.format(item_code=item_code)
    for attempt in range(3):
        try:
            r = session.get(url, timeout=15)
            if r.status_code == 404:
                return "skip"
            if r.status_code == 403:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            with open(dest, "wb") as f:
                f.write(r.content)
            time.sleep(0.5)
            return "ok"
        except Exception as e:
            log.warning("Fetch failed %s (attempt %d): %s", item_code, attempt + 1, e)
            time.sleep(2 ** attempt)
    return "err"


def compress_and_copy(item_code: str) -> bool:
    """Compress raw image and save to public/products/. Skips if already there."""
    src = os.path.join(IMAGES_DIR, f"{item_code}.jpg")
    dst = os.path.join(PUBLIC_DIR, f"{item_code}.jpg")
    if not os.path.exists(src) or os.path.exists(dst):
        return False
    try:
        img = Image.open(src)
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        else:
            img = img.convert("RGB")
        img.thumbnail((IMAGE_SIZE, IMAGE_SIZE))
        img.save(dst, "JPEG", quality=IMAGE_QUALITY, optimize=True)
        return True
    except Exception as e:
        log.warning("Compress failed %s: %s", item_code, e)
        return False


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(PUBLIC_DIR, exist_ok=True)

    log.info("Fetching product codes from DB...")
    all_codes = get_all_item_codes()
    log.info("Total products: %d", len(all_codes))

    # Only process codes not yet in public/products/
    missing = [c for c in all_codes if not os.path.exists(os.path.join(PUBLIC_DIR, f"{c}.jpg"))]
    log.info("New images to fetch: %d", len(missing))

    if not missing:
        log.info("Nothing to do.")
        return

    # Phase 1: download raw images
    log.info("=== Phase 1: Downloading images ===")
    ok = skip = err = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for i, result in enumerate(pool.map(fetch_image, missing), 1):
            if result == "ok": ok += 1
            elif result == "skip": skip += 1
            else: err += 1
            if i % 100 == 0:
                log.info("Progress: %d/%d (ok=%d, skip=%d, err=%d)", i, len(missing), ok, skip, err)
    log.info("Download done. ok=%d, skip=%d, err=%d", ok, skip, err)

    # Phase 2: compress and copy to public/products/
    log.info("=== Phase 2: Compressing images ===")
    copied = sum(1 for c in missing if compress_and_copy(c))
    log.info("Compress done. %d images copied to public/products/", copied)
    log.info("Run: git add ../public/products/ && git commit -m 'add product images' && git push")


if __name__ == "__main__":
    main()
