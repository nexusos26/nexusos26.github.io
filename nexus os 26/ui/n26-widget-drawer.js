/* ==========================================================================
   Nexus OS 26 · 小组件抽屉「全等尺寸」编排 / 戳 drw5 · 2026-11-15
   --------------------------------------------------------------------------
   只做一件事：把每张预览卡按它当前选中的 cols×rows 换成真实的相对大小。

   ★ 用户 11-14 纠错：「我说的是真实大小，那个在网格里头占几格，它拖出来
     就是几格，就是真实大小……这叫真实形状，不是真实大小。相似和全等，
     明白吗？我要的是全等」。0.5 倍只是**相似**（形状对、大小缩小），
     drw5 改成**全等**：桌面网格 cell 76 / gap 16（N26_GRID 同公式）原样呈现，
     占几格预览就是几格多大，拖出来就是多大。

   ★ 主壳业务逻辑零改动：包装两个已有的顶层函数，保留返回值与异常。
     · renderWidgetPanelGrid（此时已是 grp2 分组版）：重排完再统一写尺寸。
     · n26SetSizeIndex：拖动尺寸滑块后立即同步这一张卡的外框。
   ★ 零布局读、零 MutationObserver、零 rAF 循环、零定时器、零 DOM 新建：
     只写 CSS 变量 / dataset / inline 宽高，且全部在渲染之后批量写。
   ★ 必须排在 groups.js(grp2) 之后，包装到的才是已完成分组的版本。
   ========================================================================== */
(function (global) {
    'use strict';
    if (global.N26WidgetDrawer) return;

    /* pc1 勘误（用户「相似和全等，我要的是全等」第二轮）：
       drw2~drw4 一直写 80px 格 / 14px 间距，但主壳 N26_GRID 是
       cell:76 / gap:16，n26WidgetPixelSize(c,r) = c*(76+16)-16。
       选择页 2×2 画成 174×174、桌面实物 168×168 —— 差 6px/格，
       不是全等。这里改成与 N26_GRID **同一个公式**，纯计算零布局读。
       _verify_pc1.py 会比对 N26_GRID 常量与本处，防止再次漂移。 */
    var CELL = 76;
    var GAP = 16;
    var PITCH = CELL + GAP;   /* 92 */
    var SCALE = 1;            /* 全等：预览框与桌面实物 1:1 */

    function sizeOf(card) {
        var s = card && card._size;
        var c = Math.max(1, Math.min(8, Math.round(Number(s && s.cols) || 2)));
        var r = Math.max(1, Math.min(8, Math.round(Number(s && s.rows) || 2)));
        return { c: c, r: r };
    }

    function applyCard(card) {
        if (!card || card.nodeType !== 1) return;
        var s = sizeOf(card);
        /* 与 n26WidgetPixelSize 逐字同式：cols * pitch - gap */
        var w = s.c * PITCH - GAP;
        var h = s.r * PITCH - GAP;
        var st = card.style;
        st.setProperty('--wp-cols', s.c);
        st.setProperty('--wp-rows', s.r);
        st.setProperty('--wp-pw', w + 'px');
        st.setProperty('--wp-ph', h + 'px');
        card.dataset.wpCols = String(s.c);
        card.dataset.wpRows = String(s.r);
        /* 预览框写死真实比例，并告诉渲染器用哪个等比系数（纯计算，不读布局）。 */
        var prev = card.querySelector('.widget-panel-card-preview');
        if (prev) {
            prev.dataset.wpScale = String(SCALE);
            prev.style.width = w + 'px';
            prev.style.height = h + 'px';
        }
    }

    function applyAll() {
        var grid = global.document.getElementById('widgetPanelGrid');
        if (!grid) return;
        var cards = grid.querySelectorAll('.widget-panel-card');
        for (var i = 0; i < cards.length; i++) {
            try { applyCard(cards[i]); } catch (e) { }
        }
    }

    function wrap(name, after) {
        var orig;
        try { orig = global[name]; } catch (e) { return; }
        if (typeof orig !== 'function') return;
        try {
            global[name] = function () {
                var r;
                try { r = orig.apply(this, arguments); }
                catch (e) { try { after.apply(null, arguments); } catch (x) { } throw e; }
                try { after.apply(null, arguments); } catch (x) { }
                return r;
            };
        } catch (e) { }
    }

    wrap('renderWidgetPanelGrid', function () { applyAll(); });
    wrap('n26SetSizeIndex', function (card) { applyCard(card); });

    /* 预热可能在 drw1 加载前就渲染过一次，启动时补齐；面板未渲染则空跑。 */
    try { applyAll(); } catch (e) { }

    global.N26WidgetDrawer = {
        version: 'drw5',
        cell: CELL,
        gap: GAP,
        pitch: PITCH,
        scale: SCALE,
        apply: applyAll,
        applyCard: applyCard
    };
})(window);
