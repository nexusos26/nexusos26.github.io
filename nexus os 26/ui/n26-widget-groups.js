/* ==========================================================================
   Nexus OS 26 · 小组件选择面板「按软件分组」/ 戳 grp4 · 2026-11-15
   --------------------------------------------------------------------------
   用户 11-13 钦定：「很多同一个软件的小组件，哪怕它们是不同功能的，
   都放在一个。一个组的小组件就叫软件的名字，点击之后就会展开软件里头的
   所有小组件，以及音乐的小组件。」

   做法（主壳业务逻辑零改动）：
     · 包装顶层 renderWidgetPanelGrid：先让原函数照常生成 47 张卡片、
       尺寸滑块、事件委托、懒加载观察器，再把卡片按软件重排进 8 个组。
       原函数的所有 onclick / onpointerdown 都绑在 #widgetPanelGrid 上，
       卡片只是换了父节点，委托依旧生效。
     · 左侧栏换成「全部 + 8 个软件名」；点软件名＝只显示该软件、
       展开它下面所有小组件；点「全部」＝显示 8 个可折叠的软件组。
     · 组名就是软件名，与 fam3 的 8 个家族一一对应（47 款全覆盖）。

   ★ 折叠期间把卡片的 data-available 临时改成 '0'（原值存在 data-wp-avail），
     展开时恢复。这样主壳 3 处
     document.querySelector('#widgetPanelGrid .widget-panel-card[data-available="1"]')
     （搜索框 Enter / ArrowDown、方向键导航）自动只看见展开的卡片，
     不会 focus 到 display:none 的卡片、也不会「盲添加」看不见的组件。
     折叠卡片本来就不可点，改这个属性没有副作用。
   ★ 空态（搜索无结果）不重排，主壳的 .widget-panel-empty 原样保留。
   ★ grp4（用户「很多空当」）：组内按真实 rows / cols 升序排一次。卡片是
      1:1 全等尺寸，flex 行高由该行最高卡撑开；把相近高度的卡排在一起，
      小卡下方就不会被一张 4×4 大卡顶出大片空白。只改 DOM 顺序，不改尺寸、
      不改内容、不改事件委托（绑在 grid 上）。
   ★ grp3 鲁棒性：主壳会因签名变化自己 grid.innerHTML = ''；此时 wpGroupSig
     仍留在 grid 上，旧逻辑会认为「已分组」而不重排 → 面板永久空白。
     现在每次都查「有没有 .wp-soft-group 之外的孤儿卡片」，有就强制重排；
     regroup 先摘掉旧组再挂新组，重复调用也不会叠出两层。
   ========================================================================== */
