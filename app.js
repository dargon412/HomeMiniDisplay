/* ============================================================
   家庭看板 Home Dashboard — app logic
   Static site, no build step, no frameworks. Runs in a browser
   (target: Android Chrome/Firefox on a wall-mounted tablet).
   Data sources (all official, free, browser-friendly):
     • KMB / LWB ETA : https://data.etabus.gov.hk
     • Citybus ETA   : https://rt.data.gov.hk
     • Weather (HKO) : https://data.weather.gov.hk
   ============================================================ */
'use strict';

/* Bump this whenever you change the app, so you can tell which build a
   device is running (shown in ⚙️ settings and logged on load). */
var APP_VERSION = '2026-10-16.1';

/* ---------------- on-device tap diagnostics ----------------
   Open the page with ?debug=1 (e.g. .../HomeMiniDisplay/?debug=1)
   to show a panel that logs the raw events your taps produce. This is
   how we find out exactly what the device is sending. */
var TAP_DEBUG = /[?&]debug=1/.test(location.search);

function tapLog(msg) {
  if (!TAP_DEBUG) return;
  var log = $('tap-debug-log');
  if (!log) return;
  var line = document.createElement('div');
  var t = new Date();
  line.textContent = pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ':' + pad2(t.getSeconds()) +
    '.' + String(t.getMilliseconds()).slice(0, 3) + '  ' + msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  var c = $('tap-debug-count');
  if (c) c.textContent = String(Number(c.textContent || 0) + 1);
}

function initTapDebug() {
  if (!TAP_DEBUG) return;
  var box = $('tap-debug');
  if (box) box.classList.remove('hidden');

  var close = $('tap-debug-close');
  if (close) close.addEventListener('click', function () { box.classList.add('hidden'); });

  // Collapse to just the header so the whole screen is tappable.
  var toggle = $('tap-debug-toggle');
  if (toggle) toggle.addEventListener('click', function () {
    box.classList.toggle('min');
    toggle.textContent = box.classList.contains('min') ? '展開 Expand' : '縮小 Collapse';
  });

  // Copy the whole log to the clipboard so it can be pasted anywhere.
  var copy = $('tap-debug-copy');
  if (copy) copy.addEventListener('click', function () {
    var log = $('tap-debug-log');
    var text = log ? log.textContent : '';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        copy.textContent = '已複製 ✓';
        setTimeout(function () { copy.textContent = '複製 Copy'; }, 1500);
      }, function () { copy.textContent = '複製失敗'; });
    } else {
      copy.textContent = '不支援複製';
    }
  });

  ['touchstart', 'touchend', 'touchcancel', 'click', 'pointerdown', 'pointerup'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var el = e.target || e.srcElement;
      if (el && el.id === 'tap-debug-close') return;
      var desc = el ? (el.tagName + (el.id ? '#' + el.id : '') +
        (el.className && typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').join('.') : '')) : '?';
      var extra = '';
      if (e.changedTouches && e.changedTouches.length) {
        var tc = e.changedTouches[0];
        extra = ' [' + Math.round(tc.clientX) + ',' + Math.round(tc.clientY) + ']';
      } else if (e.clientX != null) {
        extra = ' [' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ']';
      }
      tapLog(type + extra + ' <- ' + desc);
    }, true);
  });

  tapLog('debug ready. version ' + APP_VERSION);
  tapLog('ontouchstart: ' + ('ontouchstart' in window) + ' | maxTouchPoints: ' + (navigator.maxTouchPoints || 0));
  tapLog('UA: ' + navigator.userAgent);
}

/* ----------------------------- helpers ----------------------------- */
function $(id) { return document.getElementById(id); }

/* Tapping on iPadOS can be flaky on non-<button> elements: a tap that
   moves even slightly is treated as a scroll, and `click` never fires.
   This helper fires the handler on `touchend` (if the finger barely
   moved), and falls back to `click` for mouse/desktop. */
function onTap(node, handler, opts) {
  if (!node) return;
  // `loose` loosens the movement tolerance for elements that are NOT inside a
  // scroll area (e.g. the weather box): a natural tap often drifts more than
  // the strict 10px, which made it feel like it needed a long press.
  var tol = (opts && opts.loose) ? 40 : 10;
  var moved = false, startX = 0, startY = 0, handled = false;

  node.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    moved = false; handled = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  node.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1) return;
    if (Math.abs(e.touches[0].clientX - startX) > tol ||
        Math.abs(e.touches[0].clientY - startY) > tol) moved = true;
  }, { passive: true });

  node.addEventListener('touchend', function (e) {
    if (moved) return;
    handled = true;
    handler(e);
  });

  node.addEventListener('click', function (e) {
    if (handled) { handled = false; return; }  // avoid double-firing after touchend
    handler(e);
  });
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

function parseYmd(s) {
  var p = String(s || '').split('-');
  if (p.length !== 3) return null;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function nowHM() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/* fetch JSON with a timeout so a dead network never hangs the screen */
function fetchJson(url, timeoutMs) {
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 12000);
  var opts = ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' };
  return fetch(url, opts).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (json) {
    clearTimeout(timer);
    return json;
  }, function (err) {
    clearTimeout(timer);
    throw err;
  });
}

function setStatus(text) { var n = $('bus-status'); if (n) n.textContent = text; }

/* ----------------------------- CONFIG ----------------------------- */
/* The ⚙️ settings page saves changes in localStorage. If there are none
   we fall back to config.js. */
var CFG = (window.DashboardConfig && window.DashboardConfig.load)
  ? window.DashboardConfig.load()
  : ((typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : {});
var LANG = 'tc';

function normalizeConfig() {
  CFG.roster = CFG.roster || {};
  CFG.roster.cycle = (CFG.roster.cycle && CFG.roster.cycle.length) ? CFG.roster.cycle : ['M', 'N', 'L', 'L'];
  CFG.roster.labels = CFG.roster.labels || { M: '早', N: '夜', L: '休' };
  CFG.busStops = CFG.busStops || [];
  CFG.weather = CFG.weather || {};
  CFG.refresh = CFG.refresh || { seconds: 30 };
  CFG.layout = CFG.layout || {};
  var bw = Number(CFG.layout.busWidth);
  CFG.layout.busWidth = (bw >= 12 && bw <= 60) ? bw : 20;
  CFG.layout.fonts = CFG.layout.fonts || {};
  var groups = ['clock', 'bus', 'cal', 'titles'];
  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    var fv = Number(CFG.layout.fonts[g]);
    CFG.layout.fonts[g] = (fv >= 0.6 && fv <= 2) ? fv : 1;
  }
  var ww = Number(CFG.layout.weatherWidth);
  CFG.layout.weatherWidth = (ww >= 15 && ww <= 100) ? ww : 30;
  LANG = CFG.weather.language || 'tc';
}
normalizeConfig();

