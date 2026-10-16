# Changelog

All notable changes to this project are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed
- **Sync now shares only events and parrot weights — settings stay per-device.** Each device keeps
  its own config (bus stops, roster, layout, fonts, colours); only calendar events and weights are
  synced through the Pi. The ⚙️ → 同步 text says so.
- **⚙️ → 公眾假期 Holidays: a "🔄 更新假期" button.** It force-refreshes the holiday data — live from
  1823 on the Pi (`/api/holidays?refresh=1`), or the bundled file on GitHub Pages — and reports the
  years loaded.

### Added
- **Hong Kong public holidays in the calendar.** Holidays are marked with a colour (tinted cell,
  coloured border, day number and name) and shown in the day popup. Data comes from the official
  1823 calendar, bundled as `holidays.json` (the 1823 endpoint has no CORS header, so the browser
  cannot fetch it directly); on the Pi, `/api/holidays` refreshes it live and caches it weekly.
  Refresh the bundled file with `python3 tools/update-holidays.py` when a new year is gazetted.
- **⚙️ → 外觀 Theme: the public-holiday colour is user-configurable** (preset swatches + a colour
  picker), applied live via the `--holiday` / `--holiday-soft` CSS variables, stored in
  `theme.holidayColor` and included in the backup/import.
- **Optional shared-state sync + a Raspberry Pi host.** A new dependency-free
  Python server (`server/server.py`) serves the static files, stores a shared
  copy of events and weights (`server/data/state.json`), and adds a
  password login with a 1-year cookie. The front-end now **detects** the server
  (`GET /api/state`): when present it syncs in the background (local-first,
  ~15 s poll, push on every save, seed the server from the first device), and
  when absent (GitHub Pages) it stays localStorage-only. Remote access without
  any phone app is via **Tailscale Funnel**. Full guide: `docs/DEPLOY-PI.md`.
  Real data and secrets live only in `server/data/` and are git-ignored.
- **⚙️ → 同步 Sync** section shows whether shared sync is active and offers a
  manual "sync now".
- **🦜 Parrot daily weight + line chart.** The event popup (tap any calendar day) now has a
  **鸚鵡體重 Parrot weight** section: enter grams and press 記錄. **One value per day** — entering a
  second value for the same day asks to overwrite. A recorded day can be deleted, and the calendar
  cell shows the number (`425g`). A new **📈** button in the calendar title row opens a **native-SVG
  line chart** (no libraries): the range defaults to the **last 30 days** with presets
  (7/14/30/90/全部) and a **custom start/end date**; **missing days are skipped and the line connects
  straight to the next recorded point**. Records are stored in `homeDashboard.weights.v1` and are
  **included in the backup/import**.

### Changed
- **Weather detail popup now closes with an ✕ in its top-right corner**, matching the add-event
  popup, instead of the old full-width 關閉 button. Both modals now share a `.modal-close` style.
- **Bus last-refresh time moved into the bus panel.** The "巴士 HH:MM 更新" status used to sit in
  the top header (`#status`); it is now right-aligned in the 🚌 巴士到站 title row (`#bus-status`),
  freeing the header for the clock/weather/gear. The header gear now sits at the far right.

### Fixed
- **Settings buttons (including 💾 Save & apply) sometimes did nothing on the tablet.** They were
  bound with a raw `click`, which the browser suppresses whenever a tap drifts even slightly — very
  common on a touch screen. Settings now use the same touch-aware helper as the dashboard, so a
  clean or lightly-wobbling tap fires while a genuine drag/scroll does not. This is why dragging the
  bus-width slider then tapping Save appeared to have no effect.
- **The bus-panel size setting now works in portrait too.** Previously the slider only affected the
  landscape width; portrait used a fixed height, so the setting did nothing there. The one setting
  now drives `--bus-w` (landscape width) and `--bus-h` (portrait height, scaled ~1.6×, clamped
  22–55%).

### Added
- **Adjustable current-weather box width.** New `layout.weatherWidth` (percent of the header,
  default 30, range 15–100) sets a slider in **⚙️ → 基本 General** with a live preview. Handy in
  **portrait**, where the box previously stayed narrow; the 7-day forecast is unaffected and the
  description text is no longer hard-capped, so a wider box actually shows more. Stored in
  `localStorage` and included in the backup/import.
