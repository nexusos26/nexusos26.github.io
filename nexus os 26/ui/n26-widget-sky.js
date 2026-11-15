/* ============================================================================
 * Nexus OS 26 · 小组件「天空」层（戳 sky5 · 独立模块，零侵入主壳）
 * ----------------------------------------------------------------------------
 * 用户 11-13 钦定：「这种有时间有变化的小组件，背景都是会变的」，并点名
 * 9 档时段：日出 / 早晨 / 中午 / 下午 / 黄昏时分 / 蓝调时分 / 傍晚 / 夜晚 / 凌晨，
 * 天气按常见状况分；难做的天气背景直接取 天气素材/ 里的真实图。
 *
 * 四件事：
 *  ① 首次 / 空列表时铺截图那套默认四张：时钟 · 日历 · 双区时间 · 天气
 *     （用户已经摆过就绝不覆盖，符合「仅首次/空列表铺」）
 *  ② 时间族 / 天气族共 17 款：底图按「真实天气 × 9 档时段」变化，
 *     图片来自 ui/n26-widget-sky-bg.js 扫描 209 张素材生成的映射，零 404。
 *  ③ 日历族 9 款：不铺实景图（会毁掉昼墨夜白的对比度），只叠一层
 *     极淡的时段色调 --sky-tint-soft，背景照样随 9 档时段变。
 *  ④ 优先取天气接口真实 sunrise/sunset；断网按城市纬度 + 日期用 NOAA
 *     简化公式算，不写死钟点。9 档边界单调、无空档、全天连续覆盖。
 *
 * 主壳契约（已逐条核对 Nexus OS 26.html）：
 *   - 坐标存 col/row 网格，不是像素；像素由 n26CellToPx(m,col,row,cols,rows) 算
 *   - 尺寸走 n26WidgetSizes(type) / n26SnapWidgetSize，不能自造档位
 *   - 卡片 ::before（clock 白线）与 ::after（全局柔光）都已被占用
 *     → 天空层用真实子 div（z-index:-1），绝不抢伪元素
 *   - 卡片 data-wtype 是配色键，createWidget 会写好
 *
 * 全面禁紫：所有时段色调用蓝 / 青 / 琥珀 / 橙 / 中性墨，不出现紫。
 * ==========================================================================*/