/* Push the bus-panel size into CSS. The one setting drives both:
   - landscape: bus panel WIDTH  (--bus-w), calendar takes the rest
   - portrait : bus panel HEIGHT (--bus-h), calendar fills below
   `layout.busWidth` is stored as a percentage (12-60, default 20); in
   portrait we map it a little higher so the bus panel stays readable. */
function busPanelSize() {
  var bw = Number(CFG.layout && CFG.layout.busWidth);
  if (!(bw >= 12 && bw <= 60)) bw = 20;
  return bw;
}
function applyLayout() {
  var bw = busPanelSize();
  var root = document.documentElement.style;
  root.setProperty('--bus-w', bw + '%');
  // Portrait: width->height. 20% width ~= 34% height, so scale up ~1.6x,
  // clamped to a sane 22-55% so neither panel becomes unusable.
  var bh = Math.round(bw * 1.6);
  if (bh < 22) bh = 22;
  if (bh > 55) bh = 55;
  root.setProperty('--bus-h', bh + '%');

  // Font scales: one multiplier per group (1 = unchanged), clamped 0.6-2.
  var fonts = (CFG.layout && CFG.layout.fonts) || {};
  var keys = ['clock', 'bus', 'cal', 'titles'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var f = Number(fonts[k]);
    if (!(f >= 0.6 && f <= 2)) f = 1;
    root.setProperty('--fs-' + k, String(f));
  }

  // Current-weather box width (percent of the header), clamped 15-100.
  var ww = Number(CFG.layout && CFG.layout.weatherWidth);
  if (!(ww >= 15 && ww <= 100)) ww = 30;
  root.setProperty('--weather-w', ww + '%');
}
applyLayout();

/* ============================================================
   1. CLOCK
   ============================================================ */
var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function tickClock() {
  var now = new Date();
  $('time').textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
  $('date').textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 ' +
    WEEKDAYS[now.getDay()];
}

function showVersion() {
  var v = $('app-version');
  if (v) v.textContent = 'v' + APP_VERSION;
}

/* ============================================================
   2. WEATHER  (Hong Kong Observatory open data)
   ============================================================ */
var HKO_ICONS = {
  50: '☀️', 51: '🌤️', 52: '⛅', 53: '🌦️', 54: '🌧️',
  60: '☁️', 61: '☁️', 62: '🌧️', 63: '🌧️', 64: '🌧️', 65: '⛈️',
  70: '🌫️', 71: '🌫️', 72: '🌫️', 73: '🌫️', 74: '🌫️', 75: '🌫️', 76: '🌫️', 77: '🌫️',
  80: '🌬️', 81: '🌬️', 82: '🌬️', 83: '🌬️', 84: '🌬️', 85: '🌬️',
  90: '🔥', 91: '🔥', 92: '🥶', 93: '🥶'
};

function iconEmoji(code) {
  if (code == null) return '🌡️';
  if (HKO_ICONS[code]) return HKO_ICONS[code];
  // fall back to the nearest decade
  var base = Math.floor(code / 10) * 10;
  return HKO_ICONS[base] || '🌡️';
}

function pickTemperature(list) {
  if (!list || !list.length) return null;
  var want = CFG.weather.district;
  if (want) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].place && list[i].place.indexOf(want) >= 0) return list[i];
    }
  }
  for (var j = 0; j < list.length; j++) {
    if (list[j].place && list[j].place.indexOf('天文台') >= 0) return list[j];
  }
  return list[0];
}

/* ---- HKO weather stations (approximate coordinates) for GPS lookup ---- */
var STATIONS = [
  { name: '京士柏', lat: 22.312, lon: 114.173 },
  { name: '香港天文台', lat: 22.302, lon: 114.174 },
  { name: '黃竹坑', lat: 22.248, lon: 114.170 },
  { name: '打鼓嶺', lat: 22.528, lon: 114.156 },
  { name: '流浮山', lat: 22.469, lon: 113.984 },
  { name: '大埔', lat: 22.449, lon: 114.170 },
  { name: '沙田', lat: 22.402, lon: 114.210 },
  { name: '屯門', lat: 22.390, lon: 113.976 },
  { name: '將軍澳', lat: 22.316, lon: 114.256 },
  { name: '西貢', lat: 22.383, lon: 114.271 },
  { name: '長洲', lat: 22.201, lon: 114.027 },
  { name: '赤鱲角', lat: 22.309, lon: 113.914 },
  { name: '青衣', lat: 22.344, lon: 114.098 },
  { name: '石崗', lat: 22.435, lon: 114.085 },
  { name: '荃灣可觀', lat: 22.383, lon: 114.108 },
  { name: '荃灣城門谷', lat: 22.376, lon: 114.126 },
  { name: '香港公園', lat: 22.278, lon: 114.162 },
  { name: '筲箕灣', lat: 22.281, lon: 114.229 },
  { name: '九龍城', lat: 22.332, lon: 114.188 },
  { name: '跑馬地', lat: 22.270, lon: 114.183 },
  { name: '黃大仙', lat: 22.341, lon: 114.199 },
  { name: '赤柱', lat: 22.216, lon: 114.213 },
  { name: '觀塘', lat: 22.318, lon: 114.224 },
  { name: '深水埗', lat: 22.335, lon: 114.162 },
  { name: '啟德跑道公園', lat: 22.305, lon: 114.213 },
  { name: '元朗公園', lat: 22.441, lon: 114.018 },
  { name: '大美督', lat: 22.466, lon: 114.237 }
];

