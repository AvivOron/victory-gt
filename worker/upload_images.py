"""
One-off script: fetch product images from pricez and upload to Vercel Blob.
Run from the worker directory:
  source venv/bin/activate && python upload_images.py
"""

import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")

DATABASE_URL = os.environ["DATABASE_URL"]
BLOB_READ_WRITE_TOKEN = os.environ["BLOB_READ_WRITE_TOKEN"]
GANEI_TIKVA_BRANCH_ID = os.environ.get("GANEI_TIKVA_BRANCH_ID", "")

BLOB_BASE = "https://1xwed3vbdtn2bscw.public.blob.vercel-storage.com"
PRICEZ_IMAGE_URL = "https://m.pricez.co.il/ProductPictures/{item_code}.jpg"
WORKERS = 2

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


def list_uploaded_codes() -> set[str]:
    uploaded = set()
    cursor = None
    while True:
        params = {"prefix": "products/", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        r = requests.get(
            "https://blob.vercel-storage.com",
            params=params,
            headers={"Authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        for blob in data.get("blobs", []):
            p = blob.get("pathname", "")
            if p.startswith("products/") and p.endswith(".jpg"):
                uploaded.add(p[len("products/"):-len(".jpg")])
        cursor = data.get("cursor")
        if not cursor:
            break
    log.info("Already in Blob: %d images", len(uploaded))
    return uploaded


def upload(item_code: str, image_bytes: bytes) -> bool:
    r = requests.put(
        f"https://blob.vercel-storage.com/products/{item_code}.jpg",
        data=image_bytes,
        headers={
            "Authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}",
            "Content-Type": "image/jpeg",
            "x-add-random-suffix": "0",
            "x-access": "public",
        },
        timeout=30,
    )
    r.raise_for_status()
    return True


IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")


def fetch_image(item_code: str) -> str:
    """Download image to local dir. Returns 'ok', 'skip' (404), or 'err'."""
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


def upload_file(item_code: str) -> str:
    """Upload a locally saved image to Vercel Blob. Returns 'ok' or 'err'."""
    path = os.path.join(IMAGES_DIR, f"{item_code}.jpg")
    try:
        with open(path, "rb") as f:
            upload(item_code, f.read())
        return "ok"
    except Exception as e:
        log.warning("Upload failed %s: %s", item_code, e)
        return "err"


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    log.info("Fetching product codes from DB...")
    all_codes = get_all_item_codes()
    log.info("Total products: %d", len(all_codes))

    already = list_uploaded_codes()
    missing = [c for c in all_codes if c not in already]
    log.info("To process: %d", len(missing))

    if not missing:
        log.info("Nothing to do.")
        return

    # Phase 1: download all images locally
    log.info("=== Phase 1: Downloading images ===")
    ok = skip = err = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for i, result in enumerate(pool.map(fetch_image, missing), 1):
            if result == "ok": ok += 1
            elif result == "skip": skip += 1
            else: err += 1
            if i % 100 == 0:
                log.info("Download progress: %d/%d (ok=%d, skip=%d, err=%d)", i, len(missing), ok, skip, err)
    log.info("Download done. ok=%d, skip=%d, err=%d", ok, skip, err)

    # Phase 2: upload all saved images to Vercel Blob
    to_upload = [c for c in missing if os.path.exists(os.path.join(IMAGES_DIR, f"{c}.jpg"))]
    log.info("=== Phase 2: Uploading %d images to Vercel Blob ===", len(to_upload))
    ok = err = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for i, result in enumerate(pool.map(upload_file, to_upload), 1):
            if result == "ok": ok += 1
            else: err += 1
            if i % 100 == 0:
                log.info("Upload progress: %d/%d (ok=%d, err=%d)", i, len(to_upload), ok, err)
    log.info("Upload done. ok=%d, err=%d", ok, err)


if __name__ == "__main__":
    main()
