# AGENTS.md

Orientation for agents working in this repo. Read this first; the `docs/` folder has the depth.

## What this is

An always-on wall dashboard (HK bus ETAs + a shift roster calendar + weather). **No backend, no
build step, no dependencies, no package manager.** Plain HTML/CSS/JS served statically from GitHub
Pages; the browser calls Hong Kong government open-data APIs directly. Do not introduce a bundler,
npm, or a framework.

There is an **optional** self-hosted sync server (`server/server.py`, Python standard library only)
for sharing one dataset across devices on a Raspberry Pi. It is not needed for the static app and
must not become a dependency of it. The front-end probes `GET /api/state`: present → sync on,
absent (GitHub Pages) → localStorage only. See `docs/DEPLOY-PI.md`.

- Live: <https://dargon412.github.io/HomeMiniDisplay/>
- Repo: `git@github.com:dargon412/HomeMiniDisplay.git` (remote `origin`, branch `main`)

## Run and verify

```bash
cd ~/ipad-dashboard
python3 -m http.server 8000        # then open http://localhost:8000
```

No test suite, no linter, no typechecker. Verify a change by loading the page in a browser at the
target size (**1340 × 800 landscape**) and/or by stubbing `fetch` (and throwaway `_*.html` scratch
pages, which `.gitignore` is set up to ignore). `node` is **not installed** on this machine.

There is a known-slow path: headless Firefox screenshots here often fire before JS/timers run, so
they show unpopulated panels. Do not treat an empty chip/`…`/`--°C` in a headless render as a bug —
confirm against the live API with `curl` or an injected `fetch` stub first.

## Files (load order matters)

`index.html` → `config.js` → `settings.js` → `app.js`. `settings.js` defines `window.DashboardConfig`
and `window.openSettings` *before* `app.js` reads them. Keep the order if you touch the script tags.

| File | Job |
|---|---|
| `config.js` | **Defaults only** (`const CONFIG = {...}`). Saved settings win over it. |
| `settings.js` | The ⚙️ settings page; owns read/write of saved config. IIFE exposing 2 globals. |
| `app.js` | Dashboard: clock, weather, bus, calendar, refresh scheduling. Sections marked by banner comments. |
| `tools.html` | Standalone bus-stop finder (settings has its own now). |
| `holidays.json` | Bundled HK public holidays (`YYYY-MM-DD` → name). Regenerate with `tools/update-holidays.py`. |
| `server/server.py` | Optional Pi server: static files + shared-state API + login. Stdlib only. |
| `deploy/` | Pi systemd units + helper scripts (`pi-up.sh`, `backup-to-drive.sh`). No secrets. |

Customize-stop IDs come from `tools.html`; `docs/API.md` documents the exact endpoints.

## Hard rules / gotchas

- **Every release must bump the cache-buster.** GitHub Pages sends `cache-control: max-age=600`
  and Safari caches harder still. Bump all four `?v=N` in `index.html` (lines ~12, 98–100) **and**
  `APP_VERSION` in `app.js`. The version shows bottom-left on the page and in the settings footer;
  that is how a device is confirmed to be on the new build. Missing this is the #1 source of
  "I pushed but the device shows the old thing".
- **Bind taps with `onTap(node, handler)` — never `click` directly on a non-`<button>`.** A tap that
  drifts >10 px is treated as a scroll and no `click` fires. `onTap` guards the touch→click
  double-fire. This has already caused a long debugging saga.
- **A syntax error in `config.js` blanks the whole page.** Check it first when the page is white.
- **Header height is coupled to the main area.** It is now the `--topbar-h` CSS variable; both
  `#topbar` and `main { height: calc(100% - var(--topbar-h)) }` use it. Change only the variable.
- **Keep JS conservative** (`docs/DEVELOPMENT.md` has the table): no `?.`, `??`, `Array.prototype.at`,
  top-level `await`, class fields, `structuredClone`. It deliberately reads old-fashioned.
- **Config defaults vs saved:** editing `config.js` does **not** change a device that already has
  saved settings — the localStorage copy wins. Reset via ⚙️ → 備份 → 還原 config.js 預設.
- **Never commit personal data or secrets.** `config.js` should hold demo stops only; the user's
  real stops/roster/events/weights live in the device's `localStorage` (`homeDashboard.config.v1`,
  `homeDashboard.events.v1`, `homeDashboard.weights.v1`) or, with the Pi server, in
  `server/data/` (git-ignored). Never commit `server/data/`, password hashes or cookie secrets.
  The repo is public. The user has explicitly said "no surprise".
- **Auto-refresh must keep pausing on interaction** — see `isInteracting()` / `scheduleRefresh()` in
  `app.js`. Any new timed refresh goes through the same guard.
- **Blocking taps behind an overlay needs a capture-phase guard, not an in-handler check.** When the
  event popup is open, `guardCalendarWhileModalOpen()` (in `bindUi()`) swallows
  `touchstart`/`touchend`/`click` for everything except `.modal-card` descendants, and closes the
  popup once per gesture. An `onTap` check *inside* a cell handler is not enough — the overlay's own
  tap can run first and change the state the handler checks.

## Before you finish

Update `CHANGELOG.md`, then bump the version/cache-buster, commit, and `git push` (Pages redeploys in
a minute or two). Do not add dependencies. Changes should degrade gracefully offline (each fetch is
individually `.catch()`-ed via `fetchJson`).
