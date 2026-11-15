/* ============================================================================
   Nexus OS 26 · 全面故障黑匣子（v2.10.38 / 戳 dg8）
   --------------------------------------------------------------------------
   为什么有这个文件：用户实机弹出的是 Chrome 的「此页面没有响应 / Page
   Unresponsive」对话框。这个框只在**渲染进程主线程**长时间不处理消息时出现，
   纯 GPU 合成慢只会掉帧、不会弹它。也就是说 v2.10.27 ~ v2.10.30 四轮
   「删/降级 GPU 合成层」从机理上就打错了战场。

   ★ v2.10.38（用户定案：黑匣子要「全面、以后一直用」，任何故障复制一段
     就能定位）：从「只抓长任务」升级为**全方位故障取证框架**——
     ① 长任务抓取：优先 long-animation-frame / LoAF（Chrome 116+），
        scripts[] 带函数名 / 强制布局耗时；不支持退回 longtask。
     ② ★ 心跳取证（本版核心）：黑匣子靠 PerformanceObserver 回调落盘，
        但弹「无响应」后用户点「退出页面」→ 渲染进程被杀、回调永远没跑，
        那条几秒的长任务就丢了（v2.10.37 实机：最长只抓到 245ms、用户却
        仍弹框，正是这个洞）。改用心跳：主线程活着每 1s 往 localStorage
        写一条 {sid,t}，点击瞬间也立刻写一条（锚点）；被堵死 → 心跳停 →
        **最后一条心跳的时刻 = 主线程最后存活的时刻**，退出页面也丢不了。
        重开页面诊断卡直接算出「卡死发生在上次会话第几秒 · 距最后一次
        点击多少 ms」——不用再猜卡在哪个时间窗。
     ③ window.onerror + unhandledrejection 全捕获：JS 报错 / Promise 拒绝
        自动落盘（哪个软件打不开、哪里脚本报错，一眼看到）。
     ④ 资源加载失败捕获（error 捕获阶段 e.target 是元素）：script/css/img
        404 / 路径错 → 「某个软件打不开」最常见的原因。
     ⑤ 应用窗口 iframe 哨兵：MutationObserver 看新建 iframe，5s 没 load
        记「应用未响应」，不动任何业务代码。
     ⑥ rAF 掉帧哨兵：帧间隔 >250ms 记一条（不弹框但肉眼可见的顿挫）。
     ⑦ 零门槛取证卡片：Ctrl+Alt+D 或 ?diag=1，一键复制全部故障记录。
     file:// 下主文档与同源 iframe 共用同一渲染进程主线程，心跳停 = 全卡。
   ============================================================================ */