function nearestStation(lat, lon) {
  var best = null, bestD = Infinity;
  var cosLat = Math.cos(lat * Math.PI / 180);
  STATIONS.forEach(function (s) {
    var dy = (s.lat - lat) * 111.32;
    var dx = (s.lon - lon) * 111.32 * cosLat;
    var d = dy * dy + dx * dx;
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

/* Ask the browser for GPS and hand back the nearest HKO station. */
window.detectMyLocation = function (cb) {
  if (!navigator.geolocation) { if (cb) cb(null, '此裝置不支援定位'); return; }
  navigator.geolocation.getCurrentPosition(
    function (pos) { if (cb) cb(nearestStation(pos.coords.latitude, pos.coords.longitude)); },
    function (err) { if (cb) cb(null, err.message); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
};

function detectAndApply() {
  window.detectMyLocation(function (st) {
    if (!st) return;
    CFG.weather.district = st.name;
    if (window.DashboardConfig) {
      var cfg = window.DashboardConfig.load();
      cfg.weather.district = st.name;
      window.DashboardConfig.save(cfg);
    }
    loadWeather();
  });
}

/* Forecast for the next 7 days, keyed by date (YYYY-MM-DD). */
var forecastByDate = {};
var todaySummary = '';   // concise daily summary shown in the header
var fndData = null;      // full 9-day forecast, for the detail popup
var flwData = null;      // short-term forecast, for the detail popup

function fndKey(s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }

/* Popup with the full detailed weather text (tap the weather box). */
function openWeatherDetail() {
  var body = $('wm-body');
  body.innerHTML = '';

  var now = new Date();
  $('wm-title').textContent = '今日天氣 · ' + now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';

  if (flwData && flwData.forecastDesc) {
    var p = el('p', 'wm-desc', flwData.forecastDesc);
    body.appendChild(p);
    var meta = [];
    if (flwData.forecastPeriod) meta.push(flwData.forecastPeriod);
    if (flwData.updateTime) meta.push('更新 ' + String(flwData.updateTime).slice(11, 16));
    if (meta.length) body.appendChild(el('div', 'wm-meta', meta.join(' · ')));
  }
  if (flwData && flwData.warningMessage) {
    body.appendChild(el('div', 'wm-warn', '⚠️ ' + flwData.warningMessage));
  }

  if (fndData && fndData.weatherForecast) {
    body.appendChild(el('h4', 'wm-h', '未來數日 Forecast'));
    fndData.weatherForecast.slice(0, 7).forEach(function (day) {
      var row = el('div', 'wm-row');
      row.appendChild(el('span', 'wm-ic', iconEmoji(day.ForecastIcon)));
      var mid = el('div', 'wm-mid');
      mid.appendChild(el('div', 'wm-day', day.week + '　' +
        (day.forecastMaxtemp ? day.forecastMaxtemp.value : '-') + '° / ' +
        (day.forecastMintemp ? day.forecastMintemp.value : '-') + '°'));
      mid.appendChild(el('div', 'wm-txt', day.forecastWeather || ''));
      row.appendChild(mid);
      body.appendChild(row);
    });
  }

  $('weather-modal').classList.remove('hidden');
}

function closeWeatherDetail() { $('weather-modal').classList.add('hidden'); }

function renderForecast(fnd) {
  var box = $('forecast');
  if (!box) return;
  box.innerHTML = '';
  forecastByDate = {};
  if (!fnd || !fnd.weatherForecast) return;

  fnd.weatherForecast.slice(0, 7).forEach(function (day, i) {
    var key = fndKey(day.forecastDate);
    var icon = day.ForecastIcon;
    forecastByDate[key] = {
      icon: icon,
      max: day.forecastMaxtemp && day.forecastMaxtemp.value,
      min: day.forecastMintemp && day.forecastMintemp.value
    };

    var item = el('div', 'fc-day');
    item.appendChild(el('div', 'fc-dow', i === 0 ? '今天' : String(day.week || '').replace('星期', '')));
    item.appendChild(el('div', 'fc-icon', iconEmoji(icon)));
    var temp = el('div', 'fc-temp');
    temp.appendChild(el('span', 'fc-hi', String((day.forecastMaxtemp || {}).value != null ? day.forecastMaxtemp.value : '-')));
    temp.appendChild(el('span', 'fc-lo', '/' + String((day.forecastMintemp || {}).value != null ? day.forecastMintemp.value : '-')));
    item.appendChild(temp);
    item.title = day.forecastWeather || '';
    box.appendChild(item);
  });
}

function loadWeather() {
  var base = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?lang=' + LANG + '&dataType=';
  return Promise.all([
    fetchJson(base + 'rhrread', 12000).catch(function () { return null; }),
    fetchJson(base + 'flw', 12000).catch(function () { return null; }),
    fetchJson(base + 'fnd', 12000).catch(function () { return null; })
  ]).then(function (res) {
    var real = res[0], flw = res[1], fnd = res[2];
    if (!real) { $('weather-desc').textContent = '天氣載入失敗'; return; }

    var t = pickTemperature(real.temperature && real.temperature.data);
    $('weather-temp').textContent = t ? (t.value + '°C') : '--°C';

    var code = real.icon && real.icon[0];
    $('weather-icon').textContent = iconEmoji(code);

    var hum = real.humidity && real.humidity.data && real.humidity.data[0];
    var uv = real.uvindex && real.uvindex.data && real.uvindex.data[0];
    var parts = [];
    if (hum && hum.value != null) parts.push('濕度 ' + hum.value + '%');
    if (uv && uv.value != null) parts.push('UV ' + uv.value);
    if (t && t.place) parts.push(t.place);
    $('weather-extra').textContent = parts.join(' · ');

    // Header shows the concise DAILY summary; the full paragraph is in the popup.
    flwData = flw;
    fndData = fnd;
    todaySummary = (fnd && fnd.weatherForecast && fnd.weatherForecast[0] && fnd.weatherForecast[0].forecastWeather)
      ? fnd.weatherForecast[0].forecastWeather : '';
    if (real.warningMessage) {
      $('weather-desc').textContent = '⚠️ ' + real.warningMessage;
    } else {
      $('weather-desc').textContent = todaySummary || (flw && flw.forecastDesc) || '香港天文台';
    }

    renderForecast(fnd);
    renderCalendar();   // so the calendar shows the new forecast icons
  });
}

/* ============================================================
   3. BUS ARRIVALS
   ============================================================ */
function isCitybus(op) {
  var o = String(op || 'kmb').toLowerCase();
  return o === 'ctb' || o === 'citybus' || o === 'nwfb';
}

/* Build the ETA request URL for one stop + one route. */
function etaUrl(stop, routeCfg) {
  if (isCitybus(stop.operator)) {
    var company = stop.company || 'CTB';
    return 'https://rt.data.gov.hk/v2/transport/citybus/eta/' +
      encodeURIComponent(company) + '/' + encodeURIComponent(stop.stopId) + '/' + encodeURIComponent(routeCfg.route);
  }
  // KMB / LWB share the same endpoint; service type is normally "1".
  var svc = routeCfg.serviceType || '1';
  return 'https://data.etabus.gov.hk/v1/transport/kmb/eta/' +
    encodeURIComponent(stop.stopId) + '/' + encodeURIComponent(routeCfg.route) + '/' + encodeURIComponent(svc);
}

function minutesUntil(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - Date.now()) / 60000);
}

function chipFromItem(it) {
  var chip = el('div', 'chip');
  var mins = minutesUntil(it.eta);
  if (mins == null) {
    chip.classList.add('none');
    chip.appendChild(el('div', 'chip-min', '—'));
    var note0 = it.rmk_tc || it.rmk_en || '';
    if (note0) chip.appendChild(el('div', 'chip-note', note0));
    return chip;
  }
  chip.appendChild(el('div', 'chip-min', mins <= 0 ? '即將' : mins + '分'));
  var d = new Date(it.eta);
  chip.appendChild(el('div', 'chip-time', pad2(d.getHours()) + ':' + pad2(d.getMinutes())));
  var note = it.rmk_tc || '';
  if (note && note.indexOf('最後') >= 0) chip.appendChild(el('div', 'chip-note', '最後'));
  return chip;
}

/* Create the empty DOM skeleton once. */
function buildBusSkeleton() {
  var wrap = $('bus-list');
  wrap.innerHTML = '';
  if (!CFG.busStops.length) {
    wrap.appendChild(el('div', 'cal-more', '請在 config.js 加入巴士站及路線。'));
    return;
  }
  CFG.busStops.forEach(function (stop, si) {
    var card = el('div', 'stop-card');

    var head = el('div', 'stop-head');
    head.appendChild(el('span', 'stop-name', stop.name || stop.stopId));
    head.appendChild(el('span', 'op-tag', (stop.operator || 'kmb').toUpperCase()));
    card.appendChild(head);

    (stop.routes || []).forEach(function (r, ri) {
      var row = el('div', 'route-row');
      row.id = 'route-' + si + '-' + ri;

      var label = el('div', 'route-label');
      label.appendChild(el('span', 'route-no', r.label || r.route));
      label.appendChild(el('span', 'route-dest', r.dest || ''));
      row.appendChild(label);

      var chips = el('div', 'chips');
      var loading = el('div', 'chip loading');
      loading.appendChild(el('div', 'chip-min', '…'));
      chips.appendChild(loading);
      row.appendChild(chips);

      card.appendChild(row);
    });

    wrap.appendChild(card);
  });
}

function renderRoute(si, ri, json) {
  var row = $('route-' + si + '-' + ri);
  if (!row) return;
  var chips = row.querySelector('.chips');
  chips.innerHTML = '';

  var data = (json && json.data) ? json.data : [];
  if (!data.length) {
    var none = el('div', 'chip none');
    none.appendChild(el('div', 'chip-min', '暫無班次'));
    chips.appendChild(none);
    return;
  }

  var destEl = row.querySelector('.route-dest');
  if (destEl && !destEl.textContent) {
    destEl.textContent = data[0].dest_tc || data[0].dest_en || '';
  }

  data.slice(0, 3).forEach(function (it) { chips.appendChild(chipFromItem(it)); });
}

function renderRouteError(si, ri) {
  var row = $('route-' + si + '-' + ri);
  if (!row) return;
  var chips = row.querySelector('.chips');
  chips.innerHTML = '';
  var e = el('div', 'chip err');
  e.appendChild(el('div', 'chip-min', '載入失敗'));
  chips.appendChild(e);
}

function loadBus() {
  if (!CFG.busStops.length) return Promise.resolve();
  setStatus('巴士更新中…');
  var tasks = [];
  CFG.busStops.forEach(function (stop, si) {
    (stop.routes || []).forEach(function (r, ri) {
      tasks.push(
        fetchJson(etaUrl(stop, r), 12000)
          .then(function (json) { renderRoute(si, ri, json); })
          .catch(function () { renderRouteError(si, ri); })
      );
    });
  });
  return Promise.all(tasks).then(function () {
    setStatus('巴士 ' + nowHM() + ' 更新');
  });
}

/* ============================================================
   4. CALENDAR + ROSTER + EVENTS
   ============================================================ */
var EVENTS_KEY = 'homeDashboard.events.v1';
var calCursor = new Date();
calCursor.setDate(1);

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveEvents(obj) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(obj)); }
  catch (e) { /* storage full / private mode */ }
  syncPush('events', obj);
}

