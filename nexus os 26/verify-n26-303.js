/* ============================================================================
   verify-n26-303.js · v2.10.21 FangUI 四风格全局适配守门
   老体系桥接 / 29 应用全覆盖 / 后开应用兜底 / 开放 API / 拟物凸起凹陷
   纯 Node 静态 + vm 假 DOM 冒烟，不开任何自动化浏览器
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
const FBC = read('ui/n26-fui-bridge.css');
const FBJ = read('ui/n26-fui-bridge.js');
const APPJS = read('apps/_app.js');
const ADAPTER = read('apps/_theme-adapter.js');
const DOC = read('Nexus-对外API.md');
const FBC_N = noComments(FBC), FBJ_N = noComments(FBJ);

console.log('=== verify-n26-303 · v2.10.21 四风格全局适配 ===');

/* ---------- 1. 版本 ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
ok('★ 主壳版本号格式合法', /^v2\.\d+\.\d+$/.test(VER));
ok('★ changelog 首条与主壳版本一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('changelog 记录桥接 / 全覆盖 / 手感 / API 四项',
  ['615 条视觉规则', '29 个第一方应用', '凸起可按', 'N26Fui'].every(function (k) { return has(HTML, k); }));

/* ---------- 2. 四风格令牌 ---------- */
['flat', 'neu-solid', 'neu-glass'].forEach(function (s) {
  ok('★ 令牌表覆盖 ' + s, has(FBC_N, 'html[data-fui="' + s + '"]'));
});
ok('★ data-fui 是完整风格 id 判据（data-ui 分不出两种 neu）',
  has(FBJ, "r.setAttribute('data-fui', style)") && has(DOC, '推荐判据'));
