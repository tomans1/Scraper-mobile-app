import os
import json
import base64
import requests
from dotenv import load_dotenv
load_dotenv()

LOCAL_MODE = os.getenv("LOCAL_MODE")

# Allow different env var names for compatibility across deployments
REPO = (
    os.getenv("GITHUB_REPO")
    or os.getenv("GH_REPO")
    or os.getenv("GITHUB_REPOSITORY")
    or os.getenv("GH_REPOSITORY")
    or os.getenv("REPO")
)

# Allow the repo env var to be a full GitHub URL
if REPO and "github.com" in REPO:
    REPO = REPO.rstrip("/")
    REPO = REPO.split("github.com/")[-1]
    if REPO.endswith(".git"):
        REPO = REPO[:-4]

BRANCH = (
    os.getenv("GITHUB_BRANCH")
    or os.getenv("GH_BRANCH")
    or os.getenv("BRANCH")
    or os.getenv("GITHUB_REF_NAME")
    or "data"
)

TOKEN = (
    os.getenv("GH_TOKEN")
    or os.getenv("GITHUB_TOKEN")
)

HEADERS = {"Accept": "application/vnd.github.v3+json"}
if TOKEN:
    HEADERS["Authorization"] = f"Bearer {TOKEN}"


def _local_path(path: str) -> str:
    return os.path.join(os.path.dirname(__file__), path)


