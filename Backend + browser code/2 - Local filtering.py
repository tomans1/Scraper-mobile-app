import os
from collections import Counter
from tqdm import tqdm
import argparse
from datetime import datetime
import requests

from storage import load_keyword_sets


# === FILE DIRECTORY SETUP ===
DATA_DIR = "Data"
os.makedirs(DATA_DIR, exist_ok=True)

# === FILE PATHS ===
RAW_LINKS_FILE = os.path.join(DATA_DIR, "new_links.txt")
KEYWORD_FILE = os.path.join(DATA_DIR, "keywords.txt")
FILTERED_OUT_FILE = os.path.join(DATA_DIR, "uninteresting_links.txt")
FINAL_OUTPUT_FILE = os.path.join(DATA_DIR, "final_filtered_links.txt")
SUGGESTIONS_FILE = os.path.join(DATA_DIR, "keyword_suggestions.txt")
DEFAULT_PROGRESS_URL = "http://127.0.0.1:5000/progress_update"
PROGRESS_URL = os.getenv("PROGRESS_URL", DEFAULT_PROGRESS_URL)

# === SETTINGS ===
SECONDARY_MIN_RATIO = 5
SECONDARY_MIN_COUNT = 10

# === LOAD KEYWORDS ===
agency_primary, non_sale_primary, filler_words = load_keyword_sets()

def tokenize(slug):
    return slug.strip().split('-')

# === OPTIONAL CLI ARGUMENTS FOR DATE FILTERING ===
parser = argparse.ArgumentParser()
parser.add_argument("--start-date", type=str, help="Start date in YYYY-MM-DD", default=None)
parser.add_argument("--end-date", type=str, help="End date in YYYY-MM-DD", default=None)
args = parser.parse_args()

start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date() if args.start_date else None
end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date() if args.end_date else None

# === PHASE 0: EXTRACT SLUGS FROM RAW LINKS ===
slugs = []
slug_to_full_line = {}

