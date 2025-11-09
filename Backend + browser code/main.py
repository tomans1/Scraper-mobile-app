from flask import Flask, request, jsonify, make_response, send_from_directory
from flask_cors import CORS
import subprocess
import os
from datetime import datetime
import json
import traceback
import logging
import sys
import threading
import signal
from dotenv import load_dotenv
from functools import wraps
import hmac
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
import time
from collections import defaultdict
try:
    import psutil  # type: ignore
except Exception:  # pragma: no cover - optional dep
    psutil = None
from storage import (
    load_old_links,
    save_old_links,
    load_keywords,
    append_keywords,
    load_phase3_results,
    append_phase3_results,
)

load_dotenv()

AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "")
AUTH_COOKIE_SECRET = os.getenv("AUTH_COOKIE_SECRET", os.urandom(32).hex())
serializer = URLSafeTimedSerializer(AUTH_COOKIE_SECRET)
login_attempts = defaultdict(list)

def after_label(s: str, *labels: str):
    s = s.strip()
    for label in labels:
        if s.startswith(label):
            return s[len(label):].strip()
    return None


class ProgressFilter(logging.Filter):
    def filter(self, record):
        # Suppress only "/progress" route from werkzeug logs
        return "/progress" not in record.getMessage()

# Apply filter to werkzeug logger
logging.getLogger("werkzeug").addFilter(ProgressFilter())

running_process = None

# Reduce log noise during normal runs
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s",
)

if not os.getenv("OPENAI_API_KEY"):
    logging.warning("OPENAI_API_KEY environment variable is not set. Step 5 may fail.")

app = Flask(__name__)
FRONTEND_ORIGIN = "https://bazosscraper.onrender.com"
app.config["CORS_HEADERS"] = "Content-Type,Authorization"
CORS(
    app,
    resources={r"/*": {"origins": [FRONTEND_ORIGIN], "allow_headers": ["Content-Type", "Authorization"]}},
)

DATA_DIR     = "Data"
os.makedirs(DATA_DIR, exist_ok=True)
PHASE3_FILE  = os.path.join(DATA_DIR, "phase3_filtered_links.txt")
# Holds results from the most recent run only. This file is never pushed to
# GitHub and is used solely for returning new results to the UI.
LATEST_RESULTS_FILE = os.path.join(DATA_DIR, "latest_results.txt")
progress_state = {"phase": "", "done": 0, "total": 0}
SERVER_START_TIME = datetime.utcnow()
progress_lock = threading.Lock()


def reset_progress():
    update_progress("", done=0, total=0)


def terminate_running_process():
    global running_process
    if not running_process:
        return
    try:
        if psutil:
            parent = psutil.Process(running_process.pid)
            for child in parent.children(recursive=True):
                try:
                    child.kill()
                except Exception:
                    pass
            parent.kill()
        else:
            running_process.terminate()
            if os.name != "nt":
                try:
                    os.killpg(os.getpgid(running_process.pid), signal.SIGTERM)
                except Exception:
                    pass
            try:
                running_process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                running_process.kill()
                if os.name != "nt":
                    try:
                        os.killpg(os.getpgid(running_process.pid), signal.SIGKILL)
                    except Exception:
                        pass
    finally:
        running_process = None


def run_step(cmd: str, phase: str, progress_url: str):
    global running_process
    print(f"\n🚀 Starting: {phase} → {cmd}")
    update_progress(phase, done=0, total=0)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PROGRESS_URL"] = progress_url

    running_process = subprocess.Popen(
        cmd,
        shell=True,
        stdout=sys.stdout,
        stderr=sys.stderr,
        text=True,
        env=env,
        start_new_session=True,
    )

    returncode = running_process.wait()
    running_process = None

    if returncode != 0:
        print(f"❌ Step '{phase}' failed with code {returncode}")
        failure_phase = f"❌ {phase}"
        update_progress(failure_phase, done=0, total=1)
        raise subprocess.CalledProcessError(returncode, cmd)

    print(f"✅ Finished: {phase}")
    with progress_lock:
        total = progress_state.get("total", 0)
    update_progress(phase, done=total, total=total)


def _extract_token():
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    header_token = request.headers.get("X-Auth-Token")
    if header_token:
        return header_token.strip()
    return request.cookies.get("session")


def _is_token_valid(token):
    if not token:
        return False
    try:
        serializer.loads(token, max_age=86400)
        return True
    except (BadSignature, SignatureExpired):
        return False


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if _is_token_valid(_extract_token()):
            return fn(*args, **kwargs)
        if request.remote_addr in ("127.0.0.1", "::1"):
            return fn(*args, **kwargs)
        return jsonify({"error": "auth required"}), 401

    return wrapper


