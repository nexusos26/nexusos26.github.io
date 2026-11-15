/* ==========================================================================
   Nexus OS 26 · 小方唤起模态护盾（cm1）——JS 侧
   --------------------------------------------------------------------------
   ① #covi-shield：HUD 开 → 显示（挡 Dock / 桌面 / 窗口点击），点护盾 = 收起；
   ② 焦点守卫：HUD 展开态（非胶囊）焦点离开 #covi-hud-input → 下一帧拉回；
   ③ 零 MutationObserver / 零 rAF / 零常驻定时器：状态由主壳 coviHudShow /
      coviHudClose 显式接线（N26CoviModal.sync），守卫是事件驱动的 focusout。
   ========================================================================== */
(function () {
    'use strict';

    var shield = null;
    var active = false;

    function ensureShield() {
        if (shield) return shield;
        shield = document.createElement('div');
        shield.id = 'covi-shield';
        shield.setAttribute('aria-hidden', 'true');
        /* mousedown preventDefault：点护盾不偷焦点（不触发输入框 blur 抖动） */
        shield.addEventListener('mousedown', function (e) { e.preventDefault(); });
        shield.addEventListener('click', function () {
            try {
                if (typeof coviHudClose === 'function') coviHudClose();
                else {
                    var b = document.getElementById('covi-hud-close');
                    if (b) b.click();
                }
            } catch (_) { }
        });
        document.body.appendChild(shield);
        return shield;
    }

    function focusInput() {
        var inp = document.getElementById('covi-hud-input');
        if (!inp) return;
        try { inp.focus({ preventScroll: true }); }
        catch (e) { try { inp.focus(); } catch (_) { } }
    }

    /* HUD 展开态判定：show 且未收成胶囊（胶囊 = 思考 / 播报，不该抢焦点） */
    function hudExpanded() {
        var hud = document.getElementById('covi-hud');
        return !!(hud && hud.classList.contains('show') && !hud.classList.contains('covi-hud-pill'));
    }

    function sync(open) {
        active = !!open;
        ensureShield();
        if (shield) shield.classList.toggle('on', active);
        try { document.body.classList.toggle('n26-covi-modal', active); } catch (_) { }
        if (active) focusInput();
    }

    /* 焦点守卫：展开态下焦点离开输入框 → 下一帧拉回。
       capture 挂 document，一次注册，事件驱动零轮询。 */
    document.addEventListener('focusout', function (e) {
        if (!active) return;
        var inp = document.getElementById('covi-hud-input');
        if (!inp || e.target !== inp) return;
        setTimeout(function () {
            if (!active) return;
            if (!hudExpanded()) return;
            if (document.activeElement === inp) return;
            focusInput();
        }, 0);
    }, true);

    window.N26CoviModal = {
        version: 'cm1',
        sync: sync,
        focusInput: focusInput
    };
})();
