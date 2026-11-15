/* ============================================================
   Nexus OS 26 · data-mode → data-theme 适配器（apps/_theme-adapter.js）
   ------------------------------------------------------------
   仅给「自带 data-theme 调色板」的历史应用用（Strata / Reelix / Float）。
   宿主 _app.js 只写 html[data-mode] 与 body.dark-mode，这里单向映射成
   html[data-theme]，不反向回写宿主，避免和应用内主题开关互相覆盖。
   加载顺序：_bridge.js → _app.js → 本文件。
   ============================================================ */
(function () {
    'use strict';

    function hostMode() {
        var m = document.documentElement.getAttribute('data-mode');
        if (m === 'dark' || m === 'light') return m;
        if (document.body && document.body.classList.contains('dark-mode')) return 'dark';
        return null;
    }

    function sync() {
        var m = hostMode();
        if (!m) return;
        var de = document.documentElement;
        if (de.getAttribute('data-theme') !== m) de.setAttribute('data-theme', m);
        if (document.body && document.body.getAttribute('data-theme') !== m) {
            document.body.setAttribute('data-theme', m);
        }
    }

    /* v2.10.21：Strata / Reelix / Float 这类打包产物不引 _app.js，
       风格桥层由这里补挂（与 _app.js 的注入互为幂等，重复引也不会加载两份）。 */
    (function ensureFuiBridge() {
        try {
            if (document.querySelector('script[src*="n26-fui-bridge.js"]')) return;
            var s = document.currentScript || document.querySelector('script[src*="_theme-adapter.js"]');
            var base = (s && s.src) ? s.src : location.href;
            var sc = document.createElement('script');
            sc.src = new URL('../ui/n26-fui-bridge.js?v=fb4', base).href;
            sc.async = false;
            (document.head || document.documentElement).appendChild(sc);
        } catch (e) { }
    })();

    /* v2.10.23：Strata / Reelix / Float 这类打包产物不引 _app.js，
       光学层由这里补挂（与 _app.js 的注入互为幂等，不会加载两份）。 */
    (function ensureGlassOptics() {
        try {
            if (window.N26GlassOptics || document.querySelector('script[src*="n26-glass-optics.js"]')) return;
            var s = document.currentScript || document.querySelector('script[src*="_theme-adapter.js"]');
            var base = (s && s.src) ? s.src : location.href;
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = new URL('../ui/n26-glass-optics.css?v=go11', base).href;
            (document.head || document.documentElement).appendChild(l);
            var sc = document.createElement('script');
            sc.src = new URL('../ui/n26-glass-optics.js?v=go8', base).href;
            sc.async = false;
            (document.head || document.documentElement).appendChild(sc);
        } catch (e) { }
    })();

    function boot() {
        sync();
        var mo = new MutationObserver(sync);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
        if (document.body) {
            mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        } else {
            document.addEventListener('DOMContentLoaded', sync);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
