/* ==========================================================================
   Nexus OS 26 · 小组件抽屉开合状态机 / 戳 dm1 · 2026-11-15
   --------------------------------------------------------------------------
   只做一件事：给 openWidgetPanel / closeWidgetPanel 套一层状态类编排，
   让 n26-widget-drawer-motion.css 的进出场动画真的跑完。主壳业务逻辑零改动。

   ★ 为什么必须包装而不是改主壳：
     openWidgetPanel() 首次会把 #widgetPanel 从 #desktop reparent 到 body
     （drw3 层级铁律），DOM 重挂载会吃掉 transition 的上一帧起点；
     而 animation + fill-mode:both 不依赖起点，reparent 后照样从 102% 滑入。
   ★ closeWidgetPanel() 原来立刻 remove('show')，n26-perf.css 的 visibility
     隐藏又没被延迟（被 widgets.css 的 transition !important 覆盖），
     退场一帧都画不出来。这里按状态类把面板留到动画跑完再收回。
   ★ 状态机：idle → n26-dm-in → n26-dm-open → n26-dm-out → idle
     · in / open 绝不共存（n26-dm-open 的 translate:none !important 会压过动画）
     · 退场途中重新打开：清掉 out、强制重放 in，不会卡在半空
   ★ 零 MutationObserver / 零 rAF 循环 / 零常驻定时器，只有一次性收尾 timeout；
     一次 offsetWidth 是重放 animation 必需的样式刷新，不是逐帧布局读。
   ========================================================================== */
(function (global) {
    'use strict';
    if (global.N26DrawerMotion) return;

    var DUR_IN = 460;
    var DUR_OUT = 340;
    var _timer = 0;
    var _seq = 0;

    function panelEl() { return global.document.getElementById('widgetPanel'); }
    function bodyEl() { return global.document.body; }

    function settle() {
        if (_timer) { clearTimeout(_timer); _timer = 0; }
        _seq += 1;
        return _seq;
    }

    function wrap(name, impl) {
        var orig;
        try { orig = global[name]; } catch (e) { return; }
        if (typeof orig !== 'function') return;
        global[name] = function () {
            return impl.call(this, orig, arguments);
        };
    }

    /* ---------------------------------------------------------------- 打开 */
    wrap('openWidgetPanel', function (orig, args) {
        var p = panelEl();
        if (!p) return orig.apply(this, args);
        var seq = settle();
        var b = bodyEl();

        try {
            /* 预热层会在启动几帧内把面板按 2% 画亮；用户真打开了就撤掉，
               否则它的 opacity:.02 !important / transform:none !important
               会压过入场动画。 */
            if (b) b.classList.remove('n26-gp');
        } catch (e) { }

        p.classList.remove('n26-dm-out', 'n26-dm-open', 'n26-dm-in');
        if (b) b.classList.remove('n26-dm-closing');
        /* 重复打开 / 退场途中打开：强制样式刷新，animation 才会重头播。 */
        try { void p.offsetWidth; } catch (e) { }

        p.classList.add('n26-dm-in');
        var r = orig.apply(this, args);        /* reparent + add show + 两帧后填格子 */
        if (b) b.classList.add('n26-dm-closing');

        _timer = setTimeout(function () {
            if (seq !== _seq) return;
            p.classList.remove('n26-dm-in');
            p.classList.add('n26-dm-open');    /* 动画跑完才交给稳态 */
            if (b) b.classList.remove('n26-dm-closing');
            _timer = 0;
        }, DUR_IN + 40);
        return r;
    });

    /* ---------------------------------------------------------------- 关闭 */
    wrap('closeWidgetPanel', function (orig, args) {
        var p = panelEl();
        if (!p) return orig.apply(this, args);
        var seq = settle();
        var b = bodyEl();
        var wasOpen = p.classList.contains('show') || p.classList.contains('n26-dm-open');

        /* 先撤稳态，再让原函数摘 .show —— 此时静态态是「藏在下方」，
           退场 animation 的 from 会把面板拉回 0 位置再滑走，无跳变。 */
        p.classList.remove('n26-dm-in', 'n26-dm-open');
        var r = orig.apply(this, args);

        if (!wasOpen) {
            p.classList.remove('n26-dm-out');
            if (b) b.classList.remove('n26-dm-closing');
            return r;
        }
        p.classList.add('n26-dm-out');
        if (b) b.classList.add('n26-dm-closing');

        _timer = setTimeout(function () {
            if (seq !== _seq) return;
            p.classList.remove('n26-dm-out');
            if (b) b.classList.remove('n26-dm-closing');
            _timer = 0;
        }, DUR_OUT + 40);
        return r;
    });

    global.N26DrawerMotion = {
        version: 'dm1',
        in: DUR_IN,
        out: DUR_OUT,
        states: ['idle', 'n26-dm-in', 'n26-dm-open', 'n26-dm-out']
    };
})(window);
