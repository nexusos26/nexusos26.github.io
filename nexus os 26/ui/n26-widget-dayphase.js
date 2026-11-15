/* ==========================================================================
   ui/n26-widget-dayphase.js · v1 / 戳 wdp1
   --------------------------------------------------------------------------
   小组件昼夜主题的唯一时钟源。

   设计口径（用户 2026-11-11 21:46 / 21:49）：
     · 天气卡到晚上必须从「蓝色灰蒙蒙」变成「黑底 + 星星和月亮」
     · 时间类卡同样要跟随昼夜
     · 全部小组件集体适配，不是只改天气那一张

   ★ 性能纪律（P0 收官后的硬约束，一个字都不能破）：
     ① 只往 <html> 写两个属性，绝不逐卡片写、绝不碰 innerHTML；
     ② **没有 MutationObserver** —— 三天 P0 的真凶就是逐玻璃 class MO 自激环，
        这里靠「根属性 + CSS 后代选择器」让新渲染的卡片天然继承，不需要观察 DOM；
     ③ 只有一个 60s setInterval，回调只在时段真的翻转时才写盘；
     ④ 零布局读（getBoundingClientRect / offsetWidth / getComputedStyle 全无）、
        零 rAF 循环、零 filter、零新增合成层。

   调试：地址栏加 ?n26phase=night 可强制夜间；控制台
         N26DayPhase.set('dusk') / N26DayPhase.clear() / N26DayPhase.apply()
   ========================================================================== */
(function () {
    'use strict';
    if (window.N26DayPhase) return;                 /* 重复引入只生效一次 */

    var KEY = 'data-n26-phase';
    var HKEY = 'data-n26-hour';
    var VALID = { day: 1, dawn: 1, dusk: 1, night: 1 };

    function phaseOf(h) {
        if (h >= 19 || h < 5) return 'night';      /* 19:00–04:59 夜 */
        if (h >= 5 && h < 7) return 'dawn';        /* 05:00–06:59 黎明 */
        if (h >= 17 && h < 19) return 'dusk';      /* 17:00–18:59 黄昏 */
        return 'day';                              /* 07:00–16:59 白天 */
    }

    var forced = null;
    try {
        var m = String(location.search || '').match(/[?&]n26phase=(night|day|dawn|dusk)\b/i);
        if (m) forced = m[1].toLowerCase();
    } catch (e) { }

    var last = '';
    var lastHour = -1;

    function nowHour() { try { return new Date().getHours(); } catch (e) { return 12; } }

    function apply() {
        var h = nowHour();
        var p = forced || phaseOf(h);
        if (p !== last) {
            last = p;
            try { document.documentElement.setAttribute(KEY, p); } catch (e) { }
        }
        if (h !== lastHour) {
            lastHour = h;
            try { document.documentElement.setAttribute(HKEY, String(h)); } catch (e) { }
        }
        return p;
    }

    window.N26DayPhase = {
        phaseOf: phaseOf,
        get: function () { return last; },
        hour: function () { return nowHour(); },
        apply: apply,
        set: function (p) {
            if (!VALID[p]) return last;
            forced = p; last = ''; lastHour = -1;
            return apply();
        },
        clear: function () { forced = null; last = ''; lastHour = -1; return apply(); }
    };

    apply();                                       /* 启动即写一次 */
    try { setInterval(apply, 60000); } catch (e) { }
    try {
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) { last = ''; lastHour = -1; apply(); }
        });
    } catch (e) { }
})();