/* ---- parrot weight: one value per day, keyed by YYYY-MM-DD (grams) ---- */
var WEIGHTS_KEY = 'homeDashboard.weights.v1';
function loadWeights() {
  try { return JSON.parse(localStorage.getItem(WEIGHTS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveWeights(obj) {
  try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(obj)); }
  catch (e) { /* storage full / private mode */ }
  syncPush('weights', obj);
}
function hasWeight(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

/* ============================================================
   3b. OPTIONAL SHARED-STATE SYNC (Raspberry Pi server)
   ------------------------------------------------------------
   When this page is served by server/server.py (e.g. through Tailscale Funnel)
   a /api/state endpoint exists, and every device shares one dataset. On GitHub
   Pages that endpoint 404s, so we quietly stay localStorage-only.

   localStorage stays the instant, synchronous store; the server is synced in
   the background (local-first), so the dashboard keeps working offline.
   ============================================================ */
var SYNC_ON = false;
var SYNC_REV = 0;
var SYNC_APPLYING = false;

function syncApplyState(state) {
  SYNC_APPLYING = true;
  try {
    if (state.config) localStorage.setItem('homeDashboard.config.v1', JSON.stringify(state.config));
    if (state.events) localStorage.setItem(EVENTS_KEY, JSON.stringify(state.events));
    if (state.weights) localStorage.setItem(WEIGHTS_KEY, JSON.stringify(state.weights));
  } catch (e) { /* private mode */ }
  SYNC_REV = state.rev || 0;
  SYNC_APPLYING = false;
}

/* Re-read the freshly applied config and rebuild the screen. */
function syncRerender() {
  CFG = (window.DashboardConfig && window.DashboardConfig.load) ? window.DashboardConfig.load() : CFG;
  normalizeConfig();
  applyLayout();
  renderCalendar();
  buildBusSkeleton();
  loadBus();
}

/* Pull the server state; re-render if it changed. */
function syncPull(force) {
  if (!SYNC_ON) return;
  fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (state) {
      if (!state || typeof state.rev === 'undefined') return;
      if (!force && state.rev === SYNC_REV) return;
      syncApplyState(state);
      syncRerender();
    })
    .catch(function () { /* offline: keep using localStorage */ });
}

function syncPush(collection, value) {
  if (!SYNC_ON || SYNC_APPLYING) return;
  fetch('/api/' + collection, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) { if (j && typeof j.rev !== 'undefined') SYNC_REV = j.rev; })
    .catch(function () { /* offline: the local copy is still saved */ });
}

function syncLocalHasData() {
  try {
    if (localStorage.getItem('homeDashboard.config.v1')) return true;
    if (localStorage.getItem(EVENTS_KEY)) return true;
    if (localStorage.getItem(WEIGHTS_KEY)) return true;
  } catch (e) {}
  return false;
}

function detectSync() {
  fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (state) {
      SYNC_ON = true;
      var hasEvents = state.events && Object.keys(state.events).length;
      var hasWeights = state.weights && Object.keys(state.weights).length;
      var empty = !state || (!state.config && !hasEvents && !hasWeights);
      if (empty && syncLocalHasData()) {
        // First device to reach a fresh server seeds it from its local data.
        SYNC_REV = state.rev || 0;
        syncPush('config', CFG);
        syncPush('events', loadEvents());
        syncPush('weights', loadWeights());
      } else if (state.rev !== SYNC_REV) {
        syncApplyState(state);
        syncRerender();
      } else {
        SYNC_REV = state.rev || 0;
      }
      setInterval(function () { if (!isInteracting()) syncPull(false); }, 15000);
    })
    .catch(function () { SYNC_ON = false; });
}

