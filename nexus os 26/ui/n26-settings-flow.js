/* ==========================================================================
   Nexus OS 26 · 设置面板流式重构控制器（v2.10.22 / 戳 sf1）
   --------------------------------------------------------------------------
   「加层不改层」：主壳只挂 link/script + 7 处最小接线，逻辑全在这里。
   三件事：
     ① 壁纸点一下就在下面展开（复用 n26-wg-* 同一套控件与 pick/paint 函数），
        撤掉重复的第二套缩略图网格；加「每日必应壁纸」「Wallpaper 壁纸」两张卡。
     ② 颜色二级页独立成页，给足预设 / 任意取色 / 实时预览。
     ③ Dock Bar 顶部模式融进导航栏，设置项改为「导航栏背景 / 边框」。

   ★ 大量复用同一控件：内联网格沿用 id="n26WgGrid" / id="n26WgSlideshow"，
     缩略图沿用 n26WgThumbHtml，点击沿用 n26WgPick / n26WgPaint / n26WgLazyThumbs，
     必应沿用 n26FetchBingDaily / n26ToggleBingDaily —— 不另造第二套。
   ★ 护盾：防重复初始化、每个宿主函数都判空、HTML 全部转义、reduced-motion
     降级、取色拖盘时只更 --primary 零重绘、松手才持久化、收起动画幂等。
   ========================================================================== */