@app.route("/health", methods=["GET"])
def health_check():
    """Simple unauthenticated health endpoint used by the frontend."""

    return jsonify(
        {
            "status": "ok",
            "time": datetime.utcnow().isoformat() + "Z",
            "uptime": (datetime.utcnow() - SERVER_START_TIME).total_seconds(),
        }
    )


@app.route("/wake", methods=["POST"])
def wake_backend():
    """Endpoint used by the UI to wake up the sleeping Railway instance."""

    return jsonify({"status": "waking"})


@app.route("/auth/login", methods=["POST"])
def auth_login():
    ip = request.remote_addr or ""
    now = time.time()
    attempts = login_attempts[ip]
    login_attempts[ip] = [ts for ts in attempts if now - ts < 60]
    if len(login_attempts[ip]) >= 5:
        return jsonify({"error": "Too many attempts"}), 429

    password = request.get_json(force=True).get("password", "")
    if hmac.compare_digest(str(password).encode(), AUTH_PASSWORD.encode()):
        token = serializer.dumps({"ip": ip})
        resp = make_response(jsonify({"ok": True, "token": token, "expires_in": 86400}))
        login_attempts[ip] = []
        return resp
    else:
        login_attempts[ip].append(now)
        return jsonify({"ok": False}), 401


@app.route("/auth/logout", methods=["POST"])
def auth_logout():
    return make_response(jsonify({"ok": True}))


@app.route("/auth/status", methods=["GET"])
def auth_status():
    token = _extract_token()
    return jsonify({"authenticated": _is_token_valid(token)})

@app.route("/cancel", methods=["POST"])
@require_auth
def cancel():
    terminate_running_process()
    reset_progress()
    return jsonify({"ok": True})


@app.route("/restart", methods=["POST"])
@require_auth
def restart():
    global running_process
    if running_process:
        running_process.terminate()
        running_process = None
    from threading import Timer
    Timer(0.2, lambda: os._exit(0)).start()
    return "Restarting", 200


@app.route("/progress_update", methods=["POST"])
@require_auth
def progress_update():
    data = request.get_json(force=True)
    update_progress(
        data.get("phase"),
        done=data.get("done"),
        total=data.get("total"),
    )
    return "ok", 200


def update_progress(phase=None, *, done=None, total=None):
    with progress_lock:
        if phase is not None:
            progress_state["phase"] = phase
        if done is not None:
            progress_state["done"] = done
        if total is not None:
            progress_state["total"] = total

def parse_result_blocks(filepath):
    logging.debug("Parsing result blocks from %s", filepath)
    with open(filepath, encoding="utf-8") as f:
        return parse_result_blocks_text(f.read())


def parse_result_blocks_text(text):
    results = []
    block = {}
    for raw in text.splitlines():
        line = raw.strip()

        if line.startswith("URL:"):
            # safer than split()[1]
            _, _, val = line.partition("URL:")
            block["url"] = val.strip()

        elif line.startswith("Sub Category:") or line.startswith("Subcategory:") \
             or line.startswith("Subkategória:") or line.startswith("Subkategorie:"):
            val = after_label(
                line,
                "Sub Category: ",
                "Subcategory: ",
                "Subkategória: ",
                "Subkategorie: "
            )
            if val is not None:
                block["subcat"] = val

        elif line.startswith("Timestamp:"):
            _, _, ts = line.partition("Timestamp:")
            block["date"] = _parse_datetime(ts.strip())

        elif line.startswith("==="):
            if block.get("url"):              # only keep meaningful blocks
                results.append(block)
            block = {}

    # flush trailing block if file doesn’t end with "==="
    if block.get("url"):
        results.append(block)

    logging.debug("Parsed %d result blocks", len(results))
    return results