/* Settings.js (loaded before this file) pushes config changes through here. */
window.Sync = {
  pushConfig: function (cfg) { syncPush('config', cfg); },
  pull: function () { syncPull(true); },
  status: function () { return { on: SYNC_ON, rev: SYNC_REV }; }
};

/* 4-day roster: compute the shift letter for a given date. */
function rosterLetter(date) {
  var anchor = parseYmd(CFG.roster.anchorDate);
  if (!anchor) return '';
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var diff = Math.round((d.getTime() - anchor.getTime()) / 86400000);
  var cyc = CFG.roster.cycle;
  var idx = ((diff % cyc.length) + cyc.length) % cyc.length;
  return cyc[idx];
}

function badgeFor(letter) {
  var b = el('span', 'badge ' + letter, CFG.roster.labels[letter] || letter);
  return b;
}

function renderLegend() {
  var box = $('roster-legend');
  if (!box) return;
  box.innerHTML = '';
  CFG.roster.cycle.forEach(function (letter) {
    if (!letter) return;
    box.appendChild(el('span', 'badge ' + letter, CFG.roster.labels[letter] || letter));
  });
  box.appendChild(el('span', 'hint', '點一日可新增活動'));
}

function renderCalendar() {
  var y = calCursor.getFullYear(), m = calCursor.getMonth();
  $('cal-title').textContent = y + '年' + (m + 1) + '月';
  renderLegend();

  var wd = $('cal-weekdays');
  wd.innerHTML = '';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(function (t, i) {
    var s = el('div', i === 0 ? 'sun' : '', t);
    wd.appendChild(s);
  });

  var grid = $('cal-grid');
  grid.innerHTML = '';

  var firstDow = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var todayKey = ymd(new Date());
  var events = loadEvents();
  var weights = loadWeights();

  var total = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  for (var i = 0; i < total; i++) {
    var dayNum = i - firstDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      grid.appendChild(el('div', 'cal-cell empty'));
      continue;
    }
    var date = new Date(y, m, dayNum);
    var key = ymd(date);

    var cell = el('div', 'cal-cell');
    if (key === todayKey) cell.classList.add('today');
    cell.setAttribute('data-date', key);
    // No per-cell listener: day taps are handled by ONE delegated listener on
    // #cal-grid (see bindCalendarTaps). A per-cell listener is destroyed every
    // time renderCalendar() rebuilds the grid, which can swallow a tap whose
    // touchend lands on the replacement cell.

    var top = el('div', 'cal-top');
    top.appendChild(el('span', 'cal-day', String(dayNum)));
    var right = el('div', 'cal-top-right');
    var wx = forecastByDate[key];
    if (wx) {
      var wxEl = el('span', 'cal-wx', iconEmoji(wx.icon));
      wxEl.title = (wx.max != null ? wx.max : '-') + '° / ' + (wx.min != null ? wx.min : '-') + '°';
      right.appendChild(wxEl);
    }
    var letter = rosterLetter(date);
    if (letter) right.appendChild(badgeFor(letter));
    top.appendChild(right);
    cell.appendChild(top);

    if (hasWeight(weights, key)) {
      cell.appendChild(el('div', 'cal-weight', weights[key] + 'g'));
    }

    var evs = events[key] || [];
    if (evs.length) {
      var evBox = el('div', 'cal-events');
      evs.slice(0, 2).forEach(function (t) { evBox.appendChild(el('div', 'cal-event', '• ' + t)); });
      if (evs.length > 2) evBox.appendChild(el('div', 'cal-more', '+' + (evs.length - 2) + ' 項'));
      cell.appendChild(evBox);
    }

    grid.appendChild(cell);
  }
}

/* ------------------------- event modal ------------------------- */
var modalDateKey = null;
/* Timestamp of the last openModal(). A tap that opens the popup also emits a
   synthetic `click` a moment later; without this, that click would be read as
   a tap *outside* the popup and close it again (the "flash" bug). */
var modalOpenedAt = 0;

/* True while the event popup is on screen. Calendar day taps are ignored in
   this state so a stray tap on a day behind the popup cannot switch its date. */
function modalIsOpen() {
  var m = $('modal');
  return !!m && !m.classList.contains('hidden');
}

