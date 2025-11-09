import os
import random
import time
from datetime import datetime

from bs4 import BeautifulSoup
from tqdm import tqdm
import requests

from http_client import HEADERS_POOL, new_scraper_session



# Configuration
SITEMAP_INDEX = "https://reality.bazos.sk/sitemap.php"
DEFAULT_PROGRESS_URL = "http://127.0.0.1:5000/progress_update"
PROGRESS_URL = os.getenv("PROGRESS_URL", DEFAULT_PROGRESS_URL)

# === FILE DIRECTORY ===
DATA_DIR = "Data"

# Ensure the directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# === FILE PATHS ===
ACQUIRED_FILE = os.path.join(DATA_DIR, "acquired_links.txt")
OLD_FILE = os.path.join(DATA_DIR, "old_results.txt")
NEW_FILE = os.path.join(DATA_DIR, "new_links.txt")

DELAY_SECONDS = 0

# Main scraper functions
def get_sitemap_pages(session):
    resp = session.get(SITEMAP_INDEX, headers=random.choice(HEADERS_POOL), timeout=25)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "xml")
    sitemap_urls = [loc.text for loc in soup.find_all("loc")]
    return [url for url in sitemap_urls if "sitemapdetail.php" in url]

def get_ad_entries(sitemap_url, session):
    time.sleep(DELAY_SECONDS)
    resp = session.get(sitemap_url, headers=random.choice(HEADERS_POOL), timeout=25)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "xml")
    entries = []
    for url_tag in soup.find_all("url"):
        loc_tag = url_tag.find("loc")
        lastmod_tag = url_tag.find("lastmod")
        if loc_tag and lastmod_tag:
            url = loc_tag.text.strip()
            raw_datetime = lastmod_tag.text.strip()
            try:
                dt = datetime.fromisoformat(raw_datetime)
                formatted_dt = dt.strftime("%d/%m/%Y %H:%M")
            except Exception:
                formatted_dt = raw_datetime
            entries.append((url, formatted_dt))
    return entries


def save_links_to_file(links, filename):
    with open(filename, "w", encoding="utf-8") as f:
        for link, date in links:
            f.write(f"{link} {date}\n")

def compare_links(old_file, new_file, output_file):
    old_links = set()
    new_entries = []

    if os.path.exists(old_file):
        with open(old_file, "r", encoding="utf-8") as f:
            old_links = set(line.strip().split()[0] for line in f if line.strip())

    if os.path.exists(new_file):
        with open(new_file, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split(maxsplit=1)
                if parts and parts[0] not in old_links:
                    new_entries.append(line.strip())

    with open(output_file, "w", encoding="utf-8") as f:
        for entry in new_entries:
            f.write(entry + "\n")

# Main
if __name__ == "__main__":
    from storage import save_old_links  # <-- add this import so we can push to GitHub

    # Step 1: Backup old acquired links
    if os.path.exists(ACQUIRED_FILE):
        with open(ACQUIRED_FILE, "r", encoding="utf-8") as src:
            with open(OLD_FILE, "w", encoding="utf-8") as dst:
                dst.write(src.read())

    # Proxy session that uses Bright Data when available and falls back to
    # static proxies or direct connection when not.
    session = new_scraper_session(verify_ssl=False)

    print("Fetching sitemap pages...")
    try:
        sitemap_pages = get_sitemap_pages(session)
    except Exception as e:
        print(f"Failed to fetch sitemap index: {e}")
        raise SystemExit(1)

    print("Scraping ad URLs and formatted dates from sitemaps...")
    all_entries = []
    total = len(sitemap_pages)
    # Notify backend about total sitemaps
    try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "1/5 Zber sitemap", "done": 0, "total": total},
            timeout=3,
        )
    except Exception:
        pass

    for idx, page in enumerate(tqdm(sitemap_pages, bar_format="{n_fmt}/{total_fmt} sitemaps"), 1):
        try:
            entries = get_ad_entries(page, session)
            all_entries.extend(entries)
        except Exception as e:
            print(f"Failed to fetch {page}: {e}")
        try:
            requests.post(
                PROGRESS_URL,
                json={"phase": "1/5 Zber sitemap", "done": idx, "total": total},
                timeout=3,
            )
        except Exception:
            pass

    print(f"\nTotal ad entries scraped: {len(all_entries)}")

    # Step 2: Save all new links with dates to acquired_links.txt
    save_links_to_file(all_entries, ACQUIRED_FILE)

    # Step 3: Compare with old and save new ones
    compare_links(OLD_FILE, ACQUIRED_FILE, NEW_FILE)

    try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "1/5 Zber sitemap", "done": total, "total": total},
            timeout=3,
        )
    except Exception:
        pass

    # NEW: Immediately publish the freshly acquired links to GitHub as "old links"
    try:
        with open(ACQUIRED_FILE, "r", encoding="utf-8") as f:
            current_links = [line.strip() for line in f if line.strip()]
        save_old_links(current_links)
        print("✅ Pushed acquired links to GitHub as Data/old_results.txt")
    except Exception as e:
        print(f"❌ Failed to push old_results.txt to GitHub: {e}")

    print(f"Saved to {ACQUIRED_FILE}, compared with {OLD_FILE}, new ones in {NEW_FILE}")
