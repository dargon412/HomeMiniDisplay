# 家庭看板 Home Dashboard

An always-on wall dashboard for a tablet, showing Hong Kong bus ETAs, a shift-roster
calendar with addable events, and weather — all in one glance.

- **Live:** <https://dargon412.github.io/HomeMiniDisplay/>
- **Target device:** Samsung Galaxy Tab A9 (1340 × 800 landscape), Android Chrome/Firefox
- **No backend, no build step, no dependencies.** Plain HTML/CSS/JS served from GitHub Pages.
  The browser calls Hong Kong government open-data APIs directly (KMB/LWB, Citybus, HKO).
- **Optional self-hosted sync** on a Raspberry Pi, so several devices share one dataset
  (see [`docs/DEPLOY-PI.md`](docs/DEPLOY-PI.md)). The static GitHub Pages build is unchanged.

## Features

- **Bus arrivals** — next 3 ETAs per stop/route, for KMB/LWB and Citybus.
- **Calendar** — a 4-day roster cycle (早/夜/休) plus events you add by tapping a day, with Hong
  Kong **public holidays** marked in a configurable colour.
- **Parrot weight** — log a daily weight and view it as a line chart.
- **Weather** — current conditions, a 7-day forecast strip, and per-day icons on the calendar.
- **On-screen settings** — edit stops, roster, weather district, refresh interval, layout, fonts
  and colours from the ⚙️ page (no code editing needed).
- **Backup** — one button exports settings, events *and* weights to a single JSON file; import
  restores it.

## Run locally

```bash
cd ipad-dashboard
python3 -m http.server 8000
# open http://localhost:8000
```

## Docs

- `docs/ARCHITECTURE.md` — how the pieces fit together
- `docs/API.md` — the government data endpoints
- `docs/DATA-STORAGE.md` — config/events/weights storage and backup
- `docs/DEPLOY-PI.md` — host it on a Raspberry Pi with shared data + remote access
- `docs/DEVELOPMENT.md` — conventions, release/caching, debugging
- `AGENTS.md` — orientation for AI agents working in this repo

## License

[MIT](LICENSE)