ok('★ 扁平化明确给大圆角', /html\[data-fui="flat"\] \{[\s\S]{0,400}?--n26-fui-radius:\s*16px/.test(FBC_N));
ok('★ 拟物化双阴影凸起 + 按下内凹',
  has(FBC_N, '--n26-fui-shadow-raise: 4px 4px 10px') && has(FBC_N, '--n26-fui-shadow-press: inset 3px 3px 7px'));
ok('★ 玻璃拟态吃当前磨砂滑杆半径（不写死）',
  /html\[data-fui="neu-glass"\] \{[\s\S]{0,700}?--n26-fui-blur:\s*var\(--n26-blur/.test(FBC_N));
ok('★ 四风格分动效曲线', ['150ms', '400ms', '260ms', '300ms'].every(function (d) { return has(FBC_N, d); }));
ok('★ 深色四套独立底色用合法选择器（html 不是 body 后代）',
  !/body\.dark-mode html\[/.test(FBC_N) && /html\[data-fui="flat"\]:has\(body\.dark-mode\)/.test(FBC_N));
ok('★ 液态玻璃零覆盖（折射引擎独占）',
  !/html\[data-fui="liquid"\]\s*[:.{]/.test(FBC_N) && has(FBJ, '液态玻璃：零回归'));

/* ---------- 3. 宿主老体系桥接 ---------- */
ok('★ applyFuiStyle 接上桥（最小一行接线）',
  /try \{ if \(window\.N26Fui\) window\.N26Fui\.apply\(style \|\| FUI_DEFAULT_STYLE\); \} catch \(e\) \{ \}/.test(HTML));
ok('★ 四风格 → 老三风格映射表',
  /'flat': 'style-flat', 'neu-solid': 'style-skeuomorphic', 'neu-glass': 'style-skeuomorphic'/.test(FBJ));
ok('★ 液态时精确还原启动基线（切走再切回不丢）',
  has(FBJ, 'legacyBaseline()') && has(FBJ, 'legacyRestore()') && has(FBJ, "if (style === 'liquid')"));
ok('★ 老 CSS 变量回灌 --glass-bg / --glass-blur / --window-radius',
  ['--glass-bg: var(--n26-fui-surface)', '--glass-blur: 0px', '--window-radius: 16px'].every(function (k) { return has(FBC_N, k); }));
ok('★ 切换只在那一瞬挂过渡，平时不碰应用 transition',
  has(FBJ, "r.classList.add('n26-fui-switching')") && has(FBJ, "root().classList.remove('n26-fui-switching')") &&
  /html\.n26-fui-switching :is\(/.test(FBC_N));

/* ---------- 4. 所有第一方应用 ---------- */
const pages = (function () {
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = dir + '/' + name, p = path.join(ROOT, rel);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (['.trash', 'node_modules', '_shots', 'brand'].indexOf(name) < 0) walk(rel); }
      /* v2.10.23：apps/bili/backup-index-* 是历史备份，不是第一方交付页面，
         它带着老戳不该参与「全项目戳唯一」校验。 */
      else if (/\.html$/i.test(name) && name.indexOf('.bak') < 0 && name.indexOf('backup-') !== 0) out.push(rel);
    }
  }
  walk('apps'); return out;
})();
const withApp = pages.filter(function (p) { return has(read(p), '_app.js'); });
/* ★ 版本弹性：共享运行时每次改动都要 bump 戳，硬编码旧戳会让守门自己误报。
   改为「所有页面必须带 2.9.x 戳、全项目只允许一个戳、没有 2.9.97 残留」。 */
const appStamps = {};
pages.forEach(function (p) {
  const m = read(p).match(/_app\.js\?v=([0-9.]+)/);
  if (m) appStamps[m[1]] = (appStamps[m[1]] || 0) + 1;
});
const stampKeys = Object.keys(appStamps);
const withOldStamp = pages.filter(function (p) { return has(read(p), '_app.js?v=2.9.97'); });
ok('★ 29+ 个第一方页面走共享运行时', withApp.length >= 29);
ok('★ _app.js 戳全项目唯一且版本弹性（无 2.9.97 残留）',
  stampKeys.length === 1 && /^2\.9\.\d+$/.test(stampKeys[0]) &&
  appStamps[stampKeys[0]] >= 30 && withOldStamp.length === 0);
ok('★ _app.js 自动注入桥层（应用一行 HTML 都不用改）',
  has(APPJS, "../ui/n26-fui-bridge.js?v=fb1") && has(APPJS, 'n26-fui-bridge.js'));
ok('★ 打包产物由 _theme-adapter.js 补挂',
  has(ADAPTER, '../ui/n26-fui-bridge.js?v=fb1') && has(ADAPTER, 'ensureFuiBridge'));
ok('★ 主题广播带当前风格（后开应用不再停在液态）',
  /name: 'theme', data: \{ dark: dark, perf: perf, fanguiStyle: fui \}/.test(HTML));
ok('★ _app.js 的 applyTheme 吃直接下发的 fanguiStyle',
  /if \(data\.fanguiStyle\) _lastUi = data\.fanguiStyle;/.test(APPJS));
ok('★ 四路兜底：ready / theme / osControl / 父窗口属性',
  ['nexus:ready', 'nexus:theme', 'nexus:fuistyle', 'osControl', 'readHostFui'].every(function (k) { return has(FBJ, k); }));
ok('★ 自动适配与退出开关',
  has(FBJ, "r.setAttribute('data-fui-auto', '1')") && has(FBJ, "r.getAttribute('data-fui-off') !== '1'"));
ok('★ 防重复初始化', /if \(window\.N26Fui\) return;/.test(FBJ));

/* ---------- 5. 手感 / 开放 API / 卫生 ---------- */
ok('★ 拟物化侧边 Dock 栏凸起可按、按下与选中凹陷',
  /html\[data-fui="neu-solid"\] :is\(#dock \.dock-item/.test(FBC_N) &&
  has(FBC_N, '[data-n26dng-on="1"]') && has(FBC_N, ':active'));
ok('★ 扁平化清掉应用写死的玻璃残留',
  /html\[data-fui="flat"\] :is\(\.glass[\s\S]{0,220}?backdrop-filter: none !important/.test(FBC_N));
ok('★ 通用控件只改视觉不碰布局',
  !/\b(width|height|padding|margin|display|position)\s*:/.test(FBC_N));
ok('★ 选择器覆盖应用内真实高频类名（按 28 个页面统计结果加入）',
  ['.panel-card', '.of-grp-row', '.card-note', '.ppt-prop', '.of-btn', '.of-select',
    '.of-field', '.icon-btn', '.fc-btn', '.v-btn', '.v-cbtn', '.ma-btn']
    .every(function (k) { return has(FBC_N, k); }));
ok('★ 桥 CSS 花括号配平',
  (FBC_N.match(/\{/g) || []).length === (FBC_N.match(/\}/g) || []).length);
ok('★ 开放 API：宿主 N26Fui 六件套',
  ['current:', 'apply: apply', 'set: set', 'on: on', 'tokens: tokens', 'STYLES: STYLES'].every(function (k) { return has(FBJ, k); }));
ok('★ 开放 API：iframe 侧 getFuiStyle / setFuiStyle / onFuiStyle',
  ['NX.getFuiStyle', 'NX.setFuiStyle', 'NX.onFuiStyle'].every(function (k) { return has(APPJS, k); }));
ok('★ 第三方可 set 并全系统广播', has(FBJ, "'osControl', 'setSetting'"));
ok('★ 对外文档补四风格章节', has(DOC, '2.7.1 FangUI 四风格适配') && has(DOC, 'Nexus.getFuiStyle()'));
ok('★ 资源戳 fb1 且挂在最后',
  has(HTML, 'ui/n26-fui-bridge.css?v=fb1') && has(HTML, 'ui/n26-fui-bridge.js?v=fb1') &&
  /* changelog 里也会提到文件名，必须比尾部挂载点而不是首次出现 */
  HTML.lastIndexOf('n26-fui-bridge.css') > HTML.lastIndexOf('n26-lockflow.js'));
ok('★ transition: all 为 0', !/transition\s*:\s*all/.test(FBC_N) && !/transition\s*:\s*all/.test(FBJ_N));
ok('★ 不动画 backdrop-filter 半径', !/transition[^;]*backdrop-filter/.test(FBC_N));
ok('★ 禁紫（剥注释）', !/purple|violet|#8b5cf6|#a855f7|#7c3aed/i.test(FBC_N + FBJ_N));
ok('★ reduced-motion / perf-mode 降级', has(FBC_N, 'prefers-reduced-motion') && has(FBC_N, 'body.perf-mode'));
try { new vm.Script(FBJ); ok('★ 桥 JS 语法通过', true); } catch (e) { ok('★ 桥 JS 语法通过', false); }
try { new vm.Script(APPJS); ok('★ _app.js 语法通过', true); } catch (e) { ok('★ _app.js 语法通过', false); }

/* ---------- 6. vm 冒烟 A：宿主模式四风格往返 ---------- */
function makeEnv(host, hostFui) {
  const timers = [], handlers = {}, links = [];
  function mkClassList(owner) {
    const set = {};
    return {
      _set: set,
      add: function (c) { Array.prototype.forEach.call(arguments, function (x) { set[x] = 1; }); },
      remove: function (c) { Array.prototype.forEach.call(arguments, function (x) { delete set[x]; }); },
      contains: function (c) { return !!set[c]; }
    };
  }
  const attrs = {};
  const el = { classList: mkClassList(), style: {}, getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; }, setAttribute: function (k, v) { attrs[k] = String(v); }, removeAttribute: function (k) { delete attrs[k]; } };
  const body = { classList: mkClassList(), style: {} };
  const head = { appendChild: function (n) { links.push(n); } };
  const doc = {
    readyState: 'complete', documentElement: el, body: body, head: head,
    querySelector: function () { return null; }, createElement: function () { return { style: {}, rel: '', href: '' }; },
    addEventListener: function (t, f) { (handlers['doc:' + t] = handlers['doc:' + t] || []).push(f); }
  };
  let setCalls = 0;
  const ctx = {
    console: console, Date: Date, Math: Math, Object: Object, Array: Array, String: String, Promise: Promise,
    URL: URL, location: { href: 'http://localhost/apps/music.html' },
    setTimeout: function (f) { timers.push(f); return timers.length; }, clearTimeout: function () { },
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
    document: doc,
    addEventListener: function (t, f) { (handlers[t] = handlers[t] || []).push(f); },
    Nexus: { call: function () { return Promise.resolve(hostFui || 'liquid'); }, on: function () { } }
  };
  ctx.window = ctx;
  if (host) {
    ctx.setFanguiStyle = function () { setCalls++; };
    ctx.getFanguiStyle = function () { return 'liquid'; };
    ctx.parent = ctx;
  } else {
    ctx.parent = { document: { documentElement: { getAttribute: function (k) { return k === 'data-fui' ? hostFui : null; } } } };
  }
  return { ctx: ctx, el: el, body: body, attrs: attrs, handlers: handlers, timers: timers, links: links, setCalls: function () { return setCalls; } };
}
(function () {
  const env = makeEnv(true);
  try { vm.runInNewContext(FBJ, env.ctx); } catch (e) { ok('★ vm 宿主模式加载桥', false); return; }
  const A = env.ctx.N26Fui;
  ok('★ vm 宿主模式加载桥', !!A);
  ok('★ vm：STYLES 恰好四风格', !!A && A.STYLES.length === 4 && A.STYLES.indexOf('neu-glass') >= 0);
  A.apply('flat');
  ok('★ vm：flat → data-fui/data-ui/style-flat', env.attrs['data-fui'] === 'flat' && env.attrs['data-ui'] === 'flat' && env.body.classList.contains('style-flat'));
  A.apply('neu-solid');
  ok('★ vm：neu-solid → data-ui=neu / data-neu=solid / style-skeuomorphic',
    env.attrs['data-ui'] === 'neu' && env.attrs['data-neu'] === 'solid' && env.body.classList.contains('style-skeuomorphic'));
  A.apply('neu-glass');
  ok('★ vm：neu-glass → data-neu=glass（data-ui 同为 neu 也能区分）', env.attrs['data-neu'] === 'glass');
  A.apply('liquid');
  ok('★ vm：切回 liquid 移除 data-neu 且老类还原到基线',
    !env.attrs['data-neu'] && !env.body.classList.contains('style-skeuomorphic') && !env.body.classList.contains('style-flat'));
  ok('★ vm：切换瞬间挂类、看门狗回调摘类', (function () {
    A.apply('flat');
    const added = env.el.classList.contains('n26-fui-switching');
    env.timers.forEach(function (f) { try { f(); } catch (e) { } });
    return added && !env.el.classList.contains('n26-fui-switching');
  })());
  let got = null;
  const off = A.on(function (d) { got = d; });
  A.apply('neu-glass');
  ok('★ vm：on() 订阅拿到 style / previous', !!got && got.style === 'neu-glass' && got.previous === 'flat');
  off(); got = null; A.apply('liquid');
  ok('★ vm：off() 取消订阅生效', got === null);
  A.set('flat');
  ok('★ vm：set() 走宿主 setFanguiStyle（持久化 + 广播）', env.setCalls() === 1);
  ok('★ vm：tokens() 返回对象', typeof A.tokens() === 'object');
  const before = env.ctx.N26Fui;
  vm.runInNewContext(FBJ, env.ctx);
  ok('★ vm：重复引入不重建', env.ctx.N26Fui === before);
})();

/* ---------- 7. vm 冒烟 B：iframe 模式后开应用兜底 ---------- */
(function () {
  const env = makeEnv(false, 'neu-glass');
  try { vm.runInNewContext(FBJ, env.ctx); } catch (e) { ok('★ vm iframe 模式加载桥', false); return; }
  ok('★ vm iframe 模式加载桥', !!env.ctx.N26Fui);
  ok('★ vm：从父窗口 data-fui 拿到 neu-glass，不再停在 liquid', env.attrs['data-fui'] === 'neu-glass');
  ok('★ vm：挂上 data-fui-auto 自动适配', env.attrs['data-fui-auto'] === '1');
  ok('★ vm：桥 CSS 自动注入一份', env.links.length === 1 && has(env.links[0].href, 'n26-fui-bridge.css?v=fb1'));
  (env.handlers['nexus:fuistyle'] || []).forEach(function (f) { f({ detail: { style: 'flat' } }); });
  ok('★ vm：切换事件当帧改风格', env.attrs['data-fui'] === 'flat' && env.attrs['data-ui'] === 'flat');
  (env.handlers['nexus:theme'] || []).forEach(function (f) { f({ detail: { fanguiStyle: 'neu-solid' } }); });
  ok('★ vm：theme 广播直接带风格也能跟随', env.attrs['data-fui'] === 'neu-solid' && env.attrs['data-neu'] === 'solid');
  (env.handlers['nexus:ready'] || []).forEach(function (f) { f({ detail: { settings: { fanguiStyle: 'liquid' } } }); });
  ok('★ vm：__nexusInit 带 settings 也吃', env.attrs['data-fui'] === 'liquid' && !env.attrs['data-neu']);
})();

/* ---------- 8. vm 冒烟 C：iframe 侧 Nexus 扩展 ---------- */
(function () {
  const m = APPJS.match(/  \(function extendFuiApi\(\) \{[\s\S]*?\n  \}\)\(\);/);
  if (!m) { ok('★ vm 抠出 extendFuiApi', false); return; }
  let setPayload = null;
  const ctx = {
    window: {
      Nexus: {
        call: function (method, a, p) { if (p && p.key === 'fanguiStyle') setPayload = p; return Promise.resolve('flat'); },
        on: function () { }
      }
    }, Promise: Promise, console: console
  };
  ctx.window.window = ctx.window;
  try { vm.runInNewContext(m[0], ctx); } catch (e) { ok('★ vm 执行 extendFuiApi', false); return; }
  const NX = ctx.window.Nexus;
  ok('★ vm 执行 extendFuiApi', true);
  ok('★ vm：三个 API 都挂上', ['getFuiStyle', 'setFuiStyle', 'onFuiStyle'].every(function (k) { return typeof NX[k] === 'function'; }));
  ok('★ vm：getFuiStyle 返回 Promise', !!NX.getFuiStyle().then);
  NX.setFuiStyle('neu-solid');
  ok('★ vm：setFuiStyle 写 osControl.setSetting', !!setPayload && setPayload.value === 'neu-solid');
})();

console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-303 全绿');
process.exit(FAIL === 0 ? 0 : 1);
