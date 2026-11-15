/* ============================================================
   n26-switch.js · 统一开关动效 v6.0（v2.9.93 四段液态玻璃 · v2.10.16 白点按下即隐
                                    · v2.10.23 白点展开成同一块玻璃 / 按住保持 / 跟手慢动）
   ------------------------------------------------------------
   用户原话的规格，逐条落成代码：
     ① 白胶囊隐藏 → 变成「比中间白色的大出来 50%」的一大块液态玻璃；
     ② 这块玻璃必须挂真折射（feDisplacementMap 光线扭曲引擎），无磨砂；
     ③ 朝对应方向挪到另一边：前沿先到、后沿晚 100ms 跟上 → 拉伸感；
     ④ 到位后缩回去，重新变成白色胶囊。

   实现要点：
     · 不用 WAAPI 单段 400ms，也不用 transform 缩放假装拉伸。
       把玻璃看成「前沿 L(t) + 后沿 T(t)=L(t-100ms)」两条边，
       每帧由 rAF 直接写 left/width/height —— 这是真的拉伸，不是视觉近似。
     · 玻璃是独立 .n26-sw-blob 覆盖层，静息白胶囊（::after）只被 opacity 隐藏，
       不参与 transform，落位时不会出现二次滑动。
     · 折射贴图固定 48×24 尺寸并在模块加载时预热缓存：
       宿主 n26LgAttach 的 Worker 生成是异步的，不预热就会出现
       「动画演完了贴图才回来」= 看起来永远没有折射。
     · 方向：开 → 右，关 → 左，所有开关一致；关态/开态一视同仁。
     · 业务状态（.on/.active/aria-checked）由原 onclick 负责；
       若业务把状态交给 renderSettingsPanel() 重建（本版已禁止整块重建），
       这里就地补一次翻转，保证「点了一定有反应」。
   ============================================================ */
