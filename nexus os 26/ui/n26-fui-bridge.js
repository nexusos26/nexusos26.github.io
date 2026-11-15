/* ============================================================================
   ui/n26-fui-bridge.js · v2.10.21 · FangUI 四风格桥接与开放 API
   ----------------------------------------------------------------------------
   一份文件，宿主与 iframe 双模运行（靠 window.setFanguiStyle 是否存在区分）。
   做的事：
     ① 把四风格 id 落到 <html data-fui>，同时补齐 data-ui / data-neu；
     ② 宿主：把四风格映射回老三风格 body.style-*，让 615 条既有视觉规则复活；
        液态玻璃保持「零改动」，切走再切回精确还原启动基线；
     ③ iframe：挂 data-fui-auto 让通用控件自动跟随，并从 nexus:ready /
        nexus:theme / osControl 三路兜底取当前风格 —— 解决「后开的应用永远停在 liquid」；
     ④ 开放 N26Fui：STYLES / current / apply / set / on / tokens；
     ⑤ 切换瞬间挂 260ms 的 n26-fui-switching，只在那一刻加材质过渡。

   零外部依赖、防重复初始化、任何分支都不抛错。
   ============================================================================ */
(function () {
    'use strict';
    if (window.N26Fui) return;                        /* 护盾：重复引入只生效一次 */

    var VER = '1.3-v2.11.5';
    var STYLES = ['flat', 'neu-solid', 'neu-glass', 'liquid'];
    var DEFAULT = 'liquid';
    var LEGACY = { 'flat': 'style-flat', 'neu-solid': 'style-skeuomorphic', 'neu-glass': 'style-skeuomorphic' };
    var LEGACY_ALL = ['style-flat', 'style-skeuomorphic', 'style-glass'];
    var CSS_NAME = 'n26-fui-bridge.css';
    /* drw4：应用文档此前只有 3 页引过 fangui/core —— 四风格原生层与共享控件层
       在 iframe 里整体缺席。这里按 URL 逐份幂等补挂，宿主已 link 的同名 URL 自动跳过。 */
    var EXTRA_CSS = [
        '../fangui/core/tokens.css', '../fangui/core/flat.css',
        '../fangui/core/neu.css', '../fangui/core/liquid.css',
        'n26-fui-controls.css'
    ];

    var _current = null, _subs = [], _swTimer = 0;
    var _baseline = null, _dirty = false, _asked = false;

    function isHost() { return typeof window.setFanguiStyle === 'function'; }
    function valid(s) { return STYLES.indexOf(s) >= 0 ? s : DEFAULT; }
    function root() { return document.documentElement; }
    function body() { return document.body; }

    /* 从本脚本自身 URL 推导 CSS，子目录应用（necta / floatapp / …）也不会 404 */
    function ensureCSS() {
        try {
            var sc = document.currentScript || document.querySelector('script[src*="n26-fui-bridge.js"]');
            var base = (sc && sc.src) ? sc.src : location.href;
            function add(url, version) {
                if (document.querySelector('link[href*="' + url.split('/').pop() + '"]')) return;
                var l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = new URL(url + (version ? '?v=' + version : ''), base).href;
                (document.head || root()).appendChild(l);
            }
            add(CSS_NAME, 'fb4');                     /* 桥接层本体 */
            for (var i = 0; i < EXTRA_CSS.length; i++) {
                add(EXTRA_CSS[i], EXTRA_CSS[i].indexOf('fui-controls') >= 0 ? 'fc2' : '');
            }
        } catch (e) { }
    }

    function attrs(style) {
        if (style === 'neu-solid') return { ui: 'neu', neu: 'solid' };
        if (style === 'neu-glass') return { ui: 'neu', neu: 'glass' };
        return { ui: style, neu: null };
    }

    /* 启动时宿主可能已经挂了老风格类（applyUIStyle）。记下来，切回 liquid 时精确还原，
       否则「切到扁平再切回液态」会把原来的玻璃基线弄丢。 */
    function legacyBaseline() {
        if (_baseline !== null || !body()) return _baseline;
        _baseline = LEGACY_ALL.filter(function (c) { return body().classList.contains(c); }).join(' ');
        return _baseline;
    }
    function legacyRestore() {
        var b = body();
        if (!b || !_dirty) return;
        LEGACY_ALL.forEach(function (c) { b.classList.remove(c); });
        var base = legacyBaseline() || '';
        if (base) base.split(' ').forEach(function (c) { if (c) b.classList.add(c); });
        _dirty = false;
    }

    function emit(style, previous) {
        var payload = { style: style, previous: previous, version: VER };
        for (var i = 0; i < _subs.length; i++) {
            try { _subs[i](payload); } catch (e) { }
        }
    }

    function apply(style, opts) {
        style = valid(style);
        var r = root(), b = body();
        var silent = !!(opts && opts.silent);
        var previous = _current;
        var changed = previous !== null && previous !== style;

        /* 切换那一瞬才加过渡，切完立刻摘掉 —— 平时绝不覆盖任何应用的 transition */
        if (changed && !silent) {
            r.classList.add('n26-fui-switching');
            if (_swTimer) clearTimeout(_swTimer);
            _swTimer = setTimeout(function () {
                _swTimer = 0;
                try { root().classList.remove('n26-fui-switching'); } catch (e) { }
            }, 460);
        }

        r.setAttribute('data-fui', style);
        var a = attrs(style);
        r.setAttribute('data-ui', a.ui);
        if (a.neu) r.setAttribute('data-neu', a.neu);
        else r.removeAttribute('data-neu');

        if (isHost()) {
            if (style === 'liquid') {
                legacyRestore();                    /* 液态玻璃：零回归，一点不动 */
            } else {
                legacyBaseline();                    /* 第一次切走时才记基线，避免 boot 早于 applyUserSettings */
                if (_dirty) legacyRestore();
                b.classList.remove.apply(b.classList, LEGACY_ALL);
                b.classList.add(LEGACY[style]);
                _dirty = true;
            }
        } else if (r.getAttribute('data-fui-off') !== '1') {
            r.setAttribute('data-fui-auto', '1');   /* 第一方应用自动跟随 */
        }

        _current = style;
        if (changed) emit(style, previous);
        return style;
    }

    function current() {
        if (_current) return _current;
        if (isHost()) {
            try { return valid(window.getFanguiStyle()); } catch (e) { }
        }
        return valid(root().getAttribute('data-fui'));
    }

    function set(style) {
        style = valid(style);
        if (isHost()) {
            try { window.setFanguiStyle(style); } catch (e) { apply(style); }
        } else {
            apply(style);                            /* 本地先变，不等回包 = 及时响应 */
            try {
                if (window.Nexus && window.Nexus.call) {
                    window.Nexus.call('osControl', 'setSetting', { key: 'fanguiStyle', value: style })
                        .catch(function () { });
                }
            } catch (e) { }
        }
        return style;
    }

    function on(fn) {
        if (typeof fn !== 'function') return function () { };
        _subs.push(fn);
        return function () { var i = _subs.indexOf(fn); if (i >= 0) _subs.splice(i, 1); };
    }

    function tokens() {
        var out = {}, keys = ['surface', 'surface-2', 'border', 'radius', 'radius-sm',
            'shadow', 'shadow-raise', 'shadow-press', 'blur', 'sat', 'dur', 'ease'];
        try {
            var cs = getComputedStyle(root());
            keys.forEach(function (k) { out[k] = cs.getPropertyValue('--n26-fui-' + k).trim(); });
        } catch (e) { }
        return out;
    }

    window.N26Fui = {
        version: VER, STYLES: STYLES, DEFAULT: DEFAULT,
        current: current, apply: apply, set: set, on: on, tokens: tokens,
        ensureCSS: ensureCSS,
        /* fb4：四风格全页面覆盖自查。任何页面（宿主 / iframe / 独立页）
           都能当场读到实时挂载点与已补挂的样式表， audits 用得上。 */
        coverage: function () {
            var r = root();
            var d = document;
            function has(name) { return !!d.querySelector('link[href*="' + name + '"]'); }
            return {
                version: VER,
                style: current(),
                ui: r.getAttribute('data-ui'),
                neu: r.getAttribute('data-neu'),
                host: isHost(),
                css: {
                    bridge: has(CSS_NAME),
                    tokens: has('tokens.css'),
                    flat: has('flat.css'),
                    neu: has('neu.css'),
                    liquid: has('liquid.css'),
                    controls: has('n26-fui-controls.css')
                }
            };
        }
    };

    /* ---------- 事件：宿主 / iframe 共用 ---------- */
    window.addEventListener('nexus:fuistyle', function (e) {
        var d = e.detail || {};
        apply(d.style || DEFAULT);
    });
    window.addEventListener('nexus:theme', function (e) {
        var d = e.detail || {};
        if (d.fanguiStyle) apply(d.fanguiStyle);
        else if (d.settings && d.settings.fanguiStyle) apply(d.settings.fanguiStyle);
    });
    window.addEventListener('nexus:ready', function (e) {
        var d = e.detail || {};
        if (d.settings && d.settings.fanguiStyle) apply(d.settings.fanguiStyle, { silent: true });
    });

    /* 从 _app.js 已写好的 data-ui / data-neu 反推完整风格 id，避免首屏先液态再跳扁平 */
    function inferFromAttrs() {
        var r = root(), ui = r.getAttribute('data-ui'), neu = r.getAttribute('data-neu');
        if (ui === 'neu' && neu === 'solid') return 'neu-solid';
        if (ui === 'neu' && neu === 'glass') return 'neu-glass';
        if (ui === 'flat' || ui === 'liquid') return ui;
        return '';
    }

    /* 第四路兜底：打包产物里可能连 Nexus 桥都没有，直接读同源父窗口的
       data-fui（与 _app.js 的 readHostGlass 同一招），拿不到就静默用默认值。 */
    function readHostFui() {
        try {
            if (window.parent !== window && window.parent.document) {
                return window.parent.document.documentElement.getAttribute('data-fui');
            }
        } catch (e) { }
        return null;
    }

    /* ---------- 后开应用兜底：四条通道，拿不到也不影响启动 ---------- */
    function boot() {
        ensureCSS();
        var start = isHost() ? current()
            : (root().getAttribute('data-fui') || inferFromAttrs() || readHostFui() || '');
        apply(start || DEFAULT, { silent: true });

        if (isHost() || _asked) return;
        /* ① __nexusInit 已带 settings（最快，同源一次推送）
           ② 没带就主动问一次 osControl —— 修「切到扁平后新开的应用还是液态」
           总是问一次是幂等的：值相同就不 apply，不会造成二次闪。 */
        _asked = true;
        try {
            if (window.Nexus && window.Nexus.call) {
                window.Nexus.call('osControl', 'getSetting', { key: 'fanguiStyle' })
                    .then(function (v) { if (v && valid(v) !== current()) apply(v, { silent: true }); })
                    .catch(function () { });
            }
        } catch (e) { }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
