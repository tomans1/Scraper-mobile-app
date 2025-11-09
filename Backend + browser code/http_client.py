import os
import random
import time
from typing import Iterable, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import urllib3

from proxy_config import load_raw_proxy_list

BRD_HOST = os.getenv("BRD_HOST", "brd.superproxy.io")
BRD_PORT = int(os.getenv("BRD_PORT", "33335"))
BRD_USER_BASE = os.getenv("BRD_USER_BASE")
BRD_PASS = os.getenv("BRD_PASS")
USE_DIRECT_REQUESTS = os.getenv("USE_STATIC_PROXIES", "").strip() == "1"

# Set to False for rotating IPs (default). Set to True if you want sticky IP per session.
BRD_USE_STICKY = False
BRD_SESSION_ID = f"inferno-{int(time.time())}"
DISABLE_SSL_VERIFY = os.getenv("DISABLE_SSL_VERIFY", "0") == "1"
CA_BUNDLE_PATH = os.getenv("REQUESTS_CA_BUNDLE") or os.getenv("SSL_CERT_FILE") or os.getenv("CA_BUNDLE_PATH")


_PROXY_MODE_ANNOUNCED = False


def _announce_mode(message: str) -> None:
    global _PROXY_MODE_ANNOUNCED

    if not _PROXY_MODE_ANNOUNCED:
        print(message)
        _PROXY_MODE_ANNOUNCED = True


def _brd_username() -> str:
    if BRD_USE_STICKY:
        return f"{BRD_USER_BASE}-session-{BRD_SESSION_ID}"
    return BRD_USER_BASE


def build_brd_proxies() -> dict:
    if not BRD_USER_BASE or not BRD_PASS:
        raise RuntimeError("Bright Data credentials missing: set BRD_USER_BASE and BRD_PASS in env.")
    proxy = f"http://{_brd_username()}:{BRD_PASS}@{BRD_HOST}:{BRD_PORT}"
    return {"http": proxy, "https": proxy}


def _configure_session(session: requests.Session, verify_ssl: bool = True) -> requests.Session:
    retries = Retry(
        total=5,
        backoff_factor=0.6,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "HEAD", "OPTIONS"),
    )
    session.mount("http://", HTTPAdapter(max_retries=retries))
    session.mount("https://", HTTPAdapter(max_retries=retries))
    session.trust_env = False

    session.headers.update(
        {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "sk,en;q=0.9",
        }
    )

    # ---- SSL verification control ----
    # If you provide a CA bundle path, requests will use it.
    # If DISABLE_SSL_VERIFY=1 is set, verification is turned off (temporary workaround).
    if CA_BUNDLE_PATH:
        session.verify = CA_BUNDLE_PATH
    elif DISABLE_SSL_VERIFY or not verify_ssl:
        session.verify = False
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    return session


def new_brd_session(verify_ssl: bool = True) -> requests.Session:
    """Return a configured ``requests.Session`` for Bright Data."""

    session = _configure_session(requests.Session(), verify_ssl=verify_ssl)
    session.proxies = build_brd_proxies()
    return session


def new_direct_session(verify_ssl: bool = True) -> requests.Session:
    """Return a configured session without any proxy usage."""

    return _configure_session(requests.Session(), verify_ssl=verify_ssl)


def _format_proxy(raw_proxy: str) -> Optional[str]:
    """Normalise proxy definitions into URLs understood by ``requests``.

    Supported formats include::

        host:port
        host:port:user:pass
        user:pass@host:port
        http://user:pass@host:port
        socks5://host:port
    """

    if not raw_proxy:
        return None

    raw_proxy = raw_proxy.strip()
    if not raw_proxy:
        return None

    lowered = raw_proxy.lower()
    if lowered.startswith(("http://", "https://", "socks5://", "socks4://")):
        return raw_proxy

    if "@" in raw_proxy:
        creds, address = raw_proxy.rsplit("@", 1)
        if ":" in address and ":" in creds:
            username, password = creds.split(":", 1)
            host, port = address.split(":", 1)
            return f"http://{username}:{password}@{host}:{port}"

    parts = raw_proxy.split(":")
    if len(parts) == 2:
        host, port = parts
        return f"http://{host}:{port}"
    if len(parts) == 4:
        host, port, username, password = parts
        return f"http://{username}:{password}@{host}:{port}"
    return None


def build_static_proxy_pool() -> List[str]:
    """Return list of formatted proxy URLs from configuration."""

    formatted: List[str] = []
    for raw in load_raw_proxy_list():
        proxy_url = _format_proxy(raw)
        if proxy_url:
            formatted.append(proxy_url)
    return formatted


class RotatingProxySession(requests.Session):
    """A ``requests.Session`` that rotates proxies per request."""

    def __init__(self, proxies: Iterable[str], verify_ssl: bool = True):
        self._proxies: List[str] = list(proxies)
        super().__init__()
        _configure_session(self, verify_ssl=verify_ssl)

    def request(self, method, url, **kwargs):  # type: ignore[override]
        if self._proxies and "proxies" not in kwargs:
            proxy = random.choice(self._proxies)
            kwargs["proxies"] = {"http": proxy, "https": proxy}
        return super().request(method, url, **kwargs)


def new_static_proxy_session(verify_ssl: bool = True) -> requests.Session:
    """Return a session configured to use static proxies or direct connection."""

    proxy_pool = build_static_proxy_pool()
    if proxy_pool:
        return RotatingProxySession(proxy_pool, verify_ssl=verify_ssl)
    return _configure_session(requests.Session(), verify_ssl=verify_ssl)


def new_scraper_session(verify_ssl: bool = True):
    """Return a scraper session using Bright Data proxies or direct requests."""

    if USE_DIRECT_REQUESTS:
        _announce_mode("⚡ Using direct Railway server requests (no proxies)")
        return new_direct_session(verify_ssl=verify_ssl)

    _announce_mode("🌐 Using Bright Data rotating proxies")
    return new_brd_session(verify_ssl=verify_ssl)



HEADERS_POOL = [
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "sk-SK,sk;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive",
        "Sec-CH-UA": '"Chromium";v="127", "Google Chrome";v="127", "Not A;Brand";v="99"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Sec-GPC": "1",
        "Upgrade-Insecure-Requests": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Brave/127.0.0.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-GB,en;q=0.9,sk;q=0.8",
        "Connection": "keep-alive",
        "Sec-CH-UA": '"Chromium";v="127", "Brave";v="127", "Not A;Brand";v="99"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Sec-GPC": "1",
        "Upgrade-Insecure-Requests": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "sk-SK,sk;q=0.9",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Sec-GPC": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "sk-SK,sk;q=0.9,en-US;q=0.8",
        "Connection": "keep-alive",
        "Sec-CH-UA": '"Chromium";v="127", "Google Chrome";v="127", "Not A;Brand";v="99"',
        "Sec-CH-UA-Mobile": "?1",
        "Sec-CH-UA-Platform": '"Android"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Sec-GPC": "1",
        "Upgrade-Insecure-Requests": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "sk-SK,sk;q=0.9",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Sec-GPC": "1",
    },
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "sk-SK,sk;q=0.9,en-US;q=0.8",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    },
]