- **Adjustable font sizes — four independent sliders.** New `layout.fonts.{clock,bus,cal,titles}`
  settings (multipliers, default 1, range 0.6–2) scale the clock/weather/forecast, the bus
  arrivals, the calendar (days, events, weather icons, roster badges) and the titles/legend
  independently. They are exposed as sliders in **⚙️ → 基本 General** with a live preview, are
  stored in `localStorage`, **and are included in the backup/import** so they survive a restore.
  The CSS applies them as `--fs-*` variables via `calc()` on the base size, so they work in
  landscape and portrait and stack on top of the orientation-specific sizes.
- **Adjustable bus-panel width.** A new `layout.busWidth` setting (percent, default 20) controls
  the landscape split; the calendar takes the remaining width. It is exposed as a **slider in
  ⚙️ → 基本 General** with a live preview, is stored in `localStorage`, saved in the backup file,
  and applied via a `--bus-w` CSS variable. Values outside 12–60 are clamped to 20.

### Changed
- **In landscape the bus panel is now half its former width (40% → 20%), and the calendar takes
  the rest (80%).** Because the column is narrower, the bus panel's typography was scaled down to
  match (title, stop names, route numbers, chips and times), the English panel subtitle is hidden,
  and the route-row grid is narrowed so all three ETA chips still fit without truncation. Verified
  with live KMB + Citybus data at 1340×800; portrait is unaffected (panels stack there).
- **Current-weather box is narrower; the 7-day forecast is wider.** The weather box is capped at
  240px and the forecast cells share the remaining width (`flex: 1 1 0`), so all seven days get
  more room.

### Fixed
- **Weather detail needed a "long press" to open.** `onTap` ignored any tap that drifted more than
  10px, so a normal quick tap on the weather box was treated as a scroll and never fired. `onTap`
  now takes a `loose` option (40px tolerance), used for the weather box since it is not inside a
  scroll area — a light single tap now opens the detail.
- **Portrait layout ran off the screen.** In portrait the panels stack, but the bus panel grew
  unbounded and the calendar was pushed past the bottom edge, cutting off the last week-row and the
  roster legend. Portrait now caps the bus panel at 34% (it scrolls internally), gives the calendar
  the remaining 66%, and puts the header on a clean two-row grid (clock + weather + gear, then the
  forecast strip) so all six week-rows, the legend and the 7-day forecast are visible without
  scrolling. Landscape is unchanged.

### Changed
- **The add-event popup's close control is now a ✕ in the top-right corner** of the card, instead
  of a full-width 關閉 button at the bottom. The card is `position: relative` and the button is
  absolutely positioned; the title gets right padding so it cannot run under it. The weather popup
  keeps its bottom 關閉 button.

### Fixed
- **Some calendar days did not open on a single tap (e.g. 11–14).** The day handler was bound
  per-cell, so every `renderCalendar()` (every 60 s, and on `closeModal()`) destroyed and rebuilt
  the cells and their listeners. A tap whose `touchend` landed after a rebuild hit a node that no
  longer existed, so the popup never opened. Day taps now use **one delegated listener on
  `#cal-grid`** (which survives re-renders) and read the date from the live cell at event time
  (`cellDateFromTarget()`), using `elementFromPoint` for the touch coordinate.
- **Day taps only worked on some days; single tap did nothing but rapid taps opened the popup.**
  The popup opens on `touchend`, then the browser fires the synthetic `click` that belongs to the
  *same* tap. The capture guard saw `modalIsOpen() === true`, read that click as a tap *outside* the
  popup, and closed it again — so the popup flashed open and shut. The guard's 400 ms `done` flag
  meant a quick second tap slipped through, which is why rapid taps appeared to work. Now
  `openModal()` records `modalOpenedAt`, and the guard ignores any tap event within 400 ms of opening,
  so the opening gesture can never close the popup it just opened. This also stops a tap on the
  calendar from switching the open popup's date.
