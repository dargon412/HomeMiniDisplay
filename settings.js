/* ============================================================
   settings.js — 網頁設定頁 On-screen settings
   Edit your stops, routes, roster and weather by tapping.
   Changes are saved on this iPad (localStorage) and can be exported
   back to config.js for safe keeping.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'homeDashboard.config.v1';

  /* ----------------------------- helpers ----------------------------- */
  function $(id) { return document.getElementById(id); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function defaults() {
    var d = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : {};
    return clone({
      title: d.title || '家庭看板',
      weather: d.weather || { district: '', language: 'tc' },
      roster: d.roster || { anchorDate: '', cycle: ['M', 'N', 'L', 'L'], labels: { M: '早', N: '夜', L: '休' } },
      refresh: d.refresh || { seconds: 30 },
      layout: d.layout || { busWidth: 20, fonts: { clock: 1, bus: 1, cal: 1, titles: 1 }, weatherWidth: 30 },
      theme: d.theme || { holidayColor: '#ff5b5b' },
      busStops: d.busStops || []
    });
  }

  function load() {
    var base = defaults();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; }
    if (!saved) return base;

    var baseFonts = (base.layout && base.layout.fonts) || {};
    var savedFonts = (saved.layout && saved.layout.fonts) || {};
    var layout = Object.assign({}, base.layout, saved.layout || {});
    layout.fonts = Object.assign({}, baseFonts, savedFonts);

    return {
      title: saved.title || base.title,
      weather: Object.assign({}, base.weather, saved.weather || {}),
      roster: Object.assign({}, base.roster, saved.roster || {}),
      refresh: Object.assign({}, base.refresh, saved.refresh || {}),
      layout: layout,
      theme: Object.assign({}, base.theme, saved.theme || {}),
      busStops: Array.isArray(saved.busStops) ? saved.busStops : base.busStops
    };
  }

  function save(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); }
    catch (e) { alert('儲存失敗：' + e.message); }
    // If the Pi server is serving this page, share the change with other devices.
    if (window.Sync && window.Sync.pushConfig) window.Sync.pushConfig(cfg);
  }

  function reset() { localStorage.removeItem(KEY); }

  /* Expose to app.js */
  window.DashboardConfig = { load: load, save: save, reset: reset, defaults: defaults };

  /* ----------------------------- state ----------------------------- */
  var working = null;   // the config currently being edited

  /* ----------------------------- DOM builders ----------------------------- */
  function makeSection(title) {
    var el = document.createElement('div');
    el.className = 'settings-section';
    var h = document.createElement('h3');
    h.textContent = title;
    el.appendChild(h);
    var body = document.createElement('div');
    el.appendChild(body);
    return { el: el, body: body };
  }

  function makeField(labelText, input, hint) {
    var w = document.createElement('label');
    w.className = 'sf';
    var l = document.createElement('span');
    l.className = 'sf-label';
    l.textContent = labelText;
    w.appendChild(l);
    w.appendChild(input);
    if (hint) {
      var h = document.createElement('span');
      h.className = 'sf-hint';
      h.textContent = hint;
      w.appendChild(h);
    }
    return w;
  }

  function textInput(value, onInput, placeholder, type) {
    var i = document.createElement('input');
    i.className = 'inp';
    i.type = type || 'text';
    i.value = (value == null) ? '' : value;
    if (placeholder) i.placeholder = placeholder;
    i.addEventListener('input', function () { onInput(i.value); });
    return i;
  }

  function selectInput(value, options, onChange) {
    var s = document.createElement('select');
    s.className = 'inp';
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      s.appendChild(opt);
    });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  /* Touch-aware tap binding. A plain `click` is suppressed by the browser
     whenever a tap drifts (which is normal on a tablet, especially inside a
     scroll area), so buttons appear dead. This mirrors app.js's onTap: fire
     on a clean touchend, and fall back to click for mouse/keyboard. */
  function tap(node, handler, opts) {
    if (!node) return;
    var tol = (opts && opts.loose) ? 40 : 12;
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
      e.preventDefault();          // stop the synthetic click / focus steal
      handled = true;
      handler(e);
    });

    node.addEventListener('click', function (e) {
      if (handled) { handled = false; return; }
      handler(e);
    });
  }

  function button(text, cls, onClick) {
    var b = document.createElement('button');
    b.className = cls || 'ghost';
    b.textContent = text;
    tap(b, onClick);
    return b;
  }

  /* A labelled range slider with a live value read-out. `onInput(value)` is
     called as the user drags (for live preview). */
  function rangeField(label, hint, opt) {
    var val = document.createElement('span');
    val.className = 'range-val';
    val.textContent = opt.format(opt.value);

    var input = document.createElement('input');
    input.type = 'range';
    input.className = 'inp range';
    input.min = String(opt.min);
    input.max = String(opt.max);
    input.step = String(opt.step || 1);
    input.value = String(opt.value);
    input.addEventListener('input', function () {
      var v = Number(input.value);
      val.textContent = opt.format(v);
      opt.onInput(v);
    });

    var wrap = document.createElement('div');
    wrap.className = 'range-wrap';
    wrap.appendChild(input);
    wrap.appendChild(val);
    return makeField(label, wrap, hint);
  }

  /* ============================================================
     GENERAL
     ============================================================ */
  /* One font-size slider. `group` is one of clock/bus/cal/titles. */
  function fontSlider(group, label) {
    var fonts = (working.layout && working.layout.fonts) || {};
    var cur = Number(fonts[group]);
    if (!(cur >= 0.6 && cur <= 2)) cur = 1;
    return rangeField(label + ' 字體大小', '100% = 原本大小', {
      min: 60, max: 200, step: 5, value: Math.round(cur * 100),
      format: function (v) { return v + '%'; },
      onInput: function (v) {
        working.layout = working.layout || {};
        working.layout.fonts = working.layout.fonts || {};
        working.layout.fonts[group] = v / 100;
        document.documentElement.style.setProperty('--fs-' + group, String(v / 100));
      }
    });
  }

  function sectionGeneral() {
    var s = makeSection('基本 General');

    var dist = document.createElement('select');
    dist.className = 'inp';
    dist.addEventListener('change', function () { working.weather.district = dist.value; });
    s.body.appendChild(makeField('天氣地區 Weather district', dist, '用於顯示氣溫'));

    var locBtn = button('📍 使用我的位置 Use my GPS location', 'ghost', function () {
      if (!window.detectMyLocation) { alert('定位功能未載入'); return; }
      locBtn.textContent = '定位中… Detecting…';
      window.detectMyLocation(function (st, err) {
        locBtn.textContent = '📍 使用我的位置 Use my GPS location';
        if (!st) { alert('定位失敗：' + (err || '請允許位置權限')); return; }
        working.weather.district = st.name;
        var found = false;
        for (var i = 0; i < dist.options.length; i++) {
          if (dist.options[i].value === st.name) { found = true; break; }
        }
        if (!found) {
          var o = document.createElement('option');
          o.value = st.name; o.textContent = st.name; dist.appendChild(o);
        }
        dist.value = st.name;
      });
    });
    s.body.appendChild(locBtn);

    var secs = (working.refresh && working.refresh.seconds) || 30;
    var refreshSel = selectInput(String(secs), [
      { value: '10', label: '每 10 秒' },
      { value: '15', label: '每 15 秒' },
      { value: '30', label: '每 30 秒' },
      { value: '60', label: '每 1 分鐘' },
      { value: '120', label: '每 2 分鐘' },
      { value: '300', label: '每 5 分鐘' },
      { value: '600', label: '每 10 分鐘' }
    ], function (v) {
      working.refresh = working.refresh || {};
      working.refresh.seconds = Number(v);
    });
    s.body.appendChild(makeField('自動更新間隔 Auto-refresh interval', refreshSel, '你操作畫面時會自動暫停更新'));

    // Bus panel width (landscape width / portrait height) — live preview.
    var busPct = (working.layout && working.layout.busWidth) || 20;
    s.body.appendChild(rangeField('巴士面板大小 Bus panel size',
      '打橫 = 闊度，打直 = 高度；其餘空間就係月曆（建議 15–30%）', {
      min: 12, max: 45, step: 1, value: busPct,
      format: function (v) { return v + '%'; },
      onInput: function (v) {
        working.layout = working.layout || {};
        working.layout.busWidth = v;
        // Live preview: same mapping app.js uses (width in landscape, height in portrait).
        var root = document.documentElement.style;
        root.setProperty('--bus-w', v + '%');
        var bh = Math.round(v * 1.6);
        if (bh < 22) bh = 22;
        if (bh > 55) bh = 55;
        root.setProperty('--bus-h', bh + '%');
      }
    }));

    // Current-weather box width (portrait-friendly) — live preview.
    var wwPct = (working.layout && working.layout.weatherWidth) || 30;
    s.body.appendChild(rangeField('即日天氣框寬度 Weather box width',
      '打直時特別有用（建議 30–100%）', {
      min: 15, max: 100, step: 5, value: wwPct,
      format: function (v) { return v + '%'; },
      onInput: function (v) {
        working.layout = working.layout || {};
        working.layout.weatherWidth = v;
        document.documentElement.style.setProperty('--weather-w', v + '%');
      }
    }));

    // ---- Font sizes (live preview via the --fs-* CSS vars) ----
    s.body.appendChild(fontSlider('clock', '時鐘 / 天氣 Clock & weather'));
    s.body.appendChild(fontSlider('bus', '巴士到站 Bus arrivals'));
    s.body.appendChild(fontSlider('cal', '月曆 Calendar'));
    s.body.appendChild(fontSlider('titles', '標題 / 圖例 Titles & legend'));
    var fontHint = document.createElement('p');
    fontHint.className = 'sf-hint';
    fontHint.style.marginTop = '2px';
    fontHint.textContent = '100% = 原本大小。每組獨立調整；儲存後會跟備份一齊匯出。';
    s.body.appendChild(fontHint);

    // fill options (async)
    dist.innerHTML = '<option value="">香港天文台（預設）</option>';
    dist.value = working.weather.district || '';
    fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?lang=tc&dataType=rhrread', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var places = ((j.temperature && j.temperature.data) || []).map(function (d) { return d.place; }).filter(Boolean);
        if (working.weather.district && places.indexOf(working.weather.district) < 0) places.unshift(working.weather.district);
        places.forEach(function (p) {
          var o = document.createElement('option'); o.value = p; o.textContent = p; dist.appendChild(o);
        });
        dist.value = working.weather.district || '';
      })
      .catch(function () { /* offline: keep default option */ });

    return s.el;
  }

  /* ============================================================
     ROSTER
     ============================================================ */
  function sectionRoster() {
    var s = makeSection('太太更表 Roster');

    s.body.appendChild(makeField('早更基準日 Anchor date (M day)',
      textInput(working.roster.anchorDate, function (v) { working.roster.anchorDate = v; }, '', 'date'),
      '揀一日係「早更 M」，之後每 4 日循環'));

    s.body.appendChild(makeField('循環週期 Cycle (逗號分隔)',
      textInput(working.roster.cycle.join(','), function (v) {
        var arr = v.split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean);
        if (arr.length) working.roster.cycle = arr;
      }, 'M,N,L,L'),
      '預設 M,N,L,L'));

    var labRow = document.createElement('div');
    labRow.className = 'sf-row';
    ['M', 'N', 'L'].forEach(function (k) {
      var inp = textInput(working.roster.labels[k], function (v) { working.roster.labels[k] = v; }, k);
      inp.style.width = '70px';
      labRow.appendChild(makeField('代號 ' + k + ' 顯示為', inp));
    });
    s.body.appendChild(labRow);

    return s.el;
  }

  /* ============================================================
     BUS STOPS
     ============================================================ */
  function sectionStops() {
    var s = makeSection('巴士站 Bus stops');

    var list = document.createElement('div');
    list.className = 'stop-edit-list';
    list.id = 'stop-edit-list';
    s.body.appendChild(list);
    fillStopList(list);

    s.body.appendChild(button('＋ 加巴士站 Add stop', 'primary', function () {
      working.busStops.push({ name: '', operator: 'kmb', stopId: '', routes: [{ route: '', serviceType: '1' }] });
      refreshStopList();
    }));

    s.body.appendChild(searchHelper());
    return s.el;
  }

  function stopEditor(stop, si) {
    var card = document.createElement('div');
    card.className = 'stop-edit';

    var head = document.createElement('div');
    head.className = 'stop-edit-head';
    head.appendChild(textInput(stop.name, function (v) { stop.name = v; }, '站名，例如：我家樓下'));
    head.appendChild(button('🗑', 'icon-btn', function () {
      working.busStops.splice(si, 1); refreshStopList();
    }));
    card.appendChild(head);

    var meta = document.createElement('div');
    meta.className = 'sf-row';
    meta.appendChild(makeField('公司 Operator',
      selectInput(stop.operator || 'kmb', [
        { value: 'kmb', label: '九巴 / 龍運 KMB' },
        { value: 'ctb', label: '城巴 Citybus' }
      ], function (v) { stop.operator = v; })));
    var sid = textInput(stop.stopId, function (v) { stop.stopId = v; }, 'Stop ID');
    sid.className = 'inp mono';
    meta.appendChild(makeField('Stop ID', sid));
    card.appendChild(meta);

    var routesBox = document.createElement('div');
    routesBox.className = 'route-edit-list';
    (stop.routes || []).forEach(function (r, ri) {
      var row = document.createElement('div');
      row.className = 'route-edit';
      row.appendChild(textInput(r.route, function (v) { r.route = v; }, '路線'));
      row.appendChild(textInput(r.serviceType || '', function (v) { r.serviceType = v; }, 'serviceType', 'text'));
      row.appendChild(button('✕', 'icon-btn', function () {
        stop.routes.splice(ri, 1); refreshStopList();
      }));
      routesBox.appendChild(row);
    });
    card.appendChild(routesBox);

    card.appendChild(button('＋ 加路線 Add route', 'ghost small', function () {
      stop.routes = stop.routes || [];
      stop.routes.push({ route: '', serviceType: stop.operator === 'ctb' ? undefined : '1' });
      refreshStopList();
    }));

    return card;
  }

  /* ---------------- bus stop finder (inside settings) ---------------- */
  function searchHelper() {
    var box = document.createElement('div');
    box.className = 'search-helper';

    var h = document.createElement('h4');
    h.textContent = '🔍 搵巴士站 Find a stop';
    box.appendChild(h);

    var op = 'kmb', dir = 'outbound', svc = '1';
    var row = document.createElement('div');
    row.className = 'sf-row';
    row.appendChild(makeField('公司',
      selectInput('kmb', [
        { value: 'kmb', label: '九巴 / 龍運' },
        { value: 'ctb', label: '城巴' }
      ], function (v) { op = v; })));
    var routeInp = textInput('', function (v) { routeInp._v = v; }, '路線，例如 1A');
    row.appendChild(makeField('路線', routeInp));
    row.appendChild(makeField('方向',
      selectInput('outbound', [
        { value: 'outbound', label: '去程' },
        { value: 'inbound', label: '回程' }
      ], function (v) { dir = v; })));
    row.appendChild(makeField('serviceType',
      textInput('1', function (v) { svc = v; }, '1')));
    row.appendChild(button('搜尋', 'primary', function () {
      doSearch(box, op, (routeInp.value || '').trim(), dir, svc || '1');
    }));
    box.appendChild(row);

    var results = document.createElement('div');
    results.className = 'search-results';
    box.appendChild(results);

    return box;
  }

  function doSearch(box, op, route, dir, svc) {
    var results = box.querySelector('.search-results');
    if (!route) { results.innerHTML = '<p class="sf-hint">請輸入路線號碼。</p>'; return; }
    results.innerHTML = '<p class="sf-hint">搜尋中…</p>';

    var rsUrl, infoUrl;
    if (op === 'ctb') {
      rsUrl = 'https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/' + encodeURIComponent(route) + '/' + dir;
      infoUrl = 'https://rt.data.gov.hk/v2/transport/citybus/route/CTB/' + encodeURIComponent(route);
    } else {
      rsUrl = 'https://data.etabus.gov.hk/v1/transport/kmb/route-stop/' + encodeURIComponent(route) + '/' + dir + '/' + encodeURIComponent(svc);
      infoUrl = 'https://data.etabus.gov.hk/v1/transport/kmb/route/' + encodeURIComponent(route) + '/' + dir + '/' + encodeURIComponent(svc);
    }

    function stopUrl(id) {
      return (op === 'ctb')
        ? 'https://rt.data.gov.hk/v2/transport/citybus/stop/' + id
        : 'https://data.etabus.gov.hk/v1/transport/kmb/stop/' + id;
    }

    Promise.all([fetch(infoUrl, { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; }),
                 fetch(rsUrl, { cache: 'no-store' }).then(function (r) { return r.json(); })])
      .then(function (res) {
        var info = res[0], rs = res[1];
        var stops = (rs && rs.data) ? rs.data : [];
        if (!stops.length) { results.innerHTML = '<p class="sf-hint">搵唔到，請檢查路線／方向。</p>'; return; }

        var head = '';
        if (info && info.data) {
          var d = info.data;
          head = '<div class="sf-hint">' + esc(route) + ' ' + esc(d.orig_tc || d.orig_en || '') + ' → ' + esc(d.dest_tc || d.dest_en || '') + '</div>';
        }

        var details = stops.map(function (s) {
          return fetch(stopUrl(s.stop), { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });
        });

        return Promise.all(details).then(function (ds) {
          var wrap = document.createElement('div');
          wrap.innerHTML = head;
          stops.forEach(function (s, i) {
            var dd = ds[i] && ds[i].data;
            var name = dd ? (dd.name_tc || dd.name_en) : '(未知)';
            var row = document.createElement('div');
            row.className = 'search-row';
            var info2 = document.createElement('div');
            info2.className = 'search-info';
            info2.innerHTML = '<b>' + esc(name) + '</b><span class="mono">' + esc(s.stop) + '</span>';
            row.appendChild(info2);
            row.appendChild(button('加入', 'small', function () {
              addFoundStop(op, route, svc, s.stop, name);
              row.querySelector('button').textContent = '已加入 ✓';
            }));
            wrap.appendChild(row);
          });
          results.innerHTML = '';
          results.appendChild(wrap);
        });
      })
      .catch(function (e) { results.innerHTML = '<p class="sf-hint">出錯：' + esc(e.message) + '</p>'; });
  }

  function addFoundStop(op, route, svc, stopId, name) {
    var existing = null;
    for (var i = 0; i < working.busStops.length; i++) {
      var s = working.busStops[i];
      if (s.stopId === stopId && (s.operator || 'kmb') === op) { existing = s; break; }
    }
    var newRoute = { route: route };
    if (op === 'kmb') newRoute.serviceType = svc;

    if (existing) {
      existing.routes = existing.routes || [];
      var dup = existing.routes.some(function (r) { return r.route === route; });
      if (!dup) existing.routes.push(newRoute);
    } else {
      working.busStops.push({
        name: name,
        operator: op,
        stopId: stopId,
        routes: [newRoute]
      });
    }
    refreshStopList();
  }

  /* ============================================================
     BACKUP
     ============================================================ */
  /* ============================================================
     THEME (colours)
     ============================================================ */
  function hexToRgbaLocal(hex, a) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(255,91,91,' + a + ')';
    return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) +
      ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')';
  }

  function sectionTheme() {
    var s = makeSection('外觀 Theme');
    var cur = (working.theme && working.theme.holidayColor) || '#ff5b5b';

    function apply(c) {
      working.theme = working.theme || {};
      working.theme.holidayColor = c;
      document.documentElement.style.setProperty('--holiday', c);
      document.documentElement.style.setProperty('--holiday-soft', hexToRgbaLocal(c, 0.14));
    }

    var color = document.createElement('input');
    color.type = 'color';
    color.className = 'inp color';
    color.value = cur;
    color.addEventListener('input', function () { apply(color.value); syncSwatches(); });

    var presets = ['#ff5b5b', '#ff8a3d', '#ffd166', '#ff6f91', '#8b7cff', '#4da3ff', '#35c48a', '#ffffff'];
    var swatchWrap = document.createElement('div');
    swatchWrap.className = 'swatches';
    var btns = [];
    presets.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c;
      b.title = c;
      tap(b, function () { color.value = c; apply(c); syncSwatches(); });
      btns.push({ el: b, c: c });
      swatchWrap.appendChild(b);
    });
    function syncSwatches() {
      btns.forEach(function (b) {
        if (b.c.toLowerCase() === color.value.toLowerCase()) b.el.classList.add('active');
        else b.el.classList.remove('active');
      });
    }
    syncSwatches();

    var wrap = document.createElement('div');
    wrap.className = 'range-wrap';
    wrap.appendChild(color);
    wrap.appendChild(swatchWrap);
    s.body.appendChild(makeField('公眾假期顏色 Public holiday colour', wrap,
      '公眾假期嗰日會用呢隻色顯示（揀色板或自選）'));
    return s.el;
  }

  /* ============================================================
     SYNC (Raspberry Pi shared state)
     ============================================================ */
  function sectionSync() {
    var s = makeSection('同步 Sync');
    var st = (window.Sync && window.Sync.status) ? window.Sync.status() : { on: false, rev: 0 };
    var info = document.createElement('p');
    info.className = 'sf-hint';
    if (st.on) {
      info.textContent = '✅ 已連線 Raspberry Pi — 活動、體重、設定會同其他裝置共用（rev ' + st.rev + '）。';
    } else {
      info.textContent = '未啟用：此頁唔係由 Pi server 提供（例如 GitHub Pages），資料只存喺本機。';
    }
    s.body.appendChild(info);
    if (st.on) {
      var row = document.createElement('div');
      row.className = 'sf-row';
      row.appendChild(button('🔄 立即同步 Sync now', 'ghost', function () {
        if (window.Sync) window.Sync.pull();
        alert('已向 Pi 拉取最新資料。');
      }));
      s.body.appendChild(row);
    }
    return s.el;
  }

  function sectionBackup() {
    var s = makeSection('備份 Backup');

    var hint = document.createElement('div');
    hint.className = 'sf-hint';
    hint.textContent = '一個檔案包含設定(巴士站/更表/天氣)、所有日曆活動同埋鸚鵡體重紀錄。用同一個檔可以匯入還原。';
    s.body.appendChild(hint);

    var row = document.createElement('div');
    row.className = 'sf-row';

    row.appendChild(button('⬇️ 匯出備份 Backup', 'ghost', function () {
      var backup = {
        app: 'home-dashboard',
        version: 1,
        exportedAt: new Date().toISOString(),
        config: working,
        events: loadEventsSafe(),
        weights: loadWeightsSafe()
      };
      download('home-dashboard-backup.json', JSON.stringify(backup, null, 2), 'application/json');
    }));
    row.appendChild(button('♻️ 還原 config.js 預設', 'ghost danger', function () {
      if (confirm('確定還原為 config.js 的預設值？本機修改會清除。')) {
        reset();
        working = load();
        rerender();
      }
    }));
    s.body.appendChild(row);

    // import
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.className = 'inp';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = parseBackup(reader.result);
          // New combined backup: { config: {...}, events: {...} }
          // Legacy backup: the config object itself (has busStops).
          var cfg = (parsed && parsed.config) ? parsed.config : parsed;
          if (!cfg || !cfg.busStops) { alert('檔案格式唔啱（搵唔到 busStops）。'); return; }

          var impFonts = Object.assign({}, (working.layout && working.layout.fonts) || {},
                                             (cfg.layout && cfg.layout.fonts) || {});
          var impLayout = Object.assign({}, working.layout, cfg.layout || {});
          impLayout.fonts = impFonts;

          working = {
            title: cfg.title || working.title,
            weather: Object.assign({}, working.weather, cfg.weather || {}),
            roster: Object.assign({}, working.roster, cfg.roster || {}),
            refresh: Object.assign({}, working.refresh, cfg.refresh || {}),
            layout: impLayout,
            theme: Object.assign({}, working.theme, cfg.theme || {}),
            busStops: cfg.busStops
          };

          var evCount = 0;
          if (parsed && parsed.events) {
            saveEventsSafe(parsed.events);
            evCount = countEvents(parsed.events);
          }

          var wtCount = 0;
          if (parsed && parsed.weights) {
            saveWeightsSafe(parsed.weights);
            wtCount = countWeights(parsed.weights);
          }

          rerender();
          alert('還原成功：' + working.busStops.length + ' 個巴士站' +
            (evCount ? '、' + evCount + ' 個活動' : '（此備份沒有活動）') +
            (wtCount ? '、' + wtCount + ' 日體重' : '') +
            '。\n記得按「儲存並套用」先會生效。');
        } catch (e) { alert('讀取失敗：' + e.message); }
      };
      reader.readAsText(f);
    });
    s.body.appendChild(makeField('匯入備份 (JSON / config.js)', file));

    return s.el;
  }

  /* Accept either a raw JSON backup or a previously exported `config.js`
     (which starts with a comment and wraps the object in `const CONFIG = ...;`).
     Both round-trip through the same import button. */
  function parseBackup(text) {
    var s = String(text || '');
    try { return JSON.parse(s); } catch (e) { /* fall through */ }
    // Strip a leading comment and any `const CONFIG =` wrapper, then take the
    // outermost { ... } object. Export/import now round-trip.
    s = s.replace(/^\s*\/\*[\s\S]*?\*\//, '');
    s = s.replace(/^\s*(?:const|var|let)\s+CONFIG\s*=\s*/, '');
    var start = s.indexOf('{');
    var end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    return JSON.parse(s);
  }

  /* Events live in app.js (loaded AFTER settings.js), so reach them through
     the global functions if available and fall back to the raw key. */
  var EVENTS_KEY = 'homeDashboard.events.v1';
  function loadEventsSafe() {
    try {
      if (typeof loadEvents === 'function') return loadEvents();
      return JSON.parse(localStorage.getItem(EVENTS_KEY)) || {};
    } catch (e) { return {}; }
  }
  function saveEventsSafe(obj) {
    try {
      if (typeof saveEvents === 'function') { saveEvents(obj); return; }
      localStorage.setItem(EVENTS_KEY, JSON.stringify(obj));
    } catch (e) { /* storage full / private mode */ }
  }
  function countEvents(obj) {
    var n = 0;
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) n += (obj[k] || []).length; }
    return n;
  }

  /* Parrot weights, same pattern (defined in app.js, loaded after this file). */
  var WEIGHTS_KEY = 'homeDashboard.weights.v1';
  function loadWeightsSafe() {
    try {
      if (typeof loadWeights === 'function') return loadWeights();
      return JSON.parse(localStorage.getItem(WEIGHTS_KEY)) || {};
    } catch (e) { return {}; }
  }
  function saveWeightsSafe(obj) {
    try {
      if (typeof saveWeights === 'function') { saveWeights(obj); return; }
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(obj));
    } catch (e) { /* storage full / private mode */ }
  }
  function countWeights(obj) {
    var n = 0;
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) n++; }
    return n;
  }

  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    } catch (e) { alert('下載失敗：' + e.message); }
  }

  /* ============================================================
     RENDER / OPEN / CLOSE
     ============================================================ */
  function render() {
    var box = $('settings');
    box.innerHTML = '';

    var panel = document.createElement('div');
    panel.className = 'settings-panel';

    var head = document.createElement('div');
    head.className = 'settings-head';
    var t = document.createElement('h2');
    t.textContent = '⚙️ 設定 Settings';
    head.appendChild(t);
    head.appendChild(button('✕ 關閉', 'ghost', close));
    panel.appendChild(head);

    var body = document.createElement('div');
    body.className = 'settings-body';
    body.appendChild(sectionGeneral());
    body.appendChild(sectionTheme());
    body.appendChild(sectionRoster());
    body.appendChild(sectionStops());
    body.appendChild(sectionSync());
    body.appendChild(sectionBackup());
    panel.appendChild(body);

    var foot = document.createElement('div');
    foot.className = 'settings-foot';
    foot.appendChild(button('💾 儲存並套用 Save & apply', 'primary', function () {
      save(working);
      close();
      if (window.reloadDashboard) window.reloadDashboard();
    }));
    panel.appendChild(foot);

    box.appendChild(panel);
  }

  function rerender() {
    var body = document.querySelector('#settings .settings-body');
    var top = body ? body.scrollTop : 0;
    render();
    var nb = document.querySelector('#settings .settings-body');
    if (nb) nb.scrollTop = top;
  }

  /* Fill a stop-list container (used during render and on later updates). */
  function fillStopList(list) {
    list.innerHTML = '';
    if (!working.busStops.length) {
      var empty = document.createElement('p');
      empty.className = 'sf-hint';
      empty.textContent = '仲未有巴士站，用下面「＋ 加巴士站」或「🔍 搵站」新增。';
      list.appendChild(empty);
    }
    working.busStops.forEach(function (stop, si) {
      list.appendChild(stopEditor(stop, si));
    });
  }

  /* Rebuild only the editable stop list (keeps search results on screen). */
  function refreshStopList() {
    var list = $('stop-edit-list');
    if (!list) { rerender(); return; }
    fillStopList(list);
  }

  function open() {
    working = load();
    render();
    $('settings').classList.remove('hidden');
  }

  function close() {
    $('settings').classList.add('hidden');
  }

  window.openSettings = open;
})();
