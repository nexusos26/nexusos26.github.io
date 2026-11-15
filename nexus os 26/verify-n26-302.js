/* ============================================================================
   verify-n26-302.js · v2.10.20 锁屏共享控件闭环守门
   磨砂解耦 / 反向 FLIP / 跟手上滑 / N26Shared 单一时钟源 / 护盾
   纯 Node 静态 + vm 抠函数 + vm 假 DOM 冒烟，不开任何自动化浏览器
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
const LKC = read('ui/n26-lockflow.css');
const LKJ = read('ui/n26-lockflow.js');
const LKJ_N = noComments(LKJ);
const LKC_N = noComments(LKC);

console.log('=== verify-n26-302 · v2.10.20 锁屏共享控件闭环 ===');

/* ---------- 1. 版本（弹性） ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
ok('★ 主壳版本号格式合法', /^v2\.\d+\.\d+$/.test(VER));
ok('★ changelog 首条与主壳版本一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('changelog 记录共享控件 / 磨砂 / 跟手三项',
  has(HTML, '时间从头到尾是同一个控件') && has(HTML, '返回锁屏不再残留一层毛玻璃') && has(HTML, '上滑改成真跟手'));

/* ---------- 2. 磨砂：状态解耦 + 只演 opacity ---------- */
ok('★ 磨砂独立状态 n26-blur-on 已建立', has(HTML, '#lock-screen.n26-blur-on::before'));
ok('★ 旧耦合选择器 avatars-revealed::before 已移除', !has(HTML, '#lock-screen.avatars-revealed::before'));
ok('★ 进密码页挂磨砂', /classList\.add\('password-open'\);[\s\S]{0,200}classList\.add\('n26-blur-on'\)/.test(HTML));
ok('★ 重新锁屏清磨砂', /lock\.classList\.remove\('password-open'\);\n        lock\.classList\.remove\('n26-blur-on'\)/.test(HTML));
ok('★ 切换账户进密码页也挂磨砂', /lock\.classList\.add\('avatars-revealed'\);\n            lock\.classList\.add\('n26-blur-on'\)/.test(HTML));
ok('★ 返回只收磨砂、保留账户列表',
  /_lockBack\.classList\.remove\('n26-blur-on'\)/.test(HTML) &&
  !/_lockBack\.classList\.remove\('avatars-revealed'\)/.test(HTML));
const LOCKCSS = (HTML.match(/<style id="n26LockFlowCSS">([\s\S]*?)<\/style>/) || [])[1] || '';
const LOCKOLD = (HTML.match(/N26 锁屏 2\.0[\s\S]{0,1400}?\/\* 2\. 顶部状态栏/) || [])[0] || '';
ok('★ 模糊半径恒定，过渡只有 opacity 一条',
  has(noComments(LOCKCSS), 'transition: opacity .28s cubic-bezier(.2,.7,.2,1);') &&
  !/transition:[^;]*backdrop-filter/.test(noComments(LOCKCSS)));
ok('★ 主壳全局不再动画 backdrop-filter',
  !/transition\s*:\s*(-\w+-)?backdrop-filter/.test(noComments(HTML)));
ok('★ 锁屏本体旧的双层 backdrop-filter 已拆（不再建第二个 backdrop root）',
  !!LOCKOLD && !/backdrop-filter/.test(noComments(LOCKOLD)));
ok('★ 磨砂层静止时 backdrop-filter 为 none（不建 backdrop root）',
  /-webkit-backdrop-filter: none;\n        backdrop-filter: none;\n        opacity: 0;/.test(HTML));

