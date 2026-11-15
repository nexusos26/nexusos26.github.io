/* ==========================================================================
   ui/n26-widget-plus.js · v1 / 戳 wplus1
   --------------------------------------------------------------------------
   ★ 小组件「数量多很多」+「集体全改」的内容层：18 个全新类型。

   接入方式（主壳业务逻辑零改动）：
     · WIDGET_TYPES / widgetRegistry / N26_WIDGET_SPECS / N26_RETIRED_WIDGETS
       是主壳那段大内联 script 的顶层 const / 数组 —— 对象本身可写，
       本模块在末尾加载时直接往里注册；
     · renderWidgetContent() 第一行就查 window.N26W2[type]，这是现成的
       渲染器扩展钩子，18 个新渲染器全部挂在这里；
     · 主壳只多了 2 个 <link> + 2 个 <script>。

   ★ 数据诚实（沿用 widgets-v2 的规矩）：
     时间族一律真 Date / Intl；天气族读真 n26WeatherState，没有逐时数据
     就显示「未就绪」占位，绝不编温度；日程 / 待办 / 便签读真 LS；
     月相 / 日出日落是按日期与深圳纬度算出来的，不是写死的演示值。

   ★ 性能纪律：零 MutationObserver（P0 真凶）、零布局读、
     零逐帧 rAF、零全文档扫描循环；只有 1 个 1s 秒针 interval（没有秒组件
     时直接空转）和 1 个一次性的存储估算。
   ========================================================================== */
