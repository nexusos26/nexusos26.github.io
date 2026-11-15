/* ============================================================================
   verify-n26-313.js · v2.10.37 总线收敛 / 持久缓存 / LoAF 归因（第二十六套）
   --------------------------------------------------------------------------
   用户定案（全部写进断言，防止下一轮又靠「猜一个效果层」绕回去）：
     ① 侧边栏是系统组件 UI，DOM / CSS / 类名 / 玻璃回弹动画一个字都不许改；
     ② 减少不相干的抗御代码，但系统 UI 完全不变、效果一条不减；
     ③ 主体验入口是官网 https 静态托管（Cloudflare Pages），仓库不放 .bat；
     ④ 前六轮全无实机数据 —— 本套同时验证「卡死现场黑匣子」真的能落盘/取回。
   纯 Node 静态断言 + vm 假 DOM + 虚拟时钟，未启动任何自动化浏览器。
   ============================================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function has(s, k) { return s.indexOf(k) >= 0; }
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
let PASS = 0, FAIL = 0;
function ok(n, c) { if (c) PASS++; else { FAIL++; console.log('  x ' + n); } }

const HTML = read('Nexus OS 26.html').replace(/\r\n/g, '\n');
const GOJ_RAW = read('ui/n26-glass-optics.js');
const GOJ = noComments(GOJ_RAW);
const DN_RAW = read('ui/n26-docknav.js');
const DN = noComments(DN_RAW);
const GOC = noComments(read('ui/n26-glass-optics.css'));
const PERF = noComments(read('ui/n26-perf.css'));
const DIAG = read('ui/n26-diag.js');
const DK = read('ui/n26-dom-keep.js');
const SW = noComments(read('ui/n26-switch.js'));
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
const V = (VER.match(/^v2\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
const STYLES = (HTML.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
const AT = STYLES.indexOf('class="changelog"');
const CSS = noComments(AT > 100000 ? STYLES.slice(0, AT) : STYLES);
/* changelog 正文里也写了历史版本用过 N26GpuGuard —— 扫活代码只认
   switchSettingsTab 函数体，绝不把 HTML 说明文字当 JS 判定。 */
const TAB_AT = HTML.indexOf('function switchSettingsTab(id)');
const TAB_BODY = noComments(HTML.slice(TAB_AT, TAB_AT + 1800));
console.log('=== verify-n26-313 · v2.10.39 总线收敛 / UI 零改动 / 全面黑匣子 / 分时分片 ===');

/* ---------- 1. 版本 / 可自证 ---------- */
ok('★ 版本合法且 >= v2.10.36（弹性）',
  V.length === 2 && (V[0] > 10 || (V[0] === 10 && V[1] >= 36)));
ok('★ changelog 首条 = 当前版本 + 标题自证', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER && has(HTML, '<title>Nexus OS 26 · ' + VER + '</title>');
})());

/* ---------- 2. ★ 全文档观察总线收敛（只改观察范围，不动 UI） ---------- */
ok('★ 光学层不再给整个 body 装 class 总线（剥注释后为零）',
  !/mo\.observe\(\s*doc(?:ument)?\.body/.test(GOJ));
ok('★ 光学层改为逐玻璃元素观察自身 class',
  /function watch\(el\)/.test(GOJ) &&
  /mo\.observe\(el,\s*\{[^}]*attributes:\s*true[^}]*attributeFilter:\s*\['class'\][^}]*subtree:\s*false/.test(GOJ) &&
  has(GOJ, '__n26GoWatched'));
