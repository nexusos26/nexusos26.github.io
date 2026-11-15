/* ==========================================================================
   FangLux 方曜 · 局部光传输引擎 / 运行时 · 戳 flx2 · 2026-11-14
   --------------------------------------------------------------------------
   模型：玻璃 = 发光体；光从玻璃边缘出来，单跳溢出到邻近的软件 / 控件，
   只照亮「朝向光源的那一侧、靠近光源的那一小段」，不整圈描边。

   强度 = 距离平方衰减 × 迎光重叠（法线余弦近似）× 昼夜系数。
   亮段长度与亮段中心分别由 --flx-span / --flx-shift 交给视觉层。
   多光源只取最强的那一个，受光件不再二次发光 —— 无自激回路。

   ★ 性能纪律（v2.10.26 / v2.10.39 P0 教训）：
     · 只在宿主 document 跑，绝不注入 31 个 iframe；
     · 零 MutationObserver、零 rAF 循环、零常驻定时器、零逐帧；
     · 几何在一次纯读阶段批量读完（rect / computedStyle），之后才批量写；
     · 子层 absolute inset:0，写 CSS 变量与插入子层都不改父节点几何，
       写完不会反向触发重新计算；
     · 启动延后 420ms，避开设置面板重建与玻璃滑行动画 0~360ms；
     · 每个候选上限 14 个发光体 / 28 个受光件，resize 180ms 防抖并合并。

   挂法：主壳只加一个 <link> + 一个 <script>（都在尾部），业务逻辑零改动。
   ========================================================================== */