(function () {
    'use strict';
    if (window.N26W2Plus) return;

    /* ---------------- 基础工具 ---------------- */
    function E(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function I(n, c) { return '<i class="fas ' + n + (c ? ' ' + c : '') + '"></i>'; }
    function pad(n) { return String(n).padStart(2, '0'); }
    function cut(v, n) {
        var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }
    function cc(s) { var c = Number(s && s.__cols); return c > 0 ? c : 2; }
    function rr(s) { var r = Number(s && s.__rows); return r > 0 ? r : 2; }
    function tier(s) {
        var c = cc(s), r = rr(s);
        if (r === 1) return 'bar';
        if (r >= 4) return 'l';
        if (r === 3) return 'm3';
        return c >= 3 ? 'm2' : 's';
    }
    function W(type, inner) { return '<div class="nx2 nx2-' + type + '">' + inner + '</div>'; }
    function hd(ico, title, sub) {
        return '<div class="nx2-hd">' + I(ico) + '<span>' + E(title) + '</span>'
            + (sub ? '<span class="nx2-hd-sub">' + E(sub) + '</span>' : '') + '</div>';
    }
    function emp(ico, title, sub) {
        return '<div class="nx2-empty">' + I(ico) + '<b>' + E(title) + '</b>'
            + (sub ? '<span>' + E(sub) + '</span>' : '') + '</div>';
    }
    function bar(pct) {
        var p = Math.max(0, Math.min(100, Number(pct) || 0));
        return '<div class="nx2-track"><span class="nx2-fill" style="width:' + p + '%"></span></div>';
    }
    function ring(pct, label) {
        var p = Math.max(0, Math.min(100, Number(pct) || 0));
        return '<div class="nx2-ring-wrap"><div class="nx2-ring" style="--nx2-p:' + p + '%"><b>' + E(label) + '</b></div></div>';
    }
    var WD = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var WD1 = ['日', '一', '二', '三', '四', '五', '六'];
    var NO_DRAG = 'onmousedown="event.stopPropagation()" ';

    /* ---------------- 真实数据源 ---------------- */
    function wState() {
        try { if (typeof n26WeatherState === 'function') { var s = n26WeatherState(); if (s) return s; } } catch (e) { }
        try {
            var raw = localStorage.getItem('n26:n26_weather_state_v1');
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return null;
    }
    function temp(st) {
        if (!st || !st.temp) return null;
        var n = numOrNull(st.temp.c);
        return n === null ? null : Math.round(n);
    }
    function city(st) {
        if (!st) return '';
        if (typeof st.city === 'string') return st.city;
        if (st.city && st.city.name) return st.city.name;
        return st.name || '';
    }
    function cond(st) {
        if (!st) return '';
        if (st.condition && st.condition.text) return st.condition.text;
        return st.status || st.cond || st.text || '';
    }
    function todos() {
        try { if (typeof getWidgetTodos === 'function') return getWidgetTodos() || []; } catch (e) { }
        try { if (typeof getUserLS === 'function') return getUserLS('widgetTodos') || []; } catch (e) { }
        return [];
    }
    function agenda() {
        try { if (typeof n26WGet === 'function') { var a = n26WGet('schedule', null); if (Array.isArray(a)) return a; } } catch (e) { }
        return [];
    }
    function noteText() {
        try { if (typeof getUserLS === 'function') return String(getUserLS('stickyNote') || ''); } catch (e) { }
        return '';
    }
    function agMin(x) {
        var a = String((x && x.t) || '0:0').split(':');
        return (+a[0]) * 60 + (+a[1] || 0);
    }
    /* ★ Number(null) === 0：缺数据若不拦住就会渲染成「0° / AQI 0 优」= 编数据。
       所有外部数值一律先过这道门，拿不到就诚实留空。 */
    function numOrNull(v) {
        if (v === null || v === undefined || v === '' || typeof v === 'object') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    /* 日出日落：NOAA 简化式，按深圳纬度 22.54 / 东经 114.06 计算（真实天文近似） */
    function solar() {
        try {
            var d = new Date(), lat = 22.54, lon = 114.06, RAD = Math.PI / 180;
            var y0 = new Date(d.getFullYear(), 0, 0);
            var doy = Math.floor((d - y0) / 86400000);
            var g = 2 * Math.PI / 365 * (doy - 1);
            var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
                - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
            var dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
                - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
                - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
            var x = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(dec))
                - Math.tan(lat * RAD) * Math.tan(dec);
            if (x < -1 || x > 1 || !isFinite(x)) return null;
            var ha = Math.acos(x) / RAD;
            var off = -new Date().getTimezoneOffset();
            var rise = 720 - 4 * (lon + ha) - eq + off;
            var set = 720 - 4 * (lon - ha) - eq + off;
            function fmt(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(Math.floor(m % 60)); }
            return { rise: fmt(rise), set: fmt(set) };
        } catch (e) { return null; }
    }
    /* 月相：以 2000-01-06 18:14 UTC 新月为基准的真朔望月推算 */
    function moon() {
        var SYN = 29.530588853, EPOCH = Date.UTC(2000, 0, 6, 18, 14);
        var age = ((Date.now() - EPOCH) / 86400000 % SYN + SYN) % SYN;
        var f = age / SYN;
        var lit = Math.round((1 - Math.cos(2 * Math.PI * f)) / 2 * 100);
        var name = f < .03 ? '新月' : f < .22 ? '蛾眉月' : f < .28 ? '上弦月' : f < .47 ? '盈凸月'
            : f < .53 ? '满月' : f < .72 ? '亏凸月' : f < .78 ? '下弦月' : '残月';
        return { age: age, f: f, lit: lit, name: name };
    }
    function weekNo(d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        var day = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - day);
        var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        return Math.ceil((((t - y0) / 86400000) + 1) / 7);
    }
    function tzTime(tz) {
        try {
            return new Intl.DateTimeFormat('zh-CN', {
                timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
            }).format(new Date());
        } catch (e) { return '--:--'; }
    }
    var TZS = [
        { tz: 'Asia/Shanghai', label: '北京' },
        { tz: 'Asia/Tokyo', label: '东京' },
        { tz: 'Europe/London', label: '伦敦' },
        { tz: 'America/New_York', label: '纽约' },
        { tz: 'Australia/Sydney', label: '悉尼' }
    ];

    /* ---------------- ① 时间族 ---------------- */
    var R = {};

    /* ★ 用户钦定：带秒时间「宽 3、高 2」 */
    R.timeSeconds = function (s) {
        var t = tier(s), d = new Date();
        var hms = pad(d.getHours()) + '<span class="nx2-colon">:</span>' + pad(d.getMinutes());
        var sec = '<span class="nx2-sec" data-n26-sec>' + pad(d.getSeconds()) + '</span>';
        var main = '<div class="nx2-sec-main">' + hms + sec + '</div>';
        if (t === 'bar') {
            return W('timeSeconds', '<div class="nx2-row between">' + I('fa-clock', 'nx2-accent') + main
                + '<span class="nx2-sub">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WD1[d.getDay()] + '</span></div>');
        }
        return W('timeSeconds',
            hd('fa-clock', '秒级时间', d.getFullYear() + ' · 第 ' + weekNo(d) + ' 周')
            + '<div class="nx2-grow"></div>' + main
            + '<div class="nx2-line nx2-only-wide"></div>'
            + '<div class="nx2-row between"><span class="nx2-sub">' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + WD[d.getDay()] + '</span>'
            + '<span class="nx2-faint nx2-tab">UTC' + (-(d.getTimezoneOffset() / 60) >= 0 ? '+' : '') + (-d.getTimezoneOffset() / 60) + '</span></div>'
            + '<div class="nx2-only-tall nx2-col"><span class="nx2-faint">今日已过</span>'
            + bar(((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400) * 100) + '</div>');
    };

    /* 模拟时钟：三根针用负 animation-delay 对齐当前时刻，零定时器 */
    R.clockAnalog = function (s) {
        var d = new Date();
        var sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
        var ticks = '';
        for (var i = 0; i < 12; i++) {
            var a = (i * 30 - 90) * Math.PI / 180;
            var x1 = 50 + Math.cos(a) * 41, y1 = 50 + Math.sin(a) * 41;
            var x2 = 50 + Math.cos(a) * 46, y2 = 50 + Math.sin(a) * 46;
            ticks += '<line class="nx2-tick' + (i % 3 === 0 ? ' major' : '') + '" x1="' + x1.toFixed(1)
                + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
        }
        var svg = '<svg class="nx2-dial" viewBox="0 0 100 100" aria-label="模拟时钟">'
            + '<circle class="nx2-face" cx="50" cy="50" r="47"/>' + ticks
            + '<g class="nx2-hand h" style="animation-delay:-' + (hr * 3600).toFixed(0) + 's"><line x1="50" y1="52" x2="50" y2="27"/></g>'
            + '<g class="nx2-hand m" style="animation-delay:-' + (min * 60).toFixed(0) + 's"><line x1="50" y1="53" x2="50" y2="19"/></g>'
            + '<g class="nx2-hand s" style="animation-delay:-' + sec + 's"><line x1="50" y1="58" x2="50" y2="15"/></g>'
            + '<circle class="nx2-pin" cx="50" cy="50" r="2.6"/></svg>';
        return W('clockAnalog', '<div class="nx2-grow" style="display:flex;align-items:center;justify-content:center">' + svg + '</div>'
            + '<div class="nx2-row between"><span class="nx2-sub nx2-tab">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</span>'
            + '<span class="nx2-faint">' + WD1[d.getDay()] + '</span></div>');
    };

    R.worldclock = function (s) {
        var t = tier(s), d = new Date();
        var n = t === 's' ? 2 : (t === 'bar' ? 2 : (t === 'm3' || t === 'l' ? 5 : 3));
        var cells = TZS.slice(0, n).map(function (z) {
            return '<div class="nx2-tz"><b>' + tzTime(z.tz) + '</b><span>' + E(z.label) + '</span></div>';
        }).join('');
        return W('worldclock',
            hd('fa-earth-asia', '世界时钟', '本地 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()))
            + '<div class="nx2-grid ' + (n >= 4 ? 'nx2-g3' : 'nx2-g2') + ' nx2-grow">' + cells + '</div>');
    };

    R.sunmoon = function (s) {
        var d = new Date(), h = d.getHours() + d.getMinutes() / 60;
        var night = (h >= 19 || h < 5), pos = Math.max(0, Math.min(100, ((h - 5) / 14) * 100));
        var so = solar();
        return W('sunmoon',
            hd(night ? 'fa-moon' : 'fa-sun', night ? '夜间' : '日间', '日月轨迹')
            + '<div class="nx2-arc"><div class="nx2-arc-line"></div>'
            + '<div class="nx2-orb" style="left:' + (6 + pos * .88) + '%"></div></div>'
            + '<div class="nx2-row between nx2-only-wide"><span class="nx2-kv">日出 <b>' + E(so ? so.rise : '--:--') + '</b></span>'
            + '<span class="nx2-kv">日落 <b>' + E(so ? so.set : '--:--') + '</b></span></div>'
            + '<span class="nx2-faint">按深圳纬度估算 · 当前 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</span>');
    };

    R.weekStrip = function (s) {
        var d = new Date(), mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
        var cells = '';
        for (var i = 0; i < 7; i++) {
            var x = new Date(mon); x.setDate(mon.getDate() + i);
            var on = x.toDateString() === d.toDateString();
            cells += '<div class="' + (on ? 'on' : '') + '"><span>' + WD1[x.getDay()] + '</span><b>' + x.getDate() + '</b></div>';
        }
        return W('weekStrip',
            hd('fa-calendar-week', '本周', d.getFullYear() + ' · 第 ' + weekNo(d) + ' 周')
            + '<div class="nx2-week nx2-grow">' + cells + '</div>'
            + '<div class="nx2-row between nx2-only-wide"><span class="nx2-sub">' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日</span>'
            + '<span class="nx2-faint">' + WD[d.getDay()] + '</span></div>');
    };

    R.moonphase = function (s) {
        var m = moon();
        var shade = m.f < .5
            ? 'left:' + (m.f * 100 * 2).toFixed(0) + '%;width:' + (100 - m.f * 100 * 2).toFixed(0) + '%'
            : 'left:0;width:' + ((m.f - .5) * 200).toFixed(0) + '%';
        return W('moonphase',
            hd('fa-moon', '月相', m.name)
            + '<div class="nx2-row nx2-grow" style="justify-content:center;gap:14px">'
            + '<div class="nx2-moon"><div class="nx2-moon-shade" style="' + shade + '"></div></div>'
            + '<div class="nx2-col"><span class="nx2-num">' + m.lit + '%</span><span class="nx2-sub">照亮</span>'
            + '<span class="nx2-faint">月龄 ' + m.age.toFixed(1) + ' 天</span></div></div>'
            + '<div class="nx2-line nx2-only-wide"></div><span class="nx2-faint nx2-only-wide">按朔望月推算 · 非实时天文台数据</span>');
    };

    R.bigDate = function (s) {
        var d = new Date(), t = tier(s);
        var big = '<div class="nx2-hero">' + d.getDate() + '</div>';
        if (t === 'bar') return W('bigDate', '<div class="nx2-row between">' + big
            + '<span class="nx2-sub">' + (d.getMonth() + 1) + ' 月 · ' + WD[d.getDay()] + '</span></div>');
        return W('bigDate', hd('fa-calendar-day', (d.getMonth() + 1) + ' 月', String(d.getFullYear()))
            + '<div class="nx2-grow" style="display:flex;align-items:center;justify-content:center">' + big + '</div>'
            + '<div class="nx2-line"></div><div class="nx2-row between"><span class="nx2-title">' + WD[d.getDay()] + '</span>'
            + '<span class="nx2-faint">第 ' + weekNo(d) + ' 周</span></div>');
    };

    R.dayProgress = function (s) {
        var d = new Date();
        var pct = ((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400) * 100;
        var left = 100 - pct;
        return W('dayProgress',
            hd('fa-hourglass-half', '今日进度', pad(d.getHours()) + ':' + pad(d.getMinutes()))
            + '<div class="nx2-row nx2-grow" style="justify-content:center;gap:12px">'
            + ring(pct, Math.round(pct) + '%')
            + '<div class="nx2-col"><span class="nx2-num">' + left.toFixed(1) + '%</span><span class="nx2-sub">今日剩余</span>'
            + '<span class="nx2-faint">' + Math.floor((86400 - (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds())) / 3600) + ' 小时</span></div></div>'
            + '<div class="nx2-only-wide">' + bar(pct) + '</div>');
    };

    /* ---------------- ② 天气族 ---------------- */
    R.weatherHour = function (s) {
        var d = new Date(), t = tier(s), st = wState(), cur = temp(st);
        var hours = (st && Array.isArray(st.hourly)) ? st.hourly : [];
        var cells = '';
        var n = t === 's' ? 3 : (t === 'bar' ? 4 : (t === 'm3' || t === 'l' ? 8 : 6));
        for (var i = 0; i < n; i++) {
            var h = (d.getHours() + i) % 24;
            var hv = hours[i] ? numOrNull(hours[i].temp) : null;
            var v = i === 0 && cur !== null ? cur + '°' : (hv !== null ? Math.round(hv) + '°' : '—');
            cells += '<div class="nx2-wx-hour">' + I(i === 0 ? 'fa-clock' : 'fa-cloud') + '<b>' + v + '</b><span>' + pad(h) + '</span></div>';
        }
        return W('weatherHour',
            hd('fa-cloud-sun', '逐时天气', city(st) || '当前位置')
            + '<div class="nx2-grid ' + (n >= 6 ? 'nx2-g4' : 'nx2-g3') + ' nx2-grow">' + cells + '</div>'
            + '<span class="nx2-faint">' + (hours.length ? '数据来自天气应用' : '暂无逐时预报 · 仅首格为实时温度') + '</span>');
    };

    R.weatherWeek = function (s) {
        var st = wState(), t = tier(s);
        var list = (st && Array.isArray(st.daily) && st.daily.length) ? st.daily : null;
        if (!list) {
            try { if (typeof weatherLive !== 'undefined' && weatherLive && Array.isArray(weatherLive.forecast)) list = weatherLive.forecast; } catch (e) { }
        }
        if (!list || !list.length) return W('weatherWeek', hd('fa-calendar', '七日天气', city(st) || '')
            + emp('fa-cloud', '暂无七日预报', '天气应用同步后自动填充'));
        var n = t === 's' ? 2 : (t === 'bar' ? 1 : (t === 'm3' || t === 'l' ? 7 : 4));
        var rows = list.slice(0, n).map(function (x, i) {
            var hi = numOrNull(x.high && x.high.c !== undefined ? x.high.c : x.high);
            var lo = numOrNull(x.low && x.low.c !== undefined ? x.low.c : x.low);
            hi = hi === null ? null : Math.round(hi);
            lo = lo === null ? null : Math.round(lo);
            var label = x.weekday || (i === 0 ? '今天' : WD1[(new Date().getDay() + i) % 7]);
            return '<div class="nx2-wx-day"><span>' + E(label) + '</span>' + I('fa-cloud-sun')
                + '<b>' + (hi !== null ? hi + '°' : '—') + (lo !== null ? ' / ' + lo + '°' : '') + '</b></div>';
        }).join('');
        return W('weatherWeek', hd('fa-cloud-sun', '七日天气', city(st) || '当前位置')
            + '<div class="nx2-list nx2-grow">' + rows + '</div>');
    };

    R.airQuality = function (s) {
        var st = wState(), aqi = st && (st.aqi || (st.air && st.air.aqi));
        var num = numOrNull(aqi);
        var label = num === null ? '暂无数据' : num <= 50 ? '优' : num <= 100 ? '良' : num <= 150 ? '轻度污染' : num <= 200 ? '中度污染' : '重度污染';
        return W('airQuality',
            hd('fa-wind', '空气质量', city(st) || '')
            + (num === null
                ? emp('fa-wind', '暂无空气质量数据', '天气应用同步后自动填充')
                : '<div class="nx2-row nx2-grow" style="justify-content:center;gap:12px">'
                  + '<span class="nx2-hero">' + num + '</span>'
                  + '<div class="nx2-col"><span class="nx2-title">' + label + '</span><span class="nx2-faint">AQI</span></div></div>'
                  + '<div class="nx2-only-wide">' + bar(Math.min(100, num / 3)) + '</div>'));
    };

    R.sunrise = function (s) {
        var so = solar(), st = wState(), d = new Date();
        var rise = (st && st.sunrise) || (so && so.rise) || '--:--';
        var set = (st && st.sunset) || (so && so.set) || '--:--';
        var h = d.getHours() + d.getMinutes() / 60;
        var isDay = h >= 6 && h < 18;
        return W('sunrise',
            hd(isDay ? 'fa-sun' : 'fa-moon', isDay ? '白昼' : '夜晚', '日出 · 日落')
            + '<div class="nx2-grid nx2-g2 nx2-grow">'
            + '<div class="nx2-cell">' + I('fa-arrow-up', 'nx2-accent') + '<b>' + E(rise) + '</b><span>日出</span></div>'
            + '<div class="nx2-cell">' + I('fa-arrow-down', 'nx2-accent') + '<b>' + E(set) + '</b><span>日落</span></div></div>'
            + '<span class="nx2-faint">' + (st && st.sunrise ? '来自天气应用' : '按深圳纬度估算') + '</span>');
    };

    /* ---------------- ③ 系统 / 效率族 ---------------- */
    var diskInfo = null;
    function readDisk() {
        try {
            if (!navigator.storage || !navigator.storage.estimate) return;
            navigator.storage.estimate().then(function (est) {
                if (!est || !est.quota) return;
                diskInfo = { usage: est.usage || 0, quota: est.quota };
                fillDisk();
            }).catch(function () { });
        } catch (e) { }
    }
    function fillDisk() {
        if (!diskInfo) return;
        try {
            var pct = Math.min(100, diskInfo.usage / diskInfo.quota * 100);
            var txt = (diskInfo.usage / 1048576).toFixed(1) + ' MB / ' + (diskInfo.quota / 1048576).toFixed(0) + ' MB';
            var els = document.querySelectorAll('[data-n26-disk]');
            for (var i = 0; i < els.length; i++) {
                els[i].textContent = txt;
                var barEl = els[i].parentNode && els[i].parentNode.querySelector('.nx2-fill');
                if (barEl) barEl.style.width = Math.max(2, pct) + '%';
            }
        } catch (e) { }
    }

    R.diskSpace = function (s) {
        var txt = diskInfo ? (diskInfo.usage / 1048576).toFixed(1) + ' MB / ' + (diskInfo.quota / 1048576).toFixed(0) + ' MB' : '读取中…';
        var pct = diskInfo ? Math.max(2, Math.min(100, diskInfo.usage / diskInfo.quota * 100)) : 2;
        return W('diskSpace',
            hd('fa-hard-drive', '存储空间', '浏览器配额')
            + '<div class="nx2-grow"></div><div class="nx2-num" data-n26-disk>' + E(txt) + '</div>'
            + '<div class="nx2-track"><span class="nx2-fill" style="width:' + pct + '%"></span></div>'
            + '<div class="nx2-row between"><span class="nx2-faint">点击刷新重新估算</span>'
            + '<button class="nx2-btn" ' + NO_DRAG + 'onclick="N26W2Plus.refreshDisk(event)">' + I('fa-rotate') + '</button></div>');
    };

    R.todoRing = function (s) {
        var list = todos(), done = list.filter(function (x) { return x.done; }).length;
        var pct = list.length ? Math.round(done / list.length * 100) : 0;
        var next = list.filter(function (x) { return !x.done; })[0];
        return W('todoRing',
            hd('fa-list-check', '完成率', done + ' / ' + list.length)
            + (list.length
                ? '<div class="nx2-row nx2-grow" style="justify-content:center;gap:12px">' + ring(pct, pct + '%')
                  + '<div class="nx2-col"><span class="nx2-sub">下一项</span><span class="nx2-title nx2-clamp2">' + E(cut(next ? next.text : '全部完成', 12)) + '</span></div></div>'
                : emp('fa-list-check', '今天还很清爽', '在待办小组件里记一件小事'))
            + '<div class="nx2-only-wide">' + bar(pct) + '</div>');
    };

    R.dayCard = function (s) {
        var d = new Date();
        var y0 = new Date(d.getFullYear(), 0, 1);
        var doy = Math.floor((d - y0) / 86400000) + 1;
        var total = ((d.getFullYear() % 4 === 0 && d.getFullYear() % 100 !== 0) || d.getFullYear() % 400 === 0) ? 366 : 365;
        var phase = (window.N26DayPhase && window.N26DayPhase.get) ? window.N26DayPhase.get() : '';
        var phaseName = { day: '白天', dawn: '黎明', dusk: '黄昏', night: '夜间' }[phase] || '';
        return W('dayCard',
            hd('fa-sun', '今日概览', d.getFullYear() + ' 年')
            + '<div class="nx2-grid nx2-g2 nx2-grow">'
            + '<div class="nx2-well"><div class="nx2-col"><span class="nx2-faint">星期</span><b class="nx2-num">' + WD[d.getDay()] + '</b></div></div>'
            + '<div class="nx2-well"><div class="nx2-col"><span class="nx2-faint">周数</span><b class="nx2-num">第 ' + weekNo(d) + ' 周</b></div></div>'
            + '<div class="nx2-well"><div class="nx2-col"><span class="nx2-faint">年内第</span><b class="nx2-num">' + doy + ' 天</b></div></div>'
            + '<div class="nx2-well"><div class="nx2-col"><span class="nx2-faint">剩余</span><b class="nx2-num">' + (total - doy) + ' 天</b></div></div></div>'
            + '<div class="nx2-row between"><span class="nx2-sub">' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日</span>'
            + '<span class="nx2-chip">' + E(phaseName) + '</span></div>');
    };

    R.greeting = function (s) {
        var d = new Date(), h = d.getHours(), st = wState(), tp = temp(st);
        var hi = h < 5 ? '夜深了' : h < 9 ? '早上好' : h < 12 ? '上午好' : h < 14 ? '中午好'
            : h < 18 ? '下午好' : h < 22 ? '晚上好' : '夜深了';
        return W('greeting',
            '<div class="nx2-grow" style="display:flex;flex-direction:column;justify-content:center;gap:6px">'
            + '<div class="nx2-title">' + hi + '</div>'
            + '<div class="nx2-sub">' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + WD[d.getDay()] + '</div>'
            + '<div class="nx2-row" style="gap:8px"><span class="nx2-chip">' + I('fa-clock') + pad(h) + ':' + pad(d.getMinutes()) + '</span>'
            + (tp !== null ? '<span class="nx2-chip">' + I('fa-temperature-half') + E(city(st) || '当前位置') + ' ' + tp + '°</span>' : '')
            + '</div></div>'
            + (cond(st) ? '<div class="nx2-line"></div><span class="nx2-faint">' + E(cond(st)) + '</span>' : ''));
    };

    R.todayAgenda = function (s) {
        var t = tier(s), list = agenda(), d = new Date();
        var cur = d.getHours() * 60 + d.getMinutes();
        var sorted = list.slice().sort(function (a, b) { return agMin(a) - agMin(b); });
        var next = sorted.filter(function (x) { return agMin(x) > cur; })[0];
        if (!sorted.length) return W('todayAgenda', hd('fa-list-check', '今日日程', '')
            + emp('fa-calendar', '还没有安排', '在作息计划小组件里添加'));
        var n = t === 's' ? 1 : (t === 'bar' ? 1 : (t === 'm3' || t === 'l' ? 5 : 3));
        var rows = sorted.slice(0, n).map(function (x) {
            return '<div class="nx2-li"><span class="nx2-accent nx2-tab">' + E(cut(x.t || '', 5)) + '</span>'
                + '<span>' + E(cut(x.n || x.name || '', 16)) + '</span></div>';
        }).join('');
        return W('todayAgenda',
            hd('fa-list-check', '今日日程', next ? '下一项 ' + E(cut(next.t || '', 5)) : '今日已结束')
            + '<div class="nx2-list nx2-grow">' + rows + '</div>'
            + '<span class="nx2-faint">共 ' + sorted.length + ' 项 · 来自作息计划</span>');
    };

    R.quickNote = function (s) {
        var v = noteText();
        return W('quickNote',
            hd('fa-pen', '速记', '自动保存')
            + '<textarea class="nx2-input nx2-clamp3" ' + NO_DRAG
            + 'placeholder="随手写点什么…" oninput="N26W2Plus.saveNote(this.value)">' + E(v) + '</textarea>'
            + '<span class="nx2-faint">与便利贴共用同一份本地数据</span>');
    };

    /* ---------------- 注册：类型 / 面板 / 尺寸档 ---------------- */
    var TYPES = {
        timeSeconds: { title: '秒级时间', icon: 'fa-clock', cols: 3, rows: 2, color: '#1c6fae' },
        clockAnalog: { title: '模拟时钟', icon: 'fa-clock', cols: 2, rows: 2, color: '#b07a2a' },
        worldclock: { title: '世界时钟', icon: 'fa-earth-asia', cols: 4, rows: 2, color: '#167a94' },
        sunmoon: { title: '日月轨迹', icon: 'fa-sun', cols: 4, rows: 2, color: '#c26a34' },
        weekStrip: { title: '周历', icon: 'fa-calendar-week', cols: 4, rows: 2, color: '#2f6bc0' },
        moonphase: { title: '月相', icon: 'fa-moon', cols: 2, rows: 2, color: '#38bdf8' },
        bigDate: { title: '大字日期', icon: 'fa-calendar-day', cols: 2, rows: 2, color: '#b8503a' },
        dayProgress: { title: '今日进度', icon: 'fa-hourglass-half', cols: 4, rows: 2, color: '#218a68' },
        weatherHour: { title: '逐时天气', icon: 'fa-cloud-sun', cols: 4, rows: 2, color: '#1c6fae' },
        weatherWeek: { title: '七日天气', icon: 'fa-calendar', cols: 4, rows: 3, color: '#38bdf8' },
        airQuality: { title: '空气质量', icon: 'fa-wind', cols: 2, rows: 2, color: '#2b8a55' },
        sunrise: { title: '日出日落', icon: 'fa-sun', cols: 3, rows: 2, color: '#b1832c' },
        diskSpace: { title: '存储空间', icon: 'fa-hard-drive', cols: 2, rows: 2, color: '#46566e' },
        todoRing: { title: '完成率', icon: 'fa-list-check', cols: 2, rows: 2, color: '#2f6bc0' },
        dayCard: { title: '今日概览', icon: 'fa-sun', cols: 4, rows: 2, color: '#4a627f' },
        greeting: { title: '问候卡', icon: 'fa-hand-wave', cols: 4, rows: 2, color: '#38bdf8' },
        todayAgenda: { title: '今日日程', icon: 'fa-list-check', cols: 3, rows: 2, color: '#c26a34' },
        quickNote: { title: '速记', icon: 'fa-pen', cols: 2, rows: 3, color: '#a98a2e' }
    };
    var REG = {
        timeSeconds: { name: '秒级时间', icon: 'fa-clock', builtin: true, size: '3x2', desc: '带秒的大字时间 · 用户钦定 3×2' },
        clockAnalog: { name: '模拟时钟', icon: 'fa-clock', builtin: true, size: '2x2', desc: '真走针表盘 · 时/分/秒三针' },
        worldclock: { name: '世界时钟', icon: 'fa-earth-asia', builtin: true, size: '4x2', desc: '北京 / 东京 / 伦敦 / 纽约 / 悉尼' },
        sunmoon: { name: '日月轨迹', icon: 'fa-sun', builtin: true, size: '4x2', desc: '昼夜弧线 · 日出日落时刻' },
        weekStrip: { name: '周历', icon: 'fa-calendar-week', builtin: true, size: '4x2', desc: '整周 7 天 · 高亮今天' },
        moonphase: { name: '月相', icon: 'fa-moon', builtin: true, size: '2x2', desc: '朔望月推算 · 照亮比例与月龄' },
        bigDate: { name: '大字日期', icon: 'fa-calendar-day', builtin: true, size: '2x2', desc: '超大日号 · 星期与周数' },
        dayProgress: { name: '今日进度', icon: 'fa-hourglass-half', builtin: true, size: '4x2', desc: '今日已过 / 剩余百分比' },
        weatherHour: { name: '逐时天气', icon: 'fa-cloud-sun', builtin: true, size: '4x2', desc: '未来数小时 · 缺数据诚实占位' },
        weatherWeek: { name: '七日天气', icon: 'fa-calendar', builtin: true, size: '4x3', desc: '七日高低温 · 来自天气应用' },
        airQuality: { name: '空气质量', icon: 'fa-wind', builtin: true, size: '2x2', desc: 'AQI 与等级 · 无数据不编造' },
        sunrise: { name: '日出日落', icon: 'fa-sun', builtin: true, size: '3x2', desc: '按深圳纬度估算 · 应用数据优先' },
        diskSpace: { name: '存储空间', icon: 'fa-hard-drive', builtin: true, size: '2x2', desc: '浏览器存储配额实时估算' },
        todoRing: { name: '完成率', icon: 'fa-list-check', builtin: true, size: '2x2', desc: '待办完成环 · 下一项提示' },
        dayCard: { name: '今日概览', icon: 'fa-sun', builtin: true, size: '4x2', desc: '星期 / 周数 / 年内天数 / 剩余' },
        greeting: { name: '问候卡', icon: 'fa-hand-wave', builtin: true, size: '4x2', desc: '按时段问候 · 日期与实时气温' },
        todayAgenda: { name: '今日日程', icon: 'fa-list-check', builtin: true, size: '3x2', desc: '读作息计划 · 下一项高亮' },
        quickNote: { name: '速记', icon: 'fa-pen', builtin: true, size: '2x3', desc: '随手记 · 与便利贴同一份数据' }
    };
    var STD5 = [[2, 2], [3, 2], [4, 2], [4, 3], [6, 2]];
    var SPECS = {
        timeSeconds: { sizes: [[3, 2], [2, 2], [4, 2], [6, 2], [6, 1]] },  /* ★ 首档 3×2 */
        clockAnalog: { sizes: [[2, 2], [3, 3], [4, 3], [4, 4]] },
        worldclock: { sizes: [[4, 2], [3, 2], [4, 3], [6, 2]] },
        sunmoon: { sizes: [[4, 2], [2, 2], [6, 2], [6, 1]] },
        weekStrip: { sizes: [[4, 2], [3, 2], [6, 1], [4, 3]] },
        moonphase: { sizes: [[2, 2], [3, 2], [4, 3]] },
        bigDate: { sizes: [[2, 2], [3, 2], [4, 2], [4, 3]] },
        dayProgress: { sizes: [[4, 2], [2, 2], [4, 3], [6, 1]] },
        weatherHour: { sizes: [[4, 2], [3, 2], [6, 2], [4, 3]] },
        weatherWeek: { sizes: [[4, 3], [3, 2], [4, 2], [6, 3]] },
        airQuality: { sizes: STD5 },
        sunrise: { sizes: [[3, 2], [2, 2], [4, 2], [6, 1]] },
        diskSpace: { sizes: STD5 },
        todoRing: { sizes: STD5 },
        dayCard: { sizes: [[4, 2], [2, 2], [4, 3], [6, 2]] },
        greeting: { sizes: [[4, 2], [2, 2], [3, 2], [6, 1]] },
        todayAgenda: { sizes: [[3, 2], [2, 2], [4, 3], [6, 2]] },
        quickNote: { sizes: [[2, 3], [3, 2], [4, 3], [4, 4]] }
    };

    function register() {
        var dict = null, reg = null, specs = null, retired = null;
        try { dict = WIDGET_TYPES; } catch (e) { }
        try { reg = widgetRegistry; } catch (e) { }
        try { specs = N26_WIDGET_SPECS; } catch (e) { }
        try { retired = N26_RETIRED_WIDGETS; } catch (e) { }
        var ok = 0;
        Object.keys(TYPES).forEach(function (k) {
            if (dict) { dict[k] = TYPES[k]; ok++; }
            if (reg) reg[k] = REG[k];
            if (specs) specs[k] = SPECS[k];
            if (retired) {
                var i = retired.indexOf(k);
                if (i >= 0) retired.splice(i, 1);
            }
        });
        var W2 = window.N26W2 || (window.N26W2 = {});
        Object.keys(R).forEach(function (k) { W2[k] = R[k]; });
        return ok === Object.keys(TYPES).length;
    }

    /* ---------------- 全局交互入口 ---------------- */
    var API = {
        list: Object.keys(TYPES),
        renderers: Object.keys(R),
        refreshDisk: function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            readDisk();
        },
        saveNote: function (v) {
            try { if (typeof setUserLS === 'function') setUserLS('stickyNote', String(v || '')); } catch (e) { }
        },
        dayPhase: function () { return window.N26DayPhase ? window.N26DayPhase.get() : ''; }
    };
    window.N26W2Plus = API;

    register();
    readDisk();
    try { setTimeout(fillDisk, 900); } catch (e) { }

    /* 秒针：唯一一个 1s interval；没有秒组件时 querySelectorAll 直接返回空数组 */
    try {
        setInterval(function () {
            var els = document.querySelectorAll('[data-n26-sec]');
            if (!els.length) return;
            var v = pad(new Date().getSeconds());
            for (var i = 0; i < els.length; i++) if (els[i].textContent !== v) els[i].textContent = v;
        }, 1000);
    } catch (e) { }
})();
