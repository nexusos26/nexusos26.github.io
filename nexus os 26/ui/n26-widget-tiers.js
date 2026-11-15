/* ==========================================================================
   ui/n26-widget-tiers.js · 戳 tierjs1 · 2026-11-13
   --------------------------------------------------------------------------
   ★ docs/小组件设计规格-全量47款.md §5.3 第 2 条欠账：渲染器内容切片。

     问题：主壳若干渲染器**恒定输出全部数据** ——
       renderCalendarWidget() 恒输出 42 个日期格、
       renderBrowserWidget() / renderTodoWidget() / renderClipboardWidget()
       / renderMinigameWidget() 恒输出全部条目。
     6 个族层用 CSS `:nth-child(n+N)` 解决了「不溢出」，但那是
     **画出来再藏**，不是「按尺寸换内容」；尤其日历 2×2 想显示的是
     **本周那一周**，CSS 只能藏掉第 3 行起，挑不出正确的一周。

   ★ 做法（主壳业务逻辑零改动）：
     运行时包装 window.renderWidgetContent —— 拿到原渲染器返回的 HTML，
     用 DOMParser 在**离屏文档**里按 cols×rows 把多余子节点真正删掉，
     再序列化返回。两个调用点（主壳 47692 面板预览 / 48102 桌面卡）
     都带 cols/rows，所以桌面卡与预览卡同规格。

   ★ 为什么不复制渲染器：47 款渲染器各自依赖主壳全局状态与函数，
     复制一份必然漂移。包装 + 离屏裁切对全部类型通用，且新类型
     只要进 RULES 就能吃到，不用改主壳一个字。

   ★ 性能纪律（P0 教训）：
     零 MutationObserver、零 rAF、零逐帧定时器、零 getBoundingClientRect、
     零布局读；DOMParser 只在小组件渲染那一刻跑一次，解析几百字节；
     没有任何常驻监听。异常一律 catch 后原样返回，绝不吞掉渲染结果。

   ★ 红线：只删「列表项 / 日期格 / 标签 / 推荐卡」，
     **绝不碰图片层**（.nx-mu-cover / .w-ph / .w-wp-item 里的 <img> /
     .n26-sky-layer）与音乐族 2×2（由 ml1 独立权威层收口）。
     隐藏名单逐条列名，绝不写「删掉内容层所有子元素」。

   ★ 加载位置：必须在主壳内联 script 之后（renderWidgetContent 已定义）、
     且排在 ui/n26-widget-plus.js 之后；主壳底部只加一行 <script>。
   ========================================================================== */
