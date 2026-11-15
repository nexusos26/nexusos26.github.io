/* ==========================================================================
   Nexus OS 26 · 独立页面四风格同步器 / 戳 fs1 · 2026-11-15
   --------------------------------------------------------------------------
   用途：给「不引 apps/_app.js / apps/_bridge.js」的两个独立页面补上
   FangUI 四风格的实时挂载点、原生层与共享控件层：
     · apps/_ui-demo.html           （自包含 UI 组件示例，已有 4 套核心 CSS）
     · apps/vm-os1/Nexus OS.html   （36164 行自包含 VM OS，不能注入整套 _app.js）

   为什么单独一份：注入 _app.js 会给 vm-os1 带去图标字体 / 光学层 / 位置服务
   等一整套宿主运行时，对一个自带完整 UI 的打包页面是破坏性的。这里只做
   「挂属性 + 补 CSS + 收广播」，一行页面 DOM 都不动。

   链路：
     ① 幂等补挂 fangui/core/{tokens,flat,neu,liquid}.css + n26-fui-controls.css?v=fc2
        （路径从本脚本自身 URL 推导，apps/ 与 apps/vm-os1/ 两种深度都不会 404）
     ② 把风格 id 落成实时挂载点 html[data-ui] + html[data-neu]，
        同时写 data-fui 作为运行时状态（fb2 勘误：data-fui 不是切换挂载点）
     ③ 收宿主 postMessage（__nexusEvt / fuistyle）、启动读同源父窗口、
        窗口重新获得焦点时再读一次 —— 四条通道都拿不到就静默用 liquid
   ★ 零 MutationObserver / 零定时器 / 零 rAF 循环；任何分支都不抛错。
   ========================================================================== */
(function (global) {
    'use strict';
    if (global.N26FuiSync) return;

    var STYLES = ['flat', 'neu-solid', 'neu-glass', 'liquid'];
    var DEFAULT = 'liquid';
    var CSS = [
        ['../fangui/core/tokens.css', ''],
        ['../fangui/core/flat.css', ''],
        ['../fangui/core/neu.css', ''],
        ['../fangui/core/liquid.css', ''],
        ['n26-fui-controls.css', 'fc2']
    ];
    var _current = DEFAULT;
    var _added = [];

    function valid(s) { return STYLES.indexOf(s) >= 0 ? s : DEFAULT; }

    function attrs(style) {
        if (style === 'neu-solid') return { ui: 'neu', neu: 'solid' };
        if (style === 'neu-glass') return { ui: 'neu', neu: 'glass' };
        if (style === 'flat' || style === 'liquid') return { ui: style, neu: null };
        return { ui: 'liquid', neu: null };
    }

    function apply(style) {
        style = valid(style);
        var r = global.document.documentElement;
        if (!r) return style;
        var a = attrs(style);
        r.setAttribute('data-ui', a.ui);
        if (a.neu) r.setAttribute('data-neu', a.neu);
        else r.removeAttribute('data-neu');
        r.setAttribute('data-fui', style);
        r.setAttribute('data-fui-auto', '1');
        _current = style;
        return style;
    }

    function ensureCSS() {
        try {
            var d = global.document;
            var sc = d.currentScript || d.querySelector('script[src*="n26-fui-sync.js"]');
            var base = (sc && sc.src) ? sc.src : d.location.href;
            var head = d.head || d.documentElement;
            for (var i = 0; i < CSS.length; i++) {
                var url = CSS[i][0], ver = CSS[i][1];
                var name = url.split('/').pop();
                if (d.querySelector('link[href*="' + name + '"]')) { _added.push(name + ':exists'); continue; }
                var l = d.createElement('link');
                l.rel = 'stylesheet';
                l.href = new URL(url + (ver ? '?v=' + ver : ''), base).href;
                head.appendChild(l);
                _added.push(name);
            }
        } catch (e) { }
    }

    /* 打包页可能被宿主以外层 iframe 打开，也可能被直接双击打开。
       直接读同源父窗口的 data-fui 是最快的一条通道。 */
    function readHost() {
        try {
            if (global.parent === global || !global.parent.document) return '';
            var pr = global.parent.document.documentElement;
            return pr.getAttribute('data-fui') || pr.getAttribute('data-ui') || '';
        } catch (e) {
            return '';
        }
    }

    function fromUiAttr() {
        try {
            var r = global.document.documentElement;
            var ui = r.getAttribute('data-ui');
            var neu = r.getAttribute('data-neu');
            if (ui === 'neu' && neu === 'solid') return 'neu-solid';
            if (ui === 'neu' && neu === 'glass') return 'neu-glass';
            if (ui === 'flat' || ui === 'liquid') return ui;
        } catch (e) { }
        return '';
    }

    function boot() {
        ensureCSS();
        apply(fromUiAttr() || readHost() || DEFAULT);
    }

    global.addEventListener('message', function (e) {
        var d = e && e.data;
        if (!d || typeof d !== 'object') return;
        if (d.__nexusEvt) {
            if (d.name === 'fuistyle') apply(d.data && d.data.style);
            else if (d.name === 'theme') {
                var s = d.data && (d.data.fanguiStyle ||
                    (d.data.settings && d.data.settings.fanguiStyle));
                if (s) apply(s);
            }
        } else if (d.type === 'nexus:fuistyle') {
            apply(d.style);
        }
    });

    /* 挂到后台再切回来时补一次状态，不用常驻轮询。 */
    global.addEventListener('focus', function () {
        var s = readHost();
        if (s && valid(s) !== _current) apply(s);
    });

    global.N26FuiSync = {
        version: 'fs1',
        STYLES: STYLES,
        current: function () { return _current; },
        apply: apply,
        set: apply,
        coverage: function () {
            var r = global.document.documentElement;
            return {
                style: _current,
                ui: r.getAttribute('data-ui'),
                neu: r.getAttribute('data-neu'),
                css: _added.slice(),
                core: CSS.length
            };
        }
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
