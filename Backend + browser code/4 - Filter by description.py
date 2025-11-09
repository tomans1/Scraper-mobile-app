import os
import re
from collections import Counter
from tqdm import tqdm
import argparse
import requests

from storage import load_keyword_sets


# === FILE DIRECTORY SETUP ===
DATA_DIR = "Data"
os.makedirs(DATA_DIR, exist_ok=True)

# === FILE PATHS ===
INPUT_FILE = os.path.join(DATA_DIR, "scraped_results.txt")
OUTPUT_FILE = os.path.join(DATA_DIR, "phase2_filtered_links.txt")
REMOVED_FILE = os.path.join(DATA_DIR, "phase2_removed.txt")
KEYWORDS_FILE = os.path.join(DATA_DIR, "keywords.txt")
SUGGESTIONS_FILE = os.path.join(DATA_DIR, "keyword_suggestions.txt")
DEFAULT_PROGRESS_URL = "http://127.0.0.1:5000/progress_update"
PROGRESS_URL = os.getenv("PROGRESS_URL", DEFAULT_PROGRESS_URL)

# === CONFIG ===
SECONDARY_MIN_RATIO = 10
SECONDARY_MIN_COUNT = 20
MAX_SECONDARY_SUGGESTIONS = 25

# === LOAD KEYWORDS ===
agency_primary, non_sale_primary, filler_words = load_keyword_sets()

# === Helpers ===
def extract_blocks(filename):
    blocks = []
    with open(filename, "r", encoding="utf-8") as f:
        current = {}
        for line in f:
            line = line.strip()
            if line.startswith("Result"):
                if current:
                    blocks.append(current)
                current = {"index": line}
            elif line.startswith("URL:"):
                current["url"] = line[len("URL:"):].strip()
            elif line.startswith("Name:"):
                current["name"] = line[len("Name:"):].strip()
            elif line.startswith("Description:"):
                current["description"] = line[len("Description:"):].strip()
            elif line.startswith("Main Category:"):
                current["main_category"] = line[len("Main Category:"):].strip()
            elif line.startswith("Sub Category:"):
                current["sub_category"] = line[len("Sub Category:"):].strip()
        if current:
            blocks.append(current)
    return blocks

def normalize(text):
    text = text.lower()
    text = re.sub(r"s\s*\.\s*r\s*\.\s*o\s*\.*", "s.r.o", text)
    return text


def tokenize(text): 
    normalized = normalize(text)
    tokens = re.findall(r"\b[\w.]+\b", normalized)
    return [t.rstrip(".,;:!?") for t in tokens]



ads = extract_blocks(INPUT_FILE)
total = len(ads)
try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "4/5 – Filtrovanie podľa popisu", "done": 0, "total": total},
            timeout=3,
        )
except Exception:
    pass

# === ARGUMENT PARSING FOR SUBCATEGORY FILTERING ===
parser = argparse.ArgumentParser()
parser.add_argument("subcategories", nargs="?", default="", help="Comma-separated list of allowed subcategories")
args = parser.parse_args()
allowed_subcategories = set(x.strip() for x in args.subcategories.split(",") if x.strip())


final_ads = []
removed_ads = []

agency_counts_removed = Counter()
agency_counts_final = Counter()
rent_counts_removed = Counter()
rent_counts_final = Counter()

for idx, ad in enumerate(tqdm(ads, desc="Filtering ads"), 1):
    if allowed_subcategories and ad.get("sub_category") not in allowed_subcategories:
        continue
    reasons = []
    name_tokens = tokenize(ad.get("name", ""))
    desc_tokens = tokenize(ad.get("description", ""))
    all_tokens = name_tokens + desc_tokens

    agency_name_matches = [tok for tok in name_tokens if tok in agency_primary]
    agency_desc_matches = [tok for tok in desc_tokens if tok in agency_primary]
    rent_matches = [tok for tok in desc_tokens if tok in non_sale_primary]

    if ad.get("main_category", "").lower() != "predaj":
        reasons.append("Category != Predaj")

    if agency_name_matches:
        reasons.append("Agency keyword in name: " + ", ".join(sorted(set(agency_name_matches))))
        agency_counts_removed.update(t for t in name_tokens if t not in filler_words and not t.isdigit())
    else:
        agency_counts_final.update(t for t in name_tokens if t not in filler_words and not t.isdigit())

    if agency_desc_matches:
        reasons.append("Agency keyword in description: " + ", ".join(sorted(set(agency_desc_matches))))
        agency_counts_removed.update(t for t in desc_tokens if t not in filler_words and not t.isdigit())
    else:
        agency_counts_final.update(t for t in desc_tokens if t not in filler_words and not t.isdigit())

    if rent_matches:
        reasons.append("Rent/Other keyword in description: " + ", ".join(sorted(set(rent_matches))))
        rent_counts_removed.update(t for t in desc_tokens if t not in filler_words and not t.isdigit())
    else:
        rent_counts_final.update(t for t in desc_tokens if t not in filler_words and not t.isdigit())

    if reasons:
        ad["reason"] = " | ".join(reasons)
        removed_ads.append(ad)
    else:
        final_ads.append(ad)
    try:
                requests.post(
                    PROGRESS_URL,
                    json={"phase": "4/5 – Filtrovanie podľa popisu", "done": idx, "total": total},
                    timeout=3,
                )
    except Exception:
        pass

