#!/usr/bin/env python3
"""
Home Dashboard server
=====================

Serves the static dashboard, plus a tiny shared-state API and a login, so a
tablet, phone and laptop can all see the same bus stops / events / parrot
weights. Designed to run on a Raspberry Pi and be exposed with Tailscale Funnel.

Standard library only - no pip installs, no build step.

Layout
------
    server/server.py        this file
    server/data/state.json  the shared data   (GITIGNORED - real family data)
    server/data/auth.json   the password hash (GITIGNORED)
    server/data/secret      cookie signing key(GITIGNORED)
    server/data/login.log   login attempts    (GITIGNORED)

Endpoints
---------
    GET  /api/state                 -> { rev, updatedAt, config, events, weights }
    PUT  /api/config | events | weights   body = the value, returns { rev }
    POST /api/login                 { password } -> sets a long-lived cookie
    POST /api/logout
    GET  /api/health                -> { ok: true, rev }
    everything else                 -> the static files (after login)

First run
---------
    python3 server/server.py --set-password

or set HD_PASSWORD in the environment and it is created automatically.

Environment
-----------
    HD_PORT       listen port                 (default 8080)
    HD_BIND       listen address              (default 127.0.0.1)
    HD_WEB_ROOT   static files directory      (default: parent of server/)
    HD_DATA_DIR   data directory              (default: server/data)
    HD_PASSWORD   if set and no auth.json yet, use this password
"""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_ROOT = os.environ.get("HD_WEB_ROOT") or os.path.dirname(HERE)
DATA_DIR = os.environ.get("HD_DATA_DIR") or os.path.join(HERE, "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
AUTH_FILE = os.path.join(DATA_DIR, "auth.json")
SECRET_FILE = os.path.join(DATA_DIR, "secret")
HOLIDAYS_FILE = os.path.join(DATA_DIR, "holidays.json")
HOLIDAYS_URL = "https://www.1823.gov.hk/common/ical/gc/tc.ics"
HOLIDAYS_TTL = 7 * 24 * 3600          # refresh from 1823 at most weekly
PORT = int(os.environ.get("HD_PORT", "8080"))
BIND = os.environ.get("HD_BIND", "127.0.0.1")

COOKIE = "hd_session"
SESSION_SECONDS = 365 * 24 * 3600          # stay logged in for a year
MAX_BODY = 2 * 1024 * 1024                 # 2 MB is plenty
COLLECTIONS = ("config", "events", "weights")

_write_lock = threading.Lock()


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------
def ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def save_json_atomic(path, obj):
    """Write via a temp file + rename so a crash can't half-write the state."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def hash_password(password):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_password(password, stored):
    try:
        salt_b64, dk_b64 = stored.split("$", 1)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


def load_secret():
    try:
        with open(SECRET_FILE, "r", encoding="utf-8") as fh:
            return fh.read().strip().encode("utf-8")
    except OSError:
        sec = secrets.token_bytes(32)
        with open(SECRET_FILE, "w", encoding="utf-8") as fh:
            fh.write(base64.b64encode(sec).decode())
        os.chmod(SECRET_FILE, 0o600)
        return sec


SECRET = None  # set in main()


def make_token():
    exp = str(int(time.time()) + SESSION_SECONDS)
    sig = hmac.new(SECRET, exp.encode(), hashlib.sha256).hexdigest()
    return exp + "." + sig


def verify_token(token):
    if not token or "." not in token:
        return False
    exp, sig = token.rsplit(".", 1)
    try:
        if int(exp) < time.time():
            return False
    except ValueError:
        return False
    want = hmac.new(SECRET, exp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, sig)


def load_state():
    st = load_json(STATE_FILE, None)
    if not isinstance(st, dict):
        st = {}
    st.setdefault("rev", 0)
    st.setdefault("updatedAt", None)
    for key in COLLECTIONS:
        st.setdefault(key, {} if key != "config" else None)
    return st


def save_state(st):
    st["rev"] = int(st.get("rev", 0)) + 1
    st["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    save_json_atomic(STATE_FILE, st)
    return st["rev"]


def parse_holidays(ics):
    """Parse the 1823 iCal into { 'YYYY-MM-DD': 'name' }."""
    ics = re.sub(r"\r?\n[ \t]", "", ics)          # unfold RFC 5545 long lines
    out = {}
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", ics, re.S):
        m = re.search(r"DTSTART;VALUE=DATE:(\d{8})", block)
        s = re.search(r"SUMMARY:(.*)", block)
        if not m or not s:
            continue
        d = m.group(1)
        out["%s-%s-%s" % (d[0:4], d[4:6], d[6:8])] = s.group(1).strip()
    return out


def get_holidays():
    """{date: name}, refreshed from 1823 at most once a week and cached on disk."""
    cache = load_json(HOLIDAYS_FILE, None)
    if isinstance(cache, dict) and cache.get("at") and (time.time() - cache["at"] < HOLIDAYS_TTL):
        return cache.get("data", {})
    try:
        req = urllib.request.Request(HOLIDAYS_URL, headers={"User-Agent": "home-dashboard"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = parse_holidays(r.read().decode("utf-8"))
        if data:
            save_json_atomic(HOLIDAYS_FILE, {"at": int(time.time()), "data": data})
            return data
    except Exception as exc:                       # noqa: BLE001 - never fatal
        sys.stderr.write("holidays fetch failed: %s\n" % exc)
    return cache.get("data", {}) if isinstance(cache, dict) else {}


# --------------------------------------------------------------------------
# brute-force guard (in memory, per client IP)
# --------------------------------------------------------------------------
_fail = {}
_fail_lock = threading.Lock()


def too_many_failures(ip):
    with _fail_lock:
        hits = [t for t in _fail.get(ip, []) if t > time.time() - 300]
        _fail[ip] = hits
        return len(hits) >= 8


def note_failure(ip):
    with _fail_lock:
        _fail.setdefault(ip, []).append(time.time())


def clear_failures(ip):
    with _fail_lock:
        _fail.pop(ip, None)


# --------------------------------------------------------------------------
# login page (self-contained, no external assets)
# --------------------------------------------------------------------------
LOGIN_PAGE = """<!DOCTYPE html>
<html lang="zh-HK"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>家庭看板 · 登入</title>
<style>
  html,body{margin:0;height:100%;background:#0b1220;color:#eef3fb;
    font-family:-apple-system,"PingFang HK","Helvetica Neue","Noto Sans TC",sans-serif}
  .wrap{height:100%;display:flex;align-items:center;justify-content:center}
  form{width:min(360px,90vw);background:#131c2e;border:1px solid #24324d;
    border-radius:18px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
  h1{margin:0 0 6px;font-size:20px}
  p{margin:0 0 16px;color:#93a4c0;font-size:13px}
  input{width:100%;box-sizing:border-box;background:#1b2740;color:#eef3fb;
    border:1px solid #24324d;border-radius:10px;padding:12px;font-size:16px}
  button{margin-top:14px;width:100%;background:#4da3ff;color:#04122a;border:none;
    border-radius:10px;padding:12px;font-size:16px;font-weight:700;cursor:pointer}
  .err{margin-top:12px;color:#ff6b6b;font-size:13px}
</style></head>
<body><div class="wrap"><form method="POST" action="/api/login">
  <h1>🦜 家庭看板</h1>
  <p>請輸入密碼登入(只需一次,之後自動登入)</p>
  <input type="password" name="password" autofocus autocomplete="current-password">
  <button type="submit">登入</button>
  __ERR__
</form></div></body></html>"""


# --------------------------------------------------------------------------
# request handler
# --------------------------------------------------------------------------
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "HomeDashboard"
    protocol_version = "HTTP/1.1"

    # ---- plumbing --------------------------------------------------------
    def log_message(self, fmt, *args):        # keep the console tidy
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _is_https(self):
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https"

    def _authed(self):
        cookie = self.headers.get("Cookie", "")
        m = re.search(r"(?:^|;\s*)%s=([^;]+)" % COOKIE, cookie)
        return bool(m) and verify_token(m.group(1))

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, code, obj, extra=None):
        self._send(code, json.dumps(obj, ensure_ascii=False), extra=extra)

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length)

    def _cookie_header(self, value, max_age):
        parts = ["%s=%s" % (COOKIE, value), "Path=/", "HttpOnly",
                 "SameSite=Lax", "Max-Age=%d" % max_age]
        if self._is_https():
            parts.append("Secure")
        return "; ".join(parts)

    # ---- verbs -----------------------------------------------------------
    def do_GET(self):
        self.route("GET")

    def do_HEAD(self):
        self.route("GET")

    def do_PUT(self):
        self.route("PUT")

    def do_POST(self):
        self.route("POST")

    def route(self, method):
        path = urlparse(self.path).path

        # login / health are reachable without a session
        if path == "/api/login":
            return self.handle_login(method)
        if path == "/api/logout":
            return self._send(200, '{"ok":true}',
                              extra={"Set-Cookie": self._cookie_header("", 0)})
        if path == "/api/health":
            st = load_state()
            return self._json(200, {"ok": True, "rev": st.get("rev", 0)})

        if not self._authed():
            if path.startswith("/api/"):
                return self._json(401, {"error": "unauthorized"})
            return self._send(200, LOGIN_PAGE.replace("__ERR__", ""), ctype=MIME[".html"])

        # ---- authenticated ----
        if path == "/api/state":
            st = load_state()
            return self._json(200, st)
        if path == "/api/holidays":
            return self._json(200, {"holidays": get_holidays()})
        if path.startswith("/api/") and path[5:] in COLLECTIONS:
            if method != "PUT":
                return self._json(405, {"error": "method not allowed"})
            return self.handle_put(path[5:])

        if path.startswith("/api/"):
            return self._json(404, {"error": "not found"})
        return self.serve_static(path)

    # ---- API handlers ----------------------------------------------------
    def handle_login(self, method):
        if method != "POST":
            return self._json(405, {"error": "method not allowed"})
        ip = self.client_address[0]
        if too_many_failures(ip):
            return self._send(429, LOGIN_PAGE.replace(
                "__ERR__", '<div class="err">嘗試太多次,請等 5 分鐘。</div>'),
                ctype=MIME[".html"])

        raw = self._read_body()
        password = ""
        if raw:
            ctype = self.headers.get("Content-Type", "")
            if "application/json" in ctype:
                try:
                    password = (json.loads(raw.decode("utf-8")) or {}).get("password", "")
                except ValueError:
                    password = ""
            else:  # form-encoded from the login page
                from urllib.parse import parse_qs
                password = (parse_qs(raw.decode("utf-8")).get("password") or [""])[0]

        auth = load_json(AUTH_FILE, {})
        if auth.get("passwordHash") and verify_password(password, auth["passwordHash"]):
            clear_failures(ip)
            cookie = self._cookie_header(make_token(), SESSION_SECONDS)
            # Browser form post -> redirect to the dashboard; fetch -> JSON.
            if self.headers.get("Accept", "").find("text/html") >= 0:
                return self._send(303, "", ctype="text/plain", extra={
                    "Set-Cookie": cookie, "Location": "/"})
            return self._json(200, {"ok": True}, extra={"Set-Cookie": cookie})

        note_failure(ip)
        if self.headers.get("Accept", "").find("text/html") >= 0:
            return self._send(200, LOGIN_PAGE.replace(
                "__ERR__", '<div class="err">密碼唔啱,再試一次。</div>'),
                ctype=MIME[".html"])
        return self._json(401, {"error": "bad password"})

    def handle_put(self, collection):
        raw = self._read_body()
        if raw is None:
            return self._json(400, {"error": "empty body"})
        try:
            value = json.loads(raw.decode("utf-8"))
        except ValueError:
            return self._json(400, {"error": "invalid JSON"})
        with _write_lock:
            st = load_state()
            st[collection] = value
            rev = save_state(st)
        return self._json(200, {"ok": True, "rev": rev})

    # ---- static files ----------------------------------------------------
    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        rel = os.path.normpath(path.lstrip("/"))
        full = os.path.join(WEB_ROOT, rel)
        # never escape the web root
        if not os.path.abspath(full).startswith(os.path.abspath(WEB_ROOT)):
            return self._send(403, "forbidden", ctype="text/plain")
        if not os.path.isfile(full):
            return self._send(404, "not found", ctype="text/plain")
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        try:
            with open(full, "rb") as fh:
                body = fh.read()
        except OSError:
            return self._send(500, "read error", ctype="text/plain")
        # index.html must not be cached so a git pull is picked up
        cache = "no-store" if rel.endswith(".html") else "max-age=60"
        self._send(200, body, ctype=ctype, extra={"Cache-Control": cache})


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def set_password_interactive():
    import getpass
    ensure_dirs()
    pw = getpass.getpass("New password: ")
    pw2 = getpass.getpass("Repeat password: ")
    if not pw or pw != pw2:
        print("Passwords empty or do not match.")
        sys.exit(1)
    save_json_atomic(AUTH_FILE, {"passwordHash": hash_password(pw)})
    print("Saved password to", AUTH_FILE)


def main():
    global SECRET
    if "--set-password" in sys.argv:
        set_password_interactive()
        return

    ensure_dirs()
    env_pw = os.environ.get("HD_PASSWORD")
    if env_pw and not os.path.exists(AUTH_FILE):
        save_json_atomic(AUTH_FILE, {"passwordHash": hash_password(env_pw)})
        print("Created", AUTH_FILE, "from HD_PASSWORD")
    if not os.path.exists(AUTH_FILE):
        print("No password set yet. Run:  python3 server/server.py --set-password")
        sys.exit(1)

    SECRET = load_secret()
    httpd = ThreadingHTTPServer((BIND, PORT), Handler)
    print("Home Dashboard serving %s on http://%s:%d" % (WEB_ROOT, BIND, PORT))
    print("Data:", STATE_FILE)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