(function (global) {
    'use strict';
    var doc = global.document;
    if (!doc || global.__N26_DIAG__) return;
    global.__N26_DIAG__ = 1;

    var VERSION = 'v2.10.39';
    var perf = global.performance || { now: function () { return Date.now(); } };
    var T0 = perf.now();
    var tasks = [], inputs = [];
    var phase = 'idle';
    var lastInputAt = 0;
    var reportTimer = 0;
    var fxStyle = null;
    var MAX = 80;
    var BLACKBOX_KEY = 'n26:diag:blackbox';
    /* ★ v2.10.38：通用故障黑匣子各通道（全部 localStorage、环形上限、跨刷新保留） */
    var ERR_KEY = 'n26:diag:errors';
    var RES_KEY = 'n26:diag:resources';
    var APP_KEY = 'n26:diag:apps';
    var GAP_KEY = 'n26:diag:framegaps';
    var SS_KEY = 'n26:diag:session';
    var BT_KEY = 'n26:diag:beat';
    var IN_KEY = 'n26:diag:input';
    var CHAN_MAX = 12;
    /* ★ v2.10.36：主体验入口是官网 https 静态托管（Cloudflare Pages），
       仓库里不放任何 .bat / 本地启动脚本；本地 file:// 双击同样支持，
       只是 blob: Worker / IndexedDB / 同源 iframe 会自动降级。
       两种协议共用同一套 UI，没有按协议分支的视觉差异。 */
    var IS_FILE = !!(global.location && global.location.protocol === 'file:');

    function now() { return perf.now(); }
    function r1(n) { return Math.round(n * 10) / 10; }
    function stamp(t) { return Math.round(t - T0); }
    function cap(a) { if (a.length > MAX) a.shift(); }
    function warn(s) { try { if (global.console && console.warn) console.warn(s); } catch (e) { } }
    function info(s) { try { if (global.console && console.info) console.info(s); } catch (e) { } }

    /* ---------- ★ 通用故障黑匣子通道（v2.10.38） ----------
       每类故障独立键、独立环形上限 12 条、跨刷新保留。
       全部「只写不弹 UI」：平时零 DOM、零视觉变化，Ctrl+Alt+D 才读出。 */
    function lsWrite(k, v) { try { global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
    function lsRead(k) {
        try {
            var v = global.localStorage && global.localStorage.getItem(k);
            var o = v ? JSON.parse(v) : null;
            return o && typeof o === 'object' ? o : null;
        } catch (e) { return null; }
    }
    function chanPush(key, row) {
        try {
            var arr = JSON.parse((global.localStorage && global.localStorage.getItem(key)) || '[]');
            if (!Array.isArray(arr)) arr = [];
            row.ver = VERSION;
            row.at = stamp(perf.now());
            arr.push(row);
            if (arr.length > CHAN_MAX) arr = arr.slice(-CHAN_MAX);
            lsWrite(key, arr);
        } catch (e) { }
    }
    function chanLen(key) {
        try {
            var a = JSON.parse((global.localStorage && global.localStorage.getItem(key)) || '[]');
            return Array.isArray(a) ? a.length : 0;
        } catch (e) { return 0; }
    }

    /* ---------- ★ 心跳取证（v2.10.38 核心）----------
       弹「无响应」后点「退出页面」→ 渲染进程被杀，PerformanceObserver
       的回调永远没机会落盘，那条几秒的长任务就丢了。心跳反过来：
       主线程活着每 1s 写一条 {sid,t}；点击瞬间也立刻写（把心跳锚在点击上，
       分辨率从 1s 提到 ~200ms——点击后 200/600ms 再各补一条加密心跳）。
       主线程被堵死 → 心跳停 → localStorage 里最后一条就是卡死现场。
       重开页面读回，直接算「卡死发生在上次会话第几秒 · 距最后点击多少 ms」。
       file:// 下主文档与同源 iframe 共用同一渲染进程主线程，停 = 全卡。 */
    var SID = Date.now();
    /* ★ 启动时先把上一个会话的心跳读进内存（本会话一落盘就会覆盖它），
       遗留痕迹从这里读，弹「无响应」后退出页面也丢不了。 */
    var prevSession = lsRead(SS_KEY), prevBeat = lsRead(BT_KEY), prevInput = lsRead(IN_KEY);
    function heartbeat() { lsWrite(BT_KEY, { sid: SID, t: Date.now() }); }
    lsWrite(SS_KEY, { sid: SID, start: Date.now() });
    heartbeat();
    if (global.setInterval) {
        try { global.setInterval(heartbeat, 1000); } catch (e) { }
    }
    /* 点击锚点：pointerdown 立即写心跳 + 输入记录 + 两粒加密心跳 */
    doc.addEventListener('pointerdown', function () {
        var t = Date.now();
        lsWrite(IN_KEY, { sid: SID, t: t });
        heartbeat();
        if (global.setTimeout) {
            try {
                global.setTimeout(heartbeat, 200);
                global.setTimeout(heartbeat, 600);
            } catch (e) { }
        }
    }, true);

    /* ---------- ★ 全捕获：JS 报错 / Promise 拒绝 / 资源加载失败 ---------- */
    if (global.addEventListener) {
        try {
            global.addEventListener('error', function (e) {
                if (e && e.message) {
                    /* JS 运行时错误 */
                    chanPush(ERR_KEY, {
                        kind: 'js',
                        msg: String(e.message).slice(0, 160),
                        src: String(e.filename || '').slice(-90),
                        line: e.lineno || 0
                    });
                    warn('[N26Diag] JS 报错已落盘：' + String(e.message).slice(0, 80));
                } else if (e && e.target && e.target.tagName) {
                    /* 资源加载失败（script/css/img/audio…）——「软件打不开」常见原因 */
                    var tg = e.target;
                    chanPush(RES_KEY, {
                        kind: 'resource',
                        tag: String(tg.tagName).toLowerCase(),
                        src: String(tg.src || tg.href || '').slice(-100)
                    });
                }
            }, true);
            global.addEventListener('unhandledrejection', function (e) {
                chanPush(ERR_KEY, {
                    kind: 'promise',
                    msg: String(e && e.reason || '').slice(0, 160)
                });
                warn('[N26Diag] Promise 拒绝已落盘：' + String(e && e.reason || '').slice(0, 80));
            });
        } catch (e) { }
    }

    /* ---------- ★ 应用窗口 iframe 哨兵（v2.10.38）----------
       MutationObserver 看新建 iframe，5s 没有 load 记「应用未响应」。
       只观察不干预，不动任何业务代码；5s 内正常 load 则静默跳过。 */
    var MO = global.MutationObserver || global.WebKitMutationObserver;
    if (MO && (doc.documentElement || doc.body)) {
        try {
            function watchIframe(f) {
                var src = '';
                try { src = String(f.getAttribute && f.getAttribute('src') || '').slice(-100); } catch (e0) { }
                var done = false;
                var to = global.setTimeout ? global.setTimeout(function () {
                    if (!done) chanPush(APP_KEY, { kind: 'no-load', src: src });
                }, 5000) : 0;
                try {
                    f.addEventListener('load', function () { done = true; if (to) global.clearTimeout(to); });
                    f.addEventListener('error', function () {
                        done = true; if (to) global.clearTimeout(to);
                        chanPush(APP_KEY, { kind: 'load-error', src: src });
                    });
                } catch (e1) { }
            }
            new MO(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var ns = muts[i].addedNodes || [];
                    for (var j = 0; j < ns.length; j++) {
                        if (ns[j] && ns[j].tagName === 'IFRAME') watchIframe(ns[j]);
                    }
                }
            }).observe(doc.documentElement || doc.body, { childList: true, subtree: true });
        } catch (e) { }
    }

    /* ---------- ★ rAF 掉帧哨兵（v2.10.38）----------
       不弹框但肉眼可见的顿挫：帧间隔 >250ms 记一条（上限 12）。
       只比较时间戳，零布局读、零样式写。 */
    if (global.requestAnimationFrame) {
        try {
            var lastFrame = 0;
            (function rafLoop(t) {
                if (lastFrame && t - lastFrame > 250)
                    chanPush(GAP_KEY, { kind: 'frame-gap', gap: r1(t - lastFrame) });
                lastFrame = t;
                global.requestAnimationFrame(rafLoop);
            })(0);
        } catch (e) { }
    }

    /* ---------- ③ 卡死现场黑匣子（只在 >=200ms 长任务时写一次） ---------- */
    function blackboxSave(row) {
        try {
            var ls = global.localStorage;
            if (!ls) return;
            var arr = JSON.parse(ls.getItem(BLACKBOX_KEY) || '[]');
            if (!Array.isArray(arr)) arr = [];
            arr.push({
                at: row.at, ms: row.ms, block: row.block, layout: row.layout,
                phase: row.phase, sinceInput: row.sinceInput, who: row.who || [],
                dom: row.dom, proto: row.proto, ver: row.ver,
                title: doc.title, loaf: loafOk
            });
            if (arr.length > 12) arr = arr.slice(-12);
            ls.setItem(BLACKBOX_KEY, JSON.stringify(arr));
        } catch (e) { }
    }
    function blackboxLast() {
        try {
            var arr = JSON.parse((global.localStorage && global.localStorage.getItem(BLACKBOX_KEY)) || '[]');
            var out = Array.isArray(arr) ? arr : [];
            info('[N26Diag] 上次卡死前的长任务现场（跨刷新保留，最多 12 条）：');
            table('blackbox', out);
            info('[N26Diag] 可直接复制这一行：' + JSON.stringify(out));
            return out;
        } catch (e) { return []; }
    }

    /* ---------- ① 长任务：Page Unresponsive 的直接证据 ----------
       ★ v2.10.37：优先 long-animation-frame（LoAF，Chrome 116+）——除了
       时长还带 scripts[]（函数名 / invoker / 强制布局耗时），黑匣子能直接
       指认「几秒里跑的是谁」。不支持 LoAF 的浏览器自动退回 longtask。
       两种都只在 >=200ms 时 warn + 落盘；50–200ms 只进内存 tasks。 */
    var loafOk = false;
    function scriptName(s) {
        var n = s.sourceFunctionName || s.invoker || s.sourceURL || s.name || '';
        if (s.sourceURL && s.sourceLineNumber != null && String(n).indexOf('://') < 0)
            n = n + ' @L' + s.sourceLineNumber;
        return String(n).slice(0, 90);
    }
    function makeRow(e, scripts) {
        var layout = 0;
        if (e.styleAndLayoutStart != null && e.startTime != null)
            layout = Math.max(0, (e.startTime + e.duration) - e.styleAndLayoutStart);
        return {
            at: stamp(e.startTime),
            ms: r1(e.duration),
            block: r1(e.blockingDuration != null ? e.blockingDuration : e.duration),
            layout: r1(layout),
            phase: phase,
            sinceInput: lastInputAt ? r1(e.startTime - lastInputAt) : -1,
            who: scripts || [],
            dom: doc.getElementsByTagName('*').length,
            proto: IS_FILE ? 'file' : 'https',
            ver: VERSION
        };
    }
    function onLongFrame(e, scripts) {
        if (!(e.duration > 50)) return;
        var row = makeRow(e, scripts);
        tasks.push(row); cap(tasks);
        if (e.duration >= 200) {
            warn('[N26Diag] 主线程阻塞 ' + row.ms + 'ms · 距上次输入 ' + row.sinceInput + 'ms' +
                 (row.who.length ? ' · 主凶 ' + row.who[0].name + ' ' + row.who[0].dur + 'ms' : '') +
                 '（已落盘黑匣子，Ctrl+Alt+D 可取）');
            blackboxSave(row);
        }
    }
    if (global.PerformanceObserver) {
        try {
            var po = new PerformanceObserver(function (list) {
                var es = list.getEntries();
                for (var i = 0; i < es.length; i++) {
                    var e = es[i];
                    var sc = (e.scripts || []).slice()
                        .sort(function (a, b) { return (b.duration || 0) - (a.duration || 0); })
                        .slice(0, 3)
                        .map(function (s) {
                            return {
                                name: scriptName(s),
                                dur: r1(s.duration || 0),
                                layout: r1(s.forcedStyleAndLayoutDuration || 0)
                            };
                        });
                    onLongFrame(e, sc);
                }
            });
            try {
                po.observe({ entryTypes: ['long-animation-frame'] });
                loafOk = true;
            } catch (e2) {
                po.observe({ entryTypes: ['longtask'] });
            }
        } catch (e) { /* 探针失败不影响系统 */ }
    }

    /* ---------- ② 输入时间线 + 自动摘要 ---------- */
    function onInput(type) {
        lastInputAt = now();
        inputs.push({ at: stamp(lastInputAt), type: type }); cap(inputs);
        if (type === 'pointerdown') {
            if (reportTimer) { clearTimeout(reportTimer); reportTimer = 0; }
            /* 1.4s 后出摘要：即使随后页面卡死/退出，控制台也留着这条记录 */
            reportTimer = setTimeout(function () {
                reportTimer = 0;
                try { report(true); } catch (e) { }
            }, 1400);
        }
    }
    doc.addEventListener('pointerdown', function () { onInput('pointerdown'); }, true);
    doc.addEventListener('click', function () { onInput('click'); }, true);

    /* ★ v2.10.36：六函数包装链整段删除 —— 不再给点击同步栈加任何层。 */

    /* ---------- ④ 渲染层 A/B 开关（不改源码，随时可撤） ---------- */
    var NOFX =
        '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;' +
        'filter:none!important;mix-blend-mode:normal!important}' +
        'body.n26-on::after{content:none!important}' +
        '#n26WarmTint{mix-blend-mode:normal!important}';
    function noFx(on) {
        if (on) {
            if (!fxStyle) {
                fxStyle = doc.createElement('style');
                fxStyle.id = 'n26DiagNoFx';
                fxStyle.textContent = NOFX;
                (doc.head || doc.documentElement).appendChild(fxStyle);
            }
        } else if (fxStyle && fxStyle.parentNode) {
            fxStyle.parentNode.removeChild(fxStyle);
            fxStyle = null;
        }
        return !!fxStyle;
    }

    /* ---------- ⑤ 报告 ---------- */
    function table(label, rows) {
        if (!rows.length) { info('[N26Diag] ' + label + '：无'); return; }
        try {
            if (global.console && console.table) console.table(rows);
            else console.log('[N26Diag] ' + label, rows);
        } catch (e) { }
    }
    function report(auto) {
        var lines = [
            '[N26Diag] ' + (auto ? '自动摘要（点击后 1.4s）' : '手动报告') + ' · ' + VERSION,
            '  协议 = ' + global.location.protocol + '  |  标题 = ' + doc.title,
            '  DOM 节点 = ' + doc.getElementsByTagName('*').length,
            '  运行环境 = ' + (IS_FILE ? 'file:// 本地双击' : 'https 官网静态托管') +
                '  |  折射 Worker = ' + (global.__n26LgWorkerError
                    ? '异常已降级 ' + String(global.__n26LgWorkerError).slice(0, 40)
                    : (IS_FILE ? '按协议跳过（缓存 + 每帧一张）' : 'Worker 路径')),
            '  noFx = ' + !!fxStyle,
            '  输入 = ' + inputs.length + ' 次 / 长任务 = ' + tasks.length + ' 条',
            '  上次卡死现场 = N26Diag.last()（跨刷新保留，不用截图）'
        ];
        info(lines.join('\n'));
        table('最近长任务(ms)', tasks.slice(-14));
        if (!tasks.length) info('[N26Diag] 没有抓到 longtask —— 若仍弹「无响应」，瓶颈可能不在长任务，请执行 N26Diag.last() 把上次现场发回。');
    }

    /* ---------- ⑥ 零门槛取证：Ctrl+Alt+D 弹卡片（平时零 DOM、零 UI 变化） ----------
       用户不开发、不用 DevTools：Chrome 控制台首次粘贴还会拦一道
       "allow pasting"，对非开发者是死路。所以把「读黑匣子 + 复制」做成
       页面内一个按需创建的卡片，只在按快捷键 / 带 ?diag=1 时出现，
       静止时页面 DOM 一个节点都不多，系统 UI 完全不变。 */
    function readBlackbox() {
        var arr = [];
        try {
            arr = JSON.parse((global.localStorage && global.localStorage.getItem(BLACKBOX_KEY)) || '[]');
            if (!Array.isArray(arr)) arr = [];
        } catch (e) { arr = []; }
        return arr;
    }
    function fmtLast() {
        var arr = readBlackbox();
        var errs = (function () { try { return JSON.parse((global.localStorage && global.localStorage.getItem(ERR_KEY)) || '[]') || []; } catch (e) { return []; } })();
        var ress = (function () { try { return JSON.parse((global.localStorage && global.localStorage.getItem(RES_KEY)) || '[]') || []; } catch (e) { return []; } })();
        var apps = (function () { try { return JSON.parse((global.localStorage && global.localStorage.getItem(APP_KEY)) || '[]') || []; } catch (e) { return []; } })();
        var gaps = (function () { try { return JSON.parse((global.localStorage && global.localStorage.getItem(GAP_KEY)) || '[]') || []; } catch (e) { return []; } })();
        var lines = [
            'Nexus OS 26 全面故障诊断 · 诊断卡 v3 (dg8 · 心跳+全捕获) · ' + VERSION,
            '协议 = ' + (IS_FILE ? 'file://' : 'https') + '  |  标题 = ' + doc.title,
            '主线程阻塞 = ' + arr.length + ' 条（只记 >=200ms，跨刷新保留）'
        ];
        /* ★ 心跳遗留痕迹：上次会话主线程最后存活的时刻（启动时已读入内存） */
        if (prevSession && prevBeat && prevBeat.sid !== SID) {
            var intoSec = Math.max(0, (prevBeat.t - prevSession.start) / 1000);
            var since = (prevInput && prevInput.sid === prevBeat.sid) ? (prevBeat.t - prevInput.t) : null;
            lines.push('★ 上次会话遗留痕迹：主线程最后存活于会话第 ' + r1(intoSec) + 's' +
                (since != null ? ' · 距最后一次点击 ' + r1(since) + 'ms' : '') +
                '（心跳停了 = 那之后主线程再没跑起来；弹「无响应」后退出页面也不丢）');
        } else {
            lines.push('★ 上次会话遗留痕迹：无（上次是正常关闭，或已是本会话心跳）');
        }
        lines.push('');
        /* ② JS 错误 / Promise 拒绝 */
        var jsErrs = errs.filter(function (r) { return r.kind === 'js'; });
        var pErrs = errs.filter(function (r) { return r.kind === 'promise'; });
        lines.push('JS 报错 = ' + jsErrs.length + ' 条 · Promise 拒绝 = ' + pErrs.length + ' 条');
        for (var e1 = 0; e1 < errs.length; e1++) {
            var er = errs[e1];
            lines.push('  [' + (er.kind === 'promise' ? 'Promise' : 'JS') + '] ' + er.msg +
                (er.src ? ' · ' + er.src + (er.line ? ':L' + er.line : '') : ''));
        }
        /* ④ 资源加载失败 */
        lines.push('资源加载失败 = ' + ress.length + ' 条（404 / 路径错——「软件打不开」先看这里）');
        for (var r1i = 0; r1i < ress.length; r1i++)
            lines.push('  [资源] <' + ress[r1i].tag + '> ' + ress[r1i].src);
        /* ⑤ 应用窗口未响应 */
        lines.push('应用窗口 iframe 未响应 = ' + apps.length + ' 条（打开 5s 无 load）');
        for (var a1 = 0; a1 < apps.length; a1++)
            lines.push('  [应用] ' + apps[a1].kind + ' · ' + apps[a1].src);
        /* ⑥ 掉帧长帧 */
        lines.push('掉帧长帧(>250ms) = ' + gaps.length + ' 条');
        for (var g1 = 0; g1 < gaps.length; g1++)
            lines.push('  [掉帧] 间隔 ' + gaps[g1].gap + 'ms · 距启动 ' + gaps[g1].at + 'ms');
        /* ① 主线程阻塞（长任务） */
        if (arr.length) {
            lines.push('主线程阻塞明细：');
            for (var i = 0; i < arr.length; i++) {
                var r = arr[i];
                lines.push('  #' + (i + 1) + '  距点击 ' + r.sinceInput + 'ms · 阻塞 ' +
                    (r.block != null ? r.block : r.ms) + 'ms' +
                    (r.layout ? ' · 其中样式+布局 ' + r.layout + 'ms' : '') +
                    ' · DOM ' + r.dom + ' · ' + r.proto + ' · ' + r.ver);
                for (var k = 0; k < (r.who || []).length; k++) {
                    lines.push('      主凶' + (k + 1) + '  ' + r.who[k].name + ' — ' + r.who[k].dur + 'ms' +
                        (r.who[k].layout ? '（强制布局 ' + r.who[k].layout + 'ms）' : ''));
                }
            }
        }
        lines.push('');
        lines.push('把上面整段复制发回即可，不用截图、不用重新点卡。');
        return lines.join('\n');
    }
    function showPanel() {
        var old = doc.getElementById('n26DiagCard');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var card = doc.createElement('div');
        card.id = 'n26DiagCard';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', 'Nexus OS 26 卡死现场诊断');
        card.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;' +
            'max-width:min(600px,92vw);max-height:80vh;overflow:auto;padding:16px 18px;' +
            'border-radius:14px;background:#ffffff;color:#101923;' +
            'box-shadow:0 12px 40px rgba(0,0,0,.28);' +
            'font:12px/1.65 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
        var txt = doc.createElement('div');
        txt.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
        txt.textContent = fmtLast();
        card.appendChild(txt);
        var bar = doc.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;margin-top:14px;';
        function makeBtn(label, fn) {
            var b = doc.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText = 'padding:7px 15px;border-radius:8px;border:1px solid #c9d3df;' +
                'background:#f4f7fb;color:#101923;font:12px sans-serif;cursor:pointer;';
            b.onclick = fn;
            return b;
        }
        var copyBtn = makeBtn('复制诊断', function () {
            var okc = false;
            try {
                var ta = doc.createElement('textarea');
                ta.value = fmtLast();
                ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
                doc.body.appendChild(ta);
                ta.select();
                okc = !!(doc.execCommand && doc.execCommand('copy'));
                if (ta.parentNode) ta.parentNode.removeChild(ta);
            } catch (e) { okc = false; }
            if (!okc && global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
                try { navigator.clipboard.writeText(fmtLast()); okc = true; } catch (e2) { }
            }
            copyBtn.textContent = okc ? '已复制，去对话里粘贴' : '复制失败，请选中上面文字手动复制';
        });
        var closeBtn = makeBtn('关闭', function () {
            if (card.parentNode) card.parentNode.removeChild(card);
        });
        bar.appendChild(copyBtn);
        bar.appendChild(closeBtn);
        card.appendChild(bar);
        (doc.body || doc.documentElement).appendChild(card);
        return card;
    }
    doc.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D' || e.keyCode === 68)) {
            e.preventDefault();
            showPanel();
        }
    }, true);
    /* 备选入口：地址栏末尾加 ?diag=1 回车也会自动弹，不必记快捷键 */
    try {
        if (/[?&]diag=1(?:&|$)/.test(global.location.search || '')) {
            if (doc.readyState === 'loading') {
                doc.addEventListener('DOMContentLoaded', function () { showPanel(); }, { once: true });
            } else showPanel();
        }
    } catch (e) { }

    global.N26Diag = {
        version: VERSION,
        panel: showPanel,
        blackboxText: fmtLast,
        report: function () { report(false); },
        last: blackboxLast,
        noFx: noFx,
        tasks: tasks,
        inputs: inputs,
        phase: function () { return phase; }
    };
    info('[N26Diag] 全面故障黑匣子就绪 · ' + VERSION +
         ' · 心跳取证 + JS/Promise/资源/iframe/掉帧全捕获；Ctrl+Alt+D 弹诊断卡一键复制全部记录');
})(window);