# === Write filtered ads ===
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    for ad in final_ads:
        f.write(f"{ad['index']}\n")
        f.write(f"URL: {ad['url']}\n")
        f.write(f"Name: {ad['name']}\n")
        f.write(f"Description: {ad['description']}\n")
        f.write(f"Main Category: {ad['main_category']}\n")
        f.write(f"Sub Category: {ad.get('sub_category', 'N/A')}\n")
        f.write("="*60 + "\n")

# === Write removed ads with reasons ===
with open(REMOVED_FILE, "w", encoding="utf-8") as f:
    for ad in removed_ads:
        f.write(f"{ad['index']}\n")
        f.write(f"Reason: {ad['reason']}\n")
        f.write(f"URL: {ad['url']}\n")
        f.write(f"Name: {ad['name']}\n")
        f.write(f"Description: {ad['description']}\n")
        f.write(f"Main Category: {ad['main_category']}\n")
        f.write(f"Sub Category: {ad['sub_category']}\n")
        f.write("="*60 + "\n")

# === Compute secondary suggestions ===
secondary_agency_stats = [
    (t, agency_counts_removed[t], agency_counts_final[t], agency_counts_removed[t] / (agency_counts_final[t] + 1))
    for t in agency_counts_removed
    if agency_counts_removed[t] >= SECONDARY_MIN_COUNT
    and t not in agency_primary
    and not t.isdigit()
    and t not in filler_words
    and (agency_counts_removed[t] / (agency_counts_final[t] + 1)) >= SECONDARY_MIN_RATIO
]

secondary_rent_stats = [
    (t, rent_counts_removed[t], rent_counts_final[t], rent_counts_removed[t] / (rent_counts_final[t] + 1))
    for t in rent_counts_removed
    if rent_counts_removed[t] >= SECONDARY_MIN_COUNT
    and t not in non_sale_primary
    and not t.isdigit()
    and t not in filler_words
    and (rent_counts_removed[t] / (rent_counts_final[t] + 1)) >= SECONDARY_MIN_RATIO
]

# === Write suggestions to separate file ===
with open(SUGGESTIONS_FILE, "w", encoding="utf-8") as f:
    f.write("=== SUGGESTED SECONDARY KEYWORDS ===\n\n")
    f.write("--- Secondary Agency Keywords ---\n")
    for token, r, f_, ratio in sorted(secondary_agency_stats, key=lambda x: -x[3])[:MAX_SECONDARY_SUGGESTIONS]:
        f.write(f"{token}: removed={r}, kept={f_}, ratio={ratio:.2f}\n")

    f.write("\n--- Secondary Rent/Other Keywords ---\n")
    for token, r, f_, ratio in sorted(secondary_rent_stats, key=lambda x: -x[3])[:MAX_SECONDARY_SUGGESTIONS]:
        f.write(f"{token}: removed={r}, kept={f_}, ratio={ratio:.2f}\n")

print("\n Phase 2 Filtering Complete")
print(f"Remaining ads: {len(final_ads)} | Removed: {len(removed_ads)}")
print("\n Files Created:")
print(f"- Filtered Ads: {OUTPUT_FILE}")
print(f"- Removed Ads (with reasons): {REMOVED_FILE}")
print(f"- Suggestions: {SUGGESTIONS_FILE}")
print(f"- Primary Keywords (untouched): {KEYWORDS_FILE}")
try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "4/5 – Filtrovanie podľa popisu", "done": total, "total": total},
            timeout=3,
        )
except Exception:
    pass