(function () {
    'use strict';
    if (window.__N26TierClip) return;

    var orig = window.renderWidgetContent;
    if (typeof orig !== 'function') return;   /* 主壳未就绪：诚实跳过，不伪造 */

    /* 尺寸层级，与 ui/n26-widget-plus.js 的 tier() 完全同口径 */
    function tier(c, r) {
        if (r === 1) return 'bar';
        if (r >= 4) return 'l';
        if (r === 3) return 'm3';
        return c >= 3 ? 'm2' : 's';
    }

    /* 列表型：每档可见条数。bar 档 CSS 已隐藏列表，这里留 1 条防止空态塌陷 */
    var LIST_LIMIT = { bar: 1, s: 2, m2: 3, m3: 4, l: 5 };

    /* type → 容器 / 条目选择器。
       容器只用于定位；条目用 querySelectorAll 全局取，兼容渲染器
       把条目包了一层 wrapper 的情况。 */
    var RULES = {
        browser:       { item: '.widget-browser-list > .widget-browser-bookmark', list: true },
        todo:          { item: '.widget-todo-list > .widget-todo-item',           list: true },
        clipboard:     { item: '.w-cb-list > .w-cb-item',                         list: true },
        minigame:      { item: '.widget-minigame-list > .widget-minigame-item',   list: true },
        quicklaunch:   { item: '.w-ql > .w-ql-btn:not(.w-ql-add)',                list: true,
                         limit: { bar: 6, s: 2, m2: 4, m3: 6, l: 8 } },
        biliReco:      { item: '.nx-bili-li',                                      list: true,
                         limit: { bar: 1, s: 2, m2: 3, m3: 3, l: 5 } },
        musicQueue:    { item: '.nx-mu-qi',                                        list: true,
                         limit: { bar: 1, s: 3, m2: 4, m3: 5, l: 6 } },
        wallpaperpick: { item: '.w-wp-item',                                       list: true,
                         limit: { bar: 1, s: 1, m2: 2, m3: 4, l: 4 } },
        biliSearch:    { item: '.nx-bili-tags > .nx-bili-tag',                     max: 4 },
        calendar:      { calendar: true }
    };

    /* 日历：2×2 只留「今天所在那一周」的 7 格，4×2 留 14 格，
       4×3 / 4×4 / 6×3 才是整月 42 格（MD §3 #15）。
       这是 CSS 做不到、必须靠内容切片的地方。 */
    function clipCalendar(doc, c, r) {
        var cells = Array.prototype.slice.call(doc.querySelectorAll('.widget-cal-grid > .widget-cal-day'));
        if (cells.length < 7) return;
        if (r === 1 || r >= 3 && c >= 4) return;      /* 胶囊交给 CSS；大方档整月 */
        var keep = (r === 2 && c >= 4) ? 14 : 7;
        var idx = -1;
        for (var i = 0; i < cells.length; i++) {
            if (cells[i].classList && cells[i].classList.contains('today')) { idx = i; break; }
        }
        var start = idx >= 0 ? Math.floor(idx / 7) * 7 : 0;
        var end = Math.min(cells.length, start + keep);
        /* 尾部不够就往前借整行，保证总是 keep 个 */
        if (end - start < keep) start = Math.max(0, end - keep);
        for (var k = 0; k < cells.length; k++) {
            if (k < start || k >= end) {
                if (cells[k].parentNode) cells[k].parentNode.removeChild(cells[k]);
            }
        }
    }

    function clip(type, c, r, html) {
        var rule = RULES[type];
        if (!rule || typeof html !== 'string' || html.indexOf('<') < 0) return html;
        var doc;
        try {
            doc = new DOMParser().parseFromString('<div id="n26-tier-root">' + html + '</div>', 'text/html');
        } catch (e) { return html; }
        var root = doc.getElementById('n26-tier-root');
        if (!root) return html;

        try {
            if (rule.calendar) {
                clipCalendar(root, c, r);
            } else {
                var t = tier(c, r);
                var lim = rule.max !== undefined ? rule.max
                        : (rule.limit ? rule.limit[t] : LIST_LIMIT[t]);
                var nodes = Array.prototype.slice.call(root.querySelectorAll(rule.item));
                for (var i = lim; i < nodes.length; i++) {
                    if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
                }
            }
        } catch (e) {
            return html;                 /* 裁切失败也要把原 HTML 还回去 */
        }
        return root.innerHTML;
    }

    function readSize(w) {
        var c = Number(w && w.cols), r = Number(w && w.rows);
        var st = (w && w.settings) || {};
        if (!(c > 0)) c = Number(st.__cols);
        if (!(r > 0)) r = Number(st.__rows);
        return { c: c > 0 ? c : 2, r: r > 0 ? r : 2 };
    }

    /* 运行时包装：原函数照常跑（含 N26W2 扩展钩子 / ml1 / plus 18 款），
       只在返回值上做离屏裁切。不递归、不改任何业务逻辑。 */
    window.renderWidgetContent = function (type, w) {
        var html = orig(type, w);
        if (!RULES[type]) return html;
        var s = readSize(w);
        try { return clip(type, s.c, s.r, html); } catch (e) { return html; }
    };

    window.__N26TierClip = {
        rules: Object.keys(RULES),
        /* 只读诊断：Ctrl+Alt+D 的探针可读，不催用户测、不产生任何副作用 */
        inspect: function (type, c, r, html) { return clip(type, c, r, html); }
    };
})();
