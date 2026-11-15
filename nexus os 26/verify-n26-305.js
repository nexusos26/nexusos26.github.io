/* ============================================================================
   verify-n26-305.js · v2.10.23 液态玻璃光学专项守门（第十八套）
   ★ v2.10.33 需求反转：两处 screen 混合改为数学等价的 alpha 加色，
     效果一条不减；第七 / 八 / 九条断言随之反转，戳 go2 → go6。
   对角彩虹色散 / 按下亮光 / 侧栏展开双片收尾 / 开关单一物体 / 启动台搜索栏
   纯 Node 静态 + vm 假 DOM + 虚拟时钟逐帧冒烟，不开任何自动化浏览器
   ============================================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = __dirname;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function has(s, k) { return s.indexOf(k) >= 0; }
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
let PASS = 0, FAIL = 0;
function ok(name, cond) { if (cond) PASS++; else { FAIL++; console.log('  ✗ ' + name); } }

const HTML = read('Nexus OS 26.html');
const GOC = read('ui/n26-glass-optics.css');
const GOJ = read('ui/n26-glass-optics.js');
const GOC_N = noComments(GOC);
const GOJ_N = noComments(GOJ);
const SWJ = read('ui/n26-switch.js');
const APPJS = read('apps/_app.js');
const ADAPTER = read('apps/_theme-adapter.js');

console.log('=== verify-n26-305 · v2.10.23 液态玻璃光学专项 ===');

/* ---------- 1. 版本与资源 ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
/* ★ 版本弹性：305 固化的是 v2.10.23 那批光学能力，后续小版本继续 bump 不该误报。
   用「≥ v2.10.23」的数值比较，而不是把版本号写死。 */