- **Tapping a calendar day while the add-event popup was open switched the popup to that day.**
  The device log showed the tap target was `DIV#modal` (the overlay), **not** a calendar cell, yet
  the day cell handler still ran. The guard now blocks by **exclusion**: while the popup is open it
  swallows every `touchstart`/`touchend`/`click` except those on the popup's own controls.
- Import failed with `JSON.parse: unexpected character at line 1 column 1` when fed the exported
  `config.js` (a comment plus `const CONFIG = ...;`). `parseBackup()` now unwraps both formats.
- **Taps unreliable on iPadOS.** The ⚙️ gear, calendar day taps and the weather box did not
  respond on the iPad, while the month buttons did. `addEventListener('click')` is not dependable
  on non-`<button>` elements in iPadOS Safari — a tap that moves even slightly is treated as a
  scroll and `click` never fires. Added an `onTap()` helper (handles `touchend` when the finger
  barely moved, guards against the touch+click double-fire, falls back to `click` for mouse), and
  all interactive elements now use it.
- **Settings page would not open.** An infinite recursion (`sectionStops` → `refreshStopList` →
  `rerender` → `render` → `sectionStops`) aborted the open. A `fillStopList(container)` helper now
  does the initial fill so no lookup-on-missing-node occurs.

### Added
- **Single combined backup button (⬇️ 匯出備份 Backup).** Replaces the separate `匯出 config.js` /
  `匯出 JSON 備份` / `複製設定 JSON` buttons. It downloads one `home-dashboard-backup.json`
  containing the config **and all calendar events**, and the matching 匯入 button restores both.
  Import still accepts the older plain-JSON and `config.js` backups (config only).
- `APP_VERSION` constant, printed in the ⚙️ settings footer, so you can tell which build a device
  is running.
- `?v=N` query strings on `style.css` / `config.js` / `settings.js` / `app.js` to defeat Safari's
  aggressive caching. **Bump `N` in `index.html` on every release.**
- **7-day forecast strip** in the header (icon + high/low per day), from the HKO 9-day forecast.
- **Weather icon on the calendar** for the next 7 days, beside the shift badge.
- **Tap the weather box** to open a detail popup: full short-term forecast paragraph, update time,
  active warning, and a 7-day text forecast list.
- **Auto-refresh interval** setting (10 s – 10 min), replacing the fixed 30 s.
- **Auto-refresh pauses while interacting** — settings open, typing, stop search, or within 4 s of
  a tap — and resumes automatically.
- **GPS location detection** (`📍 使用我的位置`) picks the nearest of 27 HKO weather stations;
  runs automatically on first visit.
- Developer documentation under `docs/` (`ARCHITECTURE.md`, `API.md`, `DATA-STORAGE.md`,
  `DEVELOPMENT.md`) and this changelog.

### Changed
- **Target device is now a Samsung Galaxy Tab A9** (1340 × 800, 5:3, Chrome) instead of an
  iPad mini 4. The layout was already relative, so the change is tuning rather than a rewrite:
  a `--topbar-h` variable ties the header height to the `main` calc, and a wide-landscape media
  query (`min-width: 1100px`) enlarges the header, forecast strip, bus chips and calendar text,
  and shifts the split to 40% / 60%. Verified with live API data at 1340 × 800.
- Repository renamed to `dargon412/HomeMiniDisplay`; the Pages URL is now
  <https://dargon412.github.io/HomeMiniDisplay/>.
- Header shows the concise **daily** weather summary instead of the long short-term paragraph;
  the full text moved to the popup. Widened the summary area.
- Roster badges now show only the label (`早` / `夜` / `休`) — the `M` / `N` / `L` letters are no
  longer printed. The legend is generated from the configured cycle.

## [0.1.0] — initial build

### Added
- Always-on dashboard web app: live clock and date.
- Bus ETA panel: next 3 arrivals for configured stops/routes, KMB/LWB and Citybus.
- Calendar with 4-day roster (M → N → L → L) computed from an anchor date.
- Per-day events stored in `localStorage`.
- Current weather from the Hong Kong Observatory.
- On-screen settings page with an integrated bus-stop finder.
- Export/import of settings as `config.js` or JSON.
- `tools.html` standalone stop finder.
- README with setup, GitHub, GitHub Pages and iPad kiosk instructions.
