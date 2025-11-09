import os


def load_raw_proxy_list():
    """Return list of proxy strings from env or file."""
    env_val = os.getenv("PROXIES")
    if env_val:
        return [p.strip() for p in env_val.split(',') if p.strip()]

    file_path = os.getenv("PROXY_FILE", "proxies.txt")
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            return [line.strip() for line in f if line.strip()]

    return []