def _parse_datetime(s: str):
    for fmt in ("%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

def _parse_date(s: str):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

@app.route("/scrape", methods=["POST"])
@require_auth
def scrape():
    data = request.get_json()
    logging.debug("/scrape payload: %s", data)

    mode = data.get("mode", "new")
    subcats = set(data.get("subcategories", []))
    date_start = data.get("date_start")
    date_end   = data.get("date_end")

    if mode == "old":
        return fetch_previous_results(subcats, date_start, date_end)
    try:
        # Load old links from GitHub and inject to disk for phase 1
        old_links = load_old_links()
        with open("Data/old_results.txt", "w", encoding="utf-8") as f:
            f.write("\n".join(old_links) + "\n")

        port = os.environ.get("PORT", "5000")
        progress_url = f"http://127.0.0.1:{port}/progress_update"

        run_step('python "1- Sitemap links.py"', "1/5 Zber sitemap", progress_url)
        run_step('python "2 - Local filtering.py"', "2/5 Prvé filtrovanie", progress_url)
        run_step('python "3 - Ad HTML scraper.py"', "3/5 Sťahovanie inzerátov", progress_url)
        run_step('python "4 - Filter by description.py"', "4/5 Filtrovanie popisov", progress_url)
        run_step('python "5 - OpenAI filtering.py"', "5/5 OpenAI filtrovanie", progress_url)

        # This code is not used because it is done in 1 - sitemaps 
        # # After phase 1, update old_links in GitHub
        # with open("Data/acquired_links.txt", encoding="utf-8") as f:
        #     # Preserve the timestamp portion so future runs can keep history
        #     current_links = [line.strip() for line in f if line.strip()]
        # save_old_links(current_links)

        new_results = []
        if os.path.exists(PHASE3_FILE):
            with open(PHASE3_FILE, encoding="utf-8") as f:
                phase3_text = f.read()

            # Store latest run separately so we only return fresh results
            with open(LATEST_RESULTS_FILE, "w", encoding="utf-8") as lf:
                lf.write(phase3_text)

            new_results = parse_result_blocks_text(phase3_text)
            append_phase3_results(phase3_text)

        # Filter new results according to provided filters
        filtered = []
        d1 = _parse_date(date_start) if date_start else None
        d2 = _parse_date(date_end)   if date_end   else None

        for res in new_results:
            if subcats and res.get("subcat", "").strip() not in subcats:
                continue
            if d1 and d2:
                ad_date = res.get("date")
                if ad_date and not (d1 <= ad_date.date() <= d2):
                    continue

            filtered.append({
                "url": res.get("url"),
                "subcat": res.get("subcat", ""),
                "date": res.get("date").strftime("%d/%m/%Y %H:%M") if res.get("date") else "",
            })

        update_progress("Hotovo", done=1, total=1)
        return jsonify(filtered)

    except subprocess.CalledProcessError as e:
        logging.error("Step failed: %s", e)
        traceback.print_exc()
        message = f"Skript '{e.cmd}' skončil s chybovým kódom {e.returncode}"
        return jsonify({"error": message}), 500
    except Exception as e:
        logging.exception("Unexpected error during scrape")
        update_progress("❌ Neznáma chyba", done=0, total=1)
        return jsonify({"error": f"Neočakávaná chyba: {e}"}), 500

def fetch_previous_results(subcats, start_date, end_date):
    update_progress("Načítavam výsledky", done=0, total=1)
    text = load_phase3_results()
    if text:
        all_results = parse_result_blocks_text(text)
    else:
        all_results = []
    filtered = []

    d1 = _parse_date(start_date) if start_date else None
    d2 = _parse_date(end_date)   if end_date   else None

    for res in all_results:
        if subcats and res.get("subcat", "").strip() not in subcats:
            continue
        if d1 and d2:
            ad_date = res.get("date")
            if ad_date and not (d1 <= ad_date.date() <= d2):
                continue

        filtered.append({
            "url": res.get("url"),
            "subcat": res.get("subcat", ""),
            "date": res.get("date").strftime("%d/%m/%Y %H:%M") if res.get("date") else ""
        })

    update_progress("Hotovo", done=1, total=1)
    return jsonify(filtered)

@app.route("/feedback", methods=["POST"])
def feedback():
    word = request.get_data(as_text=True).strip()
    if not word:
        return "No keyword received", 400

    lines = load_keywords()
    if word.lower() in {ln.strip().lower() for ln in lines}:
        return "Keyword already present", 200

    append_keywords(word)
    return "Keyword added", 200

from flask import Response
import logging

# Suppress Werkzeug logs for /progress
log = logging.getLogger('werkzeug')

@app.route("/progress", methods=["GET"])
@require_auth
def progress():
    if log.level <= logging.INFO:
        log.setLevel(logging.WARNING)
        with progress_lock:
            resp = jsonify(dict(progress_state))
        log.setLevel(logging.INFO)
        return resp
    with progress_lock:
        return jsonify(dict(progress_state))


@app.route("/app")
def serve_app():
    return send_from_directory(".", "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, threaded=True, debug=False, use_reloader=False)

