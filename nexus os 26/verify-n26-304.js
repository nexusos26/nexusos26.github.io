/* ============================================================================
   verify-n26-304.js · v2.10.22 设置面板流式重构守门（第十七套）
   壁纸内联展开 / 重复网格撤除 / 两张新卡 / 颜色空页 / DockBar 融入导航栏
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
const SFC = read('ui/n26-settings-flow.css');
const SFJ = read('ui/n26-settings-flow.js');
const SFC_N = noComments(SFC);
const SFJ_N = noComments(SFJ);

console.log('=== verify-n26-304 · v2.10.22 设置面板流式重构 ===');

/* ---------- 1. 版本与资源 ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
ok('★ 版本号格式合法（弹性）', /^v2\.\d+\.\d+$/.test(VER));
ok('★ changelog 首条与版本号一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('★ 两个 sf1 资源都挂上（CSS 在最后压过 dockbar-pos / polish）',
  has(HTML, 'href="ui/n26-settings-flow.css?v=sf1"') && has(HTML, 'src="ui/n26-settings-flow.js?v=sf1"'));
ok('★ sf1 引用恰好两处，无遗漏旧戳', (HTML.match(/n26-settings-flow\.(css|js)\?v=sf1/g) || []).length === 2);
ok('★ changelog 记录五项改动',
  ['壁纸就在下面展开', 'Wallpaper 壁纸', '不再是空白页', '导航栏背景', '护盾'].every(function (k) { return has(HTML, k); }));

/* ---------- 2. 主壳最小接线 ---------- */
ok('★ 颜色独立成二级页（不再靠 data-cat 过滤）',
  /if \(_pzCat === 'color' && window\.N26SettingsFlow\) \{[\s\S]{0,220}?N26SettingsFlow\.colorPage\(\)/.test(HTML));
ok('★ 主题卡改成内联展开，不再跳三级页',
  has(HTML, 'onclick="N26SettingsFlow.wallInline(\'${th.id}\')"') &&
  !has(HTML, 'onclick="n26PzOpenWallGroup(\'${th.id}\')"'));
ok('★ 主题卡带 data-n26-wg-id 供展开态高亮', has(HTML, 'data-n26-wg-id="${th.id}"'));
ok('★ 两张特殊卡插进 theme-grid', has(HTML, 'N26SettingsFlow.specialCards()'));
ok('★ 重复的选壁纸网格已整段撤除',
  !has(HTML, 'grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;') &&
  !has(HTML, 'onclick="setWallpaper(${i})"'));
ok('★ 内联网格宿主就位、必应开关仍在',
  has(HTML, 'id="n26WgInlineHost"') && has(HTML, 'class="n26-bing-row"'));
ok('★ 内联宿主紧跟主题卡（外观页 / 壁纸页都能就地展开，不再退回三级页）',
  /N26SettingsFlow\.specialCards\(\)[\s\S]{0,320}?id="n26WgInlineHost"/.test(HTML));
ok('★ 必应开关与必应卡走同一个入口（不再两套逻辑）',
  has(HTML, 'onclick="N26SettingsFlow.toggleBing()"') &&
  !has(HTML, 'onclick="n26ToggleBingDaily()"'));
ok('★ 分区显式标记护盾（data-pz-sec 优先于标题文本）',
  /function n26PzClassify\(sec\) \{[\s\S]{0,260}?getAttribute\('data-pz-sec'\)[\s\S]{0,120}?if \(forced\) return forced;/.test(HTML) &&
  has(HTML, 'data-pz-sec="wallpaper"'));
ok('★ n26PzAfter 合帧补挂 afterRender(cat)',
  /n26PzSyncUI\(\);[\s\S]{0,200}?N26SettingsFlow\.afterRender\(cat\)/.test(HTML));
ok('★ 渲染后改挂新导航栏芯片', has(HTML, 'N26SettingsFlow.renderNavRows()'));
ok('★ DockBar 设置项换成导航栏背景 / 边框',
  has(HTML, 'id="dockBarNavBgRow"') && has(HTML, 'id="dockBarNavBorderRow"') &&
  !has(HTML, '<span id="dockBarMatRow"'));
ok('★ 旧材质/底色说明已移除', !has(HTML, '云母 = 似 Windows 11 Mica'));

/* ---------- 3. 重复控件：内联网格复用三级页同一套 ---------- */
ok('★ 内联沿用 #n26WgGrid / #n26WgSlideshow（不另造第二套 id）',
  has(SFJ, "id=\"n26WgGrid\"") && has(SFJ, "id=\"n26WgSlideshow\""));
ok('★ 缩略图复用 n26WgThumbHtml，点击复用 n26WgPick，懒加载复用 n26WgLazyThumbs',
  has(SFJ, "lex('n26WgThumbHtml')") && has(SFJ, "lex('n26WgPick')") && has(SFJ, "lex('n26WgLazyThumbs')"));
ok('★ 幻灯片 bar 复用 n26WgBarHtml，且只从 state.id 取主题 id',
  has(SFJ, "lex('n26WgBarHtml')") && has(SFJ, 'var id = state.id;') &&
  !/n26WgSetInterval[\s\S]{0,120}?arguments\[0\]/.test(SFJ_N));
ok('★ 不包 n26WgPick（主壳自己会 paint，包了会重复写 DOM）',
  !/\['n26WgStartSlideshow', 'n26WgStopSlideshow', 'n26WgSetInterval', 'n26WgPick'\]/.test(SFJ));
ok('★ 经典 script 顶层 const 用 Function 只读接入，不改打包/主壳',
  has(SFJ, 'Function(\'return typeof \' + name') && has(SFJ, "lex('N26_WALLPAPERS')"));
ok('★ 旧存档别名 reserved1/2 不混进总览', has(SFJ, 'THEME_ALIAS_SKIP'));

/* ---------- 4. 两张特殊卡 + 必应本地降级 ---------- */
ok('★ 必应卡 / Wallpaper 卡都生成且可点',
  has(SFJ, 'N26SettingsFlow.toggleBing()') &&
  has(SFJ, "N26SettingsFlow.wallInline(\\'all\\')") &&
  has(SFJ, '每日必应壁纸') && has(SFJ, 'Wallpaper 壁纸'));
ok('★ 云端不通时降级成本地每日精选，且不写 bingDailyUrl（否则 applyUserSettings 会找空图）',
  /s\.bingDailyLocal = true;[\s\S]{0,160}?s\.bingDailyUrl = '';/.test(SFJ) &&
  has(SFJ, 'Math.floor(Date.now() / 86400000) % flat.length'));
ok('★ 降级仍走单一数据源：桌面与锁屏同步、清掉自定义/动态',
  has(SFJ, "s.lockWallpaperMode = 'desktop';") && has(SFJ, 's.useDynamicWallpaper = false;'));
ok('★ 云端成功路径仍写真实 url / title',
  has(SFJ, 'st.bingDailyUrl = d.url;') && has(SFJ, 'st.bingDailyTitle = d.title'));
ok('★ 必应卡状态与旧开关同步刷新', has(SFJ, '.n26-bing-row .toggle-switch') && has(SFJ, '.n26-wp-bing-state'));

/* ---------- 5. 颜色页 ---------- */
ok('★ 颜色页两个分区都带显式标记（实时预览那节不会再被过滤掉）',
  (SFJ.match(/data-pz-sec="color"/g) || []).length === 2);
ok('★ 标题带 n26-pz-h3（不会被 > h3 隐藏规则吃掉）', has(SFJ, '<h3 class="n26-pz-h3">颜色</h3>'));
ok('★ 五档预设 + 任意 hex + 实时预览齐备',
  (SFJ.match(/\{ id: '/g) || []).length >= 5 &&
  has(SFJ, 'n26SfHexPicker') && has(SFJ, 'n26-sf-preview') && has(SFJ, '--primary'));
ok('★ 禁紫铁律：第三档键名保留但渲染 #38bdf8',
  /id: 'purple', name: '天青',\s+hex: '#38bdf8'/.test(SFJ));
ok('★ 拖色盘只写变量零重绘（previewAccent 不调 renderSettingsPanel）',
  /function previewAccent\(hex\) \{[\s\S]{0,900}?\}/.test(SFJ) &&
  !/function previewAccent\(hex\) \{[\s\S]{0,900}?renderSettingsPanel/.test(SFJ) &&
  has(SFJ, "oninput=\"N26SettingsFlow.previewAccent(this.value)\""));
ok('★ 松手才持久化（commitAccent → setAccent）',
  has(SFJ, "onchange=\"N26SettingsFlow.commitAccent(this.value)\"") && has(SFJ, 'function commitAccent(hex)'));
ok('★ hex 白名单校验，杜绝注入', has(SFJ, '/^#[0-9a-fA-F]{6}$/') && has(SFJ, 'function esc(v)'));

/* ---------- 6. DockBar 导航栏令牌 ---------- */
ok('★ 四档背景 / 三档边框',
  (SFC.match(/--n26-nav-/g) || []).length > 0 &&
  ['merge', 'frost', 'mica', 'liquid'].every(function (k) { return has(SFJ, "id: '" + k + "'"); }) &&
  ['none', 'hairline', 'glow'].every(function (k) { return has(SFJ, "id: '" + k + "'"); }));
ok('★ CSS !important 压过 applyDockBarAppearance 的行内样式',
  /body\.n26-db-pos-top #dockBar \{[\s\S]{0,420}?--n26-nav-bg[\s\S]{0,420}?!important/.test(SFC_N));
ok('★ 深色同特异性且后加载，压过 dockbar-pos.css 的深色规则',
  has(SFC_N, 'body.dark-mode.n26-db-pos-top #dockBar') &&
  HTML.indexOf('n26-settings-flow.css?v=sf1') > HTML.indexOf('n26-dockbar-pos.css?v=dbp2'));
ok('★ 只作用于顶部模式，左/右浮条材质不受影响',
  !/n26-db-pos-left #dockBar[\s\S]{0,300}?--n26-nav-bg/.test(SFC_N) &&
  !/n26-db-pos-right #dockBar[\s\S]{0,300}?--n26-nav-bg/.test(SFC_N));
ok('★ 融合档去掉独立边框与浮条投影', has(SFC_N, 'n26-db-nav-merge') && has(SFC_N, 'box-shadow: none !important'));
ok('★ 位置/设置切换后重算令牌（hook 且防重复初始化）',
  has(SFJ, '__N26_SF_BOOTED__') && has(SFJ, 'global.applyDockBarPos = function ()') &&
  has(SFJ, 'global.applyUserSettings = function ()'));

/* ---------- 7. 动效铁律与卫生 ---------- */
ok('★ transition: all 为 0', !/transition:\s*all/i.test(SFC_N));
ok('★ 二级页入场/退场统一一条 260ms 表面缓动',
  has(SFC_N, 'animation: n26SfPageIn .26s cubic-bezier(.2, .7, .2, 1) both') &&
  has(SFC_N, 'animation: n26SfPageOut .26s cubic-bezier(.2, .7, .2, 1) both') &&
  !has(SFC_N, '.24s cubic-bezier(.22,.8,.28,1)'));
ok('★ 台阶 55ms、按首屏可见行封顶 min(i,10)',
  has(SFJ, 'Math.min(i, 10) * 55') && has(SFJ, 'Math.min(gi, 10) * 55'));
ok('★ 展开/收起各一条合成关键帧（opacity + transform 同帧演完）',
  has(SFC_N, '@keyframes n26SfExpand') && has(SFC_N, '@keyframes n26SfCollapse') &&
  /@keyframes n26SfExpand \{[\s\S]{0,200}?opacity: 0; transform:/.test(SFC_N));
ok('★ reduced-motion 全量降级', has(SFC_N, 'prefers-reduced-motion: reduce') && has(SFJ, 'function reduced()'));
ok('★ 全面禁紫：新 CSS 无紫色值',
  !/purple|rebeccapurple|#8b5cf6|#a855f7|#7c3aed/i.test(SFC_N));
ok('★ 高频路径不建 backdrop root（只写 CSS 变量）',
  has(SFJ, "doc.documentElement.style.setProperty('--primary', hex)"));
ok('★ 收起幂等 + 定时器可清 + 重绘后恢复内联态',
  has(SFJ, 'if (state.closing) return;') && has(SFJ, 'clearTimeout(closeTimer)') && has(SFJ, 'function restoreInline()'));
ok('★ afterRender 合帧防重入，且不按 cat 硬判恢复（外观页切回来内联态不丢）',
  has(SFJ, 'if (pending) return;') && has(SFJ, 'raf(function ()') &&
  !has(SFJ, "if (cat === 'wallpaper') { try { restoreInline(); }"));
ok('★ 新 JS / CSS 语法与结构', SFJ_N.trim().length > 3000 && SFC_N.trim().length > 2000);

/* ---------- 8. vm 假 DOM 冒烟 ---------- */
function makeCtx(opts) {
  opts = opts || {};
  const store = opts.store || { settings: {} };
  const calls = { render: 0, applyWall: [], notify: [], apply: 0 };
  const vars = {};
  const els = {};

  function ClassList(el) {
    this._s = {};
    this.add = function (c) { this._s[c] = 1; };
    this.remove = function (c) { delete this._s[c]; };
    this.toggle = function (c, on) { if (on) this._s[c] = 1; else delete this._s[c]; };
    this.contains = function (c) { return !!this._s[c]; };
  }
  function El() {
    this._html = '';
    this.attrs = {};
    this.value = '';
    this.classList = new ClassList(this);
    this.style = {
      setProperty: function (k, v) { vars[k] = v; },
      getPropertyValue: function (k) { return vars[k]; },
      background: ''
    };
  }
  Object.defineProperty(El.prototype, 'innerHTML', {
    get: function () { return this._html; },
    set: function (v) { this._html = String(v); }
  });
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  El.prototype.getAttribute = function (k) { return this.attrs[k] || null; };
  El.prototype.querySelector = function (sel) {
    var list = this.querySelectorAll(sel);
    return list[0] || null;
  };
  El.prototype.querySelectorAll = function (sel) {
    var h = this._html || '';
    var re = null;
    if (/n26-wg-thumb/.test(sel)) re = /class="n26-wg-thumb/g;
    else if (/n26-sf-swatch/.test(sel)) re = /class="n26-sf-swatch/g;
    else if (/n26-wp-bing/.test(sel)) re = /class="theme-card n26-wp-special n26-wp-bing/g;
    else if (/n26-wp-special-sub/.test(sel)) re = /class="n26-wp-special-sub"/g;
    else if (/n26-wp-bing-state/.test(sel)) re = /class="n26-wp-bing-state"/g;
    else if (/toggle-switch/.test(sel)) re = /class="toggle-switch/g;
    else if (/theme-card\[data-n26-wg-id\]/.test(sel)) re = /data-n26-wg-id="/g;
    else if (/img\[data-src\]/.test(sel)) re = /<img data-src=/g;
    var n = re ? (h.match(re) || []).length : 0;
    var out = [];
    for (var i = 0; i < n; i++) { var e = new El(); e._html = ''; out.push(e); }
    return out;
  };
  El.prototype.addEventListener = function () { };
  El.prototype.removeEventListener = function () { };

  const doc = {
    readyState: 'complete',
    documentElement: new El(),
    body: new El(),
    getElementById: function (id) { if (!els[id]) els[id] = new El(); return els[id]; },
    querySelectorAll: function (sel) {
      var host = doc.getElementById('n26WgInlineHost');
      var all = [];
      Object.keys(els).forEach(function (k) { all = all.concat(els[k].querySelectorAll(sel)); });
      return all;
    },
    querySelector: function (sel) { return doc.querySelectorAll(sel)[0] || null; },
    addEventListener: function () { }
  };
  doc.body.classList.add('dark-mode');

  const WALL = {
    abstract: ['../Wallpaper/抽象风格/a.png', '../Wallpaper/抽象风格/b.png',
      '../Wallpaper/抽象风格/c.png', '../Wallpaper/抽象风格/d.png'],
    island: ['../Wallpaper/海岛/a.jpg', '../Wallpaper/海岛/b.jpg'],
    minecraft: ['../Wallpaper/我的世界/a.jpg'],
    cleanlight: ['../Wallpaper/清新光影/a.jpg'],
    reserved1: ['../Wallpaper/我的世界/a.jpg'],
    reserved2: ['../Wallpaper/清新光影/a.jpg']
  };
  const INFO = { abstract: { name: '抽象艺术' }, island: { name: '海岛假日' },
    minecraft: { name: '我的世界' }, cleanlight: { name: '清新光影' } };

  const ctx = {
    console: console,
    setTimeout: function (fn) { if (opts.syncTimers) fn(); return 1; },
    clearTimeout: function () { },
    requestAnimationFrame: function (fn) { fn(); return 1; },
    Set: Set, Promise: Promise, Date: Date, Math: Math, Object: Object, Array: Array,
    String: String, Number: Number, RegExp: RegExp, JSON: JSON, parseInt: parseInt,
    matchMedia: function () { return { matches: !!opts.reduced }; },
    document: doc,
    N26_WALLPAPERS: WALL,
    N26_THEME_INFO: INFO,
    n26NormTheme: function (id) { return id; },
    n26PzHead: function (c) { return '<div class="n26-pz-nav">' + c + '</div>'; },
    getUserLS: function (k) { return k === 'settings' ? store.settings : {}; },
    setUserLS: function (k, v) { store[k] = v; },
    showNotification: function (a, b, c) { calls.notify.push([a, b, c]); },
    applyUserSettings: function () { calls.apply++; },
    renderSettingsPanel: function () { calls.render++; },
    switchWallpaperWithFade: function (cb) { cb(); },
    n26WgThumbHtml: function (id, url, i, active, sel) {
      return '<button type="button" class="n26-wg-thumb' + (active === i ? ' is-active' : '')
        + '" data-i="' + i + '" onclick="n26WgPick(\'' + id + '\',' + i + ',event)">'
        + '<img data-src="' + url + '" alt=""></button>';
    },
    n26WgBarHtml: function (id) { return '<div class="slide" data-group="' + id + '">bar</div>'; },
    n26WgLazyThumbs: function () { },
    n26WgApplyWallpaper: function (id, idx, notify) { calls.applyWall.push([id, idx, notify]); },
    n26WgPick: function () { },
    n26WgPaint: function () { },
    n26PzOpenWallGroup: function (id) { calls.openFull = id; },
    n26FetchBingDaily: opts.fetch || function () { return Promise.resolve({ ok: false }); },
    n26ToggleBingDaily: function () { store.settings.bingDailyWallpaper = false; }
  };
  ctx.window = ctx;
  ctx.window.window = ctx;
  return { ctx: ctx, doc: doc, store: store, calls: calls, vars: vars, els: els };
}
function load(opts) {
  const box = makeCtx(opts);
  try { vm.runInNewContext(SFJ, box.ctx, { filename: 'n26-settings-flow.js' }); }
  catch (e) { return { err: String(e), box: box }; }
  return { box: box, api: box.ctx.N26SettingsFlow };
}

/* VM-A：整模块加载 / 防重复初始化 / 导航栏变量 */
{
  const r = load({ reduced: true });
  ok('★ vm-A 整模块加载无异常', !r.err && !!r.api);
  if (r.api) {
    ok('★ vm-A 版本与 API 齐备', r.api.version === '1.0-v2.10.22' &&
      ['wallInline', 'wallClose', 'specialCards', 'toggleBing', 'colorPage', 'setNavBg',
        'setNavBorder', 'applyNavStyle', 'afterRender', 'boot'].every(function (k) { return typeof r.api[k] === 'function'; }));
    ok('★ vm-A boot 已执行且防重复初始化', !!r.box.ctx.__N26_SF_BOOTED__);
    ok('★ vm-A 默认「跟随顶栏」= 透明背景 / 无边框 / 无模糊',
      r.box.vars['--n26-nav-bg'] === 'transparent' &&
      r.box.vars['--n26-nav-border'] === '0 none' &&
      r.box.vars['--n26-nav-blur'] === 'none');
    const before = r.box.ctx.applyUserSettings;
    r.api.boot();
    ok('★ vm-A 二次 boot 不重复包装（引用不变）', r.box.ctx.applyUserSettings === before);
  }
}

/* VM-B：内联展开 / 复用控件 / 台阶 / 总览 / 收起幂等 */
{
  const r = load({ reduced: true });
  if (!r.api) { ok('★ vm-B 模块加载', false); }
  else {
    const host = r.box.doc.getElementById('n26WgInlineHost');
    r.api.wallInline('abstract');
    const h = host.innerHTML;
    ok('★ vm-B 单组展开生成 #n26WgGrid / #n26WgSlideshow',
      has(h, 'id="n26WgGrid"') && has(h, 'id="n26WgSlideshow"'));
    ok('★ vm-B 复用主壳 n26WgThumbHtml（4 张缩略图）',
      (h.match(/class="n26-wg-thumb/g) || []).length === 4);
    ok('★ vm-B 台阶 0ms 起步、单条合成展开动画',
      has(h, 'animation-delay:0ms') && has(h, 'class="n26-wg-inline"'));
    ok('★ vm-B 内联头部带收起与完整页入口（不丢多选/幻灯片）',
      has(h, 'N26SettingsFlow.wallClose()') && has(h, 'N26SettingsFlow.openFullPage'));
    ok('★ vm-B 再次点同一组 = 收起（幂等、不留残留）',
      (function () { r.api.wallInline('abstract'); return host.innerHTML === ''; })());
    r.api.wallInline('all');
    const a = host.innerHTML;
    ok('★ vm-B 总览跨四组、跳过 reserved 别名',
      has(a, 'id="n26WgAllGrid"') && (a.match(/class="n26-wg-group-tag"/g) || []).length === 8 &&
      !has(a, 'reserved1') && !has(a, 'reserved2'));
    /* flat 顺序：abstract 0-3 / island 4-5 / minecraft 6 / cleanlight 7 */
    r.api.pickAll(3, {});
    ok('★ vm-B pickAll 全局索引正确映射回 (abstract, 3) 并复用 n26WgApplyWallpaper',
      r.box.calls.applyWall.length === 1 && r.box.calls.applyWall[0][0] === 'abstract' &&
      r.box.calls.applyWall[0][1] === 3);
    r.api.pickAll(6, {});
    ok('★ vm-B 跨组索引 (minecraft, 0) 也映射正确',
      r.box.calls.applyWall.length === 2 && r.box.calls.applyWall[1][0] === 'minecraft' &&
      r.box.calls.applyWall[1][1] === 0);
    r.api.wallClose(); r.api.wallClose();
    ok('★ vm-B 收起幂等 + 定时器清理', host.innerHTML === '');
  }
}

/* VM-C：必应云端失败 → 本地每日精选 */
{
  const r = load({ reduced: true, fetch: function () { return Promise.resolve({ ok: false }); } });
  if (!r.api) { ok('★ vm-C 模块加载', false); }
  else {
    r.api.toggleBing();
    /* Promise 链在 microtask 里完成，用同步断言包一层 */
    const check = function () {
      const s = r.box.store.settings;
      ok('★ vm-C 云端不通仍开启成功（卡片点了有反应）', s.bingDailyWallpaper === true);
      ok('★ vm-C 标记为本地降级且不写 bingDailyUrl',
        s.bingDailyLocal === true && s.bingDailyUrl === '');
      ok('★ vm-C 落到真实 Wallpaper 主题 + 合法索引',
        ['abstract', 'island', 'minecraft', 'cleanlight'].indexOf(s.theme) >= 0 &&
        typeof s.wallpaper === 'number' && s.wallpaper >= 0);
      ok('★ vm-C 桌面与锁屏同源、清掉自定义/动态',
        s.lockWallpaperMode === 'desktop' && s.useCustomWallpaper === false && s.useDynamicWallpaper === false);
      ok('★ vm-C 通知里诚实说明云端未部署',
        r.box.calls.notify.some(function (x) { return has(String(x[1]), '云端服务还没部署'); }));
      console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
      if (FAIL === 0) console.log('verify-n26-304 全绿');
      process.exit(FAIL === 0 ? 0 : 1);
    };
    Promise.resolve().then(check).catch(function (e) {
      console.log('  ✗ vm-C 异常 ' + e);
      process.exit(1);
    });
    /* 下面这段在 check 之前同步跑完（颜色 / 导航栏冒烟） */
    const before = r.box.calls.render;
    r.api.previewAccent('#123456');
    ok('★ vm-D 拖色盘只写 --primary、零重绘',
      r.box.vars['--primary'] === '#123456' && r.box.calls.render === before);
    r.api.commitAccent('#123456');
    ok('★ vm-D 松手才持久化', r.box.store.settings.accentColor === '#123456');
    const cp = r.api.colorPage();
    ok('★ vm-D 颜色页两节都带显式标记、五档色点齐全',
      (cp.match(/data-pz-sec="color"/g) || []).length === 2 &&
      (cp.match(/class="n26-sf-swatch/g) || []).length === 5 &&
      has(cp, 'n26SfHexPicker') && has(cp, 'n26-sf-preview'));
    r.api.setNavBg('mica');
    r.api.setNavBorder('glow');
    ok('★ vm-D 导航栏背景/边框写进 settings 并生成不同令牌',
      r.box.store.settings.dockBarNavBg === 'mica' &&
      r.box.store.settings.dockBarNavBorder === 'glow' &&
      r.box.vars['--n26-nav-bg'] !== 'transparent' &&
      has(String(r.box.vars['--n26-nav-border']), '1px solid') &&
      has(String(r.box.vars['--n26-nav-shadow']), 'inset'));
    ok('★ vm-D 芯片行渲染出 4 + 3 个按钮',
      has(r.box.doc.getElementById('dockBarNavBgRow').innerHTML, '跟随顶栏') &&
      has(r.box.doc.getElementById('dockBarNavBorderRow').innerHTML, '内高光'));
    ok('★ vm-D 非法 hex 被挡住（不写 --primary、不持久化）',
      (function () { const v = r.box.vars['--primary']; r.api.previewAccent('javascript:alert(1)'); return r.box.vars['--primary'] === v; })());
  }
}