(function (global) {
    'use strict';

    var BRAND = 'FangLux 方曜';
    var FULL = 'FangLux 方曜 · 局部光传输引擎';
    if (global.FangLux) return;

    var doc = global.document;
    var RADIUS = 190;
    var MAX_EMIT = 14;
    var MAX_RECV = 28;
    var START_DELAY = 420;

    /* flx2 · 11-14：小组件卡 / 预览卡**不是发光体**，是受光件。
       把 47 张桌面卡与预览卡也当导光板，等于每张卡再叠四边白渐变 + 整面白晕，
       在明亮壁纸上就是用户截图里那句「又变成一片惨白」。光源只留大块玻璃
       （Dock / 侧栏 / 抽屉本体 .widget-panel / 窗口），小卡只吃迎光侧那一小段亮边。
       注意光源用 .widget-panel 而不是 #widgetPanel：后者是 inset:0 的全屏遮罩，
       拿它当发光体等于给整个视口叠四边白渐变，又是一次全屏泛白。 */
    var EMIT_SEL = '#dock, #dockBar, #finder-bar, .n26-dng, .n26ui-glass, ' +
        '.n26ui-sidebar, .n26-go-host, .widget-panel, ' +
        '.settings-panel, .window, .n26-pz-demo-win';
    var RECV_SEL = '.desktop-widget-card, .widget-panel-card, .dock-item, ' +
        '.desktop-icon, .window, .settings-row, .glass-btn, .mat-card, ' +
        '.n26-pz-demo-win, .n26-pz-demo-chip';

    var busy = false;
    var timer = 0;
    var stat = { runs: 0, emitters: 0, receivers: 0, lit: 0, lastError: '' };

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    function rectOf(n) {
        try {
            var r = n.getBoundingClientRect();
            if (!r || r.width < 8 || r.height < 8) return null;
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
                width: r.width, height: r.height };
        } catch (e) { return null; }
    }

    function isVisible(n) {
        try {
            var s = global.getComputedStyle(n);
            if (!s) return false;
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            var o = parseFloat(s.opacity);
            return !(isFinite(o) && o < 0.05);
        } catch (e) { return true; }
    }

    /* 纯读阶段：一次性把几何 / position / 可见性全部读进普通对象，
       后面所有计算与写入都不再碰 getBoundingClientRect / getComputedStyle。 */
    function read(sel, max) {
        var out = [], nodes;
        try { nodes = doc.querySelectorAll(sel); } catch (e) { return out; }
        for (var i = 0; i < nodes.length && out.length < max; i++) {
            var n = nodes[i];
            if (!n || n.nodeType !== 1 || !isVisible(n)) continue;
            var r = rectOf(n);
            if (!r) continue;
            var pos = 'static';
            try { pos = global.getComputedStyle(n).position || 'static'; } catch (e2) { }
            out.push({ node: n, r: r, pos: pos });
        }
        return out;
    }

    /* 两矩形边缘间距（含对角），不是中心距 —— 光走的是表面到表面的距离。 */
    function gap(a, b) {
        var dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
        var dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
        return Math.sqrt(dx * dx + dy * dy);
    }

    function layerOf(n, cls) {
        try {
            var kids = n.children;
            for (var i = 0; i < kids.length; i++) {
                if (kids[i].className && String(kids[i].className).indexOf(cls) >= 0) return kids[i];
            }
        } catch (e) { }
        return null;
    }

    function ensureLayer(n, cls) {
        var l = layerOf(n, cls);
        if (l) return l;
        try {
            l = doc.createElement('div');
            l.className = cls;
            l.setAttribute('aria-hidden', 'true');
            n.appendChild(l);
        } catch (e) { return null; }
        return l;
    }

    function daytimeFactor() {
        try {
            var night = doc.documentElement && doc.documentElement.getAttribute('data-n26-phase') === 'night';
            var dark = doc.body && doc.body.classList && doc.body.classList.contains('dark-mode');
            return (night || dark) ? 1 : 0.78;
        } catch (e) { return 0.85; }
    }

    function solve(emits, recvs, dayK) {
        var result = new Array(recvs.length), i, j;
        for (i = 0; i < recvs.length; i++) result[i] = null;

        for (i = 0; i < recvs.length; i++) {
            var rv = recvs[i], best = null;
            for (j = 0; j < emits.length; j++) {
                var em = emits[j];
                if (em.node === rv.node) continue;
                /* 面板包含自身控件时不算「邻近两个软件」，否则会整片发亮。 */
                try {
                    if (em.node.contains(rv.node) || rv.node.contains(em.node)) continue;
                } catch (e) { }

                var d = gap(em.r, rv.r);
                if (d > RADIUS) continue;
                var k = 1 - d / RADIUS;
                if (k <= 0) continue;

                var ecx = (em.r.left + em.r.right) / 2, ecy = (em.r.top + em.r.bottom) / 2;
                var rcx = (rv.r.left + rv.r.right) / 2, rcy = (rv.r.top + rv.r.bottom) / 2;
                var dx = ecx - rcx, dy = ecy - rcy;
                var side = (Math.abs(dx) >= Math.abs(dy))
                    ? (dx < 0 ? 'left' : 'right')
                    : (dy < 0 ? 'top' : 'bottom');

                /* 迎光重叠：光源在该边的法线方向上与受光件重合多少。 */
                var ov;
                if (side === 'left' || side === 'right') {
                    ov = Math.max(0, Math.min(em.r.bottom, rv.r.bottom) - Math.max(em.r.top, rv.r.top));
                    ov /= Math.max(1, Math.min(em.r.height, rv.r.height));
                } else {
                    ov = Math.max(0, Math.min(em.r.right, rv.r.right) - Math.max(em.r.left, rv.r.left));
                    ov /= Math.max(1, Math.min(em.r.width, rv.r.width));
                }
                ov = clamp(ov, 0, 1);
                var inten = k * k * (0.32 + 0.68 * ov) * dayK;
                if (inten < 0.035) continue;
                inten = clamp(inten, 0, 1);

                if (!best || inten > best.i) {
                    var span = 26 + 24 * inten;
                    var proj = (side === 'left' || side === 'right')
                        ? (ecy - rv.r.top) / Math.max(1, rv.r.height)
                        : (ecx - rv.r.left) / Math.max(1, rv.r.width);
                    var shift = clamp(proj, 0, 1) * (100 - span);
                    best = { i: inten, side: side, span: span, shift: clamp(shift, 0, 100 - span) };
                }
            }
            result[i] = best;
        }
        return result;
    }

    /* 一次 relight = 读阶段 → 纯计算 → 写阶段。写阶段不读任何布局。 */
    function relight() {
        if (busy) return;
        busy = true;
        try {
            var emits = read(EMIT_SEL, MAX_EMIT);
            var recvs = read(RECV_SEL, MAX_RECV);
            var solved = solve(emits, recvs, daytimeFactor());
            var i, l;

            for (i = 0; i < emits.length; i++) {
                if (emits[i].pos === 'static') {
                    try { emits[i].node.style.position = 'relative'; } catch (e) { }
                }
                ensureLayer(emits[i].node, 'flx-emitter');
            }
            var lit = 0;
            for (i = 0; i < recvs.length; i++) {
                var s = solved[i];
                if (!s) {
                    l = layerOf(recvs[i].node, 'flx-receiver');
                    if (l) { try { l.style.setProperty('--flx-i', '0'); } catch (e) { } }
                    continue;
                }
                if (recvs[i].pos === 'static') {
                    try { recvs[i].node.style.position = 'relative'; } catch (e) { }
                }
                l = ensureLayer(recvs[i].node, 'flx-receiver');
                if (!l) continue;
                try {
                    l.setAttribute('data-flx-side', s.side);
                    l.style.setProperty('--flx-i', s.i.toFixed(3));
                    l.style.setProperty('--flx-span', s.span.toFixed(1) + '%');
                    l.style.setProperty('--flx-shift', s.shift.toFixed(1) + '%');
                    lit++;
                } catch (e) { }
            }
            stat.runs++;
            stat.emitters = emits.length;
            stat.receivers = recvs.length;
            stat.lit = lit;
        } catch (e) {
            stat.lastError = String(e && e.message || e || '');
        } finally {
            busy = false;
        }
    }

    /* 合并调度：多个来源同时请求重算只跑一次。 */
    function schedule(delay) {
        if (timer) return;
        timer = global.setTimeout(function () {
            timer = 0;
            relight();
        }, delay || 240);
    }

    /* 桌面小组件重绘 / 选择面板重排之后补一次光，包装层保留原返回值与异常。 */
    function hook(name) {
        var orig;
        try { orig = global[name]; } catch (e) { return; }
        if (typeof orig !== 'function') return;
        try {
            global[name] = function () {
                var r;
                try { r = orig.apply(this, arguments); }
                catch (e) { schedule(380); throw e; }
                schedule(380);
                return r;
            };
        } catch (e) { }
    }

    function boot() {
        try {
            hook('renderDesktopWidgets');
            hook('renderWidgetPanelGrid');
            schedule(START_DELAY);
            try {
                global.addEventListener('resize', function () { schedule(180); }, { passive: true });
            } catch (e) {
                global.addEventListener('resize', function () { schedule(180); });
            }
        } catch (e) { stat.lastError = String(e && e.message || e || ''); }
    }

    global.FangLux = {
        brand: BRAND,
        full: FULL,
        version: 'flx2',
        relight: relight,
        schedule: schedule,
        stats: function () {
            return { runs: stat.runs, emitters: stat.emitters, receivers: stat.receivers,
                lit: stat.lit, lastError: stat.lastError };
        }
    };

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})(window);
