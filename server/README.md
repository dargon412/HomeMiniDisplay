# server/

A tiny, dependency-free Python server so several devices can share one copy of
the dashboard data (bus stops, calendar events, parrot weights) and so the
dashboard can be reached from outside the home through Tailscale Funnel.

**Full setup guide: [`../docs/DEPLOY-PI.md`](../docs/DEPLOY-PI.md).**

## Run

```bash
python3 server/server.py --set-password   # first time only
python3 server/server.py                  # then run it
```

Defaults to `http://127.0.0.1:8080` and serves the repo root as static files.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `HD_PORT` | `8080` | listen port |
| `HD_BIND` | `127.0.0.1` | listen address (`0.0.0.0` for LAN) |
| `HD_WEB_ROOT` | parent of `server/` | static files directory |
| `HD_DATA_DIR` | `server/data` | where the data + secrets live |
| `HD_PASSWORD` | – | create the password on first run (else use `--set-password`) |

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/state` | – | `{ rev, updatedAt, config, events, weights }` |
| `GET` | `/api/holidays` | – | `{ holidays: { 'YYYY-MM-DD': 'name' } }` (from 1823, cached weekly) |
| `PUT` | `/api/config` \| `/api/events` \| `/api/weights` | the value | `{ ok, rev }` |
| `POST` | `/api/login` | `{ password }` | sets a 1-year cookie |
| `POST` | `/api/logout` | – | clears the cookie |
| `GET` | `/api/health` | – | `{ ok, rev }` (public) |

Everything except `/api/login` and `/api/health` requires the session cookie.

## Files (all git-ignored)

| File | Holds |
|---|---|
| `data/state.json` | the shared data — your real family data |
| `data/auth.json` | the password hash (PBKDF2) |
| `data/secret` | the cookie-signing key |

Nothing here is ever committed. The repo is public; keep it that way.