function openModal(key) {
  if (!key) return;
  // Safety net: never switch the date of an already-open popup. The capture
  // guard in bindUi() should prevent this ever being reached, but some
  // browsers dispatch a stray click that slips past it.
  if (modalIsOpen() && modalDateKey && modalDateKey !== key) return;
  modalDateKey = key;
  var d = parseYmd(key);
  $('modal-date').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    WEEKDAYS[d.getDay()] + '　' + (CFG.roster.labels[rosterLetter(d)] || rosterLetter(d) || '');
  renderModalEvents();
  renderModalWeight();
  $('modal').classList.remove('hidden');
  $('modal-input').value = '';
  modalOpenedAt = Date.now();
  mark('openModal ' + key + ' -> visible=' + !$('modal').classList.contains('hidden'));
}

function closeModal() {
  $('modal').classList.add('hidden');
  modalDateKey = null;
  renderCalendar();
}

function renderModalEvents() {
  var box = $('modal-events');
  box.innerHTML = '';
  var events = loadEvents();
  var list = events[modalDateKey] || [];
  if (!list.length) {
    box.appendChild(el('div', 'cal-more', '（暫無活動）'));
    return;
  }
  list.forEach(function (text, idx) {
    var row = el('div', 'modal-event');
    row.appendChild(el('span', '', text));
    var del = el('button', '', '✕');
    del.addEventListener('click', function () {
      var ev = loadEvents();
      ev[modalDateKey].splice(idx, 1);
      if (!ev[modalDateKey].length) delete ev[modalDateKey];
      saveEvents(ev);
      renderModalEvents();
    });
    row.appendChild(del);
    box.appendChild(row);
  });
}

function addEvent() {
  var text = $('modal-input').value.trim();
  if (!text || !modalDateKey) return;
  var ev = loadEvents();
  if (!ev[modalDateKey]) ev[modalDateKey] = [];
  ev[modalDateKey].push(text);
  saveEvents(ev);
  $('modal-input').value = '';
  renderModalEvents();
}

/* ------------------------- modal: parrot weight ------------------------- */
function renderModalWeight() {
  var input = $('weight-input');
  var status = $('weight-status');
  if (!input || !status) return;
  var weights = loadWeights();
  var has = hasWeight(weights, modalDateKey);
  input.value = has ? String(weights[modalDateKey]) : '';
  status.innerHTML = '';
  if (has) {
    status.appendChild(el('span', 'mw-cur', '已記錄：' + weights[modalDateKey] + ' g'));
    var del = el('button', 'mw-del', '刪除');
    onTap(del, deleteWeight);
    status.appendChild(del);
  } else {
    status.appendChild(el('span', 'mw-cur muted', '此日未有紀錄'));
  }
}

function saveWeight() {
  if (!modalDateKey) return;
  var raw = $('weight-input').value.trim();
  if (!raw) return;
  var v = Number(raw);
  if (!isFinite(v) || v <= 0) { alert('請輸入有效嘅體重數字（克）。'); return; }
  v = Math.round(v * 10) / 10;
  var weights = loadWeights();
  if (hasWeight(weights, modalDateKey) && weights[modalDateKey] !== v) {
    if (!confirm('此日已記錄 ' + weights[modalDateKey] + ' g，要覆蓋成 ' + v + ' g 嗎？')) return;
  }
  weights[modalDateKey] = v;
  saveWeights(weights);
  renderModalWeight();
  renderCalendar();
}

function deleteWeight() {
  if (!modalDateKey) return;
  var weights = loadWeights();
  if (!hasWeight(weights, modalDateKey)) return;
  if (!confirm('確定刪除 ' + modalDateKey + ' 嘅體重紀錄？')) return;
  delete weights[modalDateKey];
  saveWeights(weights);
  renderModalWeight();
  renderCalendar();
}

/* ============================================================
   4b. PARROT WEIGHT CHART (native SVG, no dependencies)
   ============================================================ */
var SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  var e = document.createElementNS(SVGNS, tag);
  for (var k in attrs) {
    if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
  }
  return e;
}

/* Chart range state. wcDays = preset window (0 = all); wcFrom/wcTo = custom
   YYYY-MM-DD range (null when a preset is active). */
var wcDays = 30;
var wcFrom = null;
var wcTo = null;

function buildWcRange() {
  var box = $('wc-range');
  if (!box) return;
  box.innerHTML = '';
  var presets = [
    { d: 7, l: '7日' }, { d: 14, l: '14日' }, { d: 30, l: '30日' },
    { d: 90, l: '90日' }, { d: 0, l: '全部' }
  ];
  presets.forEach(function (p) {
    var active = (wcFrom === null && wcDays === p.d);
    var b = el('button', 'wc-btn' + (active ? ' active' : ''), p.l);
    onTap(b, function () {
      wcDays = p.d; wcFrom = null; wcTo = null;
      buildWcRange(); renderWeightChart();
    });
    box.appendChild(b);
  });

  var from = document.createElement('input');
  from.type = 'date'; from.className = 'wc-date'; from.value = wcFrom || '';
  var to = document.createElement('input');
  to.type = 'date'; to.className = 'wc-date'; to.value = wcTo || '';
  var apply = el('button', 'wc-btn' + (wcFrom !== null ? ' active' : ''), '自訂');
  onTap(apply, function () {
    if (!from.value || !to.value) { alert('請選擇起始同結束日期。'); return; }
    if (from.value > to.value) { alert('起始日期唔可以遲過結束日期。'); return; }
    wcFrom = from.value; wcTo = to.value;
    buildWcRange(); renderWeightChart();
  });
  box.appendChild(from);
  box.appendChild(el('span', 'wc-axis', '至'));
  box.appendChild(to);
  box.appendChild(apply);
}

function openWeightChart() {
  wcDays = 30; wcFrom = null; wcTo = null;
  buildWcRange();
  renderWeightChart();
  $('weight-chart-modal').classList.remove('hidden');
  mark('openWeightChart');
}
function closeWeightChart() { $('weight-chart-modal').classList.add('hidden'); }