(function () {
    'use strict';

    var KEY = 'desktopWidgets';

    /* ② 照片卡：显示时间 / 天色 / 天气，铺真实实景图 + 压暗层 + 白字。
       这些都是「有时间有变化」的卡，用户明确要求背景随时间与天气变。 */
    var SKY_TYPES = [
        /* 时间族 10 款 */
        'clock', 'dualtime', 'worldclock', 'clockAnalog', 'timeSeconds',
        'time', 'alarm', 'stopwatch', 'countdown', 'pomodoro',
        /* 天气族 7 款 */
        'weather', 'weatherHour', 'weatherWeek', 'airQuality',
        'sunrise', 'sunmoon', 'moonphase'
    ];
    /* ③ 色调卡：日期会变但内容密集，只随 9 档时段换一层极淡色调，
       文字对比度继续交给 wr7（昼墨夜白），零风险。 */
    var TINT_TYPES = [
        'calendar', 'schedule', 'weekStrip', 'bigDate', 'dayProgress',
        'dayCard', 'greeting', 'todayAgenda', 'date'
    ];
    var PHASES = ['sunrise', 'morning', 'noon', 'afternoon', 'golden',
                  'bluehour', 'evening', 'night', 'latenight'];

    /* 截图里的默认布局：左列「时钟 → 双区时间 → 天气」竖排，日历贴在时钟右侧。
       坐标是网格 col/row（N26_GRID: cell 76 / gap 16 / pitch 92 / margin 28）。
       尺寸不写死 —— 运行时问主壳白名单要各类型首档，避免被 n26SnapWidgetSize 打回。 */
    var DEFAULT = [
        { type: 'clock',    col: 0, row: 0 },   // 2×2
        { type: 'calendar', col: 2, row: 0 },   // 4×2
        { type: 'dualtime', col: 0, row: 2 },   // 4×2
        { type: 'weather',  col: 0, row: 4 }    // 4×2
    ];

    /* 中文天气状况 → 素材前缀（与主壳 n26WeatherStatus() 的返回字面对齐）。
       16 个前缀全部来自素材目录真实扫描，不臆造。 */
    var COND = {
        '晴': 'sunny', '基本晴朗': 'sunny', '晴朗': 'sunny', '大晴': 'sunning',
        '晴间多云': 'cloudy', '局部多云': 'cloudy', '多云': 'cloudy', '少云': 'cloudy',
        '阴': 'overcast', '阴天': 'overcast',
        '毛毛雨': 'drizzle', '小雨': 'rain', '阵雨': 'rain', '雨': 'rain',
        '中雨': 'rain', '大雨': 'storm', '暴雨': 'storms', '大暴雨': 'storms',
        '降雪': 'snow', '阵雪': 'snow', '雪': 'snow', '小雪': 'snow',
        '雨夹雪': 'sleet', '冰雹': 'hailstone',
        '雷雨': 'thunder', '雷阵雨': 'thunder', '雷电': 'thunder',
        '雾': 'fog', '霾': 'haze', '沙尘暴': 'sandstorm', '大风': 'wind', '风': 'wind'
    };

    var PHASE_CN = {
        sunrise: '日出', morning: '早晨', noon: '中午', afternoon: '下午',
        golden: '黄昏时分', bluehour: '蓝调时分', evening: '傍晚',
        night: '夜晚', latenight: '凌晨'
    };

    /* 9 档色调：叠在实景图之上的半透明层，保证同一张图不同时段观感明显不同，
       同时压暗背景让白色数字始终可读。全部无紫。 */
    var TINT = {
        latenight: 'linear-gradient(160deg, rgba(6,14,32,.74), rgba(10,26,52,.54))',
        sunrise:   'linear-gradient(160deg, rgba(255,168,110,.38), rgba(116,176,224,.28))',
        morning:   'linear-gradient(160deg, rgba(126,196,244,.24), rgba(255,255,255,.10))',
        noon:      'linear-gradient(160deg, rgba(255,255,255,.12), rgba(150,205,248,.10))',
        afternoon: 'linear-gradient(160deg, rgba(255,214,150,.18), rgba(120,180,232,.16))',
        golden:    'linear-gradient(160deg, rgba(255,186,96,.34), rgba(224,140,80,.22))',
        bluehour:  'linear-gradient(160deg, rgba(38,86,158,.46), rgba(18,44,92,.40))',
        evening:   'linear-gradient(160deg, rgba(226,120,84,.34), rgba(58,86,140,.36))',
        night:     'linear-gradient(160deg, rgba(8,20,42,.68), rgba(14,32,62,.48))'
    };
    /* ③ 色调卡的淡版：alpha 一律 ≤ .18，昼墨字 / 夜白字都不受影响。 */
    var TINT_SOFT = {
        latenight: 'linear-gradient(158deg, rgba(30,58,110,.18), rgba(20,40,80,.10))',
        sunrise:   'linear-gradient(158deg, rgba(255,176,124,.17), rgba(122,176,224,.10))',
        morning:   'linear-gradient(158deg, rgba(126,196,244,.15), rgba(255,255,255,.08))',
        noon:      'linear-gradient(158deg, rgba(255,255,255,.12), rgba(150,205,248,.09))',
        afternoon: 'linear-gradient(158deg, rgba(255,214,150,.14), rgba(120,180,232,.10))',
        golden:    'linear-gradient(158deg, rgba(255,186,96,.17), rgba(224,140,80,.10))',
        bluehour:  'linear-gradient(158deg, rgba(38,86,158,.18), rgba(18,44,92,.12))',
        evening:   'linear-gradient(158deg, rgba(226,120,84,.16), rgba(58,86,140,.14))',
        night:     'linear-gradient(158deg, rgba(8,20,42,.18), rgba(14,32,62,.12))'
    };

    /* ---------- 时间工具 ---------- */
    function toMin(s, dflt) {
        var p = String(s || '').split(':').map(Number);
        if (p.length < 2 || !isFinite(p[0]) || !isFinite(p[1])) return dflt;
        return p[0] * 60 + p[1];
    }
    function hhmm(min) {
        var v = ((Math.round(min) % 1440) + 1440) % 1440;
        return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
    }
    function sunWindow(sunrise, sunset) {
        var a = toMin(sunrise, 360), b = toMin(sunset, 1110);
        if (b <= a) { a = 360; b = 1110; }
        /* 黄昏长度随白昼长度伸缩（约 13%），夹在 40–90 分钟 */
        var golden = Math.max(40, Math.min(90, Math.round((b - a) * 0.13)));
        return { a: a, b: b, noon: (a + b) / 2, golden: golden };
    }
    /* 9 档连续覆盖全天，无空档。
       latenight 00:00→日出前 45 分；sunrise 日出前后；morning / noon / afternoon
       按白昼中点切；golden 黄昏（日落前 golden 分到日落后 10 分）；
       bluehour 日落后 10~50 分（天空转深蓝）；evening 50~90 分；night 之后到午夜。
       ★ 每段强制至少 20 分钟并单调递增，冬季白昼极短也不会出现空档或倒序。 */
    function phaseOf(sunrise, sunset, now) {
        var w = sunWindow(sunrise, sunset);
        var cur = now.getHours() * 60 + now.getMinutes();
        var b = [
            w.a - 45,                       // latenight / sunrise
            w.a + 40,                       // sunrise / morning
            w.noon - 60,                    // morning / noon
            w.noon + 45,                    // noon / afternoon
            w.b - w.golden - 40,            // afternoon / golden
            w.b + 10,                       // golden / bluehour
            w.b + 50,                       // bluehour / evening
            w.b + 90                        // evening / night
        ];
        for (var i = 1; i < b.length; i++) {
            if (b[i] < b[i - 1] + 20) b[i] = b[i - 1] + 20;
        }
        if (cur < b[0]) return 'latenight';
        if (cur < b[1]) return 'sunrise';
        if (cur < b[2]) return 'morning';
        if (cur < b[3]) return 'noon';
        if (cur < b[4]) return 'afternoon';
        if (cur < b[5]) return 'golden';
        if (cur < b[6]) return 'bluehour';
        if (cur < b[7]) return 'evening';
        return 'night';
    }

    /* ---------- 真实日出日落：接口优先，断网用 NOAA 简化公式 ---------- */
    /* 返回 UTC 分钟 → 本地 hh:mm；随纬度与一年中的日期变化，不是硬编码钟点。
       极昼/极夜（acos 无解）时返回 null，由调用方走内置兜底。 */
    function solarSun(lat, lon, date) {
        var y = date.getFullYear();
        var day = Math.floor((Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(y, 0, 0)) / 86400000);
        var g = 2 * Math.PI / 365 * (day - 1);
        var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
            - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
        var dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
            - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
            - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
        var phi = lat * Math.PI / 180;
        var cosH = Math.cos(90.833 * Math.PI / 180) / (Math.cos(phi) * Math.cos(dec))
            - Math.tan(phi) * Math.tan(dec);
        if (!isFinite(cosH) || cosH < -1 || cosH > 1) return null;
        var H = Math.acos(cosH) * 180 / Math.PI;
        var tz = -date.getTimezoneOffset();
        return {
            rise: hhmm(720 - 4 * (lon + H) - eq + tz),
            set: hhmm(720 - 4 * (lon - H) - eq + tz)
        };
    }
    function cityGeo() {
        var list = null, id = null;
        try { list = (typeof WEATHER_CITIES !== 'undefined') ? WEATHER_CITIES : null; } catch (e) { }
        try { id = (typeof weatherCurrentCity !== 'undefined') ? weatherCurrentCity : null; } catch (e) { }
        if (list && id) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id && isFinite(list[i].lat)) return list[i];
            }
        }
        if (list && list[3] && isFinite(list[3].lat)) return list[3];
        /* 统一位置服务 ui/n26-geolocation.js 在顶层文档只定位一次，
           结果写共享 localStorage['n26:geo'] 并广播给所有 iframe。 */
        try {
            var g = (window.N26GeoClient && window.N26GeoClient.get()) ||
                (window.N26Geo && window.N26Geo.get()) || null;
            if (g && isFinite(g.lat) && isFinite(g.lon)) return { lat: g.lat, lon: g.lon };
        } catch (e) { }
        return { lat: 39.9042, lon: 116.4074 };   // 与主壳统一兜底
    }
    function skyData() {
        var d = { sunrise: '06:00', sunset: '18:30', status: '晴', source: 'fallback' };
        /* ① 天气应用发布的唯一状态（nexus_n26_weather_state_v1）
           优先走主壳的统一读取函数：它同时看广播来的内存态与落盘值，
           城市刚切换、落盘还没完成时天空也不会慢一拍。 */
        try {
            var st = null;
            if (typeof n26WeatherState === 'function') {
                try { st = n26WeatherState(); } catch (e) { st = null; }
            }
            if (!st) {
                var raw = localStorage.getItem('n26:n26_weather_state_v1');
                if (raw) st = JSON.parse(raw);
                else if (typeof getUserLS === 'function') st = getUserLS('n26_weather_state_v1');
            }
            if (st && st.condition && st.condition.text) {
                d.status = String(st.condition.text);
                if (st.sunrise && st.sunset) {
                    d.sunrise = String(st.sunrise);
                    d.sunset = String(st.sunset);
                    d.source = 'shared';
                    return d;
                }
            }
        } catch (e) { }
        /* ② Open-Meteo 实时结果（主壳 weatherSyncCity 写入的 weatherLive） */
        try {
            var live = (typeof weatherLive !== 'undefined') ? weatherLive : null;
            if (live) {
                if (live.status) d.status = String(live.status);
                if (live.sunrise && live.sunset) {
                    d.sunrise = String(live.sunrise);
                    d.sunset = String(live.sunset);
                    d.source = 'live';
                    return d;
                }
            }
        } catch (e) { }
        /* ③ 离线预设城市：状态一定有，日出日落不一定有 */
        try {
            if (typeof weatherActiveCity === 'function') {
                var c = weatherActiveCity();
                if (c) {
                    if (c.status) d.status = String(c.status);
                    if (c.sunrise && c.sunset) {
                        d.sunrise = String(c.sunrise); d.sunset = String(c.sunset);
                        d.source = 'preset';
                        return d;
                    }
                }
            }
        } catch (e) { }
        /* ④ 无网络 / 无预设：按纬度 + 今天日期算真实日出日落 */
        var geo = cityGeo();
        var s = solarSun(geo.lat, geo.lon, new Date());
        if (s) { d.sunrise = s.rise; d.sunset = s.set; d.source = 'solar'; }
        return d;
    }

    /* ---------- ① 默认布局：只在「从未摆过」时铺 ---------- */
    function sizeOf(type) {
        try {
            var fn = window.n26WidgetSizes || (typeof n26WidgetSizes === 'function' ? n26WidgetSizes : null);
            var list = fn ? fn(type) : null;
            if (list && list[0]) return { cols: list[0].cols, rows: list[0].rows };
        } catch (e) { }
        return { cols: 2, rows: 2 };
    }
    function deskReady() {
        var d = document.getElementById('desktop');
        if (!d || getComputedStyle(d).display === 'none') return false;
        if (!document.getElementById('desktopWidgets')) return false;
        var lock = document.getElementById('lock-screen');
        if (lock && getComputedStyle(lock).display !== 'none') return false;
        var inst = document.getElementById('install-screen');
        if (inst && getComputedStyle(inst).display !== 'none' && getComputedStyle(inst).opacity !== '0') return false;
        return true;
    }
    function ensureDefault() {
        if (typeof getUserLS !== 'function' || typeof setUserLS !== 'function') return false;
        var cur = getUserLS(KEY);
        if (Array.isArray(cur) && cur.length) return false;      /* 用户摆过 → 绝不覆盖 */
        var m = null;
        try { m = (typeof n26Metrics === 'function') ? n26Metrics() : null; } catch (e) { }
        var pitch = (m && m.pitch) || 92, mx = (m && m.marginX) || 28, mt = (m && m.marginTop) || 28;
        var arr = DEFAULT.map(function (w, k) {
            var s = sizeOf(w.type);
            var px = { x: mx + w.col * pitch, y: mt + w.row * pitch };
            try {
                if (typeof n26CellToPx === 'function' && m) {
                    var got = n26CellToPx(m, w.col, w.row, s.cols, s.rows);
                    if (got && isFinite(got.x) && isFinite(got.y)) px = got;
                }
            } catch (e) { }
            return {
                id: k + 1, type: w.type,
                cols: s.cols, rows: s.rows,
                col: w.col, row: w.row,
                x: px.x, y: px.y,
                settings: {}
            };
        });
        setUserLS(KEY, arr);
        if (typeof renderDesktopWidgets === 'function') {
            try { renderDesktopWidgets(); } catch (e) { }
        }
        return true;
    }

    /* ---------- 天空背景层：真实子节点，不抢 ::before / ::after ---------- */
    function childByClass(node, cls) {
        for (var i = 0; i < node.children.length; i++) {
            if (node.children[i].className === cls) return node.children[i];
        }
        return null;
    }
    function ensureLayer(card) {
        var el = childByClass(card, 'n26-sky-layer');
        if (!el) {
            el = document.createElement('div');
            el.className = 'n26-sky-layer';
            el.innerHTML = '<span class="n26-sky-tag"></span>';
            card.insertBefore(el, card.firstChild);
        }
        return el;
    }

    /* ---------- ④ 时钟放大后的日出日落详情 ---------- */
    function injectSun(card, d, ph) {
        var el = childByClass(card, 'n26-sky-sun');
        if (!el) {
            el = document.createElement('div');
            el.className = 'n26-sky-sun';
            el.innerHTML = '<span class="s-rise"></span><span class="s-set"></span>' +
                '<span class="s-golden"></span><span class="s-phase"></span>';
            card.appendChild(el);
        }
        var w = sunWindow(d.sunrise, d.sunset);
        var g0 = hhmm(w.b - w.golden), g1 = hhmm(w.b);
        var set = function (sel, text) {
            var n = el.querySelector(sel);
            if (n && n.textContent !== text) n.textContent = text;
        };
        set('.s-rise', '日出 ' + d.sunrise);
        set('.s-set', '日落 ' + d.sunset);
        set('.s-golden', '黄昏 ' + g0 + '–' + g1);
        set('.s-phase', PHASE_CN[ph] || '');
    }

    /* ---------- ②③ 背景按「天气 × 9 档时段」落到真节点 ---------- */
    function apply() {
        var layerRoot = document.getElementById('desktopWidgets');
        if (!layerRoot) return 0;
        var d = skyData();
        var now = new Date();
        var ph = phaseOf(d.sunrise, d.sunset, now);
        if (PHASES.indexOf(ph) < 0) ph = 'noon';
        var cond = COND[d.status] || 'sunny';
        var table = (window.N26_SKY_BG || {})[cond] || window.N26_SKY_FALLBACK || {};
        var fb = window.N26_SKY_FALLBACK || {};
        var file = table[ph] || fb[ph] || 'weather_quick_card_sunny_big_bg.webp';
        var base = window.N26_SKY_BG_BASE || '../天气素材/天气/OPPO天气/天气背景/';
        var url;
        try {
            /* 统一解析成绝对地址：base 可能是绝对地址（脚本反推），也可能是相对路径，
               不再直接字符串拼接相对地址，避免依赖当前文档/iframe 的基址。 */
            url = new URL(file, new URL(base, document.baseURI)).href;
        } catch (e) {
            url = '../天气素材/天气/OPPO天气/天气背景/' + file;
        }
        var cards = layerRoot.querySelectorAll('.desktop-widget-card');
        var n = 0;
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var t = card.dataset.wtype || card.dataset.type;
            var photo = SKY_TYPES.indexOf(t) >= 0;
            var soft = TINT_TYPES.indexOf(t) >= 0;
            if (!photo && !soft) continue;
            card.dataset.skyPhase = ph;
            card.dataset.skyCond = cond;
            card.style.setProperty('--sky-tint-soft', TINT_SOFT[ph] || TINT_SOFT.noon);
            if (soft && !photo) {
                /* 日历族：只换淡色调，不铺实景图，昼墨夜白对比度零风险 */
                card.dataset.skyTint = '1';
                card.style.removeProperty('--sky-bg');
                card.style.removeProperty('--sky-tint');
                continue;
            }
            card.dataset.sky = '1';
            card.dataset.skyTint = '0';
            card.style.setProperty('--sky-bg', 'url("' + url + '")');
            card.style.setProperty('--sky-tint', TINT[ph] || TINT.noon);
            var sky = ensureLayer(card);
            var tag = sky.querySelector('.n26-sky-tag');
            if (tag && tag.textContent !== PHASE_CN[ph]) tag.textContent = PHASE_CN[ph];
            if (t === 'clock') injectSun(card, d, ph);
            n++;
        }
        return n;
    }

    /* ---------- 生命周期 ---------- */
    var booted = false, obs = null;
    function boot() {
        if (booted || !deskReady()) return false;
        booted = true;
        /* clock 原本 fixed:true（只有 2×2），用户要求「时间可以变大」→
           运行时放开成 2×2 / 4×2 / 4×4 三档；const 对象的属性可改，不动主壳源码。 */
        try {
            if (typeof N26_WIDGET_SPECS !== 'undefined' && N26_WIDGET_SPECS && N26_WIDGET_SPECS.clock) {
                N26_WIDGET_SPECS.clock = { sizes: [[2, 2], [4, 2], [4, 4]] };
            }
        } catch (e) { }
        ensureDefault();
        apply();
        /* renderDesktopWidgets() 会整块重建卡片 → 重新贴背景。
           只观察容器的直接子节点；往卡片内部插层不会触发回环。 */
        var layer = document.getElementById('desktopWidgets');
        if (layer && typeof MutationObserver === 'function') {
            try {
                obs = new MutationObserver(function () {
                    /* 观察器回调抛错会静默停掉后续通知；单点隔离，绝不影响桌面 */
                    try { apply(); } catch (e) { }
                });
                obs.observe(layer, { childList: true });
            } catch (e) { }
        }
        setInterval(function () { try { apply(); } catch (e) { } }, 60000);   /* 每分钟对齐时段与时钟详情 */
        /* 天气应用切换城市/刷新后会写共享键：主文档能收到 storage 事件，立即换天空 */
        window.addEventListener('storage', function (ev) {
            if (ev && ev.key === 'n26:n26_weather_state_v1') { try { apply(); } catch (e) { } }
        });
        try { window.N26SkyRefresh = apply; } catch (e) { }
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) { try { apply(); } catch (e) { } }
        });
        window.addEventListener('resize', function () { try { apply(); } catch (e) { } });
        return true;
    }

    /* 「模块先于 enterDesktop 加载」的守候：
       短轮询覆盖常规启动；OOBE 有可能走好几分钟，所以再加一层长期属性监听。 */
    var tries = 0;
    (function wait() {
        if (boot()) return;
        if (tries++ > 600) return;   /* 60s 后交由属性监听接管 */
        setTimeout(wait, 100);
    })();
    if (typeof MutationObserver === 'function' && (document.body || document.documentElement)) {
        var bootObs = new MutationObserver(function () {
            if (!booted) { try { boot(); } catch (e) { } }
        });
        bootObs.observe(document.body || document.documentElement,
            { attributes: true, attributeFilter: ['class'] });
        var deskNode = document.getElementById('desktop');
        if (deskNode) bootObs.observe(deskNode, { attributes: true, attributeFilter: ['style', 'class'] });
        var instNode = document.getElementById('install-screen');
        if (instNode) bootObs.observe(instNode, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    window.N26WidgetSky = {
        phases: function () { return PHASES.slice(); },
        phase: function (t) {
            var d = skyData();
            var dt = t ? new Date(t) : new Date();
            if (!isFinite(dt.getTime())) dt = new Date();
            return phaseOf(d.sunrise, d.sunset, dt);
        },
        sunWindow: function () { var d = skyData(); return sunWindow(d.sunrise, d.sunset); },
        skyData: skyData,
        solarSun: solarSun,
        skyTypes: function () { return SKY_TYPES.slice(); },
        tintTypes: function () { return TINT_TYPES.slice(); },
        boot: boot,
        apply: apply,
        defaults: function () { return DEFAULT.map(function (w) { return w.type; }); },
        ensureDefault: ensureDefault
    };
})();