/* ---------- 3. 往返都是同一个控件 ---------- */
ok('★ 飞行钟仍是全局唯一节点', (HTML.match(/el\.id = 'n26FlyClock'/g) || []).length === 1);
ok('★ 新增反向接力 n26FlyBackToBigClock', has(HTML, 'function n26FlyBackToBigClock()'));
ok('★ 返回走反向接力而非硬切',
  /try \{ n26FlyBackToBigClock\(\); \}/.test(HTML) &&
  !/backToAccountList\(\) \{[\s\S]{0,160}?try \{ n26FlyReset\(\); \}/.test(HTML));
ok('★ 大钟几何缓存含视口尺寸（resize 失效兜底）',
  /n26FlyState\.big = \{[\s\S]{0,300}?w: window\.innerWidth, h: window\.innerHeight/.test(HTML));
ok('★ 反向接力只在尺寸未变时飞', /big\.w !== window\.innerWidth \|\| big\.h !== window\.innerHeight/.test(HTML));
ok('★ 落地同一帧交接，不会两个时间并存', /const finish = function \(\) \{ n26FlyReset\(\); \}/.test(HTML));
ok('★ 反向时长 280ms + 表面缓动', /duration: 280, easing: 'cubic-bezier\(\.2,\.7,\.2,1\)'/.test(HTML));
ok('★ 秒钟返程渐显', /\[\{ opacity: 0 \}, \{ opacity: big\.secOpacity \|\.62 \}\]/.test(HTML) === false ||
  /opacity: big\.secOpacity/.test(HTML));
ok('★ reduced-motion / animate 缺失降级', /n26FlyReduceMotion\(\) \|\| typeof el\.animate !== 'function'/.test(HTML));

/* ---------- 4. 护盾 ---------- */
ok('★ cancel 前 commitStyles 固化终态', /typeof a\.commitStyles === 'function'[\s\S]{0,100}a\.commitStyles\(\)/.test(HTML));
ok('★ 900ms 飞行看门狗', /\}, 900\);/.test(HTML) && has(HTML, 'function n26FlyWatchdog()'));
ok('★ 四态可重入护盾', /phase === 'flying2' \|\| n26FlyState\.phase === 'flying-back'/.test(HTML));
ok('★ reset 清缓存与看门狗', /n26FlyState\.big = null;/.test(HTML) && /n26FlyState\.wd = 0;/.test(HTML));
ok('★ 返回幂等：连点 / Esc 连按不重播', /if \(lockTopVisible\) return;/.test(HTML));
ok('★ 返回时面板与时钟对齐到同一条 280ms 曲线', has(HTML, "_lockBack.classList.add('n26-lk-back')") && has(LKC, '.n26-lk-back .lock-layer'));

/* ---------- 5. 跟手上滑模块 ---------- */
ok('★ 防重复初始化双保险', /if \(window\.N26LockFlow\) return;/.test(LKJ) && /dataset\.n26Lk === '1'/.test(LKJ));
ok('★ pointer 三段齐全', ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].every(function (k) { return has(LKJ, k); }));
ok('★ rAF 合帧只写 transform', /function schedule\(\)/.test(LKJ) && /lockTop\.style\.transform = 'translateY\('/.test(LKJ));
const DRAG = LKJ.slice(LKJ.indexOf('function paint()'), LKJ.indexOf("lock.addEventListener('pointerdown'"));
ok('★ 跟手路径不读布局（resize 护盾才读一次）',
  DRAG.length > 100 && !/getBoundingClientRect|offsetHeight|offsetWidth|clientHeight|clientWidth/.test(DRAG));
ok('★ resize 护盾：小钟跟回测量槽、返程终点随视口平移',
  /flyState\.big\.top \+= window\.innerHeight - flyState\.big\.h/.test(LKJ) &&
  /el\.style\.left = r\.left/.test(LKJ));
ok('★ 跟手阶段不挂模糊', !/backdrop-filter/.test(LKJ_N) && !/backdrop-filter/.test(LKC_N));
ok('★ 阈值与主壳一致（-80）', /var THRESHOLD = -80;/.test(LKJ));
ok('★ 拖动封顶 + 6px 点击判定', /MAX_LIFT = -140/.test(LKJ) && /DRAG_EPS = 6/.test(LKJ));
ok('★ 拖过才吞 click，纯点击不干预', /if \(wasMoved\) swallowClick\(\)/.test(LKJ));
ok('★ 环境护盾：失焦 / 隐藏 / resize / 3s 超时 / 面板状态',
  ['blur', 'visibilitychange', 'resize', '3000', 'MutationObserver'].every(function (k) { return has(LKJ, k); }));