function renderWeightChart() {
  var host = $('weight-chart');
  var meta = $('wc-meta');
  if (!host) return;
  host.innerHTML = '';
  if (meta) meta.textContent = '';

  // Collect all recorded points, sorted by date.
  var weights = loadWeights();
  var all = [];
  for (var k in weights) {
    if (!Object.prototype.hasOwnProperty.call(weights, k)) continue;
    var d = parseYmd(k);
    var v = Number(weights[k]);
    if (!d || !isFinite(v)) continue;
    all.push({ key: k, date: d, v: v });
  }
  all.sort(function (a, b) { return a.date - b.date; });

  // Work out the date domain.
  var t0 = null, t1 = null, label = '';
  if (wcFrom && wcTo) {
    var fd = parseYmd(wcFrom), td = parseYmd(wcTo);
    if (fd && td && fd <= td) { t0 = fd; t1 = td; label = wcFrom + ' 至 ' + wcTo; }
  }
  if (t0 === null) {
    if (wcDays > 0) {
      t1 = new Date(); t1.setHours(0, 0, 0, 0);
      t0 = new Date(t1.getTime() - (wcDays - 1) * 86400000);
      label = '最近 ' + wcDays + ' 日';
    } else if (all.length) {
      t0 = all[0].date; t1 = all[all.length - 1].date; label = '全部紀錄';
    }
  }
  if (t0 === null) {
    host.appendChild(el('div', 'wc-empty', '未有體重紀錄。點日曆一日就可以開始記錄。'));
    return;
  }
  if (t1.getTime() === t0.getTime()) t1 = new Date(t0.getTime() + 86400000);

  // Points inside the domain. Missing days are simply absent — the line
  // connects straight to the next recorded point.
  var pts = all.filter(function (p) { return p.date >= t0 && p.date <= t1; });
  if (!pts.length) {
    host.appendChild(el('div', 'wc-empty', '此範圍內未有紀錄。'));
    if (meta) meta.textContent = label;
    return;
  }

  // Y domain (with a little padding).
  var vals = pts.map(function (p) { return p.v; });
  var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
  var pad = Math.max(1, (vmax - vmin) * 0.15);
  var y0 = vmin - pad, y1 = vmax + pad;
  if (y1 - y0 < 2) { y0 = vmin - 1; y1 = vmax + 1; }

  var W = 480, H = 260, padL = 48, padR = 16, padT = 18, padB = 34;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var span = t1.getTime() - t0.getTime();
  function X(d) { return padL + (d.getTime() - t0.getTime()) / span * plotW; }
  function Y(v) { return padT + (1 - (v - y0) / (y1 - y0)) * plotH; }

  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' });

  // Horizontal gridlines + Y labels.
  var steps = 4;
  for (var i = 0; i <= steps; i++) {
    var val = y0 + (y1 - y0) * i / steps;
    var yy = Y(val);
    svg.appendChild(svgEl('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, 'class': 'wc-grid' }));
    var yl = svgEl('text', { x: padL - 6, y: yy + 4, 'class': 'wc-axis', 'text-anchor': 'end' });
    yl.textContent = String(Math.round(val));
    svg.appendChild(yl);
  }

  // X labels (about 5, spread across the domain).
  var xN = 5;
  for (var j = 0; j < xN; j++) {
    var tt = new Date(t0.getTime() + span * j / (xN - 1));
    var xl = svgEl('text', { x: X(tt), y: H - padB + 18, 'class': 'wc-axis', 'text-anchor': 'middle' });
    xl.textContent = (tt.getMonth() + 1) + '/' + tt.getDate();
    svg.appendChild(xl);
  }

  // The line: connects recorded points directly (gaps are spanned).
  var coords = pts.map(function (p) { return X(p.date) + ',' + Y(p.v); }).join(' ');
  svg.appendChild(svgEl('polyline', { points: coords, 'class': 'wc-line' }));

  // Dots, with value labels when there aren't too many.
  var showVals = pts.length <= 12;
  pts.forEach(function (p) {
    var cx = X(p.date), cy = Y(p.v);
    svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: 4, 'class': 'wc-dot' }));
    if (showVals) {
      var vl = svgEl('text', { x: cx, y: cy - 8, 'class': 'wc-val', 'text-anchor': 'middle' });
      vl.textContent = String(p.v);
      svg.appendChild(vl);
    }
  });

  host.appendChild(svg);

  if (meta) {
    var latest = pts[pts.length - 1], first = pts[0];
    var diff = Math.round((latest.v - first.v) * 10) / 10;
    var sum = 0;
    for (var s = 0; s < vals.length; s++) sum += vals[s];
    var avg = Math.round(sum / vals.length * 10) / 10;
    meta.textContent = label + '：最新 ' + latest.v + ' g（' + (diff > 0 ? '+' : '') + diff +
      ' g）· 平均 ' + avg + ' g · 範圍 ' + vmin + '–' + vmax + ' g · ' + pts.length + ' 次';
  }
}

/* ============================================================
   5. WIRE UP + REFRESH LOOPS
   ============================================================ */
/* Called at the start of each tap handler so the debug log shows whether
   OUR code ran, separately from the raw browser events. */
function mark(what) { if (TAP_DEBUG) tapLog('   -> HANDLER: ' + what); }

/* Find the calendar day cell under a tap, and read its date.
   Reads the date at event time from the live DOM, so it never goes stale. */
function cellDateFromTarget(node) {
  while (node && node !== document) {
    if (node.classList && node.classList.contains('cal-cell') &&
        !node.classList.contains('empty') && node.getAttribute) {
      var d = node.getAttribute('data-date');
      if (d) return d;
    }
    node = node.parentNode;
  }
  return null;
}

/* ONE tap handler for the whole grid, delegated on #cal-grid.
   #cal-grid itself survives renderCalendar() (only its children are rebuilt),
   so this listener is never lost mid-tap the way a per-cell listener was. */
function bindCalendarTaps(grid) {
  if (!grid) return;
  var moved = false, sx = 0, sy = 0, handled = false;

  grid.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length === 1) {
      moved = false; handled = false;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }
  }, { passive: true });

  grid.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length === 1 &&
        (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10)) moved = true;
  }, { passive: true });

  grid.addEventListener('touchend', function (e) {
    if (moved) return;
    var touch = (e.changedTouches && e.changedTouches[0]) || null;
    var target = (touch && document.elementFromPoint)
      ? (document.elementFromPoint(touch.clientX, touch.clientY) || e.target)
      : e.target;
    var key = cellDateFromTarget(target);
    if (!key) return;               // tapped an empty cell / the gap between cells
    handled = true;                 // stop the synthetic click that follows
    if (modalIsOpen()) { mark('grid touchend while modal open -> closeModal'); closeModal(); return; }
    mark('grid touchend ' + key);
    openModal(key);
  });

  grid.addEventListener('click', function (e) {
    if (handled) { handled = false; return; }   // already handled by touchend
    var key = cellDateFromTarget(e.target);
    if (!key) return;
    if (modalIsOpen()) { mark('grid click while modal open -> closeModal'); closeModal(); return; }
    mark('grid click ' + key);
    openModal(key);
  });
}

