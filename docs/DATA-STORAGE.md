# Data storage & configuration

Everything the app remembers lives in the browser's `localStorage`, on the device. Nothing is
sent to any server except the public bus/weather API calls.

## Three things are stored

| localStorage key | What | Written by | Read by |
|---|---|---|---|
| `homeDashboard.config.v1` | Your settings (stops, roster, district, refresh, layout, theme) | settings page | `DashboardConfig.load()` |
| `homeDashboard.events.v1` | Calendar events | calendar modal | `loadEvents()` |
| `homeDashboard.weights.v1` | Parrot weight, one value per day (grams) | calendar modal | `loadWeights()` |
| `homeDashboard.holidays.v1` | Cached public holidays (`{at, data}`) | `loadHolidays()` | `loadHolidays()` |

## How config is resolved

`config.js` (committed to the repo) is only the **default**. On load:

```js
defaults()                  // from config.js
  └─ saved = localStorage['homeDashboard.config.v1']
       └─ result = merge(saved over defaults)
```

So the effective config is: **saved settings, with config.js filling in anything missing.**

Consequences:

- Editing `config.js` and pushing changes **does not** change a device that already has saved
  settings — the saved copy wins. To apply a new `config.js` default, press
  **⚙️ → 備份 → ♻️ 還原 config.js 預設** first, then reload.
- Clearing Safari website data wipes saved settings; the app falls back to `config.js`.
- `localStorage` is per-browser-profile. A private window starts fresh.

## Config shape

```js
{
  weather: { district: "沙田", language: "tc" },
  roster: {
    anchorDate: "2026-10-01",          // a date that is a Morning (M) shift
    cycle: ["M", "N", "L", "L"],       // repeats forever
    labels: { M: "早", N: "夜", L: "休" } // what to print on the badge
  },
  refresh: { seconds: 30 },            // auto-refresh interval
  busStops: [
    {
      name: "我家樓下",                 // display name
      operator: "kmb",                 // "kmb" | "ctb"
      stopId: "DCFF4041D0C0ACF8",      // from the stop finder
      routes: [
        { route: "1A", serviceType: "1" }
      ]
    }
  ]
}
```

## Roster maths

The shift for a date is derived, never stored:

```
diff  = days between date and anchorDate
index = ((diff % cycle.length) + cycle.length) % cycle.length
shift = cycle[index]
```

The double modulo keeps it correct for dates **before** the anchor. With the default cycle, any
date exactly equal to the anchor is `M`, the next day `N`, then `L`, `L`, then `M` again.

## Calendar events

```js
{
  "2026-10-05": ["覆診 3:00pm", "買餸"],
  "2026-10-11": ["太太生日"]
}
```

- Keyed by local date `YYYY-MM-DD`.
- Each value is an array of plain strings.
- Added/removed in the event modal; the array is spliced and the key deleted when empty.

Event text is rendered with `textContent`, so it is safe against HTML injection.

## Parrot weight

```js
{
  "2026-10-01": 423,
  "2026-10-02": 425
}
```

- Keyed by local date `YYYY-MM-DD` — so there can only ever be **one value per day**.
- Units are **grams**; one decimal is kept.
- Entering a value for a day that already has one prompts to overwrite. The day can also be deleted.
- The calendar cell shows the number (`425g`) on recorded days.
- The 📈 chart button draws a native-SVG line chart (no libraries). Missing days are simply
  skipped — the line connects straight to the next recorded point. The range defaults to the last
  30 days and can be changed with the presets or a custom start/end date.

## Public holidays

- Bundled in `holidays.json` (parsed from the official 1823 iCal), keyed `YYYY-MM-DD` → name.
  The 1823 endpoint sends **no CORS header**, so the browser cannot fetch it directly.
- The app loads `holidays.json` (same-origin), caches it in `homeDashboard.holidays.v1`, and on the
  Pi also fetches `/api/holidays` (which refreshes from 1823 at most weekly and caches on disk).
- Holiday cells get the `theme.holidayColor` colour (see below) and the day popup shows the name.
- Refresh the bundled file when a new year is gazetted: `python3 tools/update-holidays.py`.

`theme.holidayColor` (a CSS hex colour, default `#ff5b5b`) is applied as the `--holiday` CSS
variable; `--holiday-soft` is the same colour at low alpha for the cell tint. Editable in
⚙️ → 外觀 Theme and included in the backup.

## Backup and restore

> **Raspberry Pi hosts:** if you run the optional `server/`, **events and weights** are shared
> through `server/data/state.json` and synced automatically across devices. **Settings (config) are
> per-device and are not synced.** The export/import below still works and is the easiest way to
> move everything.

The settings page (**⚙️ → 備份**) provides:

| Button | Effect |
|---|---|
| ⬇️ 匯出備份 Backup | Downloads **one** `.json` file containing the config, **all calendar events** and **all weight records** |
| ♻️ 還原 config.js 預設 | Deletes the saved config (falls back to `config.js`) |
| 匯入備份 | Loads a backup — the combined file, or a legacy plain-JSON / `config.js` file |

### Backup file shape

The single export button writes `home-dashboard-backup.json`:

```json
{
  "app": "home-dashboard",
  "version": 1,
  "exportedAt": "2026-10-02T17:00:00.000Z",
  "config": { "title": "...", "weather": {...}, "roster": {...},
              "refresh": {...}, "busStops": [ ... ] },
  "events": { "2026-10-05": ["覆診 3:00pm"] },
  "weights": { "2026-10-01": 423, "2026-10-02": 425 }
}
```

Import is deliberately forgiving. It accepts:

- the combined backup above → restores **config, events and weights**;
- a legacy plain-JSON config object → restores config only;
- a legacy exported `config.js` (`/* comment */` + `const CONFIG = { ... };`) → config only.

`parseBackup()` unwraps the `config.js` form. Events are written back to
`homeDashboard.events.v1`, weights to `homeDashboard.weights.v1`, and the import reports how many
stops, events and weight days were restored. **The config part only takes effect after you press
儲存並套用** (events and weights apply immediately).

## Versioning

The `.v1` suffixes are schema versions. If you change the shape of stored data:

1. Bump the key (`v2`) **and** add a migration that reads the old key, or
2. Add a normalizer that tolerates the old shape.

Do not silently change a shape in place — existing devices will break.

## Storage limits & failure modes

- `localStorage` is roughly 5 MB per origin. This app uses a few KB.
- In private browsing, writes can throw. `saveEvents()` and `DashboardConfig.save()` wrap writes
  in try/catch so the app keeps working in memory even if persistence fails.