(function () {
    'use strict';

    var SEL = '.fu-switch, .toggle-switch, .widget-alarm-toggle-btn, .alarm-toggle';

    /* 四段节拍（ms） */
    var P1_SWELL = 90;      // ① 白胶囊隐藏 → 玻璃涨到 150%
    var P2_MOVE = 260;      // ② 前沿走完全程
    var P2_LAG = 100;       //    后沿晚 100ms 跟上（用户钦定）
    var P3_SETTLE = 100;    // ③ 缩回白色胶囊
    var TOTAL = P1_SWELL + P2_MOVE + P2_LAG + P3_SETTLE;

    /* v2.10.23 ★「按住即展开」：白点和玻璃必须是同一个物体。
       pointerdown 第一帧就地把白点涨成玻璃并一直保持（纯按住不动也保持），
       鼠标慢慢动时玻璃低通跟手，松手由 click 链路从当前几何续演四段到另一侧，
       到位再缩回白点。全程只有一块 .n26-sw-blob，绝不删了再建、绝不重算折射贴图。 */
    var HOLD_SWELL = 260;    // 白点 → 150% 玻璃（与表面类 260ms 统一节奏）
    var HOLD_FOLLOW = 0.34;  // 跟手位移系数：慢慢动，不是一格一格跳
    var HOLD_LAG = 0.22;     // 低通：前片先到、后片慢半拍

    /* 折射贴图固定尺寸：一次生成、全站复用，动画首帧就有 url(#...) */
    var LG_SIZE = { w: 48, h: 24 };
    var LG_OPTS = { hw: 0.30, hh: 0.20, thresh: -0.10, noBlur: true };
    var lgSeq = 0;

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        (document.body && document.body.classList.contains('reduce-motion'));

    /* ---------- 状态读写 ---------- */
    function mode(el) {
        if (!el.__n26SwMode) {
            el.__n26SwMode = (el.hasAttribute('aria-checked') &&
                !el.classList.contains('on') && !el.classList.contains('active')) ? 'aria' : 'class';
        }
        return el.__n26SwMode;
    }
    function isOn(el) {
        if (mode(el) === 'aria') return el.getAttribute('aria-checked') === 'true';
        return el.classList.contains('on') || el.classList.contains('active') ||
            el.getAttribute('aria-checked') === 'true';
    }
    function setOn(el, on) {
        el.classList.toggle('on', on);
        el.classList.toggle('active', on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    function upgrade(el) {
        if (!el.hasAttribute('role')) el.setAttribute('role', 'switch');
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', isOn(el) ? 'true' : 'false');
    }

    /* ---------- 折射引擎 ---------- */
    function lgClear(blob) {
        try { if (window.n26LgClear) window.n26LgClear(blob); } catch (e) { }
    }
    function lgAttach(blob) {
        if (!blob || typeof window.n26LgAttach !== 'function') return false;
        try {
            window.n26LgAttach(blob, 'n26LgSw' + (++lgSeq), LG_OPTS, LG_SIZE);
            return blob.classList.contains('n26-liquid-on');
        } catch (e) { return false; }
    }
    /* 预热：宿主引擎走 Worker，第一次生成是异步的。先用一块离屏元素把
       48×24 这张 SDF 位移图算进缓存，之后每次动画都是同步命中。 */
    function warmLg() {
        if (typeof window.n26LgAttach !== 'function' || !document.body) return;
        var probe = document.createElement('span');
        probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:48px;height:24px;' +
            'visibility:hidden;pointer-events:none;';
        probe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(probe);
        try {
            window.n26LgAttach(probe, 'n26LgSwWarm', LG_OPTS, LG_SIZE);
            lgClear(probe);
        } catch (e) { }
        if (probe.parentNode) probe.parentNode.removeChild(probe);
    }

    /* ---------- 几何 ---------- */
    function metrics(el) {
        var cs = getComputedStyle(el);
        function nv(name, d) {
            var v = parseFloat(cs.getPropertyValue(name));
            return isFinite(v) ? v : d;
        }
        return {
            kw: nv('--fu-sw-kw', 18),
            kh: nv('--fu-sw-kh', 15),
            pad: nv('--fu-sw-pad', 2),
            travel: nv('--fu-sw-travel', 14),
            h: el.offsetHeight || 20
        };
    }
    function clamp(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function ease(t) {
        /* easeInOutCubic：前沿干脆起步、中段最快、末端稳稳停住，不过冲 */
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /* ---------- 动效 ---------- */
    function stop(el, opts) {
        opts = opts || {};
        /* ★ 按住态的 blob 挂在 __n26SwHold 上而不是 __n26Sw —— 旧版 stop 找不到它，
           会留下一块永不消失的玻璃 / 把白点永久藏掉。这里两个来源统一收。
           keepBlob:true 只给 play() 复用，保留 blob 与 busy 让视觉不断线。 */
        var h = el.__n26SwHold;
        if (h && h.raf) cancelAnimationFrame(h.raf);
        if (!opts.keepBlob && h && h.blob) {
            lgClear(h.blob);
            if (h.blob.parentNode) h.blob.parentNode.removeChild(h.blob);
        }
        var s = el.__n26Sw;
        if (s && s.raf) cancelAnimationFrame(s.raf);
        if (!opts.keepBlob && s && s.blob) {
            lgClear(s.blob);
            if (s.blob.parentNode) s.blob.parentNode.removeChild(s.blob);
        }
        if (!opts.keepBlob) el.classList.remove('n26-sw-busy', 'n26-sw-dragging');
        el.__n26Sw = null;
        el.__n26SwHold = null;
    }

    /* v2.10.16：★「中心小白点按下即隐」—— 消除「点击 → setTimeout(0) 播放」之间
       那一帧白点（::after）滑过的闪烁。只要 n26-sw-busy 在，①b 规则就把 ::after
       压成 opacity:0 + visibility:hidden + transition:none；播放结束 / 看门狗收尾时
       stop() 移除它，白点才在新位置回来。 */
    function hideKnob(el) { el.classList.add('n26-sw-busy'); }
    function showKnob(el) { el.classList.remove('n26-sw-busy'); }

    function play(el, fromOn, toOn) {
        /* ★ 复用按住态那一块玻璃：白点早已经展开成它了，这里绝不重建。
           从它当前的涨大程度与跟手位置续演，自始至终只有一个物体。 */
        var held = el.__n26SwHold;
        var blob, holdG = 0, holdCX = null;
        if (held && held.blob && held.blob.parentNode) {
            blob = held.blob;
            holdG = clamp(held.g || 0);
            holdCX = held.cx;
            stop(el, { keepBlob: true });
        } else {
            stop(el);
            upgrade(el);
            blob = document.createElement('span');
            blob.className = 'n26-sw-blob';
            blob.setAttribute('aria-hidden', 'true');
            el.appendChild(blob);
            el.classList.add('n26-sw-busy');
            var hasLg = lgAttach(blob);
            blob.classList.toggle('n26-sw-nolg', !hasLg);
        }
        if (reduced) { stop(el); return; }

        var m = metrics(el);
        var x0 = m.pad + (fromOn ? m.travel : 0);
        var x1 = m.pad + (toOn ? m.travel : 0);

        var seq = (el.__n26SwSeq || 0) + 1;
        el.__n26SwSeq = seq;
        var s = { blob: blob, raf: 0 };
        el.__n26Sw = s;

        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

        function frame(now) {
            if (!el.__n26Sw || el.__n26Sw !== s || el.__n26SwSeq !== seq) return;
            var t = now - t0;
            if (t >= TOTAL) { stop(el); return; }

            /* P1：白胶囊 → 150% 玻璃块。按住态已经涨到 holdG，这里只补完
               剩下的那一截，不从头再涨一次；中心点也从跟手位置平滑归位。 */
            var grow = clamp(t / P1_SWELL);

            /* P2：前沿 L(t) 走，后沿 T(t) = L(t - 100ms) 跟上 */
            var mt = clamp((t - P1_SWELL) / P2_MOVE);
            var bt = clamp((t - P1_SWELL - P2_LAG) / P2_MOVE);
            var base = (holdCX == null) ? x0 : holdCX + (x0 - holdCX) * ease(grow);
            var lead = base + (x1 - x0) * ease(mt);
            var trail = base + (x1 - x0) * ease(bt);
            var span = Math.abs(lead - trail);

            /* P3：缩回白胶囊 */
            var shrink = clamp((t - P1_SWELL - P2_MOVE - P2_LAG) / P3_SETTLE);
            var g = (holdG + (1 - holdG) * grow) * (1 - shrink);

            var kw = m.kw * (1 + 0.5 * g);
            var kh = m.kh * (1 + 0.5 * g);
            var width = span + kw;
            var left = Math.min(lead, trail) - (kw - m.kw) / 2;
            var top = (m.h - kh) / 2;

            blob.style.left = left.toFixed(2) + 'px';
            blob.style.top = top.toFixed(2) + 'px';
            blob.style.width = width.toFixed(2) + 'px';
            blob.style.height = kh.toFixed(2) + 'px';
            blob.style.opacity = String(Math.min(1, grow * 3) * (1 - shrink));

            s.raf = requestAnimationFrame(frame);
        }
        s.raf = requestAnimationFrame(frame);
        /* v2.10.3：看门狗。rAF 被节流（切后台 / 长任务）时 frame 可能停在半路，
           .n26-sw-busy 会一直留着 —— 那会让白点永久不可见（用户会以为开关坏了）。
           TOTAL 之后强制收尾一次。 */
        setTimeout(function () {
            if (el.__n26Sw === s) stop(el);
        }, TOTAL + 160);
    }

    /* ---------- v2.9.94：按住液态玻璃拖动，靠哪边就判定开 / 关 ----------
       用户追加规格：「开关液态玻璃要能拖动：按住玻璃拖到靠哪边就判断
       开启/关闭」。这里不改变普通点击链路 —— 只有位移超过 6px 才进入
       拖动态；没超过就完全当作原来的点击，四段动效逐帧行为不变。
       拖动结束时若目标状态与起始不同，手动触发一次 el.click() 让业务
       handler 真正翻转并落盘；本模块用 __n26SwDragEnd 吃掉这次 click
       的动效，避免「拖完了又播一遍四段动画」。 */
    var DRAG_THRESH = 6;
    function clampN(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    /* ---------- v2.10.23：按住即展开，白点 → 同一块玻璃 ----------
       用户规格：「那个小圆点就会展开变成玻璃，到另一个地方了再缩回去，
       并且这个也是可以鼠标一直摁着，它一直保持玻璃的，然后跟着鼠标慢慢动的」。
       旧版是白点瞬间 visibility:hidden + 另建一块 blob（两个物体），
       且只有位移 >6px 才创建玻璃 —— 纯按住不动时开关像坏了一样。 */
    function beginHold(el, e) {
        stop(el);
        upgrade(el);
        var m = metrics(el);
        var x0 = m.pad + (isOn(el) ? m.travel : 0);
        var blob = document.createElement('span');
        blob.className = 'n26-sw-blob';
        blob.setAttribute('aria-hidden', 'true');
        el.appendChild(blob);
        /* 与白点同帧交接：白点由 n26-sw-busy 即时隐藏，玻璃从白点原位、
           白点原大小起步，逐帧涨到 150%。起点几何完全一致 = 一个物体在变形。 */
        el.classList.add('n26-sw-busy');
        var hasLg = lgAttach(blob);
        blob.classList.toggle('n26-sw-nolg', !hasLg);

        var h = {
            blob: blob, raf: 0, g: 0, cx: x0, lag: 0, target: 0, fade: 1, g0: 1,
            m: m, x0: x0,
            t0: (window.performance && performance.now) ? performance.now() : Date.now()
        };
        el.__n26SwHold = h;

        function paintHold() {
            var kw = h.m.kw * (1 + 0.5 * h.g);
            var kh = h.m.kh * (1 + 0.5 * h.g);
            blob.style.left = (h.cx - (kw - h.m.kw) / 2).toFixed(2) + 'px';
            blob.style.top = ((h.m.h - kh) / 2).toFixed(2) + 'px';
            blob.style.width = kw.toFixed(2) + 'px';
            blob.style.height = kh.toFixed(2) + 'px';
            blob.style.opacity = String(Math.min(1, 0.35 + h.g * 3) * h.fade);
        }
        function holdFrame(now) {
            if (el.__n26SwHold !== h) return;
            h.g = clamp((now - h.t0) / HOLD_SWELL);
            h.lag += (h.target - h.lag) * HOLD_LAG;
            h.cx = h.x0 + h.lag;
            paintHold();
            /* 涨完且没在跟手就停 rAF：纯按住静息态零开销。
               之后每次 followHold 会重新唤起，不会留一条空转的帧循环。 */
            if (h.g < 1 || Math.abs(h.target - h.lag) > 0.2) h.raf = requestAnimationFrame(holdFrame);
            else h.raf = 0;
        }
        h.paint = paintHold;
        h.frame = holdFrame;
        paintHold();
        h.raf = requestAnimationFrame(holdFrame);
    }
    function followHold(el, dx) {
        var h = el.__n26SwHold;
        if (!h) return;
        /* 慢慢跟：只走位移的一小截，且不超过轨道的 60%，
           「一直保持玻璃、跟着鼠标慢慢动」，绝不提前判定开 / 关。 */
        var lim = h.m.travel * 0.6;
        h.target = clampN(dx * HOLD_FOLLOW, -lim, lim);
        if (!h.raf) h.raf = requestAnimationFrame(h.frame);
    }
    function settleHold(el) {
        /* 看门狗：click 没来（框选 / 事件被吞 / 节点被重建）时，
           把玻璃缩回白点，绝不留下永不消失的玻璃。 */
        var h = el.__n26SwHold;
        if (!h) return;
        if (h.raf) cancelAnimationFrame(h.raf);
        h.g0 = h.g;
        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        function frame(now) {
            if (el.__n26SwHold !== h) return;
            var p = clamp((now - t0) / 180);
            var q = 1 - Math.pow(1 - p, 3);
            h.g = (1 - q) * h.g0;
            h.lag *= (1 - q);
            h.cx = h.x0 + h.lag;
            h.fade = 1 - q;
            h.paint();
            if (p < 1) h.raf = requestAnimationFrame(frame);
            else { h.raf = 0; stop(el); }
        }
        h.raf = requestAnimationFrame(frame);
    }

    function beginDrag(el, e) {
        var before = isOn(el);
        var m = metrics(el);
        var startX = e.clientX;
        var kw = m.kw * 1.5, kh = m.kh * 1.5;
        var x0 = m.pad + (before ? m.travel : 0);
        var minLeft = -(kw - m.kw) / 2;
        var maxLeft = Math.max(minLeft, el.offsetWidth - kw + (kw - m.kw) / 2);
        var curLeft = x0 - (kw - m.kw) / 2;
        var blob = null, active = false, ended = false;

        function paint() {
            if (!blob) return;
            blob.style.left = curLeft.toFixed(2) + 'px';
            blob.style.top = ((m.h - kh) / 2).toFixed(2) + 'px';
            blob.style.width = kw.toFixed(2) + 'px';
            blob.style.height = kh.toFixed(2) + 'px';
            blob.style.opacity = '1';
        }
        function begin() {
            active = true;
            var h = el.__n26SwHold;
            if (h && h.blob && h.blob.parentNode) {
                /* ★ 按住态那块玻璃直接接管成拖动态，绝不删了重建 ——
                   视觉不断线、折射贴图不重算、首帧不闪。 */
                if (h.raf) cancelAnimationFrame(h.raf);
                blob = h.blob;
                el.__n26SwHold = null;
                curLeft = h.cx - (kw - m.kw) / 2;
                el.__n26Sw = { blob: blob, raf: 0 };
            } else {
                stop(el);
                upgrade(el);
                blob = document.createElement('span');
                blob.className = 'n26-sw-blob';
                blob.setAttribute('aria-hidden', 'true');
                el.appendChild(blob);
                el.__n26Sw = { blob: blob, raf: 0 };
                var hasLg = lgAttach(blob);
                blob.classList.toggle('n26-sw-nolg', !hasLg);
            }
            el.classList.add('n26-sw-busy', 'n26-sw-dragging');
            paint();
        }
        function settle(toOn) {
            /* 140ms：玻璃吸到目标侧、缩回胶囊大小、淡出；期间折射贴图
               仍是固定 48×24，不重建，不会抖。 */
            var dest = (m.pad + (toOn ? m.travel : 0)) - (kw - m.kw) / 2;
            var from = curLeft;
            var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
            var s = el.__n26Sw;
            function frame(now) {
                if (!s || el.__n26Sw !== s || !blob) { stop(el); return; }
                var p = clampN((now - t0) / 140, 0, 1);
                var q = 1 - Math.pow(1 - p, 3);
                curLeft = from + (dest - from) * q;
                var w = kw + (m.kw - kw) * q;
                var h = kh + (m.kh - kh) * q;
                blob.style.left = curLeft.toFixed(2) + 'px';
                blob.style.top = ((m.h - h) / 2).toFixed(2) + 'px';
                blob.style.width = w.toFixed(2) + 'px';
                blob.style.height = h.toFixed(2) + 'px';
                blob.style.opacity = String(1 - q);
                if (p < 1) { s.raf = requestAnimationFrame(frame); return; }
                el.classList.remove('n26-sw-dragging');
                stop(el);
            }
            s.raf = requestAnimationFrame(frame);
        }
        function onMove(ev) {
            if (ended) return;
            var dxMove = ev.clientX - startX;
            if (!active) {
                /* 6px 以内：不进拖动态，玻璃只低通跟手慢慢动 */
                if (Math.abs(dxMove) < DRAG_THRESH) { followHold(el, dxMove); return; }
                begin();
            }
            curLeft = clampN(x0 - (kw - m.kw) / 2 + dxMove, minLeft, maxLeft);
            paint();
            if (ev.cancelable) ev.preventDefault();
        }
        function onUp() {
            if (ended) return;
            ended = true;
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
            if (!active) {
                /* 普通点击 / 纯按住：这里绝不收玻璃。click 链路的 play() 会复用
                   这块 hold 玻璃续演到另一侧再缩回白点 = 全程一个物体。
                   万一 click 没来（框选、被遮挡、事件被吞），看门狗把它收回，
                   既不留下永不消失的玻璃，也不把白点永久藏掉。 */
                var h = el.__n26SwHold;
                if (h) setTimeout(function () {
                    if (el.__n26SwHold === h && !el.__n26Sw) settleHold(el);
                }, 320);
                return;
            }
            var toOn = (curLeft + kw / 2) >= (el.offsetWidth / 2);
            /* 拖回原侧：不改状态，不触发业务；只把玻璃收回 */
            if (toOn === before) { settle(toOn); return; }
            el.__n26SwDragEnd = true;
            settle(toOn);
            try { el.click(); } catch (err) { el.__n26SwDragEnd = false; }
        }
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
    }

    /* ---------- 点击链路（捕获阶段，setTimeout(0) 等业务 handler 跑完） ---------- */
    function allSwitches() { return document.querySelectorAll(SEL); }
    function indexOf(el) { return Array.prototype.indexOf.call(allSwitches(), el); }
    function resolve(el, idx) {
        if (el && el.isConnected) return el;
        var list = allSwitches();
        if (idx >= 0 && idx < list.length) return list[idx];
        return null;
    }

    document.addEventListener('click', function (e) {
        var src = e.target;
        var el = src && src.closest ? src.closest(SEL) : null;
        if (!el) return;
        /* 拖动结束时手动 click 只为让业务翻转并落盘；玻璃已在吸附，
           不要再播一遍四段动效。业务 handler 照常收得到这次 click。 */
        if (el.__n26SwDragEnd) { el.__n26SwDragEnd = false; return; }
        var before = isOn(el);
        var idx = indexOf(el);
        setTimeout(function () {
            var target = resolve(el, idx);
            if (!target) return;
            upgrade(target);
            var after = isOn(target);
            /* 业务把状态交给整块重建时，重建已被 N26 NoReload 拦下 → 就地翻转 */
            if (after === before) { setOn(target, !before); after = !before; }
            play(target, before, after);
        }, 0);
    }, true);

    document.addEventListener('pointerdown', function (e) {
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        upgrade(el);
        if (e.button !== 0 || reduced) return;
        /* 按下瞬间就把白点藏掉：之后不管走「点击播放」还是「拖动态」，
           ::after 都不会再露脸，直到 stop() / 看门狗收尾。松手/取消兜底回收：
           260ms 后若没有任何动画在跑（__n26Sw 为空）就还白点，避免极端情况
           （点了却没触发 click，如框选文本）把白点永久藏掉。 */
        hideKnob(el);
        /* ★ v2.10.23：按下第一帧就把白点展开成玻璃（同一个物体）。
           纯按住不动也一直保持，鼠标慢慢动就跟手，松手由 click 续演到另一侧。 */
        beginHold(el, e);
        var reclaim = function () {
            window.removeEventListener('pointerup', reclaim, true);
            window.removeEventListener('pointercancel', reclaim, true);
            /* 按住态也算「有动画在跑」，不能这时候把白点放回来 */
            setTimeout(function () {
                if (!el.__n26Sw && !el.__n26SwHold) showKnob(el);
            }, 260);
        };
        window.addEventListener('pointerup', reclaim, true);
        window.addEventListener('pointercancel', reclaim, true);
        beginDrag(el, e);
    }, true);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        e.preventDefault();
        if (!reduced) hideKnob(el);   /* 键盘激活同样即时藏白点 */
        el.click();
    }, true);

    function scan() {
        var nodes = allSwitches();
        for (var i = 0; i < nodes.length; i++) upgrade(nodes[i]);
    }

    function boot() {
        scan();
        warmLg();
        if (window.MutationObserver && document.body) {
            var mo = new MutationObserver(function (recs) {
                /* ★ v2.10.39 P0（心跳实机：卡死在点击后 50–200ms）：
                   旧写法「任何 childList 都 160ms 后 scan() 全文档」，设置面板
                   整块 innerHTML 重建会带出几百条记录，正好压在玻璃滑行动画
                   半途、与光学层 120ms 扫描叠在一起。现在：
                   ① 只有新增节点里真的出现开关（SEL）才排扫描；
                   ② 时间从 160ms 挪到 380ms（动画收尾之后）。
                   开关升级逻辑、四段动效、折射白名单一条未删。 */
                var hit = false;
                for (var i = 0; i < recs.length && !hit; i++) {
                    var a = recs[i].addedNodes;
                    if (!a) continue;
                    for (var j = 0; j < a.length; j++) {
                        var n = a[j];
                        if (!n || n.nodeType !== 1) continue;
                        if ((n.matches && n.matches(SEL)) ||
                            (n.querySelector && n.querySelector(SEL))) { hit = true; break; }
                    }
                }
                if (!hit) return;
                clearTimeout(mo.__t);
                mo.__t = setTimeout(scan, 380);
            });
            mo.observe(document.body, { childList: true, subtree: true });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* 供自检脚本驱动逐帧坐标（不参与业务） */
    window.N26Switch = {
        version: '6.0-2.10.23',
        phases: { swell: P1_SWELL, move: P2_MOVE, lag: P2_LAG, settle: P3_SETTLE },
        holdSwell: HOLD_SWELL,
        metrics: metrics,
        ease: ease,
        isOn: isOn,
        setOn: setOn,
        dragThreshold: DRAG_THRESH,
        beginDrag: beginDrag,
        beginHold: beginHold,
        followHold: followHold,
        settleHold: settleHold
    };
})();
