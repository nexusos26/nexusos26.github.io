/* ==========================================================================
   Nexus OS 26 · 液态玻璃光学层控制器（v2.10.23 / v2.10.35 批量读修订 / 戳 go4）
   --------------------------------------------------------------------------
   「加层不改层」：不碰 n26-docknav.js 的逐帧 paint()，靠观察它自己挂/摘的
   状态类（.n26-dng-on / .travel / .n26-sw-busy）来驱动三段动效，零冲突。

   五件事：
     ① 给每个玻璃面注入对角彩虹层（右上 + 左下），消费 --n26-disp。
     ② 全局按下光源：覆盖全视口的 screen 混合层，从指针按点发亮，
        按住保持、松手淡出 —— 真正提亮下层所有控件与元素。
     ③ 玻璃按下展开 / 移动前片先到后片慢到 / 松手原地收拢成普通背景。
     ④ 折射引擎兜底：iframe 里缺 n26LgAttach 就动态补挂 n26-lg-core.js，
        并给 .n26ui-glass（音乐 / 地图侧栏，以前完全没折射）挂上真引擎。
     ⑤ 开放 window.N26GlassOptics 给第三方。

   ★ 护盾：防重复初始化、每步判空、reduced-motion 全降级、单实例光源、
     rAF 合帧、pointercancel / blur / visibilitychange 全清理、MutationObserver
     防抖、几何只在状态切换那一瞬读一次（高频 pointermove 只读 clientX/Y）。

   ★★ v2.10.35 P0（主线程「此页面没有响应」根治 · 第三处）
     旧 scan() 对 N 个玻璃面循环调用 decorate()，而 decorate() 内部是
     「getComputedStyle 读一次 → 写 style.position → 插 3 个子节点」：
     读-写-读-写交替 N 轮 = N 次全文档 style recalc，且它恰好在设置面板
     整块 innerHTML 重建后的 120ms 触发。本版把 position 读取集中成一批
     （所有读在任何写之前完成），随后再统一写，N 次结算压成 1 次。
     彩虹层 / 前后片 / 折射 / 亮光 / 三段动效一条未删。
   ========================================================================== */
