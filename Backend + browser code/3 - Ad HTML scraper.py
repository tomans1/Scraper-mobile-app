import os
import random
import re
import time
import requests

from bs4 import BeautifulSoup
from tqdm import tqdm

from http_client import HEADERS_POOL, new_scraper_session

DEBUG_HEADERS = False
DEFAULT_PROGRESS_URL = "http://127.0.0.1:5000/progress_update"
PROGRESS_URL = os.getenv("PROGRESS_URL", DEFAULT_PROGRESS_URL)

# === FILE DIRECTORY ===
DATA_DIR = "Data"
os.makedirs(DATA_DIR, exist_ok=True)

# === CLEAR PREVIOUS SCRAPED RESULTS IF EXIST ===
with open(os.path.join(DATA_DIR, "scraped_results.txt"), "w", encoding="utf-8") as f:
    f.write("")  # Empty file

# === CONFIGURATION ===
INPUT_FILE = os.path.join(DATA_DIR, "final_filtered_links.txt")
OUTPUT_FILE = os.path.join(DATA_DIR, "scraped_results.txt")
ACQUIRED_FILE = os.path.join(DATA_DIR, "acquired_links.txt")


def clean_url(url):
    match = re.match(r"^(https?://[^\s]+\.php)", url)
    return match.group(1) if match else url

def estimate_referer_from_ad_url(ad_url, acquired_file_path="Data/acquired_links.txt"):
    try:
        ad_id = ad_url.split("/inzerat/")[1].split("/")[0]
        with open(acquired_file_path, "r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                if ad_id in line:
                    page_offset = (idx // 20) * 20
                    return f"https://reality.bazos.sk/{page_offset}/" if page_offset > 0 else "https://reality.bazos.sk/"
        return "https://reality.bazos.sk/"
    except Exception:
        return "https://reality.bazos.sk/"

def scrape_ad_page(url, session):
    for attempt in range(5):
        try:
            print(f"\nAttempt {attempt+1}/5 Fetching {url}")
            headers = random.choice(HEADERS_POOL).copy()
            headers["Referer"] = estimate_referer_from_ad_url(url)

            resp = session.get(url, headers=headers, timeout=25, allow_redirects=True)

            if "inzeraty" in resp.url or resp.url != url:
                print(f"🔁 Skipping (redirected ad): {url} {resp.url}")
                return None

            if resp.status_code != 200:
                raise Exception(f"Status code {resp.status_code}")

            soup = BeautifulSoup(resp.text, "html.parser")

            description = soup.find("div", class_="popisdetail")
            description = description.get_text(strip=True) if description else "N/A"

            name = "N/A"
            table = soup.find("td", class_="listadvlevo")
            if table:
                inner = table.find("table")
                if inner:
                    tds = inner.find_all("td")
                    if len(tds) > 1:
                        span = tds[1].find("b")
                        if span:
                            inner_span = span.find("span")
                            if inner_span:
                                name = inner_span.get_text(strip=True)

            main_category = sub_category = "N/A"
            drobky = soup.find("div", class_="drobky")
            if drobky:
                links = drobky.find_all("a")
                if len(links) >= 4:
                    main_category = links[2].get_text(strip=True)
                    sub_category = links[3].get_text(strip=True)

            return {
                "url": url,
                "description": description,
                "name": name,
                "main_category": main_category,
                "sub_category": sub_category
            }

        except Exception as e:
            print(f"Request failed: {e}")
            time.sleep(random.uniform(0.5, 2))
            continue

    print(f"Skipping {url} after 5 failed attempts.\n")
    return None

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Input file not found: {INPUT_FILE}")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        raw_lines = [line.strip() for line in f if line.strip()]

    if not raw_lines:
        print("Input file is empty. Nothing to scrape.")
        return

    # true de-dup while preserving order
    cleaned_links = list(dict.fromkeys(clean_url(line) for line in raw_lines))
    total_ads = len(cleaned_links)
    print(f"\nLoaded {len(raw_lines)} lines from {INPUT_FILE}")
    print(f"Cleaned down to {total_ads} unique URLs\n")
    try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "3/5 Sťahovanie inzerátov", "done": 0, "total": total_ads},
            timeout=3,
        )
    except Exception:
        pass

    # Disable SSL verification to handle proxy-injected certificates
    session = new_scraper_session(verify_ssl=False)

    valid_count = 0

    with tqdm(total=total_ads, desc="Scraping ads") as pbar:
        for i, url in enumerate(cleaned_links, 1):
            result = scrape_ad_page(url, session)
            if result and result["description"] != "N/A":
                valid_count += 1
                result["index"] = valid_count

                with open(OUTPUT_FILE, "a", encoding="utf-8") as out:
                    out.write(f"Result #{result['index']}\n")
                    out.write(f"URL: {result['url']}\n")
                    out.write(f"Name: {result['name']}\n")
                    out.write(f"Description: {result['description']}\n")
                    out.write(f"Main Category: {result['main_category']}\n")
                    out.write(f"Sub Category: {result['sub_category']}\n")
                    out.write("=" * 60 + "\n")

                print(f"Saved result #{valid_count} {url}")
            else:
                print(f"No usable data for: {url}")

            try:
                requests.post(
                    PROGRESS_URL,
                    json={"phase": "3/5 Sťahovanie inzerátov", "done": i, "total": total_ads},
                    timeout=3,
                )
            except Exception:
                pass

            pbar.update(1)

    try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "3/5 Sťahovanie inzerátov", "done": total_ads, "total": total_ads},
            timeout=3,
        )
    except Exception:
        pass

    print(f"\nFinished scraping.\nValid results saved: {valid_count} {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
