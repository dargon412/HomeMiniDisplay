# Architecture

This document explains how the Home Dashboard works, so you can safely change it later.

## The big picture

```
┌─────────────────────────────────────────────────────────────┐
│  Samsung Galaxy Tab A9 (Android) — Chrome, landscape        │
│                                                             │
│   index.html ──> style.css                                  │
│       │                                                     │
│       ├── config.js     (defaults, committed to the repo)   │
│       ├── settings.js   (the ⚙️ settings page)              │
│       └── app.js        (the dashboard)                     │
│                                                             │
│   localStorage:                                             │
│       homeDashboard.config.v1  ← saved settings             │
│       homeDashboard.events.v1  ← calendar events            │
└───────────────┬─────────────────────────────────────────────┘
                │  HTTPS (no server of our own)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Hong Kong Government Open Data (all send CORS: *)          │
│   • data.etabus.gov.hk         KMB / LWB ETA                │
│   • rt.data.gov.hk             Citybus ETA                  │
│   • data.weather.gov.hk        HKO weather forecast         │
└─────────────────────────────────────────────────────────────┘
```

**There is no backend.** The browser talks directly to the government APIs. This is why the app
can be a static site on GitHub Pages with zero running cost. All three APIs were verified to send
`access-control-allow-origin: *`, which is what allows the browser to call them.

**Optional self-hosted sync.** An optional `server/` (Python stdlib only) can serve the same files
and share **calendar events and parrot weights** so several devices stay in step. Settings stay
per-device. The front-end probes `GET /api/state`; if it answers, sync turns on (local-first:
localStorage is still the instant store, the server is synced in the background). On GitHub Pages
the probe 404s and the app stays local-only, so the static build is unchanged. See
`docs/DEPLOY-PI.md`.

## Files and their jobs

| File | Responsiblity | Load order |
|---|---|---|
| `index.html` | The static markup: header, bus panel, calendar panel, three modals | — |
| `style.css` | All styling, including the dark theme and the landscape/portrait layouts | — |
| `config.js` | **Default** settings, defined as `const CONFIG = {...}` | 1st |
| `settings.js` | The ⚙️ settings UI; also owns reading/writing saved settings | 2nd |
| `app.js` | The dashboard: clock, weather, bus, calendar, refresh scheduling | 3rd |
| `tools.html` | Standalone bus-stop finder (older helper; settings now has its own) | standalone |
| `manifest.json` | PWA metadata for "Add to Home Screen" | referenced by HTML |

**Load order matters.** `settings.js` runs before `app.js` and defines `window.DashboardConfig`.
When `app.js` starts, it calls `DashboardConfig.load()` to get the effective config (saved settings
merged over `config.js` defaults).

## Config resolution

```
DashboardConfig.load()
   ├─ defaults()  ← reads config.js (CONFIG)
   ├─ reads localStorage 'homeDashboard.config.v1'
   └─ merges saved over defaults:
        { weather, roster, refresh, busStops }
```

`app.js` calls `normalizeConfig()` afterwards to fill in anything missing and set `LANG`.

When you press **儲存並套用**:
1. `settings.js` calls `DashboardConfig.save(working)` → writes localStorage.
2. Then calls `window.reloadDashboard()` (defined in `app.js`).
3. `reloadDashboard` re-reads the config, re-renders calendar + bus skeleton, reloads data, and
   reschedules the timers.

## Runtime render loops

| Loop | Interval | Function | Pauses when interacting? |
|---|---|---|---|
| Clock | 1000 ms | `tickClock` | no (cheap) |
| Bus ETA | configurable (default 30 s) | `loadBus` | yes |
| Calendar | 60 s | `renderCalendar` | yes |
| Weather | 600 s (10 min) | `loadWeather` | yes |

`scheduleRefresh()` (re)creates the three intervals. Each interval checks `isInteracting()` before
doing work.

`isInteracting()` returns `true` when:
- the settings page, event modal, or weather modal is open, **or**
- the focused element is an input/textarea/select, **or**
- the user touched the screen within the last 4 seconds.

Interaction is tracked by capture-phase listeners in `bindUi()` (`pointerdown`, `touchstart`,
`keydown`, `input`, `focusin`, `wheel`).

## Data flow: buses

```
buildBusSkeleton()   creates one row per stop per route, with placeholder chips
        │
loadBus()            for every (stop, route) calls etaUrl(stop, routeCfg)
        │
etaUrl()             KMB/LWB vs Citybus endpoint selection
        │
renderRoute()        keeps the FIRST THREE items, builds chips with minutes + clock time
```

Stop identity in config: `{ name, operator, stopId, routes: [{ route, serviceType }] }`.
`serviceType` is KMB/LWB only and is normally `"1"`.

## Data flow: weather

```
loadWeather()  fetches three endpoints in parallel:
   rhrread   current temp / humidity / UV / icon / warnings
   flw       short-term forecast paragraph   → header summary fallback + popup body
   fnd       9-day forecast                  → calendar icons + 7-day strip + popup list
```

The header shows `fnd.weatherForecast[0].forecastWeather` (the concise daily summary). The full
`flw.forecastDesc` paragraph appears in the tap-to-open popup. If there is an active warning,
the header shows the warning instead.

GPS: `window.detectMyLocation(cb)` asks the browser for a position and returns the nearest entry
from the hard-coded `STATIONS` list (27 HKO stations, approximate coordinates). `detectAndApply()`
is called once on first run when nothing has been saved.

## Data flow: calendar

- `rosterLetter(date)` computes the shift from `roster.anchorDate` + `roster.cycle` using a
  modulo on the day difference.
- `forecastByDate` (filled by `renderForecast`) supplies the weather icon for the next 7 days.
- Events come from `localStorage` via `loadEvents()`/`saveEvents()`.
- `renderCalendar()` rebuilds the whole grid each call — simple and fast enough at this size.

## localStorage keys

| Key | Contents |
|---|---|
| `homeDashboard.config.v1` | Saved settings (weather, roster, refresh, busStops) |
| `homeDashboard.events.v1` | Events, keyed by `YYYY-MM-DD` → array of strings |

The `.v1` suffix is a version marker. If you ever change the shape of saved data, add a migration
or bump the key rather than silently breaking existing installs.

## Constraints to remember

- **Target device is a Samsung Galaxy Tab A9, 1340 × 800 landscape (5:3), Chrome.** The code also
  stays conservative enough for older WebKit, so avoid `??`, `?.`, `Array.prototype.at`, top-level
  `await` and class fields. ES5-ish + Promises + `fetch` is safe everywhere.
- **A wide-landscape media query (min-width 1100px)** supplies the Tab A9 tuning. The base layout
  is relative, so narrow screens still work.
- **Never break `config.js` parsing** — a syntax error there blanks the whole page.
- **Keep the header height in sync** with `main { height: calc(100% - 104px) }` in `style.css`.
- Everything must degrade gracefully when offline: `fetchJson` has a timeout, and each fetch is
  individually `.catch()`-ed so one failure doesn't take down the screen.

## How to add a feature (checklist)

1. Decide if it needs config. If so, add it in `config.js`, `settings.js` defaults, and normalize
   it in `app.js`.
2. Add markup in `index.html` if it's a new panel/modal.
3. Add styles in `style.css`, keeping the 1340×800 landscape target in mind.
4. Write the render function in `app.js`; make it idempotent (safe to call repeatedly).
5. If it fetches data, add the loop in `scheduleRefresh()` and respect `isInteracting()`.
6. Test in a browser at 1340×800, then on the tablet.
7. Update `CHANGELOG.md` and the relevant doc.