(function () {
    'use strict';

    /* 8 个软件组 = fam3 的 8 个家族；ids 为面板可见的全部 47 款。 */
    var GROUPS = [
        { key: 'clock',    name: '时钟',       icon: 'fa-clock',            color: '#0284c7', ids:
            ['clock', 'dualtime', 'timeSeconds', 'clockAnalog', 'worldclock', 'stopwatch', 'countdown'] },
        { key: 'weather',  name: '天气',       icon: 'fa-cloud-sun',        color: '#0ea5e9', ids:
            ['weather', 'weatherHour', 'weatherWeek', 'airQuality', 'sunrise', 'sunmoon', 'moonphase'] },
        { key: 'calendar', name: '日历',       icon: 'fa-calendar',         color: '#f97316', ids:
            ['calendar', 'schedule', 'weekStrip', 'bigDate', 'dayProgress', 'dayCard', 'greeting', 'todayAgenda'] },
        { key: 'todo',     name: '待办事项',   icon: 'fa-list-check',       color: '#3b82f6', ids:
            ['todo', 'todoRing', 'quickNote'] },
        { key: 'system',   name: '系统监视器', icon: 'fa-microchip',        color: '#10b981', ids:
            ['system', 'battery', 'network', 'diskSpace', 'volume', 'quicklaunch'] },
        { key: 'music',    name: '音乐',       icon: 'fa-compact-disc',     color: '#1d4ed8', ids:
            ['music', 'musicQueue', 'musicSearch', 'musicReco', 'musicRadio'] },
        { key: 'bili',     name: '方哩方哩',   icon: 'fa-circle-play',      color: '#d95c86', ids:
            ['biliNow', 'biliReco', 'biliSearch'] },
        { key: 'tools',    name: '实用工具',   icon: 'fa-toolbox',          color: '#14b8a6', ids:
            ['minigame', 'sleep', 'focus', 'browser', 'calculator', 'clipboard', 'photos', 'wallpaperpick'] }
    ];

    var MAP = {};
    GROUPS.forEach(function (g) {
        g.ids.forEach(function (id) { MAP[id] = g.key; });
    });

    /* drw4：默认 8 组全展开 —— 折叠会让 40 款看着像「被搞没了」。
   滚动由 #widgetPanelGrid 承担，组头 sticky，用户仍可手动收起。 */
var open = { clock: true, weather: true, calendar: true, todo: true,
             system: true, music: true, bili: true, tools: true };
    var searchClosed = {};            /* 搜索态下用户手动收起的组 */
    var active = 'all';               /* 左侧栏选中的软件 */
    var lastQuery = '';

    function gridEl() { return document.getElementById('widgetPanelGrid'); }
    function sideEl() { return document.getElementById('widgetPanelSidebar'); }
    function query() {
        var i = document.getElementById('widgetPanelSearch');
        return i ? String(i.value || '').trim().toLowerCase() : '';
    }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ---------------------------------------------------------------- 左侧栏 */
    function softBtn(key, icon, name, count) {
        return '<button type="button" class="wp-soft-btn' + (key === active ? ' active' : '') +
            '" data-soft="' + key + '"><i class="fas ' + icon + '"></i>' +
            '<span>' + esc(name) + '</span><em data-count="' + key + '">' + count + '</em></button>';
    }
    function buildSidebar() {
        var s = sideEl();
        if (!s || s.dataset.grpBuilt === '1') return;
        s.dataset.grpBuilt = '1';
        s.dataset.built = '1';       /* 主壳不再写它自己的 4 个分类按钮 */
        s.onclick = null;            /* 主壳的 onclick 只认 .wp-cat-btn，这里彻底解绑 */
        var html = '<div class="wp-soft-side-title">按软件</div>' + softBtn('all', 'fa-border-all', '全部小组件', 47);
        GROUPS.forEach(function (g) { html += softBtn(g.key, g.icon, g.name, g.ids.length); });
        s.innerHTML = html;
        s.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('.wp-soft-btn') : null;
            if (!b || b.disabled || !b.dataset.soft) return;
            active = b.dataset.soft;
            updateSideActive();
            applyView();
        });
    }
    function updateSideActive() {
        var s = sideEl(); if (!s) return;
        Array.prototype.forEach.call(s.querySelectorAll('.wp-soft-btn'), function (b) {
            b.classList.toggle('active', b.dataset.soft === active);
        });
    }
    function updateCounts(grid, searching) {
        var s = sideEl(); if (!s) return;
        var total = 0;
        GROUPS.forEach(function (g) {
            var sec = grid.querySelector('.wp-soft-group[data-soft="' + g.key + '"]');
            var n = sec ? sec.querySelectorAll('.widget-panel-card').length : 0;
            total += n;
            var em = s.querySelector('em[data-count="' + g.key + '"]');
            if (em) em.textContent = n;
            var btn = s.querySelector('.wp-soft-btn[data-soft="' + g.key + '"]');
            if (btn) btn.disabled = searching && n === 0;
        });
        var ea = s.querySelector('em[data-count="all"]');
        if (ea) ea.textContent = total;
    }

    /* ---------------------------------------------------------------- 主区重排 */
    function headHtml(g) {
        return '<span class="wp-soft-ico"><i class="fas ' + g.icon + '"></i></span>' +
            '<span class="wp-soft-txt"><b>' + esc(g.name) + '</b><small class="wp-soft-sub"></small></span>' +
            '<span class="wp-soft-count"></span>' +
            '<span class="wp-soft-added" hidden></span>' +
            '<i class="fas fa-chevron-down wp-soft-chev"></i>';
    }
    function regroup(grid) {
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.widget-panel-card'));
        if (!cards.length) return false;      /* 空态：保留主壳 .widget-panel-empty */
        /* 先摘掉可能残留的旧组（卡片引用已在 cards 里，移动节点仍然有效） */
        Array.prototype.forEach.call(grid.querySelectorAll('.wp-soft-group'), function (s) {
            if (s.parentNode) s.parentNode.removeChild(s);
        });

        var buckets = {};
        GROUPS.forEach(function (g) { buckets[g.key] = []; });
        cards.forEach(function (c) {
            var k = MAP[c.dataset.widgetId];
            (buckets[k] ? buckets[k] : buckets.tools).push(c);   /* 未登记的新类型兜底进「实用工具」 */
        });

        var frag = document.createDocumentFragment();
        GROUPS.forEach(function (g) {
            var list = buckets[g.key];
            if (!list.length) return;
            var sec = document.createElement('section');
            sec.className = 'wp-soft-group';
            sec.dataset.soft = g.key;
            sec.style.setProperty('--wp-soft-accent', g.color);
            var head = document.createElement('button');
            head.type = 'button';
            head.className = 'wp-soft-head';
            head.setAttribute('aria-expanded', 'false');
            head.innerHTML = headHtml(g);
            sec.appendChild(head);
            var box = document.createElement('div');
            box.className = 'wp-soft-cards';
            /* grp4：同组按真实行高 / 列宽升序，减少 flex 行高差造成的空当。
               _size 由主壳渲染时挂在卡片上（drw5 的 sizeOf 也读它）。 */
            list.sort(function (a, b) {
                var sa = (a && a._size) || {}, sb = (b && b._size) || {};
                var ra = Math.round(Number(sa.rows) || 2), rb = Math.round(Number(sb.rows) || 2);
                if (ra !== rb) return ra - rb;
                return (Math.round(Number(sa.cols) || 2) - Math.round(Number(sb.cols) || 2));
            });
            list.forEach(function (c) { box.appendChild(c); });
            sec.appendChild(box);
            frag.appendChild(sec);
        });
        grid.appendChild(frag);
        return true;
    }

    /* ---------------------------------------------------------------- 显隐编排 */
    function setCardVisible(c, vis) {
        c.hidden = !vis;
        if (!vis) {
            /* 折叠：临时撤掉 available，让主壳的 querySelector/键盘导航看不见它 */
            if (c.dataset.available === '1') { c.dataset.wpAvail = '1'; c.dataset.available = '0'; }
            c.tabIndex = -1;
        } else {
            if (c.dataset.wpAvail === '1') { c.dataset.available = '1'; delete c.dataset.wpAvail; }
            c.tabIndex = c.dataset.available === '1' ? 0 : -1;
        }
    }
    function applyView() {
        var grid = gridEl(); if (!grid) return;
        var searching = !!query();
        var secs = grid.querySelectorAll('.wp-soft-group');
        Array.prototype.forEach.call(secs, function (sec) {
            var key = sec.dataset.soft;
            var cards = sec.querySelectorAll('.widget-panel-card');
            var showGroup = searching ? cards.length > 0 : (active === 'all' || active === key);
            var isOpen = searching
                ? (cards.length > 0 && !searchClosed[key])
                : (active === 'all' ? !!open[key] : active === key);

            sec.hidden = !showGroup;
            sec.classList.toggle('open', !!isOpen);
            var head = sec.querySelector('.wp-soft-head');
            if (head) {
                head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                var cnt = head.querySelector('.wp-soft-count');
                if (cnt) cnt.textContent = cards.length + ' 款';
                var sub = head.querySelector('.wp-soft-sub');
                if (sub) {
                    var names = [];
                    Array.prototype.forEach.call(cards, function (c) {
                        var n = c.querySelector('.widget-panel-card-name');
                        if (n && names.length < 3) names.push(n.textContent.trim());
                    });
                    sub.textContent = names.join(' · ') + (cards.length > 3 ? ' 等 ' + cards.length + ' 款' : '');
                }
                var added = head.querySelector('.wp-soft-added');
                if (added) {
                    var n = sec.querySelectorAll('.widget-panel-card.installed').length;
                    added.hidden = n === 0;
                    added.textContent = '已添加 ' + n;
                }
            }
            Array.prototype.forEach.call(cards, function (c) { setCardVisible(c, !!isOpen); });
        });
        updateCounts(grid, searching);
        updateSideActive();
    }

    /* ---------------------------------------------------------------- 事件 */
    function bindGrid() {
        var grid = gridEl();
        if (!grid || grid.dataset.grpBound === '1') return;
        grid.dataset.grpBound = '1';
        /* capture：组头点击先于主壳 grid.onclick（bubble）执行；
           主壳那边 closest('.widget-panel-card') 为空，本来就直接 return。 */
        grid.addEventListener('click', function (e) {
            var h = e.target && e.target.closest ? e.target.closest('.wp-soft-head') : null;
            if (!h || !grid.contains(h)) return;
            var sec = h.closest('.wp-soft-group');
            var key = sec && sec.dataset.soft;
            if (!key) return;
            if (query()) searchClosed[key] = !searchClosed[key];
            else {
                open[key] = !open[key];
                if (active !== 'all') { active = 'all'; updateSideActive(); }
            }
            applyView();
        }, true);
    }

    /* ---------------------------------------------------------------- 包装入口 */
    var orig = window.renderWidgetPanelGrid;
    if (typeof orig !== 'function') return;
    window.renderWidgetPanelGrid = function () {
        var r = orig.apply(this, arguments);
        try {
            var grid = gridEl();
            if (!grid) return r;
            buildSidebar();
            bindGrid();
            var q = query();
            if (q !== lastQuery) { searchClosed = {}; lastQuery = q; }
            var sig = grid.dataset.wpSig || '';
            /* 孤儿卡片 = 主壳刚整块重建过、或第三方清空过 grid；必须强制重排 */
            var orphan = false;
            var all = grid.querySelectorAll('.widget-panel-card');
            for (var ci = 0; ci < all.length; ci++) {
                if (!all[ci].closest || !all[ci].closest('.wp-soft-group')) { orphan = true; break; }
            }
            if (orphan || grid.dataset.wpGroupSig !== sig) {
                regroup(grid);
                grid.dataset.wpGroupSig = sig;
            }
            applyView();
        } catch (e) {
            /* 分组层任何异常都不许拖垮小组件面板本身 */
            if (window.console && console.warn) console.warn('[n26 widget groups]', e);
        }
        return r;
    };

    window.N26WidgetGroups = {
        groups: function () { return GROUPS.map(function (g) { return { key: g.key, name: g.name, ids: g.ids.slice() }; }); },
        total: function () { return GROUPS.reduce(function (n, g) { return n + g.ids.length; }, 0); }
    };
})();