function bindUi() {
  onTap($('prev-month'), function () {
    calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar();
  });
  onTap($('next-month'), function () {
    calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar();
  });
  onTap($('today-btn'), function () {
    calCursor = new Date(); calCursor.setDate(1); renderCalendar();
  });

  // Day taps: one delegated touch-aware handler on the whole grid. Tapping the
  // number, badge, weather icon or an event text all resolve to the same cell.
  bindCalendarTaps($('cal-grid'));

  // HARD GUARD: while the event popup is open, any tap that is NOT on the
  // popup's own controls must close the popup and must NOT open a day.
  //
  // Note the target can be #modal (the overlay) rather than a .cal-* element,
  // yet the day cell handler still fires on some browsers. So we block by
  // EXCLUSION: allow only the popup's own interactive parts, block the rest.
  function isInsideModalCard(node) {
    while (node && node !== document) {
      if (node.className && String(node.className).indexOf('modal-card') >= 0) return true;
      node = node.parentNode;
    }
    return false;
  }
  function guardCalendarWhileModalOpen(e) {
    if (!modalIsOpen()) return;
    if (isInsideModalCard(e.target)) return;   // let the popup's own controls work
    // Ignore the synthetic click/touchend that belongs to the SAME tap which
    // just opened the popup; otherwise the popup flashes open then closed.
    if (Date.now() - modalOpenedAt < 400) return;
    // Block the tap from reaching any day cell...
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    // ...and close the popup.
    if (e.type === 'touchend' || e.type === 'click') {
      mark('tap outside popup while open -> closeModal');
      closeModal();
    }
  }
  ['touchstart', 'touchend', 'click'].forEach(function (ev) {
    document.addEventListener(ev, guardCalendarWhileModalOpen, true);
  });

  onTap($('modal-add-btn'), addEvent);
  $('modal-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addEvent();
  });
  onTap($('modal-close'), closeModal);
  // (Tapping the overlay to close is handled by guardCalendarWhileModalOpen,
  //  which stopPropagation()s before this element's own handlers could run.)

  // parrot weight: save / delete inside the event modal
  onTap($('weight-save-btn'), saveWeight);
  $('weight-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveWeight();
  });

  // weight chart modal
  onTap($('weight-chart-btn'), openWeightChart);
  onTap($('wc-close'), closeWeightChart);
  onTap($('weight-chart-modal'), function (e) {
    if (e.target === $('weight-chart-modal')) closeWeightChart();
  });

  mark('bindUi done');

  onTap($('settings-btn'), function () {
    mark('settings-btn tapped, openSettings=' + (typeof window.openSettings));
    if (window.openSettings) window.openSettings();
  });

  // `loose`: the weather box is not in a scroll area, so accept a tap that
  // drifts a little — a normal quick tap should be enough to open the detail.
  onTap($('weather'), function (e) { mark('weather tapped'); openWeatherDetail(e); }, { loose: true });
  onTap($('wm-close'), closeWeatherDetail);
  onTap($('weather-modal'), function (e) {
    if (e.target === $('weather-modal')) closeWeatherDetail();
  });

  // remember recent interaction so auto-refresh pauses while you use the screen
  ['pointerdown', 'touchstart', 'keydown', 'input', 'focusin', 'wheel'].forEach(function (ev) {
    document.addEventListener(ev, markInteraction, true);
  });

  // refresh when the iPad wakes up
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tickClock(); renderCalendar(); loadBus(); }
  });
}

/* Called by the settings page after you press "儲存並套用". */
window.reloadDashboard = function () {
  CFG = (window.DashboardConfig && window.DashboardConfig.load) ? window.DashboardConfig.load() : CFG;
  normalizeConfig();
  applyLayout();
  renderCalendar();
  buildBusSkeleton();
  loadBus();
  loadWeather();
  scheduleRefresh();
};

/* ---- pause auto-refresh while the user is interacting ---- */
var lastInteraction = 0;
function markInteraction() { lastInteraction = Date.now(); }

/* Shows the running version and lets you confirm a fresh copy loaded.
   Visible in the ⚙️ settings footer. */
window.appVersion = function () { return APP_VERSION; };

function isInteracting() {
  var s = $('settings'), m = $('modal'), w = $('weather-modal'), c = $('weight-chart-modal');
  if (s && !s.classList.contains('hidden')) return true;   // settings open
  if (m && !m.classList.contains('hidden')) return true;   // adding an event
  if (w && !w.classList.contains('hidden')) return true;   // weather detail open
  if (c && !c.classList.contains('hidden')) return true;   // weight chart open
  var ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return true; // typing
  if (Date.now() - lastInteraction < 4000) return true;    // just touched the screen
  return false;
}

var refreshTimers = [];
function refreshSeconds() {
  var s = Number(CFG.refresh && CFG.refresh.seconds);
  return (s && s >= 5) ? s : 30;
}
function scheduleRefresh() {
  refreshTimers.forEach(function (t) { clearInterval(t); });
  refreshTimers = [];
  var busMs = refreshSeconds() * 1000;
  refreshTimers.push(setInterval(function () { if (!isInteracting()) loadBus(); }, busMs));
  refreshTimers.push(setInterval(function () { if (!isInteracting()) renderCalendar(); }, 60000));
  refreshTimers.push(setInterval(function () { if (!isInteracting()) loadWeather(); }, 600000));
}

function start() {
  bindUi();
  showVersion();
  initTapDebug();
  tickClock();
  renderCalendar();
  buildBusSkeleton();
  loadBus();
  loadWeather();
  scheduleRefresh();

  // If a Raspberry Pi server is serving this page, enable shared-state sync.
  detectSync();

  setInterval(tickClock, 1000);

  // First ever visit with no saved settings: use GPS to pick the weather district.
  var hasSaved = false;
  try { hasSaved = !!localStorage.getItem('homeDashboard.config.v1'); } catch (e) { hasSaved = true; }
  if (!hasSaved) detectAndApply();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