with open(RAW_LINKS_FILE, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        parts = line.rsplit(" ", 2)
        if len(parts) < 2:
            continue
        url = parts[0]
        date_str = " ".join(parts[1:])
        try:
            dt = datetime.strptime(date_str, "%d/%m/%Y %H:%M").date()
            if start_date and dt < start_date:
                continue
            if end_date and dt > end_date:
                continue
        except:
            continue
        if ".php" in url:
            try:
                start = url.rindex('/') + 1
                end = url.index('.php', start)
                slug = url[start:end]
                slugs.append(slug)
                slug_to_full_line[slug] = line
            except ValueError:
                continue

print(f"Extracted {len(slugs)} slugs from raw links.")
steps_total = 4
try:
    requests.post(
        PROGRESS_URL,
            json={"phase": "2/5 – Prvé filtrovanie", "done": 0, "total": steps_total},
        timeout=3,
    )
except Exception:
    pass

# === PHASE 1: FILTER AGENCIES ===
agency_links = []
non_agency_links = []

for slug in tqdm(slugs, desc="Step 1: Filtering Agencies"):
    tokens = tokenize(slug)
    if any(token in agency_primary for token in tokens):
        agency_links.append((slug, tokens))
    else:
        non_agency_links.append((slug, tokens))

try:
    requests.post(
        PROGRESS_URL,
            json={"phase": "2/5 – Prvé filtrovanie", "done": 1, "total": steps_total},
        timeout=3,
    )
except Exception:
    pass

agency_counts = Counter()
non_agency_counts = Counter()

for _, tokens in agency_links:
    agency_counts.update(token for token in tokens if token not in agency_primary and token not in filler_words and not token.isdigit())

for _, tokens in non_agency_links:
    non_agency_counts.update(tokens)

agency_secondary_stats = []
for token, count in agency_counts.items():
    if token in filler_words or token.isdigit():
        continue
    ratio = count / (non_agency_counts.get(token, 0) + 1)
    if ratio >= SECONDARY_MIN_RATIO and count >= SECONDARY_MIN_COUNT:
        agency_secondary_stats.append((token, count, non_agency_counts.get(token, 0), ratio))

def score_agency(slug):
    tokens = tokenize(slug)
    reasons = []
    if any(t in agency_primary for t in tokens):
        reasons = [f"[AGENCY_PRIMARY: {t}]" for t in tokens if t in agency_primary]
        return 100, reasons
    score = sum(5 for t in tokens if any(t == s[0] for s in agency_secondary_stats))
    reasons = [f"[AGENCY_SECONDARY: {t}]" for t in tokens if any(t == s[0] for s in agency_secondary_stats)]
    return min(score, 100), reasons

post_agency_links = []
agency_filtered = []

for slug, _ in tqdm(non_agency_links + agency_links, desc="Step 2: Scoring Agency Confidence"):
    score, reasons = score_agency(slug)
    if score == 100:
        agency_filtered.append((slug, "AGENCY", reasons))
    else:
        post_agency_links.append((slug, tokenize(slug)))

try:
    requests.post(
        PROGRESS_URL,
            json={"phase": "2/5 – Prvé filtrovanie", "done": 2, "total": steps_total},
        timeout=3,
    )
except Exception:
    pass

# === PHASE 2: FILTER NON-SALE ===
non_sale_links = []
sale_links = []

for slug, tokens in tqdm(post_agency_links, desc="Step 3: Filtering Rentals and Others"):
    if any(token in non_sale_primary for token in tokens):
        non_sale_links.append((slug, tokens))
    else:
        sale_links.append((slug, tokens))

try:
    requests.post(
        PROGRESS_URL,
            json={"phase": "2/5 – Prvé filtrovanie", "done": 3, "total": steps_total},
        timeout=3,
    )
except Exception:
    pass

non_sale_counts = Counter()
sale_counts = Counter()

for _, tokens in non_sale_links:
    non_sale_counts.update(token for token in tokens if token not in non_sale_primary and token not in filler_words and not token.isdigit())

for _, tokens in sale_links:
    sale_counts.update(tokens)

non_sale_secondary_stats = []
for token, count in non_sale_counts.items():
    if token in filler_words or token.isdigit():
        continue
    ratio = count / (sale_counts.get(token, 0) + 1)
    if ratio >= SECONDARY_MIN_RATIO and count >= SECONDARY_MIN_COUNT:
        non_sale_secondary_stats.append((token, count, sale_counts.get(token, 0), ratio))

def score_non_sale(slug):
    tokens = tokenize(slug)
    reasons = []
    if any(t in non_sale_primary for t in tokens):
        reasons = [f"[NON-SALE PRIMARY: {t}]" for t in tokens if t in non_sale_primary]
        return 100, reasons
    score = sum(5 for t in tokens if any(t == s[0] for s in non_sale_secondary_stats))
    reasons = [f"[NON-SALE SECONDARY: {t}]" for t in tokens if any(t == s[0] for s in non_sale_secondary_stats)]
    return min(score, 100), reasons

final_links = []
non_sale_filtered = []

for slug, _ in tqdm(sale_links + non_sale_links, desc="Step 4: Final Scoring"):
    score, reasons = score_non_sale(slug)
    if score == 100:
        non_sale_filtered.append((slug, "RENT/OTHER", reasons))
    else:
        final_links.append(slug)

try:
    requests.post(
        PROGRESS_URL,
            json={"phase": "2/5 – Prvé filtrovanie", "done": 4, "total": steps_total},
        timeout=3,
    )
except Exception:
    pass

# === WRITE FILTERED OUT LINKS ===
with open(FILTERED_OUT_FILE, "w", encoding="utf-8") as f:
    for slug, reason, reasons in agency_filtered + non_sale_filtered:
        f.write(f"{slug} | {reason} | {' '.join(reasons)}\n")

# === WRITE FINAL OUTPUT ===
with open(FINAL_OUTPUT_FILE, "w", encoding="utf-8") as f:
    for slug in final_links:
        full_line = slug_to_full_line.get(slug)
        if full_line:
            f.write(full_line + "\n")
        else:
            f.write(f"(unknown) {slug}\n")

# === SUGGESTIONS OUTPUT ===
with open(SUGGESTIONS_FILE, "w", encoding="utf-8") as f:
    f.write("=== SUGGESTED SECONDARY KEYWORDS ===\n\n")
    f.write("--- Secondary Agency Keywords ---\n")
    for token, a, na, ratio in sorted(agency_secondary_stats, key=lambda x: -x[1]):
        f.write(f"{token}: agency={a}, non_agency={na}, ratio={ratio:.2f}\n")

    f.write("\n--- Secondary Rent/Other Keywords ---\n")
    for token, ns, s, ratio in sorted(non_sale_secondary_stats, key=lambda x: -x[3]):
        f.write(f"{token}: non_sale={ns}, sale={s}, ratio={ratio:.2f}\n")

print("\nALL DONE!")
print(f"Links removed: {len(agency_filtered) + len(non_sale_filtered)}")
print(f"Links remaining: {len(final_links)}")
print(f"- Suggestions saved to: {SUGGESTIONS_FILE}")
print(f"- Filtered out links: {FILTERED_OUT_FILE}")
print(f"- Final output (with full links): {FINAL_OUTPUT_FILE}")
print(f"- Primary Keywords (untouched): {KEYWORD_FILE}")