ok('★ 提交通过主壳函数，不另造一套状态', /typeof showPasswordPanel === "function"/.test(LKJ));
ok('★ reduced-motion 降级', /n26FlyReduceMotion|prefers-reduced-motion/.test(LKJ + LKC));

/* ---------- 6. N26Shared 开放 API（重复控件 / 单一时钟源） ---------- */
ok('★ 对外暴露 N26Shared', /window\.N26Shared = Shared;/.test(LKJ));
ok('★ register / get / subscribe / emitClock 齐全',
  ['register:', 'get:', 'subscribe:', 'emitClock:'].every(function (k) { return has(LKJ, k); }));
ok('★ 时间控件登记 4 个宿主、唯一数据源',
  /hosts: \['#lockTime', '#n26FlyClock', '#finderTime', '#lockStatusTime'\]/.test(LKJ) &&
  /source: 'updateLockTime'/.test(LKJ));
ok('★ 不新开定时器，观察主壳那一拍', !/setInterval/.test(LKJ_N) && /mo\.observe\(node/.test(LKJ));
ok('★ 磨砂状态也登记为共享控件', /Shared\.register\('lock-blur'/.test(LKJ));
ok('★ N26LockFlow 对外 API', /window\.N26LockFlow = \{/.test(LKJ) && /setBlur:/.test(LKJ));

/* ---------- 7. CSS / 资源戳 / 卫生 ---------- */
ok('★ 统一 260ms 表面缓动', (LKC_N.match(/260ms cubic-bezier\(\.2,\.7,\.2,1\)/g) || []).length >= 2);
ok('★ transition: all 为 0', !/transition\s*:\s*all/.test(LKC_N) && !/transition\s*:\s*all/.test(LKJ_N));
ok('★ 按下凹陷统一控件', /:active \{[\s\S]{0,20}transform: scale\(\.94\)/.test(LKC_N));
ok('★ 禁紫（剥注释后）', !/purple|violet|#8b5cf6|#a855f7|#7c3aed|rgba\(139, ?92, ?246/i.test(LKC_N + LKJ_N));
ok('★ 资源戳 lk1 且挂在最后',
  has(HTML, 'ui/n26-lockflow.css?v=lk1') && has(HTML, 'ui/n26-lockflow.js?v=lk1') &&
  HTML.indexOf('ui/n26-lockflow.css') > HTML.indexOf('ui/n26-launchpad-modal.css'));
ok('★ 模块文件真实存在', fs.existsSync(path.join(ROOT, 'ui/n26-lockflow.css')) && fs.existsSync(path.join(ROOT, 'ui/n26-lockflow.js')));
try { new vm.Script(LKJ); ok('★ 新 JS 语法通过', true); } catch (e) { ok('★ 新 JS 语法通过', false); }

/* ---------- 8. vm 冒烟 A：backToAccountList 真调用链 ---------- */
(function () {
  let m;
  try { m = HTML.match(/function backToAccountList\(\) \{[\s\S]*?\n    \}/); } catch (e) { }
  if (!m) { ok('★ vm 抠出 backToAccountList', false); return; }
  const removed = [], added = [];
  let backCalls = 0, resetCalls = 0;
  function fake() {
    const cls = {
      add: function (c) { added.push(c); },
      remove: function (c) { removed.push(c); },
      contains: function () { return false; }
    };
    return { classList: cls, style: {}, value: '', textContent: '', blur: function () { }, focus: function () { } };
  }
  const ctx = {
    document: { getElementById: fake },
    n26FlyBackToBigClock: function () { backCalls++; },
    n26FlyReset: function () { resetCalls++; },
    setTimeout: function () { return 1; },
    console: console
  };
  try {
    vm.runInNewContext('var lockTopVisible = false;\n' + m[0] + '\nbackToAccountList(); backToAccountList();', ctx);
  } catch (e) { ok('★ vm 执行 backToAccountList', false); return; }
  ok('★ vm 执行 backToAccountList', true);
  ok('★ vm：反向接力调用一次，重复返回被幂等挡住', backCalls === 1 && resetCalls === 0);
  ok('★ vm：磨砂 / password-open 被收掉', removed.indexOf('n26-blur-on') >= 0 && removed.indexOf('password-open') >= 0);
  ok('★ vm：账户列表 avatars-revealed 保留', removed.indexOf('avatars-revealed') < 0);
  ok('★ vm：返回过渡类挂上', added.indexOf('n26-lk-back') >= 0);
  ok('★ vm：lockTopVisible 复位为 true', ctx.lockTopVisible === true);
})();

/* ---------- 9. vm 冒烟 B：反向 FLIP 关键帧 ---------- */
(function () {
  const m = HTML.match(/function n26FlyBackToBigClock\(\) \{[\s\S]*?\n    \}/);
  if (!m) { ok('★ vm 抠出 n26FlyBackToBigClock', false); return; }
  let captured = null, resetCalls = 0, animObj = {};
  const sn = { style: {}, animate: function () { return {}; } };
  const el = {
    style: {},
    getBoundingClientRect: function () { return { left: 84, top: 57, width: 60, height: 20 }; },
    querySelector: function () { return sn; },
    animate: function (frames, opts) { captured = { frames: frames, opts: opts }; return animObj; }
  };
  const timeEl = { style: {} };
  const ctx = {
    document: { getElementById: function (id) { return id === 'n26FlyClock' ? el : (id === 'lockTime' ? timeEl : null); } },
    n26FlyState: { phase: 'mini', font: 20, lh: .96, anims: [], big: { left: 48, top: 600, font: 106, spacing: '-3px', secOpacity: '.62', w: 1200, h: 800 } },
    n26FlyCancel: function () { }, n26FlyReset: function () { resetCalls++; },
    n26FlyReduceMotion: function () { return false; }, n26FlyWatchdog: function () { },
    window: { innerWidth: 1200, innerHeight: 800 },
    getComputedStyle: function () { return { letterSpacing: '-.4px' }; },
    console: console
  };
  try { vm.runInNewContext(m[0] + '\nn26FlyBackToBigClock();', ctx); }
  catch (e) { ok('★ vm 执行 n26FlyBackToBigClock', false); return; }
  ok('★ vm 执行 n26FlyBackToBigClock', true);
  ok('★ vm：280ms 表面缓动 + fill forwards', !!captured && captured.opts.duration === 280 &&
    captured.opts.easing === 'cubic-bezier(.2,.7,.2,1)' && captured.opts.fill === 'forwards');
  ok('★ vm：终点按缓存反算（-36, 543）放大 5.3 倍',
    !!captured && has(captured.frames[1].transform, 'translate(-36px,543px)') && has(captured.frames[1].transform, 'scale(5.3)'));
  ok('★ vm：大钟保持隐藏、秒钟从 0 渐显', timeEl.style.visibility === 'hidden' && sn.style.opacity === '0');
  ok('★ vm：phase 进入 flying-back', ctx.n26FlyState.phase === 'flying-back');
  try { animObj.onfinish(); } catch (e) { }
  ok('★ vm：落地调 reset 交接', resetCalls === 1);

  /* 视口变了 → 不走 FLIP，直接收（护盾） */
  captured = null; resetCalls = 0;
  ctx.window.innerHeight = 900; ctx.n26FlyState.phase = 'mini';
  try { vm.runInNewContext(m[0] + '\nn26FlyBackToBigClock();', ctx); } catch (e) { }
  ok('★ vm：视口尺寸变化即失效，不硬飞', captured === null && resetCalls === 1);
})();

/* ---------- 10. vm 冒烟 C：整模块假 DOM ---------- */
(function () {
  function makeEnv() {
    const H = { lock: {}, win: {}, doc: {} };
    const els = {};
    function mk(id) {
      const cls = {};
      const e = {
        id: id, dataset: {}, style: { display: 'flex' }, textContent: '00:00',
        classList: {
          add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
          contains: function (c) { return !!cls[c]; }
        },
        _cls: cls,
        addEventListener: function (t, f) { (H.lock[t] = H.lock[t] || []).push(f); },
        getBoundingClientRect: function () { return { left: 0, top: 0, width: 60, height: 20 }; }
      };
      return e;
    }
    ['lock-screen', 'lockTop', 'lockStatusTime'].forEach(function (id) { els[id] = mk(id); });
    const called = { pw: 0 };
    const ctx = {
      console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
      Date: Date, Math: Math, Object: Object, Array: Array, String: String,
      innerHeight: 800, innerWidth: 1200,
      requestAnimationFrame: function (f) { f(); return 1; }, cancelAnimationFrame: function () { },
      matchMedia: function () { return { matches: false }; },
      MutationObserver: function (cb) { this.observe = function () { }; this.disconnect = function () { }; },
      showPasswordPanel: function () { called.pw++; },
      document: {
        getElementById: function (id) { return els[id] || null; },
        addEventListener: function (t, f) { (H.doc[t] = H.doc[t] || []).push(f); },
        hidden: false
      },
      addEventListener: function (t, f) { (H.win[t] = H.win[t] || []).push(f); }
    };
    ctx.window = ctx;
    return { ctx: ctx, H: H, els: els, called: called };
  }
  function fire(bag, type, ev) { (bag[type] || []).forEach(function (f) { f(ev); }); }
  const env = makeEnv();
  try { vm.runInNewContext(LKJ, env.ctx); } catch (e) { ok('★ vm 加载 lockflow 模块', false); return; }
  ok('★ vm 加载 lockflow 模块', true);
  ok('★ vm：N26Shared / N26LockFlow 都挂上', !!env.ctx.N26Shared && !!env.ctx.N26LockFlow);
  ok('★ vm：clock 已注册，重复注册被拒',
    !!env.ctx.N26Shared.get('clock') && env.ctx.N26Shared.register('clock', {}) === false);
  let got = null;
  env.ctx.N26Shared.subscribe(function (p) { got = p; });
  env.ctx.N26Shared.emitClock('12:34', '56', new env.ctx.Date());
  ok('★ vm：订阅者拿到同一时钟源那一拍', !!got && got.hhmm === '12:34' && got.source === 'updateLockTime');

  const ev = function (y) { return { clientY: y, button: 0, pointerType: 'mouse', target: {} }; };
  /* 提交路径：拖 -100px */
  fire(env.H.lock, 'pointerdown', ev(600));
  fire(env.H.win, 'pointermove', ev(500));
  const dragged = !!env.els['lock-screen']._cls['n26-lk-drag'];
  fire(env.H.win, 'pointerup', ev(500));
  ok('★ vm：拖动中挂 n26-lk-drag', dragged);
  ok('★ vm：过阈值提交一次，内联 transform 收干净',
    env.called.pw === 1 && env.els.lockTop.style.transform === '' && !env.els['lock-screen']._cls['n26-lk-drag']);
  /* 回弹路径：只拖 -30px */
  fire(env.H.lock, 'pointerdown', ev(600));
  fire(env.H.win, 'pointermove', ev(570));
  fire(env.H.win, 'pointerup', ev(570));
  ok('★ vm：不足阈值不提交、回弹清干净', env.called.pw === 1 && env.els.lockTop.style.transform === '');
  let stopped = false;
  fire(env.H.doc, 'click', { stopImmediatePropagation: function () { stopped = true; }, preventDefault: function () { } });
  ok('★ vm：拖动后的那一下 click 被吞', stopped);
  /* 纯点击不干预 */
  fire(env.H.lock, 'pointerdown', ev(600));
  fire(env.H.win, 'pointerup', ev(600));
  ok('★ vm：6px 内纯点击完全不干预', !env.els['lock-screen']._cls['n26-lk-drag'] && env.called.pw === 1);
  /* 重复初始化 */
  const before = env.ctx.N26LockFlow;
  vm.runInNewContext(LKJ, env.ctx);
  ok('★ vm：同一环境重复引入不重建', env.ctx.N26LockFlow === before);
})();

console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-302 全绿');
process.exit(FAIL === 0 ? 0 : 1);
