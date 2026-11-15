/* ==========================================================================
   ui/n26-release-guard.js · 戳 rg2 · 2026-11-14 发布前兜底（含 FangLux 隔离）
   --------------------------------------------------------------------------
   用户 11-14 原话：「你再好好修修，加强它的鲁棒性等等一系列的！」

   本模块是**最后加载**的独立 classic script，零侵入主壳业务逻辑：
     ① 可选小组件模块（天空 / 音乐同步）异常隔离：连续失败到阈值就降级成
        空操作并只报一次日志，绝不因为一个可选层把桌面主流程带崩。
     ② 脏存档自愈：desktopWidgets 若被写成对象 / 字符串 / 含 null 的数组，
        收敛成合法数组再写回（能解析出数组的旧格式会尽量抢救）。
     ③ 关键节点完整性体检：缺 DOM 只报一次日志，不抛错、不弹窗。
     ④ file:// 一等运行环境：明示网络能力不可用时的降级事实，不做任何
        弹窗/跳转，也不影响离屏渲染、Worker 降级与本地素材读取。
     ⑤ FangLux 方曜光传输引擎纳入同一套异常隔离，光学层失败只降级自己。

   ★ 性能纪律（P0 教训）：零 MutationObserver、零 rAF、零常驻定时器、
     零 getBoundingClientRect、零强制布局读。只在 DOMContentLoaded 做一次
     体检，其余都是纯函数包装。任何一步异常都被自己吞掉。
   ★ 不改 CSS、不改 DOM 结构、不新建视觉层。
   ========================================================================== */
(function () {
    'use strict';
    if (window.N26ReleaseGuard) return;

    var WARNED = {};
    var report = {
        protocol: (location && location.protocol) || 'unknown',
        fileMode: (location && location.protocol === 'file:'),
        repairedWidgets: false,
        repairedCount: 0,
        missingNodes: [],
        isolated: [],
        degraded: []
    };

    function warn(tag, e) {
        if (WARNED[tag]) return;
        WARNED[tag] = 1;
        try {
            if (window.console && console.warn) {
                console.warn('[n26 release guard] ' + tag, e || '');
            }
        } catch (x) { }
    }

    /* 可选模块单点隔离：连续 5 次抛错就永久降级，避免错误日志刷屏、
       也避免一个坏的可选层反复打断桌面重绘。 */
    function isolate(obj, key, label) {
        if (!obj || typeof obj[key] !== 'function') return false;
        var orig = obj[key];
        var fails = 0;
        obj[key] = function () {
            if (fails >= 5) return undefined;
            try {
                var r = orig.apply(this, arguments);
                fails = 0;
                return r;
            } catch (e) {
                fails++;
                if (fails === 5) {
                    report.degraded.push(label);
                    warn(label + ' 连续失败 5 次，已降级为空操作', e);
                } else {
                    warn(label + ' 单次异常已隔离', e);
                }
                return undefined;
            }
        };
        report.isolated.push(label);
        return true;
    }

    /* ---------------------------------------------------------------- ① */
    try {
        if (window.N26WidgetSky) {
            isolate(window.N26WidgetSky, 'apply', 'N26WidgetSky.apply');
            isolate(window.N26WidgetSky, 'boot', 'N26WidgetSky.boot');
        }
        if (typeof window.n26MusicExtraSync === 'function') {
            isolate(window, 'n26MusicExtraSync', 'n26MusicExtraSync');
        }
    } catch (e) { warn('可选模块隔离失败', e); }

    /* ---------------------------------------------------------------- ② */
    /* desktopWidgets 的合法形态：数组，且每项是有字符串 type 的对象。
       null / undefined = 首启，绝不写回（不制造空存档覆盖用户数据）。 */
    function validList(v) {
        return Array.isArray(v);
    }
    function cleanList(v) {
        if (!Array.isArray(v)) return [];
        var out = [];
        for (var i = 0; i < v.length; i++) {
            var w = v[i];
            if (w && typeof w === 'object' && typeof w.type === 'string' && w.type) out.push(w);
        }
        return out;
    }
    function repairWidgets() {
        try {
            /* 顶层 function 声明会挂到 window，但主壳也可能跑在模块作用域里；
               两种取法都试，取不到就诚实跳过，绝不伪造存档。 */
            var getLS = window.getUserLS ||
                (typeof getUserLS === 'function' ? getUserLS : null);
            var setLS = window.setUserLS ||
                (typeof setUserLS === 'function' ? setUserLS : null);
            if (typeof getLS !== 'function' || typeof setLS !== 'function') return;
            var cur = getLS('desktopWidgets');
            if (cur === null || cur === undefined) return;      /* 首启：不碰 */
            var list = cur;
            if (typeof cur === 'string') {
                /* 旧版本可能落过 JSON 字符串，能抢救就抢救 */
                try { list = JSON.parse(cur); } catch (e) { list = null; }
            }
            if (validList(list)) {
                var good = cleanList(list);
                if (good.length === list.length) return;         /* 完全健康，零写入 */
                setLS('desktopWidgets', good);
                report.repairedWidgets = true;
                report.repairedCount = list.length - good.length;
                return;
            }
            setLS('desktopWidgets', []);
            report.repairedWidgets = true;
            report.repairedCount = 0;
            warn('desktopWidgets 存档不是数组，已自愈为空列表');
        } catch (e) { warn('desktopWidgets 自愈失败（已跳过）', e); }
    }

    /* ---------------------------------------------------------------- ③④ */
    var REQUIRED = ['desktop', 'desktopWidgets', 'dock', 'widgetPanelGrid',
                    'widgetPanelSidebar', 'widgetPanelSearch'];
    function audit() {
        try {
            report.missingNodes = [];
            for (var i = 0; i < REQUIRED.length; i++) {
                if (!document.getElementById(REQUIRED[i])) report.missingNodes.push(REQUIRED[i]);
            }
            if (report.missingNodes.length) warn('关键节点缺失：' + report.missingNodes.join(', '));
        } catch (e) { warn('节点体检失败', e); }
        if (report.fileMode) {
            /* file:// 下 fetch / Worker 会失败，主壳已有各自降级路径；
               这里只留一条可查的事实，不弹窗、不改写任何运行状态。 */
            try {
                if (window.console && console.info) {
                    console.info('[n26 release guard] file:// 运行：网络接口降级，本地素材与离屏渲染照常');
                }
            } catch (x) { }
        }
        return snapshot();
    }
    function snapshot() {
        return {
            protocol: report.protocol,
            fileMode: report.fileMode,
            repairedWidgets: report.repairedWidgets,
            repairedCount: report.repairedCount,
            missingNodes: report.missingNodes.slice(),
            isolated: report.isolated.slice(),
            degraded: report.degraded.slice()
        };
    }

    /* 主壳已在底部同步执行完；DOMContentLoaded 可能已经过了，两种都覆盖。 */
    function once() {
        repairWidgets();
        audit();
        try { isolate(window.FangLux, 'relight', 'FangLux fanglux'); } catch (e) { }
    }
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', once, { once: true });
        } else {
            once();
        }
    } catch (e) { warn('启动体检注册失败', e); }

    window.N26ReleaseGuard = {
        version: 'rg2',
        audit: audit,
        report: snapshot,
        repairWidgets: repairWidgets,
        isolate: isolate
    };
})();
