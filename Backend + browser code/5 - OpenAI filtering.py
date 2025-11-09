import os
import re
from tqdm import tqdm
from openai import OpenAI
import requests


# Load timestamps from acquired_links.txt
acquired_links = {}
with open("Data/acquired_links.txt", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().rsplit(" ", 2)
        if len(parts) == 3:
            url, date, time = parts
            acquired_links[url] = f"{date} {time}"


# === CONFIG ===
DATA_DIR = "Data"
INPUT_FILE = os.path.join(DATA_DIR, "phase2_filtered_links.txt")
OUTPUT_FILE = os.path.join(DATA_DIR, "phase3_filtered_links.txt")
REMOVED_FILE = os.path.join(DATA_DIR, "phase3_removed.txt")
# LOG_FILE = os.path.join(DATA_DIR, "gpt_log.txt")
DEFAULT_PROGRESS_URL = "http://127.0.0.1:5000/progress_update"
PROGRESS_URL = os.getenv("PROGRESS_URL", DEFAULT_PROGRESS_URL)

MODEL = "gpt-5-chat-latest"
CHUNK_SIZE = 15

#Set your OpenAI API key using the OPENAI_API_KEY environment variable
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# === HELPER FUNCTIONS ===
def extract_blocks(filename):
    blocks = []
    current = []
    with open(filename, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("=") and current:
                blocks.append(current)
                current = []
            else:
                current.append(line.rstrip())
        if current:
            blocks.append(current)
    return blocks

def batch_blocks(blocks, n):
    for i in range(0, len(blocks), n):
        yield blocks[i:i + n]

def build_prompt(batch):
    intro = (
    "You are a Slovak real estate ad classifier. Each ad below represents one listing.\n"
    "Your goal is to find and list ONLY the ads that should be REMOVED — because they are clearly not private property sales.\n\n"
    "Remove the ad if ANY of the following apply:\n"
    "- Posted by a real estate agency or broker (look for company forms like s.r.o., reality, maklér, agentúra, kancelária, etc.)\n"
    "- The ad is for RENT, LEASE, or similar (prenájom, nájom, mesačne, deposit, etc.)\n"
    "- It is foreign property (outside Slovakia)\n"
    "- It is anything other than a private sale by an owner\n\n"
    "Output ONLY the ads that should be removed, in this format:\n"
    "#123 AGENCY: contains 'realitná kancelária'\n"
    "#456 RENTAL: mentions 'mesačný nájom'\n\n"
    "If the ad looks like a normal private sale of property in Slovakia, do not include it in your response.\n\n"
    "Ads:\n---\n"
    )
    return intro + "\n\n".join("\n".join(block) for block in batch)

def call_openai(prompt):
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3
    )
    return response.choices[0].message.content

def extract_removed_ids(text):
    lines = text.strip().splitlines()
    removed = {}
    for line in lines:
        match = re.match(r"#(\d{1,5})\s+(AGENCY|RENTAL):\s+(.+)", line.strip(), re.I)
        if match:
            num, reason, detail = match.groups()
            removed[num] = f"{reason.upper()}: {detail}"
    return removed

# === MAIN ===
all_blocks = extract_blocks(INPUT_FILE)
kept_blocks = []
removed_blocks = {}
total = len(all_blocks)
done = 0
try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "5/5 – Finálne filtrovanie", "done": 0, "total": total},
            timeout=3,
        )
except Exception:
    pass

for batch in tqdm(list(batch_blocks(all_blocks, CHUNK_SIZE)), desc="Filtering via OpenAI"):
    prompt = build_prompt(batch)
    try:
        result = call_openai(prompt)
    except Exception as e:
        print("Error from OpenAI:", e)
        continue

    removed_ids = extract_removed_ids(result)
    for block in batch:
        header = next((line for line in block if line.startswith("Result")), None)
        if not header:
            continue
        ad_id = header.strip().split("#")[-1]
        if ad_id in removed_ids:
            removed_blocks[ad_id] = (block, removed_ids[ad_id])
        else:
            kept_blocks.append(block)
    done += len(batch)
    try:
                requests.post(
                    PROGRESS_URL,
                    json={"phase": "5/5 – Finálne filtrovanie", "done": done, "total": total},
                    timeout=3,
                )
    except Exception:
        pass


# === WRITE RESULTS ===
def _ensure_trailing_newline(path):
    try:
        with open(path, "rb+") as f:
            f.seek(0, os.SEEK_END)
            if f.tell() == 0:
                return
            f.seek(-1, os.SEEK_END)
            if f.read(1) != b"\n":
                f.seek(0, os.SEEK_END)
                f.write(b"\n")
    except FileNotFoundError:
        return


def _append_blocks(filename, blocks, formatter):
    if not blocks:
        return

    _ensure_trailing_newline(filename)
    mode = "a" if os.path.exists(filename) else "w"
    with open(filename, mode, encoding="utf-8") as f:
        for block in blocks:
            f.write(formatter(block))


def _format_kept_block(block):
    new_block = []
    url = None

    for line in block:
        new_block.append(line)
        if line.startswith("URL: "):
            url = line[5:].strip()
            timestamp = acquired_links.get(url)
            if timestamp:
                new_block.append(f"Timestamp: {timestamp}")

    return "\n".join(new_block) + "\n" + "=" * 60 + "\n"


def _format_removed_block(item):
    block, reason = item
    return "\n".join(block) + f"\nREASON: {reason}\n" + "=" * 60 + "\n"


def _reset_file(path):
    """Truncate ``path`` so every run starts with a clean file."""
    try:
        with open(path, "w", encoding="utf-8"):
            pass
    except OSError:
        # File may live in a non-existing directory on the first run – ignore.
        return


# Ensure we don't keep results from previous executions.
_reset_file(OUTPUT_FILE)
_reset_file(REMOVED_FILE)
_append_blocks(OUTPUT_FILE, kept_blocks, _format_kept_block)
_append_blocks(REMOVED_FILE, removed_blocks.values(), _format_removed_block)

print(f"\nFiltering complete. Kept: {len(kept_blocks)} | Removed: {len(removed_blocks)}")
try:
        requests.post(
            PROGRESS_URL,
            json={"phase": "5/5 – Finálne filtrovanie", "done": total, "total": total},
            timeout=3,
        )
except Exception:
    pass