(function (global) {
    'use strict';

    var doc = global.document;
    var VERSION = '1.0-v2.10.22';

    /* classic script 顶层 const（N26_WALLPAPERS / N26_THEME_INFO）不在 window 上，
       但仍在全局词法环境里 —— 用 Function 只读拿，不改主壳任何一行。 */
    function lex(name) {
        try { return Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : null')(); }
        catch (e) { return null; }
    }
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function readSettings() {
        var f = lex('getUserLS');
        try { return (f ? f('settings') : null) || {}; } catch (e) { return {}; }
    }
    function writeSettings(s) {
        var f = lex('setUserLS');
        try { if (f) f('settings', s); } catch (e) { }
    }
    function notify(title, msg, type) {
        var f = lex('showNotification');
        try { if (f) f(title, msg, type || 'info'); } catch (e) { }
    }
    function reduced() {
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }
    function raf(fn) {
        if (global.requestAnimationFrame) global.requestAnimationFrame(fn);
        else setTimeout(fn, 16);
    }

    /* ---------------- 壁纸库（单一数据源） ---------------- */
    var THEME_ALIAS_SKIP = { reserved1: 1, reserved2: 1 };
    function groups() {
        var W = lex('N26_WALLPAPERS') || {};
        var I = lex('N26_THEME_INFO') || {};
        var out = [];
        Object.keys(I).forEach(function (id) {
            if (THEME_ALIAS_SKIP[id]) return;
            var list = W[id] || [];
            if (list.length) out.push({ id: id, name: (I[id] && I[id].name) || id, list: list });
        });
        return out;
    }
    function flatAll() {
        var out = [];
        groups().forEach(function (g) {
            g.list.forEach(function (u, i) { out.push({ theme: g.id, idx: i, url: u, name: g.name }); });
        });
        return out;
    }
    function normTheme(id) {
        var f = lex('n26NormTheme');
        return f ? f(id) : id;
    }
    function currentPair() {
        var s = readSettings();
        return { theme: normTheme(s.theme), idx: Number(s.wallpaper) || 0 };
    }
    function applyWall(theme, idx) {
        var f = lex('n26WgApplyWallpaper');
        if (f) { try { f(theme, idx, true); return; } catch (e) { } }
        var s = readSettings();
        s.theme = theme; s.wallpaper = Number(idx) || 0;
        s.useCustomWallpaper = false; s.customWallpaper = '';
        s.useDynamicWallpaper = false; s.lockWallpaperMode = 'desktop';
        writeSettings(s);
        var fade = lex('switchWallpaperWithFade');
        var apply = lex('applyUserSettings');
        try { if (fade) fade(function () { if (apply) apply(); }); else if (apply) apply(); } catch (e) { }
        notify('壁纸已更换', '桌面与锁屏已同步', 'success');
    }

    /* ---------------- ① 内联壁纸网格 ---------------- */
    var state = { id: null, closing: false, flat: null };
    var closeTimer = null;

    function inlineHead(name, count, id) {
        return '<div class="n26-wg-inline-head">'
            + '<b>' + esc(name) + '</b>'
            + '<small>' + count + ' 张 · 单击立即设为壁纸</small>'
            + '<span class="n26-sf-spacer"></span>'
            + '<button type="button" onclick="N26SettingsFlow.wallClose()">收起</button>'
            + (id !== 'all'
                ? '<button type="button" onclick="N26SettingsFlow.openFullPage(\'' + esc(id) + '\')">多选 / 幻灯片</button>'
                : '')
            + '</div>';
    }
    function thumbFallback(id, url, i, active) {
        return '<button type="button" class="n26-wg-thumb' + (active === i ? ' is-active' : '')
            + '" data-i="' + i + '" onclick="N26SettingsFlow.pickGroup(\'' + esc(id) + '\',' + i + ',event)">'
            + '<span class="n26-wg-check"><i class="fas fa-check"></i></span>'
            + '<img src="' + esc(url) + '" alt="" decoding="async">'
            + '<span class="n26-wg-num">' + (i + 1) + '</span></button>';
    }
    function groupInlineHtml(id) {
        var W = lex('N26_WALLPAPERS') || {};
        var I = lex('N26_THEME_INFO') || {};
        var list = W[id] || [];
        var name = (I[id] && I[id].name) || id;
        var cur = currentPair();
        var active = (cur.theme === id) ? cur.idx : -1;
        var selSet = global._n26WgSel;
        if (!(selSet instanceof Set)) selSet = new Set(active >= 0 ? [active] : []);
        var thumb = lex('n26WgThumbHtml');
        var bar = lex('n26WgBarHtml');
        var thumbs = list.map(function (u, i) {
            var h = thumb ? thumb(id, u, i, active, selSet) : thumbFallback(id, u, i, active);
            /* 台阶 55ms，按首屏可见行封顶 min(i,10) —— 不是「一套内容放大缩小」 */
            return h.replace('class="n26-wg-thumb', 'style="animation-delay:' + (Math.min(i, 10) * 55) + 'ms" class="n26-wg-thumb');
        }).join('');
        return inlineHead(name, list.length, id)
            + '<div class="n26-wg-grid n26-wg-inline-grid" id="n26WgGrid">' + thumbs + '</div>'
            + '<div class="n26-wg-slide" id="n26WgSlideshow">' + (bar ? bar(id) : '') + '</div>';
    }
    function allInlineHtml() {
        var flat = flatAll();
        state.flat = flat;
        var cur = currentPair();
        var thumbs = flat.map(function (it, gi) {
            var on = it.theme === cur.theme && it.idx === cur.idx;
            return '<button type="button" class="n26-wg-thumb' + (on ? ' is-active' : '') + '"'
                + ' style="animation-delay:' + (Math.min(gi, 10) * 55) + 'ms"'
                + ' data-i="' + gi + '" onclick="N26SettingsFlow.pickAll(' + gi + ',event)"'
                + ' aria-label="' + esc(it.name) + ' 壁纸 ' + (it.idx + 1) + '">'
                + '<span class="n26-wg-group-tag">' + esc(it.name) + '</span>'
                + '<span class="n26-wg-check"><i class="fas fa-check"></i></span>'
                + '<span class="n26-wg-err"><i class="fas fa-triangle-exclamation"></i><b>加载失败</b></span>'
                + '<img data-src="' + esc(it.url) + '" alt="" decoding="async">'
                + '<span class="n26-wg-num">' + (gi + 1) + '</span></button>';
        }).join('');
        return inlineHead('Wallpaper 壁纸', flat.length, 'all')
            + '<div class="n26-wg-grid n26-wg-inline-grid n26-wg-inline-all" id="n26WgAllGrid">' + thumbs + '</div>';
    }
    function inlineHtml(id) { return id === 'all' ? allInlineHtml() : groupInlineHtml(id); }

    function lazyThumbs(host) {
        var f = lex('n26WgLazyThumbs');
        if (f) { try { f(host); return; } catch (e) { } }
        /* 兜底：没有主壳懒加载时，只给可视范围内的图赋 src，不解码整库 */
        try {
            var imgs = host.querySelectorAll('img[data-src]');
            for (var i = 0; i < imgs.length; i++) {
                if (i < 12) imgs[i].src = imgs[i].getAttribute('data-src');
            }
        } catch (e) { }
    }
    function paintCards(id) {
        try {
            var cards = doc.querySelectorAll('.theme-card[data-n26-wg-id]');
            for (var i = 0; i < cards.length; i++) {
                cards[i].classList.toggle('n26-sf-open', cards[i].getAttribute('data-n26-wg-id') === id);
            }
        } catch (e) { }
    }
    function wallInline(id) {
        var host = doc.getElementById('n26WgInlineHost');
        if (!host) {
            /* 护盾：设置页还没渲染到那块时，退回原来的三级页，绝不静默失效 */
            var f = lex('n26PzOpenWallGroup');
            if (f && id !== 'all') { try { f(id); } catch (e) { } }
            return;
        }
        if (state.id === id && !state.closing) { wallClose(); return; }
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        state.id = id; state.closing = false;
        host.innerHTML = '<div class="n26-wg-inline" id="n26WgInlineBox">' + inlineHtml(id) + '</div>';
        lazyThumbs(host);
        paintCards(id);
    }
    function wallClose() {
        var host = doc.getElementById('n26WgInlineHost');
        var box = doc.getElementById('n26WgInlineBox');
        if (state.closing) return;
        state.closing = true;
        if (box) box.classList.add('is-closing');
        var done = function () {
            if (host) host.innerHTML = '';
            state.id = null; state.closing = false; state.flat = null;
            closeTimer = null;
            paintCards('');
        };
        if (reduced() || !box) { done(); return; }
        closeTimer = setTimeout(done, 280);
    }
    function openFullPage(id) {
        var f = lex('n26PzOpenWallGroup');
        if (f) { try { wallClose(); f(id); } catch (e) { } }
    }
    function restoreInline() {
        if (!state.id || state.closing) return;
        var host = doc.getElementById('n26WgInlineHost');
        if (!host) return;
        host.innerHTML = '<div class="n26-wg-inline" id="n26WgInlineBox">' + inlineHtml(state.id) + '</div>';
        lazyThumbs(host);
        paintCards(state.id);
    }
    function pickGroup(id, idx, ev) {
        /* 主壳存在就完全复用它（含 Ctrl 多选 / Shift 连选 / 幻灯片） */
        var f = lex('n26WgPick');
        if (f) { try { f(id, idx, ev || {}); return; } catch (e) { } }
        applyWall(id, idx);
    }
    function pickAll(gi, ev) {
        var flat = state.flat || flatAll();
        var it = flat[gi];
        if (!it || (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey))) return;
        applyWall(it.theme, it.idx);
        /* 只改 class，绝不重建 DOM —— 点一下不闪、不重播台阶动画 */
        try {
            var grid = doc.getElementById('n26WgAllGrid');
            if (!grid) return;
            var th = grid.querySelectorAll('.n26-wg-thumb');
            for (var i = 0; i < th.length; i++) th[i].classList.toggle('is-active', i === gi);
        } catch (e) { }
    }

    /* ---------------- ② 两张特殊卡 + 必应本地兜底 ---------------- */
    function bingOn() { return !!readSettings().bingDailyWallpaper; }
    function specialCards() {
        var on = bingOn();
        return '<div class="theme-card n26-wp-special n26-wp-bing' + (on ? ' active' : '') + '"'
            + ' data-n26-wg-id="bing" onclick="N26SettingsFlow.toggleBing()" role="button" tabindex="0">'
            + '<div class="theme-preview">'
            + '<i class="fas fa-globe-asia n26-wp-special-ico"></i>'
            + '<span class="n26-wp-special-txt">每日必应壁纸</span>'
            + '<span class="n26-wp-special-sub">' + (on ? '已开启 · 每天自动换' : '点一下开启') + '</span>'
            + '</div><div class="theme-name">每日必应壁纸'
            + '<span class="n26-wp-bing-state">' + (on ? '开' : '关') + '</span>'
            + '<i class="fas fa-bolt" style="font-size:9px;opacity:.45;margin-left:2px;"></i></div></div>'
            + '<div class="theme-card n26-wp-special n26-wp-all"'
            + ' data-n26-wg-id="all" onclick="N26SettingsFlow.wallInline(\'all\')" role="button" tabindex="0">'
            + '<div class="theme-preview">'
            + '<i class="fas fa-images n26-wp-special-ico"></i>'
            + '<span class="n26-wp-special-txt">Wallpaper 壁纸</span>'
            + '<span class="n26-wp-special-sub">全部内置素材 · 一次看全</span>'
            + '</div><div class="theme-name">Wallpaper 壁纸'
            + '<i class="fas fa-chevron-down" style="font-size:9px;opacity:.45;margin-left:2px;"></i></div></div>';
    }
    function refreshBing() {
        var on = bingOn();
        try {
            var cards = doc.querySelectorAll('.theme-card.n26-wp-bing');
            for (var i = 0; i < cards.length; i++) {
                cards[i].classList.toggle('active', on);
                var sub = cards[i].querySelector('.n26-wp-special-sub');
                if (sub) sub.textContent = on ? '已开启 · 每天自动换' : '点一下开启';
                var st = cards[i].querySelector('.n26-wp-bing-state');
                if (st) st.textContent = on ? '开' : '关';
            }
            var sw = doc.querySelectorAll('.n26-bing-row .toggle-switch');
            for (var k = 0; k < sw.length; k++) sw[k].classList.toggle('active', on);
        } catch (e) { }
    }
    function localDaily() {
        /* 云端 Worker 未部署时不能让这张卡点了没反应 —— 降级成「本地每日精选」：
           按天从 Wallpaper 库里挑一张，不写 bingDailyUrl，applyUserSettings 就仍走内置主题。 */
        var flat = flatAll();
        if (!flat.length) { notify('每日壁纸', '内置壁纸库为空', 'warning'); return; }
        var pick = flat[Math.floor(Date.now() / 86400000) % flat.length];
        var s = readSettings();
        s.bingDailyWallpaper = true;
        s.bingDailyLocal = true;
        s.bingDailyUrl = '';
        s.bingDailyTitle = '本地每日精选';
        s.theme = pick.theme; s.wallpaper = pick.idx;
        s.useCustomWallpaper = false; s.customWallpaper = '';
        s.useDynamicWallpaper = false; s.lockWallpaperMode = 'desktop';
        writeSettings(s);
        var fade = lex('switchWallpaperWithFade');
        var apply = lex('applyUserSettings');
        try { if (fade) fade(function () { if (apply) apply(); }); else if (apply) apply(); } catch (e) { }
        notify('每日壁纸已开启', '云端服务还没部署，先用 Wallpaper 本地每日精选（每天自动换一张）', 'info');
        refreshBing();
    }
    function toggleBing() {
        if (bingOn()) {
            var off = lex('n26ToggleBingDaily');
            if (off) { try { off(); } catch (e) { } }
            else {
                var s0 = readSettings(); s0.bingDailyWallpaper = false; s0.bingDailyUrl = '';
                writeSettings(s0); var ap0 = lex('applyUserSettings'); if (ap0) { try { ap0(); } catch (e) { } }
            }
            refreshBing();
            return;
        }
        var fetchBing = lex('n26FetchBingDaily');
        if (!fetchBing) { localDaily(); return; }
        try {
            var p = fetchBing(false);
            if (!p || typeof p.then !== 'function') { localDaily(); return; }
            p.then(function (d) {
                if (d && d.ok && d.url) {
                    var st = readSettings();
                    st.bingDailyWallpaper = true;
                    st.bingDailyLocal = false;
                    st.bingDailyUrl = d.url;
                    st.bingDailyTitle = d.title || '';
                    writeSettings(st);
                    var ap = lex('applyUserSettings'); if (ap) { try { ap(); } catch (e) { } }
                    notify('必应每日壁纸已开启', d.title || '每天自动换一张', 'success');
                    refreshBing();
                } else { localDaily(); }
            }).catch(function () { localDaily(); });
        } catch (e) { localDaily(); }
    }

    /* ---------------- ③ 颜色二级页 ---------------- */
    /* id 沿用主壳认识的名字，渲染一律蓝色系（★ 全面禁紫，第三档渲染 #38bdf8） */
    var ACCENTS = [
        { id: 'blue',   name: '晴空蓝', hex: '#4A9BF5' },
        { id: 'green',  name: '薄荷绿', hex: '#34D399' },
        { id: 'purple', name: '天青',   hex: '#38bdf8' },
        { id: 'orange', name: '暖橙',   hex: '#FB923C' },
        { id: 'pink',   name: '樱粉',   hex: '#F472B6' }
    ];
    function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
    function colorPage() {
        var head = lex('n26PzHead');
        var cur = readSettings().accentColor || 'blue';
        var sw = ACCENTS.map(function (a, i) {
            var on = cur === a.id || (isHex(cur) && cur.toLowerCase() === a.hex.toLowerCase());
            return '<div class="n26-sf-swatch' + (on ? ' is-on' : '') + '"'
                + ' style="animation-delay:' + (Math.min(i, 10) * 55) + 'ms"'
                + ' onclick="N26SettingsFlow.setAccent(\'' + a.id + '\')" role="button" tabindex="0">'
                + '<span class="n26-sf-dot" style="background:' + a.hex + '"></span>'
                + '<b>' + a.name + '</b></div>';
        }).join('');
        var custom = isHex(cur) ? cur : '#4A9BF5';
        return (head ? head('color') : '')
            + '<h3 class="n26-pz-h3">颜色</h3>'
            + '<div class="settings-section" data-pz-sec="color">'
            + '<h4>系统强调色 <small>按钮 / 选中态 / 进度条 / 链接，全系统共用这一个值</small></h4>'
            + '<div class="n26-sf-color-grid">' + sw + '</div>'
            + '<div class="n26-sf-custom">'
            + '<span style="font-size:11.5px;opacity:.7;">自定义</span>'
            + '<input type="color" id="n26SfHexPicker" value="' + esc(custom) + '" aria-label="自定义强调色"'
            + ' oninput="N26SettingsFlow.previewAccent(this.value)" onchange="N26SettingsFlow.commitAccent(this.value)">'
            + '<input type="text" id="n26SfHexText" value="' + esc(custom) + '" maxlength="7" spellcheck="false"'
            + ' aria-label="强调色十六进制值" onchange="N26SettingsFlow.commitAccent(this.value)">'
            + '<button class="n26-sf-chip" onclick="N26SettingsFlow.setAccent(\'blue\')">恢复默认</button>'
            + '</div>'
            + '</div>'
            + '<div class="settings-section" data-pz-sec="color">'
            + '<h4>实时预览 <small>拖色盘时只改颜色，不重绘页面 —— 及时响应、不闪一下</small></h4>'
            + '<div class="n26-sf-preview">'
            + '<button class="n26-sf-pbtn" type="button">强调按钮</button>'
            + '<button class="n26-sf-pbtn ghost" type="button">次要按钮</button>'
            + '<span class="n26-sf-pswitch" aria-hidden="true"></span>'
            + '<span class="n26-sf-pbar"><i></i></span>'
            + '<span class="n26-sf-pchip">选中项</span>'
            + '</div>'
            + '<div class="n26-pz-cat-note" style="margin-top:10px;">颜色写进 <code>--primary</code>，'
            + '主壳、Dock、窗口标题栏、第一方应用与第三方应用读的是同一个变量。</div>'
            + '</div>';
    }
    function previewAccent(hex) {
        if (!isHex(hex)) return;
        /* 拖盘高频路径：只写 CSS 变量 + 两个输入框的值，零重绘、零布局读、零通知 */
        try { doc.documentElement.style.setProperty('--primary', hex); } catch (e) { }
        try {
            var picker = doc.getElementById('n26SfHexPicker');
            var text = doc.getElementById('n26SfHexText');
            if (picker && picker.value.toLowerCase() !== hex.toLowerCase()) picker.value = hex;
            if (text && text.value.toLowerCase() !== hex.toLowerCase()) text.value = hex;
            var sw = doc.querySelectorAll('.n26-sf-swatch');
            for (var i = 0; i < sw.length; i++) {
                var dot = sw[i].querySelector('.n26-sf-dot');
                sw[i].classList.toggle('is-on', !!(dot && dot.style.background && hexToRgb(hex) === rgbOf(dot.style.background)));
            }
        } catch (e) { }
    }
    function hexToRgb(hex) {
        var n = parseInt(String(hex).slice(1), 16);
        return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    }
    function rgbOf(v) {
        var m = String(v).match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        return m ? (m[1] + ',' + m[2] + ',' + m[3]) : '';
    }
    function setAccent(color) {
        var ok = isHex(color) || ACCENTS.some(function (a) { return a.id === color; });
        if (!ok) return;
        var f = lex('setAccentColor');
        if (f) { try { f(color); return; } catch (e) { } }
        var s = readSettings(); s.accentColor = color; writeSettings(s);
        var ap = lex('applyUserSettings'); if (ap) { try { ap(); } catch (e) { } }
        var rr = lex('renderSettingsPanel'); if (rr) { try { rr(); } catch (e) { } }
    }
    function commitAccent(hex) { if (isHex(hex)) setAccent(hex); }

    /* ---------------- ④ Dock Bar 导航栏背景 / 边框 ---------------- */
    var NAV_BG = [
        { id: 'merge',  name: '跟随顶栏' },
        { id: 'frost',  name: '磨砂' },
        { id: 'mica',   name: '云母实色' },
        { id: 'liquid', name: '液态玻璃' }
    ];
    var NAV_BORDER = [
        { id: 'none',     name: '无' },
        { id: 'hairline', name: '细线' },
        { id: 'glow',     name: '内高光' }
    ];
    function valid(v, list, dflt) {
        for (var i = 0; i < list.length; i++) if (list[i].id === v) return v;
        return dflt;
    }
    function applyNavStyle() {
        var s = readSettings();
        var bg = valid(s.dockBarNavBg, NAV_BG, 'merge');
        var bd = valid(s.dockBarNavBorder, NAV_BORDER, 'none');
        var dark = !!(doc.body && doc.body.classList.contains('dark-mode'));
        var B = {
            merge:  { bg: 'transparent',              blur: 'none',                       shadow: 'none', fg: 'inherit', pv: dark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.12)' },
            frost:  { bg: dark ? 'rgba(18,22,34,.42)' : 'rgba(255,255,255,.18)', blur: 'blur(18px) saturate(1.4)', shadow: '0 8px 24px rgba(0,0,0,.14)', fg: 'inherit', pv: dark ? 'rgba(18,22,34,.50)' : 'rgba(255,255,255,.26)' },
            mica:   { bg: dark ? 'rgba(20,24,36,.92)' : 'rgba(246,248,252,.88)', blur: 'blur(10px)', shadow: '0 8px 24px rgba(0,0,0,.14)', fg: dark ? '#ffffff' : '#16202e', pv: dark ? 'rgba(20,24,36,.92)' : 'rgba(246,248,252,.90)' },
            liquid: { bg: dark ? 'rgba(18,22,34,.34)' : 'rgba(255,255,255,.12)', blur: 'blur(30px) saturate(2.1)', shadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 12px 32px rgba(0,0,0,.18)', fg: 'inherit', pv: dark ? 'rgba(18,22,34,.40)' : 'rgba(255,255,255,.16)' }
        }[bg];
        var border;
        if (bd === 'none') border = '0 none';
        else if (bd === 'hairline') border = '1px solid ' + (dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.30)');
        else border = '1px solid ' + (dark ? 'rgba(255,255,255,.34)' : 'rgba(255,255,255,.58)');
        var shadow = B.shadow;
        if (bd === 'glow' && shadow !== 'none') shadow += ', inset 0 1px 0 rgba(255,255,255,.55)';
        else if (bd === 'glow') shadow = 'inset 0 1px 0 rgba(255,255,255,.55)';
        try {
            var root = doc.documentElement;
            root.style.setProperty('--n26-nav-bg', B.bg);
            root.style.setProperty('--n26-nav-blur', B.blur);
            root.style.setProperty('--n26-nav-border', border);
            root.style.setProperty('--n26-nav-shadow', shadow);
            root.style.setProperty('--n26-nav-fg', B.fg);
            root.style.setProperty('--n26-nav-preview-bg', B.pv);
            if (doc.body) doc.body.classList.toggle('n26-db-nav-merge', bg === 'merge');
        } catch (e) { }
    }
    function chips(list, cur, fn) {
        return list.map(function (x) {
            return '<button class="n26-sf-chip' + (x.id === cur ? ' is-on' : '') + '"'
                + ' onclick="N26SettingsFlow.' + fn + '(\'' + x.id + '\')">' + esc(x.name) + '</button>';
        }).join('');
    }
    function renderNavRows() {
        var s = readSettings();
        var bg = valid(s.dockBarNavBg, NAV_BG, 'merge');
        var bd = valid(s.dockBarNavBorder, NAV_BORDER, 'none');
        var r1 = doc.getElementById('dockBarNavBgRow');
        var r2 = doc.getElementById('dockBarNavBorderRow');
        if (r1) r1.innerHTML = chips(NAV_BG, bg, 'setNavBg');
        if (r2) r2.innerHTML = chips(NAV_BORDER, bd, 'setNavBorder');
    }
    function setNav(key, val, label) {
        var s = readSettings();
        s[key] = val;
        writeSettings(s);
        applyNavStyle();
        renderNavRows();
        notify('Dock Bar', label, 'success');
    }
    function setNavBg(v) {
        v = valid(v, NAV_BG, 'merge');
        var n = NAV_BG.filter(function (x) { return x.id === v; })[0];
        setNav('dockBarNavBg', v, '导航栏背景：' + (n ? n.name : v));
    }
    function setNavBorder(v) {
        v = valid(v, NAV_BORDER, 'none');
        var n = NAV_BORDER.filter(function (x) { return x.id === v; })[0];
        setNav('dockBarNavBorder', v, '导航栏边框：' + (n ? n.name : v));
    }

    /* ---------------- 渲染后钩子（合帧、防重入） ---------------- */
    var pending = false;
    function afterRender(cat) {
        if (pending) return;
        pending = true;
        raf(function () {
            pending = false;
            try { applyNavStyle(); } catch (e) { }
            try { renderNavRows(); } catch (e) { }
            try { refreshBing(); } catch (e) { }
            /* 宿主挂在主题卡那一节，外观页 / 壁纸页都会显示；只要宿主在就恢复，
               不按 cat 硬判 —— 否则从外观页切走再回来内联态会丢。 */
            try { restoreInline(); } catch (e) { }
        });
    }

    /* ---------------- 启动护盾 ---------------- */
    function boot() {
        if (global.__N26_SF_BOOTED__) return;
        global.__N26_SF_BOOTED__ = true;
        try { applyNavStyle(); } catch (e) { }
        /* 位置切换 / 深浅色切换后立刻重算令牌，不让旧值留一帧 */
        var origPos = global.applyDockBarPos;
        if (typeof origPos === 'function') {
            global.applyDockBarPos = function () {
                var r = origPos.apply(this, arguments);
                try { applyNavStyle(); } catch (e) { }
                return r;
            };
        }
        var origApply = global.applyUserSettings;
        if (typeof origApply === 'function') {
            global.applyUserSettings = function () {
                var r = origApply.apply(this, arguments);
                try { applyNavStyle(); } catch (e) { }
                return r;
            };
        }
        /* 幻灯片那一组按钮复用的是三级页函数，内联态下它不知道要重绘这块 bar ——
           包一层，操作完顺手重画一次，避免「点了但按钮状态没变」。
           ★ id 只认 state.id：n26WgSetInterval 的首参是间隔秒数、Stop 根本没有参数，
           拿 arguments[0] 当主题 id 会把 bar 画坏。n26WgPick 不包，主壳自己会 paint。 */
        function repaintInlineBar() {
            try {
                var bar = doc.getElementById('n26WgSlideshow');
                var barFn = lex('n26WgBarHtml');
                var id = state.id;
                if (bar && barFn && id && id !== 'all') bar.innerHTML = barFn(id);
            } catch (e) { }
        }
        ['n26WgStartSlideshow', 'n26WgStopSlideshow', 'n26WgSetInterval'].forEach(function (name) {
            var f = global[name];
            if (typeof f !== 'function') return;
            global[name] = function () {
                var r = f.apply(this, arguments);
                repaintInlineBar();
                return r;
            };
        });
        if (doc.addEventListener) {
            doc.addEventListener('n26:settings-render', function () { try { afterRender('wallpaper'); } catch (e) { } }, false);
        }
        setTimeout(function () { try { applyNavStyle(); } catch (e) { } }, 0);
        if (doc.readyState === 'loading' && doc.addEventListener) {
            doc.addEventListener('DOMContentLoaded', function () { try { applyNavStyle(); } catch (e) { } }, { once: true });
        }
    }

    var API = {
        version: VERSION,
        /* 壁纸 */
        wallInline: wallInline,
        wallClose: wallClose,
        openFullPage: openFullPage,
        specialCards: specialCards,
        toggleBing: toggleBing,
        pickAll: pickAll,
        pickGroup: pickGroup,
        /* 颜色 */
        colorPage: colorPage,
        setAccent: setAccent,
        previewAccent: previewAccent,
        commitAccent: commitAccent,
        /* 导航栏 */
        setNavBg: setNavBg,
        setNavBorder: setNavBorder,
        applyNavStyle: applyNavStyle,
        renderNavRows: renderNavRows,
        /* 通用 */
        afterRender: afterRender,
        refreshBing: refreshBing,
        boot: boot
    };
    global.N26SettingsFlow = API;
    try { boot(); } catch (e) { }
})(typeof window !== 'undefined' ? window : this);