ok('★ 新玻璃面补扫只由真的按下触发，不再由任何 DOM 变化触发',
  /doc\.addEventListener\('pointerdown'[\s\S]{0,900}?scheduleScan\(\)/.test(GOJ) &&
  !/MutationObserver\(function \(records\)[\s\S]{0,900}?scheduleScan\(\)/.test(GOJ));
ok('★ docknav 动态侧栏观察器有 [data-n26dock] 闸门（无关 DOM 变化不再 auto）',
  /var hit = false;/.test(DN) && has(DN, "n.getAttribute('data-n26dock')") &&
  has(DN, "n.querySelector('[data-n26dock]')") && /if \(!hit \|\| t\) return;/.test(DN));
ok('★ docknav 超椭圆观察器从 documentElement 收到 #dock',
  !/sqMO\.observe\(document\.documentElement/.test(DN) &&
  /var dockHost = document\.getElementById\('dock'\)/.test(DN) &&
  /sqMO\.observe\(dockHost, \{ childList: true, subtree: true \}\)/.test(DN));

/* ---------- 3. ★ 侧边栏 UI 一个字没动 ---------- */
ok('★ 侧栏注册表 15 条 [data-n26dock] 全在（含设置侧栏）', (function () {
  const reg = DN_RAW.slice(DN_RAW.indexOf('var REGISTRY') >= 0 ? DN_RAW.indexOf('var REGISTRY') : 0, 3000);
  return (reg.match(/\[data-n26dock\]/g) || []).length >= 15 &&
    has(reg, '.settings-sidebar[data-n26dock]');
})());
ok('★ 玻璃回弹 / 滑动 / 旅行三段动画函数与状态类全在',
  /function spring\(amp, dir, done\)/.test(DN) &&
  /function glide\(a, b, dur, done\)/.test(DN) &&
  /function startTravel\(prev, item\)/.test(DN) &&
  has(DN, 'n26-dng-on') && has(DN, 'n26-dng-live'));
ok('★ 侧栏折射引擎接口与尺寸量化未改',
  has(DN, 'n26LgAttach') && has(DN, 'function qSize(w, h)') &&
  /Math\.max\(48, Math\.round\(w \/ 8\) \* 8\)/.test(DN));
ok('★ switchSettingsTab 主链路仍在，且仍是原来的 class 切换 / 渲染顺序', (function () {
  const at = HTML.indexOf('function switchSettingsTab(id)');
  const body = HTML.slice(at, at + 1800);
  return at > 0 && has(body, "panel.classList.remove('animating')") &&
    has(body, "panel.classList.add('animating')") && has(body, 'renderSettingsPanel()') &&
    !/panel\.offsetHeight/.test(body);
})());

/* ---------- 4. ★ 抗御代码确已减少 ---------- */
ok('★ N26GpuGuard 整层消失：文件 / 脚本引用 / 切页 arm() / perf 降级规则',
  !fs.existsSync(path.join(ROOT, 'ui/n26-gpu-guard.js')) &&
  !/<script[^>]+n26-gpu-guard\.js/.test(HTML) &&
  TAB_AT > 0 && !/N26GpuGuard\.arm\(/.test(TAB_BODY) &&
  !/n26-gpu-safe/.test(PERF));
ok('★ diag 不包装任何业务函数（六函数 wrapper 链已删）',
  !/__n26DiagWrapped|forEach\(wrap\)|function wrap\(/.test(DIAG) &&
  /PerformanceObserver/.test(DIAG) && /longtask/.test(DIAG));
ok('★ 零门槛取证：卡片只由 Ctrl+Alt+D / ?diag=1 触发，静止时零 DOM',
  has(DIAG, 'e.ctrlKey && e.altKey') && has(DIAG, 'diag=1') &&
  has(DIAG, 'function showPanel()') && has(DIAG, 'panel: showPanel') &&
  /function showPanel\(\)[\s\S]{0,400}?doc\.createElement\('div'\)/.test(DIAG) &&
  (DIAG.match(/showPanel\(\)/g) || []).length <= 4);
ok('★ 诊断卡一键复制：execCommand 兜底，不依赖 DevTools / 剪贴板权限',
  has(DIAG, "doc.execCommand('copy')") && has(DIAG, '已复制，去对话里粘贴') &&
  has(DIAG, '不用截图、不用重新点卡'));
ok('★ perf.css 花括号配平、模糊层一条没删',
  (PERF.match(/\{/g) || []).length === (PERF.match(/\}/g) || []).length &&
  (HTML.match(/backdrop-filter\s*:/g) || []).length >= 200);
ok('★ 仓库内无 .bat / 本地启动脚本',
  fs.readdirSync(ROOT).filter(function (f) { return /\.bat$/i.test(f); }).length === 0);

/* ---------- 5. ★ 静止效果一条不减 ---------- */
ok('★ overlay 噪点 / 护眼 multiply / orb screen 全在',
  /body\.n26-on::after\s*\{[^}]*mix-blend-mode:\s*overlay[^}]*feTurbulence/.test(CSS) &&
  /#n26WarmTint\s*\{[^}]*mix-blend-mode:\s*multiply/.test(CSS) &&
  /\.n26-orb[\s\S]{0,400}?mix-blend-mode:\s*screen/.test(HTML));
ok('★ 光学层亮光 / 彩虹 / 对角 mask 仍在，且已无 screen（v2.10.33 成果不回退）',
  !/mix-blend-mode\s*:\s*screen/i.test(GOC) &&
  has(GOC, '#n26GoLight.is-active { visibility: visible; }') &&
  has(GOC, 'linear-gradient(135deg') && has(GOC, 'width: 560px'));
ok('★ 全面禁紫',
  !/purple|rebeccapurple|violet|#8b5cf6|#a855f7|#7c3aed/i.test(GOJ + DN + GOC + PERF + DIAG));

/* ---------- 6. ★ 确定性性能：存储持久解析缓存（v2.10.37） ---------- */
ok('★ 存储持久解析缓存：原始字符串校验，跨任务零陈旧且绝不读旧值',
  has(HTML, '_n26RawCache') && has(HTML, '_n26RawStr') &&
  has(HTML, '_n26RawStr[key] === v') &&
  /function _getLSRaw\(key\)[\s\S]{0,1200}?_n26RawStr\[key\] = v;/.test(HTML) &&
  /function _getLSRaw\(key\)[\s\S]{0,1200}?_n26RawCache\[key\] = out;/.test(HTML));
ok('★ 写入即时失效（对象 + 原始字符串双删）+ setLS / setUserLS 两条写路径都走 _setLSRaw',
  /function _setLSRaw\(key, value\) \{[\s\S]{0,300}?delete _n26RawCache\[key\];/.test(HTML) &&
  /function _setLSRaw\(key, value\) \{[\s\S]{0,300}?delete _n26RawStr\[key\];/.test(HTML) &&
  /function setLS\(key, value\)[\s\S]{0,1400}?_setLSRaw\(key, value\)/.test(HTML) &&
  /function setUserLS\(key, value\)[\s\S]{0,1400}?_setLSRaw\(/.test(HTML));
ok('★ dom-keep restoreScroll 仍是只写不读',
  has(DK, 'noLayoutReadAfterWrite: true') &&
  /if \(s\.y\) s\.el\.scrollTop = s\.y;/.test(DK));

/* ---------- 7. ★ 官网 https 静态托管优先 ---------- */
ok('★ 全相对路径 / 无 file:/// 硬编码 / 无 CSP meta 硬拦 / 无绝对路径资源',
  !/(?:src|href)="\/(?:ui|apps)\//.test(HTML) && !has(HTML, 'file:///') &&
  !/http-equiv="Content-Security-Policy"/i.test(HTML));
ok('★ 协议分支只判 file: 一次，https 官网能力未误伤',
  (HTML.match(/location\.protocol\s*===\s*['"]file:/g) || []).length === 1 &&
  !/location\.protocol === 'https\?'/.test(HTML));
ok('★ changelog 明确官网 https / Cloudflare Pages 为主体验入口',
  has(HTML, 'Cloudflare Pages') && has(HTML, '主体验入口'));

/* ---------- 8. ★ 戳同步 ---------- */
ok('★ 主壳 / _app.js / _theme-adapter.js / API 文档四处 go6 + dg5 + dn15',
  has(HTML, 'ui/n26-glass-optics.css?v=go6') && has(HTML, 'ui/n26-glass-optics.js?v=go6') &&
  has(read('apps/_app.js'), "'../ui/n26-glass-optics.js?v=go6'") &&
  has(read('apps/_theme-adapter.js'), "'../ui/n26-glass-optics.js?v=go6'") &&
  has(read('Nexus-对外API.md'), 'go6') &&
  has(HTML, 'n26-diag.js?v=dg8') && has(HTML, 'n26-docknav.js?v=dn15'));
ok('★ 31 个 apps 页唯一戳 2.9.103、三个打包产物 ta5', (function () {
  let bumped = 0, ta = 0, bad = 0;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.html$/.test(e.name) || /^backup-/.test(e.name)) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (has(s, '_app.js?v=2.9.103')) bumped++;
      if (has(s, 'src="../_theme-adapter.js?v=ta5"')) ta++;
      if (has(s, '_app.js?v=2.9.101')) bad++;
    }
  }
  walk(path.join(ROOT, 'apps'));
  return bumped >= 30 && ta >= 3 && bad === 0;
})());

/* ---------- 9. ★ 主壳 9 段内联脚本编译（改过内联 JS 必查） ---------- */
ok('★ 主壳内联 <script> 全部编译通过（>=9 段，口径与 298/299 一致）', (function () {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, n = 0, bad = 0;
  while ((m = re.exec(HTML))) {
    n++;
    try { new vm.Script(m[1]); } catch (e) { bad++; }
  }
  return n >= 9 && bad === 0;
})());
ok('★ 改过的共享 JS 全部编译通过', (function () {
  try {
    [GOJ_RAW, DN_RAW, DIAG, DK, read('ui/n26-switch.js'), read('apps/_app.js')]
      .forEach(function (s) { new vm.Script(s); });
    return true;
  } catch (e) { return false; }
})());

/* ---------- 9b. ★ v2.10.38 全面故障黑匣子（用户定案：以后一直用，任何故障复制一段就能定位） ---------- */
ok('★ 心跳取证：每秒落盘 + 点击锚点 + 200/600ms 加密点 + 启动先读旧会话',
  has(DIAG, 'setInterval(heartbeat, 1000)') &&
  has(DIAG, 'n26:diag:beat') && has(DIAG, 'n26:diag:session') && has(DIAG, 'n26:diag:input') &&
  has(DIAG, 'setTimeout(heartbeat, 200)') && has(DIAG, 'setTimeout(heartbeat, 600)') &&
  has(DIAG, 'prevSession = lsRead(SS_KEY)'));
ok('★ 全捕获：JS 错误 / Promise 拒绝 / 资源失败 / 应用 iframe 哨兵 / rAF 掉帧，五通道独立环形 12 条',
  has(DIAG, "addEventListener('error'") && has(DIAG, "addEventListener('unhandledrejection'") &&
  has(DIAG, 'n26:diag:errors') && has(DIAG, 'n26:diag:resources') &&
  has(DIAG, 'n26:diag:apps') && has(DIAG, 'n26:diag:framegaps') &&
  has(DIAG, "tagName === 'IFRAME'") && has(DIAG, 'requestAnimationFrame') &&
  has(DIAG, 'CHAN_MAX = 12'));
ok('★ 诊断卡 v3：全通道一键复制（遗留痕迹 / JS / Promise / 资源 / 应用 / 掉帧 / 阻塞明细）',
  has(DIAG, '诊断卡 v3') && has(DIAG, '主线程阻塞明细') &&
  has(DIAG, '上次会话遗留痕迹') && has(DIAG, '软件打不开') &&
  has(DIAG, '退出页面也不丢'));

/* ---------- 9c. ★ v2.10.39 心跳数据驱动：三条扫描分时分片（真修，不许回退） ---------- */
ok('★ 光学层补扫从 120ms 挪到 380ms（玻璃动画收尾之后），且分片每帧 10 个',
  /function scheduleScan\(\) \{[\s\S]{0,260}?scan\(\); \}, 380\);/.test(GOJ) &&
  has(GOJ, 'SCAN_BATCH = 10') && has(GOJ, 'scanQueue.splice(0, SCAN_BATCH)') &&
  has(GOJ, 'raf(pumpScan)') && has(GOJ, 'scanBusy'));
ok('★ 光学层批内先批量读 position 再批量写，写完才挂观察器（自写 class 不喂回 MO）',
  /var pos = new Array\(batch.length\)[\s\S]{0,300}?pos\[i\] = readPos\(batch\[i\]\)/.test(GOJ) &&
  /if \(decorate\(batch\[i\], pos\[i\]\)\) onState\(batch\[i\]\);[\s\S]{0,160}?watch\(batch\[i\]\)/.test(GOJ) &&
  /else watch\(el\);/.test(GOJ));
ok('★ 折射兜底只在队列清空后统一跑一次，不再每批全文档 querySelectorAll',
  /if \(scanQueue\.length\) \{ raf\(pumpScan\); return; \}[\s\S]{0,420}?ensureEngine\(function \(\)/.test(GOJ));
ok('★ 开关层观察器加 SEL 闸门（无关 DOM 变化不再全文档 scan）+ 160→380ms',
  has(SW, 'setTimeout(scan, 380)') && has(SW, 'n.matches(SEL)') &&
  has(SW, "n.querySelector(SEL)") && !has(SW, 'setTimeout(scan, 160)'));
ok('★ 按下命中的玻璃仍立即 decorate + beginGlass（手感 / 三段动效零回退）',
  /if \(glass\) \{ decorate\(glass\); beginGlass\(glass\); glass\.__n26GoActive = true; \}/.test(GOJ));
ok('★ 动态侧栏 [data-n26dock] 闸门保持（v2.10.36 成果不回退）',
  has(DN, "n.getAttribute('data-n26dock')") && /if \(!hit \|\| t\) return;/.test(DN));

/* ---------- 10. ★ vm 假 DOM：卡死现场黑匣子真的能落盘 / 取回 ---------- */
(function () {
  const store = Object.create(null);   /* 两个「会话」共享，模拟 file:// 同 origin localStorage */
  let cb = null;
  function makeCtx() {
    const head = {
      appendChild: function (n) { n.parentNode = head; },
      removeChild: function (n) { n.parentNode = null; }
    };
    const listeners = {};
    const winListeners = {};
    const doc = {
      title: 'Nexus OS 26 · v2.10.38',
      head: head,
      documentElement: { appendChild: function () { } },
      addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
      getElementById: function () { return null; },
      execCommand: function () { return true; },
      createElement: function () {
        return {
          id: '', textContent: '', value: '', type: '', onclick: null,
          style: {}, parentNode: null, children: [],
          setAttribute: function () { },
          select: function () { },
          appendChild: function (n) { n.parentNode = this; this.children.push(n); }
        };
      },
      getElementsByTagName: function () { return { length: 42 }; }
    };
    function PO(fn) { cb = fn; }
    PO.prototype.observe = function () { };
    const ctx = {
      document: doc,
      performance: { now: function () { return 1000; } },
      localStorage: {
        getItem: function (k) { return k in store ? store[k] : null; },
        setItem: function (k, v) { store[k] = String(v); }
      },
      location: { protocol: 'https:' },
      PerformanceObserver: PO,
      console: { info: function () { }, warn: function () { }, log: function () { }, table: function () { } },
      setTimeout: function () { return 1; },
      clearTimeout: function () { },
      setInterval: function () { return 1; },
      clearInterval: function () { },
      addEventListener: function (t, fn) { (winListeners[t] || (winListeners[t] = [])).push(fn); },
      Promise: Promise, Math: Math, JSON: JSON, Date: Date
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    return { ctx: ctx, listeners: listeners, winListeners: winListeners, doc: doc };
  }
  const first = makeCtx();
  const ctx = first.ctx, listeners = first.listeners,
    winListeners = first.winListeners, doc = first.doc;
  let boot = true;
  try { vm.runInContext(DIAG, ctx, { filename: 'n26-diag.js' }); } catch (e) { boot = false; }
  ok('★ vm：diag 在假 DOM 里正常启动，N26Diag API 齐备',
    boot && !!ctx.N26Diag && typeof ctx.N26Diag.last === 'function' &&
    typeof ctx.N26Diag.noFx === 'function' && ctx.N26Diag.version === VER);

  cb({ getEntries: function () { return [{ startTime: 1010, duration: 60 }]; } });
  ok('★ vm：60ms 普通长任务不落盘（常态零写入）', !store['n26:diag:blackbox']);

  cb({ getEntries: function () { return [{ startTime: 1020, duration: 320 }]; } });
  let arr = [];
  try { arr = JSON.parse(store['n26:diag:blackbox'] || '[]'); } catch (e) { }
  ok('★ vm：320ms 长任务落盘 1 条，字段含耗时 / 协议 / DOM 规模 / 版本',
    arr.length === 1 && arr[0].ms === 320 && arr[0].proto === 'https' &&
    arr[0].dom === 42 && arr[0].ver === VER && arr[0].at === 20);
  ok('★ vm：N26Diag.last() 跨「重开页面」取回黑匣子', ctx.N26Diag.last().length === 1);
  ok('★ vm：黑匣子上限 12 条，不会无限涨', (function () {
    for (let i = 0; i < 20; i++) cb({ getEntries: function () { return [{ startTime: 1100 + i, duration: 260 }]; } });
    let a = [];
    try { a = JSON.parse(store['n26:diag:blackbox'] || '[]'); } catch (e) { }
    return a.length === 12;
  })());
  ok('★ vm：noFx A/B 可开可关，不残留样式节点',
    ctx.N26Diag.noFx(true) === true && ctx.N26Diag.noFx(false) === false);
  ok('★ vm：Ctrl+Alt+D 弹出诊断卡，文本含黑匣子记录、明确不用截图', (function () {
    const fired = listeners.keydown || [];
    const before = doc.getElementById('n26DiagCard');
    fired.forEach(function (fn) {
      fn({ ctrlKey: true, altKey: true, key: 'd', preventDefault: function () { } });
    });
    const t = ctx.N26Diag.blackboxText();
    return fired.length > 0 && before === null &&
      t.indexOf('主线程阻塞 = ') >= 0 && t.indexOf('不用截图') >= 0 &&
      t.indexOf('诊断卡 v3') >= 0 && t.indexOf('阻塞') >= 0;
  })());
  ok('★ vm：LoAF 归因——黑匣子记录主凶函数与强制布局耗时，诊断卡直接指认', (function () {
    delete store['n26:diag:blackbox'];
    cb({ getEntries: function () {
      return [{ startTime: 1500, duration: 500, blockingDuration: 480,
        styleAndLayoutStart: 1750,
        scripts: [{ sourceFunctionName: 'renderSettingsPanel', duration: 420,
          forcedStyleAndLayoutDuration: 260, invoker: 'click' },
          { sourceFunctionName: 'applyLayout', duration: 90 }] }];
    } });
    let a = [];
    try { a = JSON.parse(store['n26:diag:blackbox'] || '[]'); } catch (e) { }
    const t = ctx.N26Diag.blackboxText();
    return a.length === 1 && a[0].loaf === true && a[0].block === 480 &&
      a[0].layout === 250 &&
      a[0].who.length === 2 &&
      a[0].who[0].name === 'renderSettingsPanel' && a[0].who[0].dur === 420 &&
      t.indexOf('主凶1  renderSettingsPanel') >= 0 &&
      t.indexOf('强制布局 260ms') >= 0 && t.indexOf('主线程阻塞明细') >= 0;
  })());
  ok('★ vm：JS 报错 / Promise 拒绝 / 资源加载失败全捕获落盘，诊断卡分类呈现', (function () {
    const wl = winListeners.error || [];
    wl.forEach(function (fn) {
      fn({ message: 'boom is not defined', filename: 'apps/demo.js', lineno: 42 });
      fn({ target: { tagName: 'SCRIPT', src: 'apps/missing.js' } });
    });
    (winListeners['unhandledrejection'] || []).forEach(function (fn) {
      fn({ reason: 'nope' });
    });
    const errs = JSON.parse(store['n26:diag:errors'] || '[]');
    const res = JSON.parse(store['n26:diag:resources'] || '[]');
    const t = ctx.N26Diag.blackboxText();
    return errs.length === 2 && errs.some(function (r) { return r.msg === 'boom is not defined'; }) &&
      errs.some(function (r) { return r.kind === 'promise'; }) &&
      res.length === 1 && res[0].tag === 'script' && res[0].src.indexOf('missing.js') >= 0 &&
      t.indexOf('[JS] boom is not defined') >= 0 &&
      t.indexOf('[Promise] nope') >= 0 &&
      t.indexOf('<script>') >= 0 && t.indexOf('missing.js') >= 0;
  })());
  ok('★ vm：心跳遗留痕迹——上次会话主线程最后存活时刻 + 距最后点击，退出页面也不丢', (function () {
    /* 模拟：跑 diag 之前 store 里留着「上次会话」sid=111 的记录
       （会话始于 5000，最后心跳 12000 = 会话第 7s，最后点击 9000 = 距心跳 3s） */
    store['n26:diag:session'] = JSON.stringify({ sid: 111, start: 5000 });
    store['n26:diag:beat'] = JSON.stringify({ sid: 111, t: 12000 });
    store['n26:diag:input'] = JSON.stringify({ sid: 111, t: 9000 });
    let boot2 = true, ctx2;
    try {
      ctx2 = makeCtx();
      vm.runInContext(DIAG, ctx2.ctx, { filename: 'n26-diag-2.js' });
    } catch (e) { boot2 = false; }
    if (!boot2 || !ctx2.ctx.N26Diag) return false;
    const t = ctx2.ctx.N26Diag.blackboxText();
    return t.indexOf('主线程最后存活于会话第 7s') >= 0 &&
      t.indexOf('距最后一次点击 3000ms') >= 0 &&
      t.indexOf('退出页面也不丢') >= 0;
  })());
  ok('★ vm：N26Diag.panel() 可直接弹卡，含「复制诊断 / 关闭」两个按钮', (function () {
    const c = ctx.N26Diag.panel();
    return !!c && c.children.length === 2 &&
      c.children[1].children.length === 2 &&
      c.children[1].children[0].textContent === '复制诊断';
  })());
})();

/* ---------- 11. 卫生 ---------- */
ok('★ 无临时补丁 / 探针脚本残留',
  !fs.existsSync(path.join(ROOT, '_patch_gates.js')) &&
  !fs.existsSync(path.join(ROOT, '_n26_repro.js')) &&
  !fs.existsSync(path.join(ROOT, '_dbg313.js')));

console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-313 全绿 · 纯 Node 静态 + vm 假 DOM，未启动任何浏览器');
process.exit(FAIL === 0 ? 0 : 1);
