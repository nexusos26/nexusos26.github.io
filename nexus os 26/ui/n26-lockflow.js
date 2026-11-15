/* ============================================================================
   ui/n26-lockflow.js · v2.10.20
   锁屏共享控件闭环的运行时层（加层不改层）：

   ① 跟手上滑：拖动时只写 .lock-top 的 transform（rAF 合帧、不读布局、不挂模糊），
      松手过阈值才提交给主壳 showPasswordPanel，不足则 260ms 弹性回位；
   ② N26Shared：共享控件注册表 + 单一时钟源订阅。第三方小组件 / 软件订阅
      「时间」时不再各自开 setInterval，直接复用主壳 updateLockTime 的那一拍；
   ③ 护盾：防重复初始化、指针取消 / 失焦 / 页面隐藏 / 3s 超时强制复位、
      拖动误触点击拦截、动画 API 缺失与 reduced-motion 静默降级。

   自身零外部依赖，任何分支都不许抛错。
   ============================================================================ */
(function () {
    'use strict';
    if (window.N26LockFlow) return;                       /* 护盾：重复引入只生效一次 */

    var VER = '1.0-v2.10.20';
    var lock = document.getElementById('lock-screen');
    if (!lock || lock.dataset.n26Lk === '1') return;
    lock.dataset.n26Lk = '1';

    var lockTop = document.getElementById('lockTop');
    if (!lockTop) return;

    var raf = (typeof window.requestAnimationFrame === 'function')
        ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 16); };
    var caf = (typeof window.cancelAnimationFrame === 'function')
        ? window.cancelAnimationFrame.bind(window) : clearTimeout;

    /* ---------- 共享控件注册表（对外 API） ---------- */
    var registry = Object.create(null);
    var subs = [];
    var Shared = {
        version: VER,
        /* register(key, spec)：声明一个「同一控件的多个宿主」。
           spec.hosts 为选择器数组，spec.source 指明唯一数据源。 */
        register: function (key, spec) {
            if (!key || registry[key]) return false;
            registry[key] = { hosts: (spec && spec.hosts) || [], source: (spec && spec.source) || '', note: (spec && spec.note) || '' };
            return true;
        },
        get: function (key) { return registry[key] || null; },
        keys: function () { return Object.keys(registry); },
        /* subscribe(fn)：拿到同一个时钟源的每一拍，不再自建 setInterval */
        subscribe: function (fn) {
            if (typeof fn !== 'function') return function () { };
            subs.push(fn);
            return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
        },
        emitClock: function (hhmm, sec, now) {
            var d = now || new Date();
            var payload = { hhmm: hhmm, sec: sec, date: d, source: 'updateLockTime' };
            for (var i = 0; i < subs.length; i++) {
                try { subs[i](payload); } catch (e) { }
            }
            return payload;
        }
    };
    window.N26Shared = Shared;

    /* 时间控件：锁屏大钟 → 密码页飞行小钟 → 桌面顶栏，三个宿主、一个节点在飞。
       数据来源只有主壳 updateLockTime，桌面顶栏日期 / 状态栏时间都吃同一拍。 */
    Shared.register('clock', {
        hosts: ['#lockTime', '#n26FlyClock', '#finderTime', '#lockStatusTime'],
        source: 'updateLockTime',
        note: '同一个时间控件的三态接力，不重建、不复制节点'
    });
    Shared.register('lock-blur', {
        hosts: ['#lock-screen::before'],
        source: 'n26-blur-on',
        note: '磨砂与账户列表解耦后的独立状态'
    });

    /* 不新开定时器：观察主壳每秒写入的状态栏时间，把这一拍广播给订阅者。 */
    (function () {
        var node = document.getElementById('lockStatusTime');
        if (!node || typeof window.MutationObserver !== 'function') return;
        try {
            var mo = new MutationObserver(function () {
                var now = new Date();
                Shared.emitClock(node.textContent, String(now.getSeconds()).padStart(2, '0'), now);
            });
            mo.observe(node, { childList: true, characterData: true, subtree: true });
        } catch (e) { }
    })();

    /* ---------- 跟手上滑 ---------- */
    var st = { active: false, startY: 0, dy: 0, lift: 0, frame: 0, timer: 0, moved: false, swallow: false, swallowAt: 0 };
    var THRESHOLD = -80;      /* 与主壳 mouseup / touchmove 的提交线保持一致 */
    var MAX_LIFT = -140;      /* 跟手位移封顶，防止拖出屏幕 */
    var DRAG_EPS = 6;         /* 小于这个位移算「点击」，完全不干预 */

    function reduceMotion() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }
    function visible() {
        return lock.style.display !== 'none' && !lockTop.classList.contains('up');
    }
    function paint() {
        st.frame = 0;
        if (!st.active) return;
        lockTop.style.transform = 'translateY(' + st.lift + 'px)';   /* 只写 transform，不读布局 */
    }
    function schedule() {
        if (st.frame) return;
        st.frame = raf(paint);
    }
    function reset() {
        if (st.frame) { caf(st.frame); st.frame = 0; }
        if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
        st.active = false;
        st.dy = 0; st.lift = 0;
        lock.classList.remove('n26-lk-drag');
        lockTop.style.transform = '';
    }
    function armWatchdog() {
        if (st.timer) clearTimeout(st.timer);
        st.timer = setTimeout(function () { st.timer = 0; if (st.active) reset(); }, 3000);
    }
    function swallowClick() { st.swallow = true; st.swallowAt = Date.now(); }

    function onDown(e) {
        if (!visible()) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.clientY < window.innerHeight * 0.5) return;   /* 只在下半屏起手 */
        var t = e.target;
        if (t && t.closest && t.closest('.power-btn-lock, .account-item, .lock-qa-btn, .lock-back-btn, .password-panel, #lockNotifBtn, #lockNotifCenter, input, button')) return;
        st.active = true;
        st.startY = e.clientY;
        st.dy = 0; st.lift = 0; st.moved = false;
        armWatchdog();
    }
    function onMove(e) {
        if (!st.active) return;
        if (!visible()) { reset(); return; }
        st.dy = e.clientY - st.startY;
        if (Math.abs(st.dy) < DRAG_EPS) return;
        st.moved = true;
        lock.classList.add('n26-lk-drag');
        st.lift = Math.max(MAX_LIFT, Math.min(0, st.dy * 0.6));   /* 阻尼跟手，只向上 */
        schedule();
    }
    function onUp(e) {
        if (!st.active) return;
        var dy = (typeof e.clientY === 'number') ? e.clientY - st.startY : st.dy;
        var commit = dy < THRESHOLD;
        var wasMoved = st.moved || Math.abs(dy) >= DRAG_EPS;
        /* 先恢复过渡、清掉跟手内联值；同一帧内提交的 .up 会从当前渲染位置继续滑，
           回弹则弹回 0 —— 两个方向都不会闪回。 */
        reset();
        if (wasMoved) swallowClick();            /* 拖过就不让 click 再推一次密码页 */
        if (commit) {
            var go = null;
            try { go = Function('return typeof showPasswordPanel === "function" ? showPasswordPanel : null')(); } catch (er) { }
            if (go) { try { go(); } catch (er2) { } }
        }
    }

    lock.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', function () { if (st.active) reset(); }, { passive: true });

    /* 一次性的 click 拦截：拖动提交 / 回弹后的那一下 click 不能穿透 */
    document.addEventListener('click', function (e) {
        if (!st.swallow) return;
        if (Date.now() - st.swallowAt > 420) { st.swallow = false; return; }
        st.swallow = false;
        try { e.stopImmediatePropagation(); e.preventDefault(); } catch (er) { }
    }, true);

    /* 环境护盾 */
    window.addEventListener('blur', function () { if (st.active) reset(); });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && st.active) reset();
    });
    /* resize 护盾：飞行钟是固定 px 定位，窗口变了要跟回测量槽；
       大钟是「左下角」定位，纵向随视口高度平移，把缓存终点一并修正，
       否则返回时会飞到旧尺寸的位置。非高频路径，读一次布局不心疼。 */
    window.addEventListener('resize', function () {
        if (st.active) reset();
        try {
            var flyState = Function('return typeof n26FlyState !== "undefined" ? n26FlyState : null')();
            var el = document.getElementById('n26FlyClock');
            var slot = document.getElementById('n26MiniClockSlot');
            if (flyState && flyState.phase === 'mini' && el && slot && el.style.display !== 'none') {
                var r = slot.getBoundingClientRect();
                el.style.left = r.left + 'px';
                el.style.top = r.top + 'px';
            }
            if (flyState && flyState.big) {
                flyState.big.top += window.innerHeight - flyState.big.h;
                flyState.big.w = window.innerWidth;
                flyState.big.h = window.innerHeight;
            }
        } catch (e) { }
    }, { passive: true });

    /* 锁屏被关掉 / 面板状态被外部改掉时，把内联 transform 收干净 */
    if (typeof window.MutationObserver === 'function') {
        try {
            var guard = new MutationObserver(function () {
                if (st.active && !visible()) reset();
                else if (!st.active && lockTop.style.transform) lockTop.style.transform = '';
            });
            guard.observe(lock, { attributes: true, attributeFilter: ['style', 'class'] });
            guard.observe(lockTop, { attributes: true, attributeFilter: ['class', 'style'] });
        } catch (e) { }
    }

    /* reduced-motion：跟手仍可用，但不做动画过渡（CSS 已把时长降到 .01ms） */
    if (reduceMotion()) lock.classList.add('n26-lk-reduced');

    window.N26LockFlow = {
        version: VER,
        shared: Shared,
        reset: reset,
        setBlur: function (on) { lock.classList[on ? 'add' : 'remove']('n26-blur-on'); },
        isDragging: function () { return !!st.active; }
    };
})();