(function (global) {
    'use strict';
    var doc = global.document;
    var VERSION = '1.1-v2.10.35';
    if (global.__N26_GO_BOOTED__) return;
    global.__N26_GO_BOOTED__ = true;

    /* 真实玻璃面。不给 #dock / #dockBar 注入子层 —— 它们内部有图标与命中测试，
       只在下方「光源」和「彩虹」的宿主白名单里出现，避免压住 Dock 交互。 */
    var GLASS_SEL = '.n26-dng, .n26ui-glass, .n26-sw-blob, .n26-lg-ctrl, #n26PzDemoWin';
    var LIGHT_SEL = '.n26-dng, .n26ui-glass, .n26-docknav-host, .n26ui-sidebar, .fu-switch, .toggle-switch, ' +
        'button, .glass-btn, .dock-item, .launchpad-item, .settings-row, .theme-card, ' +
        '.n26-sf-chip, .n26-sf-swatch, .widget, .appstore-card, .n26-wg-thumb, .n26-dng-item';
    /* FIX: n26-go-live 由 beginGlass 自己写入，若留在 ON_CLASS 会让 isGlassOn 恒 true、
       onState 永远走不到 settleGlass（状态机死锁）。只认外部真实状态类。 */
    var ON_CLASS = ['n26-dng-on', 'n26-sw-busy', 'n26-sw-dragging', 'travel', 'glow'];

    function reduced() {
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }
    function raf(fn) {
        if (global.requestAnimationFrame) global.requestAnimationFrame(fn);
        else setTimeout(fn, 16);
    }
    function closest(node, sel) {
        try { return node && node.closest ? node.closest(sel) : null; } catch (e) { return null; }
    }
    var selfScript = doc.currentScript;
    var selfSrc = selfScript && selfScript.src ? selfScript.src : '';
    function coreUrl() {
        try { return new URL('n26-lg-core.js?v=lg2', selfSrc).href; }
        catch (e) { return 'ui/n26-lg-core.js?v=lg2'; }
    }

    var seq = 0;
    var lastPointer = { x: 0, y: 0 };
    var activeGlass = null;
    var lightRoot = null, bulb = null, lightHideTimer = 0;
    var movePending = false, moveEv = null;
    var scanTimer = 0, coreFailed = false, coreWaiters = [];
    /* ★ v2.10.39 P0 分时分片（心跳实机数据落地）：
       用户 file:// 实机：心跳最后存活「距最后一次点击 50ms」、rAF 掉帧
       3880ms / 3898ms，即点击后 50–200ms 之间主线程被连续堵约 3.9 秒。
       那个窗口里唯一会批量写 DOM + 读布局的就是 120ms 的 scan()：
       设置面板刚整块 innerHTML 重建出几百个新玻璃面，scan 一次给每个
       注入 3 个子层（DOM +1362 的来源），随后 attachLg 逐个 offsetWidth
       强制布局 —— 全压在玻璃滑行动画（0–360ms）半途。
       修法：① 补扫整体挪到动画收尾之后（380ms）；② 每帧只处理 10 个，
       批内「先批量读 position、再批量写」；③ attachLg 只在队列清空后
       统一跑一次。彩虹层 / 前后片 / 折射 / 亮光 / 三段动效一条不减。 */
    var SCAN_BATCH = 10;
    var scanQueue = [], scanBusy = false;
    function pumpScan() {
        var batch = scanQueue.splice(0, SCAN_BATCH);
        var pos = new Array(batch.length), i;
        for (i = 0; i < batch.length; i++) pos[i] = readPos(batch[i]);  /* 读阶段 */
        for (i = 0; i < batch.length; i++) {                            /* 写阶段 */
            if (!batch[i] || !batch[i].isConnected) continue;
            try {
                if (decorate(batch[i], pos[i])) onState(batch[i]);
                watch(batch[i]);   /* 写完再挂：decorate 自己的 class 不喂回 MO */
            } catch (e) { }
        }
        if (scanQueue.length) { raf(pumpScan); return; }
        scanBusy = false;
        /* 折射兜底全队列做完只跑一次，绝不在每批里全文档 querySelectorAll */
        try {
            ensureEngine(function () {
                var g;
                try { g = doc.querySelectorAll('.n26ui-glass, .n26-dng'); } catch (e) { return; }
                for (var j = 0; j < g.length; j++) attachLg(g[j]);
            });
        } catch (e) { }
    }

    /* ---------- ④ 折射引擎兜底 ----------
       宿主已有 n26LgAttach 就直接让位；iframe 独立文档引用不到宿主的
       url(#n26Lg*)，必须补挂同一套 API。所有等待者合并成一个队列，
       一次加载、一次通知，绝不每个玻璃面各请求一遍。 */
    function engineReady() {
        var q = coreWaiters.slice();
        coreWaiters.length = 0;
        for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) { } }
    }
    function ensureEngine(done) {
        if (done) coreWaiters.push(done);
        if (typeof global.n26LgAttach === 'function') { engineReady(); return; }
        if (coreFailed) { coreWaiters.length = 0; return; }
        var s = doc.querySelector('script[data-n26-go-core]');
        if (s) return;                          /* 已在加载，等 onload 统一通知 */
        s = doc.createElement('script');
        s.src = coreUrl();
        s.async = false;
        s.setAttribute('data-n26-go-core', '1');
        s.onload = function () { engineReady(); };
        s.onerror = function () { coreFailed = true; coreWaiters.length = 0; };
        (doc.head || doc.documentElement).appendChild(s);
    }
    /* 只认 offsetWidth / offsetHeight —— 绝不用 getBoundingClientRect()（含形变会漂）。
       尺寸量化到 8/4，相等就不重建贴图（重建 = 玻璃闪一下）。 */
    function attachLg(el) {
        if (!el || el.__n26GoLg || typeof global.n26LgAttach !== 'function') return;
        var w = el.offsetWidth || 0, h = el.offsetHeight || 0;
        if (!(w > 0) || !(h > 0)) return;
        var q = { w: Math.max(48, Math.round(w / 8) * 8), h: Math.max(40, Math.round(h / 4) * 4) };
        var id = 'n26GoLg' + (++seq);
        el.__n26GoLg = { id: id, w: q.w, h: q.h };
        try {
            /* v2.10.26 P0：plain: true —— .n26ui-glass 是整条大侧栏，SVG 位移滤镜
               在它背后内容一变（点导航换页）就整块重采样，Windows GPU 合成器直接崩
               （用户实测「严重卡死直接退出网页」）。改吃原生磨砂链，零 SVG。 */
            global.n26LgAttach(el, id, { hw: 0.30, hh: 0.20, thresh: -0.10, plain: true }, q);
            el.classList.add('n26-go-lg-on');
        } catch (e) { el.__n26GoLg = null; }
    }

    /* ---------- ① 注入对角彩虹 + 前后片子层（幂等） ---------- */
    /* 唯一的 position 读取入口。scan() 会在任何写之前把它批量取好。 */
    function readPos(el) {
        try { return global.getComputedStyle ? global.getComputedStyle(el).position : ''; }
        catch (e) { return ''; }
    }
    function decorate(el, pos) {
        if (!el || el.getAttribute('data-n26-go') === '1') return false;
        el.setAttribute('data-n26-go', '1');
        el.classList.add('n26-go-host');
        /* 玻璃元素若原本是 static，子层会跑到别处去 —— 只改一次，不动布局数值。
           pos 未给时才现场读一次（单点路径，如 pointerdown 命中的那一片玻璃）。 */
        var isStatic = (pos === undefined) ? (readPos(el) === 'static') : (pos === 'static');
        if (isStatic) {
            try { el.style.position = 'relative'; } catch (e) { }
        }
        var iris = doc.createElement('i');
        iris.className = 'n26-go-iris';
        iris.setAttribute('aria-hidden', 'true');
        var lead = doc.createElement('i');
        lead.className = 'n26-go-face lead';
        lead.setAttribute('aria-hidden', 'true');
        var trail = doc.createElement('i');
        trail.className = 'n26-go-face trail';
        trail.setAttribute('aria-hidden', 'true');
        /* 顺序：faces 在下、iris 在上；都是 pointer-events:none 的纯合成层 */
        try {
            el.insertBefore(lead, el.firstChild);
            el.insertBefore(trail, lead.nextSibling);
            el.appendChild(iris);
        } catch (e) { }
        return true;
    }

    /* ---------- ② 按下光源 ---------- */
    function ensureLight() {
        if (lightRoot || reduced()) return;
        lightRoot = doc.createElement('div');
        lightRoot.id = 'n26GoLight';
        lightRoot.setAttribute('aria-hidden', 'true');
        bulb = doc.createElement('div');
        bulb.className = 'n26-go-bulb';
        lightRoot.appendChild(bulb);
        (doc.body || doc.documentElement).appendChild(lightRoot);
    }
    function lightAt(x, y, strong) {
        if (reduced()) return;
        ensureLight();
        if (!bulb || !lightRoot) return;
        /* ★ v2.10.28 P0：把 560px 混合框本身中心对准指针（left/top 只在按下那一刻写一次，
           不是高频路径），灯泡留在框正中（CSS 0,0）。这样 screen 混合区域永远是「指针周围
           560px」，灯泡绝不溢出框、混合不会被任何浏览器裁到框外 —— 既保留提亮效果，又不触发
           全屏读回（这正是 v2.10.27 之后仍卡死的真凶所在）。 */
        lightRoot.style.left = x + 'px';
        lightRoot.style.top = y + 'px';
        if (lightHideTimer) { clearTimeout(lightHideTimer); lightHideTimer = 0; }
        lightRoot.classList.add('is-active');
        bulb.classList.add('is-on');
        /* 点在真玻璃上：亮光更「从玻璃里发出来」一点，别的控件只是被照到 */
        if (strong) lightRoot.classList.add('is-strong');
        else lightRoot.classList.remove('is-strong');
    }
    function lightOff() {
        if (bulb) bulb.classList.remove('is-on');
        if (!lightRoot) return;
        if (lightHideTimer) clearTimeout(lightHideTimer);
        /* ★ 不能立刻摘整层：bulb 还有 260ms 淡出要跑。等淡出结束再退出合成，
           否则「松手」那一帧亮光会硬切消失 = 闪一下。 */
        lightHideTimer = setTimeout(function () {
            lightHideTimer = 0;
            if (lightRoot && bulb && !bulb.classList.contains('is-on')) {
                lightRoot.classList.remove('is-active', 'is-strong');
            }
        }, 300);
    }

    /* ---------- ③ 三段：展开 / 前后片错落 / 收尾 ---------- */
    function beginGlass(el) {
        if (!el || reduced()) return;
        activeGlass = el;
        /* 按点作为展开原点。只在状态切换那一瞬读一次几何，不是每帧读。 */
        try {
            var r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                var ox = Math.max(0, Math.min(100, (lastPointer.x - r.left) / r.width * 100));
                var oy = Math.max(0, Math.min(100, (lastPointer.y - r.top) / r.height * 100));
                el.style.setProperty('--n26-go-ox', ox.toFixed(1) + '%');
                el.style.setProperty('--n26-go-oy', oy.toFixed(1) + '%');
            }
        } catch (e) { }
        el.classList.remove('n26-go-settle');
        el.classList.add('n26-go-expand', 'n26-go-press', 'n26-go-live');
        setTimeout(function () {
            if (activeGlass === el) {
                el.classList.remove('n26-go-expand');
                el.classList.add('n26-go-moving');
            }
        }, reduced() ? 280 : 800); /* 520ms 错落 + 260ms 动画 + 20ms 余量；reduced 下 CSS 已降级不必空等 */
    }
    function settleGlass(el) {
        if (!el) return;
        if (activeGlass === el) activeGlass = null;
        el.classList.remove('n26-go-expand', 'n26-go-moving', 'n26-go-press');
        /* 原地留一层「玻璃收拢」的幽灵：父玻璃已经被 docknav 瞬间隐藏，
           幽灵挂 body 才能让用户看见「变回普通背景」这 260ms，而不是闪没。 */
        if (!reduced()) {
            try {
                var r = el.getBoundingClientRect();
                if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < (global.innerHeight || 9999)) {
                    var ghost = doc.createElement('i');
                    ghost.className = 'n26-go-ghost';
                    ghost.setAttribute('aria-hidden', 'true');
                    ghost.style.left = r.left.toFixed(1) + 'px';
                    ghost.style.top = r.top.toFixed(1) + 'px';
                    ghost.style.width = r.width.toFixed(1) + 'px';
                    ghost.style.height = r.height.toFixed(1) + 'px';
                    ghost.style.borderRadius = 'clamp(10px, var(--n26-ui-radius, 14px), 22px)';
                    (doc.body || doc.documentElement).appendChild(ghost);
                    setTimeout(function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 320);
                }
            } catch (e) { }
        }
        el.classList.add('n26-go-settle');
        setTimeout(function () {
            el.classList.remove('n26-go-settle', 'n26-go-live');
            el.style.removeProperty('--n26-go-lead-x');
            el.style.removeProperty('--n26-go-lead-y');
            el.style.removeProperty('--n26-go-trail-x');
            el.style.removeProperty('--n26-go-trail-y');
        }, 300);
    }

    /* rAF 合帧：前片直跟、后片低通滞后 —— 前片先到、后片慢半拍 */
    var lagX = 0, lagY = 0, baseX = 0, baseY = 0;
    function flushMove() {
        movePending = false;
        var el = activeGlass;
        if (!el || !moveEv) return;
        var dx = moveEv.clientX - baseX, dy = moveEv.clientY - baseY;
        var lx = Math.max(-16, Math.min(16, dx * 0.14));
        var ly = Math.max(-16, Math.min(16, dy * 0.14));
        lagX += (lx - lagX) * 0.34;
        lagY += (ly - lagY) * 0.34;
        try {
            el.style.setProperty('--n26-go-lead-x', lx.toFixed(2) + 'px');
            el.style.setProperty('--n26-go-lead-y', ly.toFixed(2) + 'px');
            el.style.setProperty('--n26-go-trail-x', lagX.toFixed(2) + 'px');
            el.style.setProperty('--n26-go-trail-y', lagY.toFixed(2) + 'px');
        } catch (e) { }
        moveEv = null;
    }

    function isGlassOn(el) {
        for (var i = 0; i < ON_CLASS.length; i++) if (el.classList.contains(ON_CLASS[i])) return true;
        return false;
    }
    function onState(el) {
        if (!el || el.getAttribute('data-n26-go') !== '1') return;
        var on = isGlassOn(el);
        if (on && !el.__n26GoActive) { el.__n26GoActive = true; beginGlass(el); }
        else if (on && el.__n26GoActive) el.classList.add('n26-go-moving');
        else if (!on && el.__n26GoActive) { el.__n26GoActive = false; settleGlass(el); }
    }

    /* ---------- 扫描（v2.10.39：只负责「把新玻璃面排队」，重活交给分片） ---------- */
    function scan() {
        var list;
        try { list = doc.querySelectorAll(GLASS_SEL); } catch (e) { return; }
        var i, el;
        for (i = 0; i < list.length; i++) {
            el = list[i];
            if (el.getAttribute('data-n26-go') !== '1') scanQueue.push(el);
            else watch(el);   /* 已装饰的不会再写 DOM，现在挂观察器不会自激 */
        }
        if (scanQueue.length && !scanBusy) { scanBusy = true; raf(pumpScan); }
    }
    function scheduleScan() {
        if (scanTimer) clearTimeout(scanTimer);
        /* ★ 玻璃滑行动画 0–360ms 期间绝不批量写 DOM：等收尾后（380ms）再分片。
           按下命中的那一片玻璃仍在 pointerdown 里立即 decorate + beginGlass，
           手感与三段动效完全不变。 */
        scanTimer = setTimeout(function () { scanTimer = 0; scan(); }, 380);
    }

    /* ---------- 事件 ---------- */
    doc.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        /* v2.10.36：新玻璃面的补扫改由「用户真的按下」触发（120ms 防抖），
           不再由任何 DOM 变化触发。已装饰 / 已观察的元素一律幂等跳过。 */
        scheduleScan();
        lastPointer.x = e.clientX; lastPointer.y = e.clientY;
        baseX = e.clientX; baseY = e.clientY; lagX = 0; lagY = 0;
        var lit = closest(e.target, LIGHT_SEL);
        var glass = closest(e.target, GLASS_SEL);
        if (lit) lightAt(e.clientX, e.clientY, !!glass);
        /* 点在侧栏菜单项上时玻璃本体还没显示，从宿主里找出那一片 */
        if (!glass) {
            var host = closest(e.target, '.n26-docknav-host');
            if (host) glass = host.querySelector('.n26-dng');
        }
        if (glass) { decorate(glass); beginGlass(glass); glass.__n26GoActive = true; }
    }, true);

    doc.addEventListener('pointermove', function (e) {
        if (!activeGlass || reduced()) return;
        moveEv = { clientX: e.clientX, clientY: e.clientY };
        if (!movePending) { movePending = true; raf(flushMove); }
    }, true);

    function release() {
        /* ★ 松手只收光源，绝不在这里收玻璃 —— docknav 的 glide/fade 还要跑几百毫秒，
           此刻玻璃正在滑向目标。收尾交给「.n26-dng-on 被摘掉」那一瞬（applyRest）。 */
        lightOff();
        moveEv = null;
    }
    doc.addEventListener('pointerup', release, true);
    doc.addEventListener('pointercancel', release, true);
    global.addEventListener && global.addEventListener('blur', function () { lightOff(); }, false);
    doc.addEventListener && doc.addEventListener('visibilitychange', function () {
        if (doc.hidden) { lightOff(); if (activeGlass) settleGlass(activeGlass); }
    }, false);

    /* ★★ v2.10.36 P0（真·系统级）：把「观察整个 body 子树的所有 class 变化」
       收敛成「只观察玻璃宿主元素自己的 class」。

       旧写法 mo.observe(doc.body, {subtree:true, childList:true,
       attributes:true, attributeFilter:['class']}) 等于给整个文档装了一条总线：
       本项目里有 14 个全文档观察器、几十处 classList 写，任何模块给任何元素
       加/摘 class 都会唤醒它；设置面板一次 innerHTML 重建又是几百条 record。
       它再对每个 addedNodes 调 scheduleScan() → 120ms 后 querySelectorAll
       全文档 + 逐个 getComputedStyle + decorate 插 3 个子节点 → 新的 record
       → 再 scheduleScan。这就是用户说的「什么情况下都会触发、整个系统都受影响」：
       不是一个效果坏，是一条全文档观察总线把所有 DOM 操作互相串起来放大。
       而且 _app.js 把本模块注入了每一个应用 iframe，每个文档各有一条。

       现在每个玻璃面各自 observe（subtree:false, 只看自己的 class），
       record 数从「全文档几千节点」降到「几个玻璃元素」；
       docknav 挂摘 n26-dng-on 依然看得见 —— 展开 / 前后片错落 / 收拢
       三段动效一条不删，侧栏 DOM、CSS、类名、动画参数一个字没动。 */
    var mo = null, moQueue = [], moPending = false;  /* FIX: MO 分帧合并队列 */
    function watch(el) {
        if (!mo || !el || el.__n26GoWatched) return;
        el.__n26GoWatched = true;
        mo.observe(el, { attributes: true, attributeFilter: ['class'], subtree: false });
    }
    if (global.MutationObserver && doc.body) {
        mo = new MutationObserver(function (records) {
            /* FIX: 合并到下一帧、每元素只处理一次，打断「写 class -> MO -> 读布局 -> 再写 class」
               的同步自激环；三段动效 / 彩虹 / 光源 / 折射一条不删。 */
            var seen = Object.create(null);
            for (var i = 0; i < records.length; i++) {
                var el = records[i].target;
                if (!el || !el.classList) continue;
                var key = el.__n26GoId || (el.__n26GoId = ++seq);
                if (!seen[key]) { seen[key] = 1; moQueue.push(el); }
            }
            if (moPending) return;
            moPending = true;
            raf(function () {
                moPending = false;
                var q = moQueue.slice(); moQueue.length = 0;
                for (var j = 0; j < q.length; j++) {
                    if (q[j] && q[j].classList) { try { onState(q[j]); } catch (e) { } }
                }
            });
        });
    }

    /* ---------- 启动 ---------- */
    function boot() {
        ensureLight();
        scan();                                  /* scan 内部按需补挂折射引擎 */
        if (doc.readyState === 'loading') {
            doc.addEventListener('DOMContentLoaded', function () { ensureLight(); scan(); }, { once: true });
        }
    }
    try { boot(); } catch (e) { }

    /* ---------- 开放 API ---------- */
    global.N26GlassOptics = {
        version: VERSION,
        scan: scan,
        lightAt: lightAt,
        lightOff: lightOff,
        beginGlass: beginGlass,
        settleGlass: settleGlass,
        attachLg: attachLg,
        isReduced: reduced,
        bulb: function () { return bulb; }
    };
})(typeof window !== 'undefined' ? window : this);