const VER_NUM = (VER.match(/^v2\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
ok('★ 版本号格式合法且不低于 v2.10.23（弹性）',
  VER_NUM.length === 2 && (VER_NUM[0] > 10 || (VER_NUM[0] === 10 && VER_NUM[1] >= 23)));
ok('★ changelog 首条与版本号一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('★ changelog 五条改动全在',
  ['玻璃边缘终于有彩虹了', '照亮周围所有控件', '侧边栏玻璃会展开', '白点和玻璃变成同一个物体', '搜索栏上移并抬高']
    .every(function (k) { return has(HTML, k); }));
/* ★ v2.10.33 需求反转：两处 mix-blend-mode:screen 已由等价 alpha 加色取代。
   光学层本身仍在（彩虹 / 亮光 / 展开 / 折射一条没删），只是不再整屏读回。
   戳 go2 → go6，三条注入路径与全部引用同步。 */
ok('★ 宿主挂光学层资源（css go6 / js go\\d+），且挂在最后压过 glass-system / dockbar-pos',
  has(HTML, 'href="ui/n26-glass-optics.css?v=go6"') &&
  /src="ui\/n26-glass-optics\.js\?v=go\d+"/.test(HTML) &&
  (HTML.match(/n26-glass-optics\.css\?v=go6/g) || []).length === 1 &&
  HTML.lastIndexOf('n26-glass-optics.css') > HTML.lastIndexOf('n26-settings-flow.js'));
ok('★ _app.js 自动注入 go6（第一方应用一行 HTML 都不用改）',
  has(APPJS, "'../ui/n26-glass-optics.css?v=go6'") && has(APPJS, "'../ui/n26-glass-optics.js?v=go6'") &&
  has(APPJS, 'script[src*="n26-glass-optics.js"]'));
ok('★ 打包产物由 _theme-adapter.js 补挂',
  has(ADAPTER, "'../ui/n26-glass-optics.css?v=go6'") && has(ADAPTER, 'ensureGlassOptics'));
ok('★ 折射引擎戳弹性 lg\\d+（bump 不用改断言）',
  /n26-lg-core\.js\?v=lg\d+/.test(GOJ));

/* ---------- 2. 色散：默认开启 + 只有右上 / 左下 ---------- */
ok('★ 色散默认从 0 提到 10（此前永远看不见）',
  /N26_GLASS_DEFAULTS = \{[^}]*dispersion: 10/.test(HTML) &&
  !/N26_GLASS_DEFAULTS = \{[^}]*dispersion: 0/.test(HTML));
ok('★ 三处兜底默认值同步为 10',
  (HTML.match(/dispersion: 10/g) || []).length >= 3 &&
  !/\{ refraction: 55, dispersion: 0 \}/.test(HTML));
ok('★ 老配置一次性迁移且之后尊重用户 0',
  has(HTML, 'g.dispOpticsMigrated') && /!g\.dispOpticsMigrated[\s\S]{0,180}?g\.dispersion = 10/.test(HTML) &&
  !has(HTML, 'g.dispMigrated = 1'));
ok('★ --n26-disp 终于被 CSS 消费（伪元素 opacity）',
  /\.n26-go-iris::before,\s*\.n26-go-iris::after \{[\s\S]{0,1000}?opacity: calc\(var\(--n26-disp/.test(GOC_N));
ok('★ v2.10.33 彩虹层已移除 screen，改等价 alpha 加色（强度变量 / 层级 / opacity:1 不变）',
  !/mix-blend-mode\s*:\s*screen/.test(GOC_N) &&
  /^\.n26-go-iris \{[^}]{0,900}?--n26-go-iris-k: 1;/m.test(GOC_N) &&
  !/^\.n26-go-iris \{[^}]*?\n\s*opacity:/m.test(GOC_N));
ok('★ 只有右上角 + 左下角：135deg / 45deg 对角掩膜，黑端落在可见象限',
  /::before \{[\s\S]{0,400}?linear-gradient\(135deg, transparent 0%/.test(GOC_N) &&
  /::after \{[\s\S]{0,400}?linear-gradient\(45deg, transparent 0%/.test(GOC_N) &&
  !has(GOC_N, 'linear-gradient(225deg'));
ok('★ 宿主全边缘 R/B 色散减半，彩虹交给对角层',
  /var sD = \(dAmt \/ 20\) \* 3;/.test(HTML));
ok('★ 静止灰底时彩虹一起退场，不留彩色边',
  has(GOC_N, '.n26-go-host.n26-dng:not(.n26-dng-on):not(.n26-go-live) > .n26-go-iris'));

/* ---------- 3. 按下亮光：照亮周围所有控件与元素 ---------- */
ok('★ v2.10.33 按下亮光完整保留（fixed 560px / 指针中心 / bulb），但不再整屏 screen 混合',
  /#n26GoLight \{[\s\S]{0,600}?position: fixed;[\s\S]{0,600}?visibility: hidden;/.test(GOC_N) &&
  !/#n26GoLight \{[^}]*mix-blend-mode\s*:\s*screen/.test(GOC_N) &&
  has(GOC_N, '.n26-go-bulb') && has(GOC_N, 'width: 560px;') &&
  has(GOC_N, '#n26GoLight.is-strong .n26-go-bulb.is-on'));
ok('★ 等价加色不需要 backdrop，也不新建离屏表面（无 contain / filter / isolation）',
  !/contain\s*:\s*(paint|strict|layout|content)/.test(GOC_N) &&
  !/isolation\s*:/.test(GOC_N) &&
  !/filter:\s*(blur|drop-shadow|brightness|contrast)/.test(GOC_N));
ok('★ 按下从指针点发亮、按住保持、松手 260ms 淡出后才退出合成',
  has(GOJ, "lightRoot.style.left = x + 'px'") && has(GOJ, "lightRoot.style.top = y + 'px'") &&
  has(GOJ, "lightRoot.classList.add('is-active')") && has(GOJ, '}, 300);') &&
  has(GOC_N, '#n26GoLight.is-active { visibility: visible; }') &&
  has(GOC_N, 'visibility: hidden;'));
ok('★ 点在真玻璃上光更强（is-strong 有实际样式）',
  has(GOJ, "'is-strong'") && has(GOC_N, '#n26GoLight.is-strong .n26-go-bulb.is-on'));
ok('★ 高频 pointermove 只读 clientX/clientY，不读布局',
  /moveEv = \{ clientX: e\.clientX, clientY: e\.clientY \}/.test(GOJ) &&
  has(GOJ, 'raf(flushMove)') &&
  !/function flushMove\(\)[\s\S]{0,600}?getBoundingClientRect/.test(GOJ));
ok('★ 光源单实例 + reduced-motion 降级 + blur/cancel/失焦全清理',
  has(GOJ, "if (lightRoot || reduced()) return;") &&
  ['pointerup', 'pointercancel', 'blur', 'visibilitychange'].every(function (k) { return has(GOJ, k); }));

/* ---------- 4. 侧栏玻璃：展开 / 双片错落 / 收尾回普通背景 ---------- */
ok('★ 按下一条合成关键帧从指针点涨出玻璃',
  has(GOC_N, '@keyframes n26GoExpand') && has(GOJ, "--n26-go-ox") &&
  /var ox = Math\.max\(0, Math\.min\(100, \(lastPointer\.x/.test(GOJ));
ok('★ 移动前片直跟、后片 60ms 台阶慢半拍',
  /\.n26-go-host\.n26-go-moving > \.n26-go-face\.trail \{[\s\S]{0,400}?60ms/.test(GOC_N) &&
  has(GOJ, "'--n26-go-lead-x'") && has(GOJ, "'--n26-go-trail-x'") &&
  /lagX \+= \(lx - lagX\) \* 0\.34/.test(GOJ));
ok('★ 收尾幽灵挂 body 演完 300ms，玻璃不啪一下消失',
  has(GOC_N, '.n26-go-ghost') && has(GOC_N, '@keyframes n26GoGhostOut') &&
  has(GOJ, "ghost.className = 'n26-go-ghost'") &&
  has(GOJ, '(doc.body || doc.documentElement).appendChild(ghost)'));
ok('★ 收尾由状态类被摘掉触发，不在 pointerup 硬收',
  /function release\(\) \{[\s\S]{0,400}?lightOff\(\);/.test(GOJ) &&
  !/function release\(\) \{[\s\S]{0,400}?settleGlass/.test(GOJ) &&
  has(GOJ, 'MutationObserver'));
ok('★ .n26ui-glass 进白名单 + CSS 放行，不再是透明卡片加边框',
  /* ★ 白名单会随新玻璃面追加（v2.10.24 补了 .n26-ws-lens），只判包含、不判结尾 */
  /N26_LG_WHITELIST = '[^']*\.n26ui-glass/.test(HTML) &&
  /html body :is\([^)]*\.n26ui-glass\.n26-liquid-on\)/.test(GOC_N));
ok('★ iframe 缺引擎才补挂，一次加载合并所有等待者',
  has(GOJ, 'function engineReady()') && has(GOJ, 'coreWaiters') &&
  has(GOJ, 'data-n26-go-core') && has(GOJ, 'if (coreFailed)'));
ok('★ 折射贴图尺寸只认 offsetWidth/offsetHeight（绝不用 getBoundingClientRect）',
  /function attachLg\(el\) \{[\s\S]{0,400}?el\.offsetWidth[\s\S]{0,200}?el\.offsetHeight/.test(GOJ) &&
  !/function attachLg\(el\) \{[\s\S]{0,600}?getBoundingClientRect/.test(GOJ));
ok('★ will-change 不写尺寸，reduced-motion 全降级',
  !/will-change[^;]*(width|height)/.test(GOC_N) &&
  has(GOC_N, 'prefers-reduced-motion: reduce') && has(GOJ, 'function reduced()'));

/* ---------- 5. 开关：白点与玻璃是同一个物体 ---------- */
ok('★ 新增按住三件套 beginHold / followHold / settleHold',
  ['function beginHold', 'function followHold', 'function settleHold'].every(function (k) { return has(SWJ, k); }) &&
  has(SWJ, 'beginHold: beginHold') && has(SWJ, 'followHold: followHold'));
ok('★ pointerdown 第一帧就展开玻璃（不再等位移 6px）',
  /document\.addEventListener\('pointerdown'[\s\S]{0,900}?beginHold\(el, e\)/.test(SWJ));
ok('★ 白点原位、白点原大小起步逐帧涨到 150%',
  has(SWJ, 'HOLD_SWELL = 260') && /var kw = h\.m\.kw \* \(1 \+ 0\.5 \* h\.g\)/.test(SWJ) &&
  /blob\.style\.opacity = String\(Math\.min\(1, 0\.35 \+ h\.g \* 3\) \* h\.fade\)/.test(SWJ));
ok('★ 纯按住一直保持且 rAF 停转零开销',
  /if \(h\.g < 1 \|\| Math\.abs\(h\.target - h\.lag\) > 0\.2\) h\.raf = requestAnimationFrame\(holdFrame\);\s*else h\.raf = 0;/.test(SWJ));
ok('★ 跟手慢慢动：低通 + 不越过轨道 60%，绝不提前判定开关',
  has(SWJ, 'HOLD_FOLLOW = 0.34') && has(SWJ, 'HOLD_LAG = 0.22') &&
  /var lim = h\.m\.travel \* 0\.6/.test(SWJ) &&
  /if \(Math\.abs\(dxMove\) < DRAG_THRESH\) \{ followHold\(el, dxMove\); return; \}/.test(SWJ));
ok('★ click 复用同一块 blob 续演，不删不重建、折射贴图不重算',
  /var held = el\.__n26SwHold;[\s\S]{0,400}?blob = held\.blob;/.test(SWJ) &&
  has(SWJ, 'stop(el, { keepBlob: true })') &&
  /var base = \(holdCX == null\) \? x0 : holdCX \+ \(x0 - holdCX\) \* ease\(grow\)/.test(SWJ));
ok('★ 拖动也复用按住块，不重算折射',
  /var h = el\.__n26SwHold;[\s\S]{0,500}?blob = h\.blob;/.test(SWJ) &&
  has(SWJ, 'curLeft = h.cx - (kw - m.kw) / 2'));
ok('★ 看门狗：click 没来就缩回白点，不留永不消失的玻璃',
  /setTimeout\(function \(\) \{\s*if \(el\.__n26SwHold === h && !el\.__n26Sw\) settleHold\(el\);/.test(SWJ) &&
  has(SWJ, '320'));
ok('★ stop 统一收两份 state，reclaim 认按住态',
  /function stop\(el, opts\)[\s\S]{0,900}?el\.__n26SwHold = null;/.test(SWJ) &&
  /if \(!el\.__n26Sw && !el\.__n26SwHold\) showKnob\(el\)/.test(SWJ));
ok('★ 版本戳 sw15，且 305 不写死旧戳',
  /version: '6\.0-2\.10\.23'/.test(SWJ) &&
  (HTML.match(/n26-switch\.js\?v=sw1\d+/g) || []).length >= 1);

/* ---------- 6. 启动台搜索栏 ---------- */
ok('★ 顶部留白 60 → 44px，搜索栏整体上移',
  /padding: 44px 40px 100px;/.test(HTML) && !/padding: 60px 40px 100px;/.test(HTML));
ok('★ 搜索框本身加高到 44px 并抬到左上卡片之上',
  /\.launchpad-search \{[\s\S]{0,600}?min-height: 44px;/.test(HTML) &&
  /\.launchpad-search \{[\s\S]{0,600}?z-index: 3;/.test(HTML) &&
  /padding: 12px 18px;/.test(HTML));

/* ---------- 7. 戳同步 / 卫生 ---------- */
/* ★ v2.10.33：_app.js 内容改了（go2 → go6），引用戳 2.9.99 → 2.9.103，
   顶层 27 页 + 子目录 4 页共 31 页，备份页（backup- 前缀）豁免。 */
ok('★ _app.js 全项目唯一戳 2.9.103（备份页除外）',
  (function () {
    const out = [];
    (function walk(d) {
      for (const n of fs.readdirSync(path.join(ROOT, d))) {
        const rel = d + '/' + n, p = path.join(ROOT, rel), st = fs.statSync(p);
        if (st.isDirectory()) { if (['.trash', 'node_modules', '_shots', 'brand', '_go_backup'].indexOf(n) < 0) walk(rel); }
        else if (/\.html$/i.test(n) && n.indexOf('.bak') < 0 && n.indexOf('backup-') !== 0) out.push(rel);
      }
    })('apps');
    const m = {};
    out.forEach(function (f) {
      const r = read(f).match(/_app\.js\?v=([0-9.]+)/);
      if (r) m[r[1]] = (m[r[1]] || 0) + 1;
    });
    const k = Object.keys(m);
    return k.length === 1 && k[0] === '2.9.103' && m[k[0]] >= 30;
  })());
ok('★ switch JS 戳全项目同步到 sw15',
  (HTML.match(/n26-switch\.js\?v=sw15/g) || []).length >= 1 &&
  !/n26-switch\.js\?v=sw13/.test(HTML));
ok('★ 防重复初始化 / 开放 API',
  has(GOJ, '__N26_GO_BOOTED__') && has(GOJ, 'global.N26GlassOptics') &&
  ['scan:', 'lightAt:', 'lightOff:', 'beginGlass:', 'settleGlass:', 'attachLg:'].every(function (k) { return has(GOJ, k); }));
ok('★ transition: all 为 0', !/transition\s*:\s*all/i.test(GOC_N));
ok('★ 统一 260ms 表面节奏 + 60ms 台阶',
  has(GOC_N, '.26s cubic-bezier(.2, .7, .2, 1)') && has(GOC_N, '60ms'));
ok('★ 全面禁紫（剥注释）', !/purple|rebeccapurple|violet|#8b5cf6|#a855f7|#7c3aed/i.test(GOC_N + GOJ_N));
try { new vm.Script(GOJ); ok('★ 光学层 JS 语法通过', true); } catch (e) { ok('★ 光学层 JS 语法通过', false); }
try { new vm.Script(SWJ); ok('★ 开关 JS 语法通过', true); } catch (e) { ok('★ 开关 JS 语法通过', false); }
try { new vm.Script(APPJS); ok('★ _app.js 语法通过', true); } catch (e) { ok('★ _app.js 语法通过', false); }
try { new vm.Script(ADAPTER); ok('★ _theme-adapter.js 语法通过', true); } catch (e) { ok('★ _theme-adapter.js 语法通过', false); }
ok('★ CSS 花括号配平',
  (GOC_N.match(/\{/g) || []).length === (GOC_N.match(/\}/g) || []).length);

/* ---------- 8. vm 假 DOM + 虚拟时钟逐帧冒烟 ---------- */
function fakeEl(tag) {
  const classes = {}, attrs = {}, vars = {};
  const el = {
    tagName: tag || 'div', children: [], parentNode: null, firstChild: null,
    isConnected: true, offsetWidth: 120, offsetHeight: 32,
    _n26Lg: null, style: {
      _v: vars,
      setProperty: function (k, v) { vars[k] = String(v); },
      removeProperty: function (k) { delete vars[k]; },
      getPropertyValue: function (k) { return vars[k] || ''; }
    },
    classList: {
      add: function () { for (const c of arguments) classes[c] = 1; },
      remove: function () { for (const c of arguments) delete classes[c]; },
      toggle: function (c, on) { if (on) classes[c] = 1; else delete classes[c]; },
      contains: function (c) { return !!classes[c]; }
    },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; },
    hasAttribute: function (k) { return attrs[k] != null; },
    removeAttribute: function (k) { delete attrs[k]; },
    matches: function () { return false; },
    closest: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () { },
    removeEventListener: function () { },
    appendChild: function (c) { c.parentNode = el; el.children.push(c); if (!el.firstChild) el.firstChild = c; return c; },
    insertBefore: function (c) { c.parentNode = el; el.children.unshift(c); el.firstChild = c; return c; },
    removeChild: function (c) {
      const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1);
      c.parentNode = null; el.firstChild = el.children[0] || null; return c;
    },
    getBoundingClientRect: function () { return { left: 10, top: 20, width: 120, height: 32, right: 130, bottom: 52 }; },
    _classes: classes, _attrs: attrs
  };
  return el;
}
function makeCtx(opts) {
  opts = opts || {};
  let now = 0;
  const frames = [], timers = [];
  const ctx = {
    console: console,
    URL: URL,
    setTimeout: function (fn, ms) { const t = { at: now + (ms || 0), fn: fn, done: false }; timers.push(t); return t; },
    clearTimeout: function (t) { if (t) t.done = true; },
    requestAnimationFrame: function (fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame: function () { },
    performance: { now: function () { return now; } },
    matchMedia: function () { return { matches: false }; },
    getComputedStyle: function () {
      return { position: 'static', getPropertyValue: function (k) {
        const t = { '--fu-sw-kw': '18', '--fu-sw-kh': '15', '--fu-sw-pad': '2', '--fu-sw-travel': '14' };
        return t[k] || '';
      } };
    },
    MutationObserver: function (cb) { this.observe = function () { }; this._cb = cb; },
    innerHeight: 900,
    addEventListener: function () { },
    removeEventListener: function () { }
  };
  const glass = [];
  for (let i = 0; i < (opts.glass || 2); i++) {
    const g = fakeEl('div'); g.classList.add('n26-dng'); glass.push(g);
  }
  const head = fakeEl('head'), body = fakeEl('body');
  const scripts = [];
  const doc = {
    readyState: 'complete',
    hidden: false,
    currentScript: { src: 'file:///ui/n26-glass-optics.js?v=go6' },
    documentElement: fakeEl('html'),
    head: head, body: body,
    createElement: function (t) { const e = fakeEl(t); if (t === 'script') scripts.push(e); return e; },
    querySelector: function (sel) {
      if (/script\[data-n26-go-core\]/.test(sel)) return scripts.filter(function (s) { return s.getAttribute('data-n26-go-core'); })[0] || null;
      if (/script\[src\*="n26-glass-optics/.test(sel)) return null;
      return null;
    },
    querySelectorAll: function (sel) {
      if (/n26-dng|n26ui-glass|n26-sw-blob/.test(sel)) return glass;
      return [];
    },
    addEventListener: function () { },
    getElementById: function () { return null; },
    getElementsByName: function () { return []; }
  };
  ctx.document = doc;
  ctx.window = ctx;
  /* 宿主没有引擎 → 走动态补挂分支；开关冒烟单独注入 stub */
  if (opts.withLg) {
    ctx.n26LgAttach = function (el) { el.classList.add('n26-liquid-on'); el._n26Lg = { id: 'x' }; };
    ctx.n26LgClear = function () { };
    ctx.n26LgResize = function () { };
  }
  ctx.tick = function (ms) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 16);
      const fs = frames.splice(0);
      for (const f of fs) { try { f(now); } catch (e) { ctx._frameErr = e; } }
      timers.filter(function (t) { return !t.done && t.at <= now; })
        .forEach(function (t) { t.done = true; try { t.fn(); } catch (e) { ctx._timerErr = e; } });
    }
  };
  ctx._glass = glass; ctx._scripts = scripts; ctx._head = head; ctx._body = body;
  ctx._frames = frames; ctx._timers = timers;
  /* 必须上下文化，否则 vm.runInContext 会抛 ERR_INVALID_ARG_TYPE */
  return vm.createContext(ctx);
}

/* 8.1 光学层：注入 / 亮光 / 幂等 / 单次引擎请求 */
(function () {
  const c = makeCtx({ glass: 2 });
  try { vm.runInContext(GOJ, c, { filename: 'n26-glass-optics.js' }); } catch (e) { c._bootErr = e; }
  if (c._bootErr) console.log('  [vm 诊断] ' + (c._bootErr.stack || c._bootErr.message));
  /* ★ v2.10.39：scan 改为「排队 + rAF 分片」，boot 后要驱动虚拟帧跑完批次，
     最终每片玻璃仍然注入 3 个子层（效果零删减，只是分帧出现）。 */
  if (c.N26GlassOptics) c.tick(64);
  ok('★ [vm] 光学层 boot 不抛错且暴露 API', !c._bootErr && !!c.N26GlassOptics && !!c.N26GlassOptics.scan);
  ok('★ [vm] 两个玻璃面各注入 3 个子层（face×2 + iris）',
    c._glass.every(function (g) { return g.getAttribute('data-n26-go') === '1' && g.children.length === 3; }));
  ok('★ [vm] scan 幂等：重复扫描不重复注入子层', (function () {
    if (c.N26GlassOptics) c.N26GlassOptics.scan();
    c.tick(64);
    return c._glass.every(function (g) { return g.children.length === 3; });
  })());
  ok('★ [vm] 按下亮光从指针点起、按住保持', (function () {
    if (!c.N26GlassOptics) return false;
    c.N26GlassOptics.lightAt(120, 80, true);
    const root = c._body.children.filter(function (x) { return x.id === 'n26GoLight' || x.getAttribute('id') === 'n26GoLight'; })[0];
    if (!root) return false;
    const bulb = root.children[0];
    return root.classList.contains('is-active') && root.classList.contains('is-strong') &&
      bulb.classList.contains('is-on') && root.style.left === '120px' && root.style.top === '80px';
  })());
  ok('★ [vm] 松手淡出跑完 300ms 后整层退出合成', (function () {
    if (!c.N26GlassOptics) return false;
    c.N26GlassOptics.lightOff();
    const root = c._body.children.filter(function (x) { return x.id === 'n26GoLight' || x.getAttribute('id') === 'n26GoLight'; })[0];
    if (!root.children[0].classList.contains('is-on')) { /* 已摘 is-on */ }
    c.tick(320);
    return !root.classList.contains('is-active') && !c._timerErr;
  })());
  ok('★ [vm] iframe 缺引擎时只补挂一次（等待者合并）',
    c._scripts.filter(function (s) { return s.getAttribute('data-n26-go-core'); }).length === 1);
})();

/* 8.2 开关：纯按住展开 / rAF 停转 / 跟手慢动 */
(function () {
  const c = makeCtx({ glass: 0, withLg: true });
  try { vm.runInContext(SWJ, c, { filename: 'n26-switch.js' }); } catch (e) { c._bootErr = e; }
  ok('★ [vm] 开关模块可执行且暴露按住 API', !c._bootErr && !!c.N26Switch && !!c.N26Switch.beginHold);
  const el = fakeEl('button');
  el.classList.add('fu-switch');
  let r;
  try { c.N26Switch.beginHold(el, { clientX: 0 }); r = el.__n26SwHold; } catch (e) { c._holdErr = e; }
  ok('★ [vm] pointerdown 立刻生成唯一一块玻璃、白点同帧隐藏',
    !c._holdErr && !!r && !!r.blob && el.children.length === 1 &&
    el.classList.contains('n26-sw-busy') && r.blob.classList.contains('n26-liquid-on'));
  ok('★ [vm] 首帧几何与白点一致（18×15，不是一上来就 150%）',
    !!r && r.blob.style.width === '18.00px' && r.blob.style.height === '15.00px');
  c.tick(300);
  ok('★ [vm] 260ms 涨到 150% 且纯按住 rAF 停转（静息零开销）',
    !!r && !c._frameErr && r.g === 1 && r.raf === 0 &&
    r.blob.style.width === '27.00px' && r.blob.style.height === '22.50px');
  ok('★ [vm] 按住态一直保持，没有被 reclaim 偷偷收回', !!r && el.__n26SwHold === r);
  const cx0 = r ? r.cx : 0;
  if (r && c.N26Switch) c.N26Switch.followHold(el, 10);
  c.tick(96);
  ok('★ [vm] 鼠标慢动时玻璃低通跟手，且不越过轨道 60%',
    !!r && Math.abs(r.target - 3.4) < 1e-6 && r.cx > cx0 && r.cx - r.x0 <= 14 * 0.6 + 0.01);
  if (r && c.N26Switch) c.N26Switch.settleHold(el);
  c.tick(220);
  ok('★ [vm] 看门狗收尾：玻璃缩回、白点归位、无残影',
    el.__n26SwHold === null && el.children.length === 0 && !el.classList.contains('n26-sw-busy'));
})();

console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-305 全绿');
process.exit(FAIL === 0 ? 0 : 1);