if LOCAL_MODE:
    def get_file_from_github(path):
        try:
            with open(_local_path(path), encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return None

    def update_file_on_github(path, content, message):
        full = _local_path(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)

    def append_file_on_github(path, extra_content, message):
        full = _local_path(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "a", encoding="utf-8") as f:
            f.write(extra_content)
else:
    _DEFAULT_BRANCH = None

    def _get_default_branch():
        """Return repository default branch name if available."""

        global _DEFAULT_BRANCH
        if _DEFAULT_BRANCH:
            return _DEFAULT_BRANCH

        if not REPO:
            return None

        resp = requests.get(f"https://api.github.com/repos/{REPO}", headers=HEADERS)
        if resp.status_code == 200:
            _DEFAULT_BRANCH = resp.json().get("default_branch") or "main"
            return _DEFAULT_BRANCH

        print("⚠️ Failed to determine default branch:", resp.text)
        return None

    def _ensure_branch(branch):
        """Ensure ``branch`` exists on the remote repository."""
        if not REPO or not TOKEN:
            return
        ref_url = f"https://api.github.com/repos/{REPO}/git/refs/heads/{branch}"
        ref_resp = requests.get(ref_url, headers=HEADERS)
        if ref_resp.status_code != 404:
            return
        # Create the branch from the repo's default branch
        repo_resp = requests.get(f"https://api.github.com/repos/{REPO}", headers=HEADERS)
        if repo_resp.status_code != 200:
            print("❌ Failed to fetch repo info:", repo_resp.text)
            return
        default_branch = repo_resp.json().get("default_branch", "main")
        base_resp = requests.get(
            f"https://api.github.com/repos/{REPO}/git/refs/heads/{default_branch}",
            headers=HEADERS,
        )
        if base_resp.status_code != 200:
            print("❌ Failed to fetch base branch:", base_resp.text)
            return
        sha = base_resp.json()["object"]["sha"]
        create = requests.post(
            f"https://api.github.com/repos/{REPO}/git/refs",
            headers=HEADERS,
            json={"ref": f"refs/heads/{branch}", "sha": sha},
        )
        if create.status_code not in (200, 201):
            print("❌ Failed to create branch:", create.text)

    def get_file_from_github(path):
        if not REPO:
            print("⚠️ GITHUB_REPO environment variable is not set")
            return None
        ref_branch = BRANCH

        def _fetch(branch_name):
            api_url = f"https://api.github.com/repos/{REPO}/contents/{path}?ref={branch_name}"
            return requests.get(api_url, headers=HEADERS)

        resp = _fetch(ref_branch)
        if resp.status_code == 404:
            default_branch = _get_default_branch()
            if default_branch and default_branch != ref_branch:
                resp = _fetch(default_branch)
        if resp.status_code == 200:
            data = resp.json()
            enc = data.get("encoding")
            content = data.get("content")
            if enc == "base64" and content:
                return base64.b64decode(content).decode("utf-8")
            # Large files may have encoding "none" and require download_url
            download_url = data.get("download_url")
            if enc == "none" and download_url:
                raw = requests.get(download_url, headers=HEADERS)
                if raw.status_code == 200:
                    return raw.text
        else:
            print(f"⚠️ GitHub request failed: {resp.status_code} {resp.text}")
        return None

    def update_file_on_github(path, content, message):
        """Create or update ``path`` on GitHub with ``content``."""
        if not REPO:
            print("⚠️ GITHUB_REPO environment variable is not set; skip update")
            return
        _ensure_branch(BRANCH)
        api_url = f"https://api.github.com/repos/{REPO}/contents/{path}"

        # Get current file SHA if it exists
        meta = requests.get(f"{api_url}?ref={BRANCH}", headers=HEADERS)
        sha = None
        if meta.status_code == 200:
            sha = meta.json().get("sha")

        encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")

        payload = {
            "message": message,
            "content": encoded,
            "branch": BRANCH,
        }
        if sha:
            payload["sha"] = sha

        put = requests.put(api_url, headers=HEADERS, json=payload)
        if put.status_code not in (200, 201):
            print("❌ GitHub file update failed:", put.text)

    def append_file_on_github(path, extra_content, message):
        """Append ``extra_content`` to ``path`` on GitHub without rewriting it."""
        if not REPO:
            print("⚠️ GITHUB_REPO environment variable is not set; skip append")
            return

        _ensure_branch(BRANCH)
        api_url = f"https://api.github.com/repos/{REPO}/contents/{path}"

        meta = requests.get(f"{api_url}?ref={BRANCH}", headers=HEADERS)
        sha = None
        current_text = ""

        if meta.status_code == 200:
            data = meta.json()
            sha = data.get("sha")
            download_url = data.get("download_url")
            encoding = data.get("encoding")
            encoded_content = data.get("content")

            if encoding == "base64" and encoded_content:
                current_text = base64.b64decode(encoded_content).decode("utf-8")
            elif download_url:
                raw = requests.get(download_url, headers=HEADERS)
                if raw.status_code == 200:
                    current_text = raw.text
        elif meta.status_code != 404:
            print("⚠️ Failed to fetch file metadata for append:", meta.text)
            return

        if current_text and not current_text.endswith("\n") and not extra_content.startswith("\n"):
            current_text += "\n"

        new_text = current_text + extra_content

        if not new_text.endswith("\n"):
            new_text += "\n"

        encoded = base64.b64encode(new_text.encode("utf-8")).decode("utf-8")

        payload = {
            "message": message,
            "content": encoded,
            "branch": BRANCH,
        }
        if sha:
            payload["sha"] = sha

        resp = requests.put(api_url, headers=HEADERS, json=payload)
        if resp.status_code not in (200, 201):
            print("❌ GitHub file append failed:", resp.text)


def load_old_links():
    """Fetch previous links from GitHub.

    Falls back to ``Data/old_results.txt`` which stores URLs line by line.
    """
    text = get_file_from_github("Data/old_results.txt")
    if not text:
        return []
    links = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        links.append(line.split()[0])
    return links


def save_old_links(links):
    """Persist the latest set of links back to GitHub."""
    content = "\n".join(links) + "\n"
    update_file_on_github("Data/old_results.txt", content, "Update old_results.txt")


def load_keywords():
    text = get_file_from_github("Data/keywords.txt")
    return text.splitlines() if text else []


def load_keyword_sets():
    """Return keyword sets for agency, non-sale, and filler words."""

    def _read_keywords():
        if LOCAL_MODE:
            try:
                with open(_local_path("Data/keywords.txt"), encoding="utf-8") as f:
                    return f.read()
            except FileNotFoundError:
                return ""
        return get_file_from_github("Data/keywords.txt") or ""

    text = _read_keywords()
    if not text:
        return set(), set(), set()

    section = None
    agency_primary = set()
    non_sale_primary = set()
    filler_words = set()

    for line in text.splitlines():
        raw_line = line.strip()
        lower_line = raw_line.lower()

        if not raw_line or lower_line.startswith("--- secondary"):
            continue

        if "primary agency keywords" in lower_line:
            section = "agency"
        elif "primary rent/other keywords" in lower_line:
            section = "non_sale"
        elif "filler words" in lower_line:
            section = "filler"
        elif section == "agency":
            agency_primary.add(raw_line)
            agency_primary.add(lower_line)
        elif section == "non_sale":
            non_sale_primary.add(raw_line)
            non_sale_primary.add(lower_line)
        elif section == "filler":
            filler_words.add(raw_line.split(":")[0])

    return agency_primary, non_sale_primary, filler_words


def save_keywords(lines):
    update_file_on_github("Data/keywords.txt", "\n".join(lines) + "\n", "Update keywords.txt")


def append_keywords(new_words):
    """Append one or more keywords to ``Data/keywords.txt`` on GitHub."""
    if isinstance(new_words, str):
        new_words = [new_words]
    chunk = "\n".join(new_words)
    if not chunk.endswith("\n"):
        chunk += "\n"
    append_file_on_github("Data/keywords.txt", chunk, "Append keywords")


def load_phase3_results():
    """Return contents of ``phase3_filtered_links.txt`` from GitHub."""
    return get_file_from_github("Data/phase3_filtered_links.txt")


def append_phase3_results(text):
    """Append scraping results to ``phase3_filtered_links.txt`` on GitHub."""
    existing = get_file_from_github("Data/phase3_filtered_links.txt") or ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    content = existing + text
    if not content.endswith("\n"):
        content += "\n"
    update_file_on_github("Data/phase3_filtered_links.txt", content, "Update phase3_filtered_links.txt")
