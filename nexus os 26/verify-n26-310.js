/* ============================================================================
   verify-n26-310.js · v2.10.33 侧栏 P0 根治专项守门（第二十三套）
   --------------------------------------------------------------------------
   背景：v2.10.27 ~ v2.10.32 六轮误判后，用 GitHub v2.10.15 / v2.9.57
   做分界线对照，定案真凶是 ui/n26-glass-optics.* 里两处
   mix-blend-mode:screen 的整屏 backdrop 读回；修法是数学等价的 alpha
   加色，效果一条不减。本守门锁死「screen 已消除 + 效果全保留 +
   三条注入路径戳同步 + 三协议一致 + 旧版只作对照不被改」。

   纯 Node 静态断言，不开任何自动化浏览器。
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function has(s, k) { return s.indexOf(k) >= 0; }
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
let PASS = 0, FAIL = 0;
function ok(name, cond) { if (cond) PASS++; else { FAIL++; console.log('  ✗ ' + name); } }

const HTML = read('Nexus OS 26.html');
const GOC = noComments(read('ui/n26-glass-optics.css'));
const GOC_RAW = read('ui/n26-glass-optics.css');
const GOJ = read('ui/n26-glass-optics.js');
const APPJS = read('apps/_app.js');
const ADAPTER = read('apps/_theme-adapter.js');
const API = read('Nexus-对外API.md');
const PERF = noComments(read('ui/n26-perf.css'));   /* ★ 剥注释后再扫，别把说明文字当代码 */

console.log('=== verify-n26-310 · v2.10.33 侧栏 P0 根治专项 ===');

/* ---------- 1. 版本与 changelog ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
const VN = (VER.match(/^v2\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
ok('★ 版本号格式合法且不低于 v2.10.33（弹性）',
  VN.length === 2 && (VN[0] > 10 || (VN[0] === 10 && VN[1] >= 33)));
ok('★ 标签页标题带当前版本号（强刷可自证）', has(HTML, '<title>Nexus OS 26 · ' + VER + '</title>'));
/* ★ v2.10.35：方向从「找某一层 GPU 杀手」重定为「重写层累积的主线程同步布局」，
   changelog 首条必须诚实写出三版本差分、真因链路与四处根治。 */
ok('★ changelog 首条 = 当前版本（v2.10.36 主线程方向）', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('★ changelog 明确「只修本地最新版 / 旧版只作对照」',
  has(HTML, '本次只修本地最新版') && has(HTML, '一个字没动'));

/* ---------- 2. 真凶已消除：光学层零 screen 声明 ---------- */
ok('★ 光学层 CSS 去注释后 mix-blend-mode:screen 声明为 0',
  !/mix-blend-mode\s*:\s*screen/i.test(GOC));
ok('★ #n26GoLight 规则里不再有 screen',
  (function () { const b = GOC.match(/#n26GoLight\s*\{[^}]*\}/); return !!b && !/mix-blend-mode\s*:\s*screen/i.test(b[0]); })());
ok('★ .n26-go-iris 规则里不再有 screen',
  (function () { const b = GOC.match(/\.n26-go-iris\s*\{[^}]*\}/); return !!b && !/mix-blend-mode\s*:\s*screen/i.test(b[0]); })());
ok('★ 光学层里也没有任何其它混合模式（只剩普通 alpha 合成）',
  !/mix-blend-mode\s*:/i.test(GOC));
ok('★ 等价性有据可查：文件头写明 screen / normal 数学等价',
  has(GOC_RAW, 'screen(a, α) = a + α(1-a)') && has(GOC_RAW, 'a(1-α) + α·1'));
ok('★ 根因说明写明「缩小 560px 不等于缩小 backdrop」',
  has(GOC_RAW, 'backdrop 仍是整屏') || has(GOC_RAW, 'backdrop 始终是整屏'));

/* ---------- 3. 效果一条不减 ---------- */
ok('★ 按下亮光整层保留：fixed / 560px / 指针中心外边距 / 最高层级 / 静息隐藏',
  (function () {
    const b = GOC.match(/#n26GoLight\s*\{[^}]*\}/);
    return !!b && /position:\s*fixed/.test(b[0]) && /width:\s*560px/.test(b[0]) &&
      /height:\s*560px/.test(b[0]) && /margin:\s*-280px 0 0 -280px/.test(b[0]) &&
      /z-index:\s*2147483001/.test(b[0]) && /visibility:\s*hidden/.test(b[0]);
  })());
ok('★ 亮光状态机与淡出动画全在 is-active / is-on / is-strong / 260ms',
  has(GOC, '#n26GoLight.is-active { visibility: visible; }') &&
  has(GOC, '.n26-go-bulb.is-on') && has(GOC, '#n26GoLight.is-strong .n26-go-bulb.is-on') &&
  /transition:\s*opacity 260ms/.test(GOC) && has(GOJ, "classList.add('is-active')"));
ok('★ 灯泡径向渐变五档 alpha 一个没动（等价加色的输入）',
  ['rgba(255, 255, 255, .78)', 'rgba(206, 236, 255, .48)', 'rgba(120, 190, 255, .24)',
   'rgba(56, 189, 248, .12)', 'rgba(56, 189, 248, 0)'].every(function (c) { return has(GOC, c); }));
ok('★ 对角彩虹仍在：135deg / 45deg 掩膜 + --n26-disp 消费 + 强度变量',
  has(GOC, 'linear-gradient(135deg') && has(GOC, 'linear-gradient(45deg') &&
  /opacity: calc\(var\(--n26-disp/.test(GOC) && has(GOC, '--n26-go-iris-k: 1;'));
ok('★ 彩虹渐变五档配色保留（全面禁紫，青/绿/琥珀/洋红）',
  ['rgba(56, 189, 248, .78)', 'rgba(52, 211, 153, .62)', 'rgba(251, 146, 60, .56)',
   'rgba(244, 114, 182, .48)'].every(function (c) { return has(GOC, c); }));
ok('★ 静止灰底时彩虹退场规则仍在',
  has(GOC, '.n26-go-host.n26-dng:not(.n26-dng-on):not(.n26-go-live) > .n26-go-iris'));
ok('★ 没有用「删效果」的老办法：主壳三处常驻全屏混合层都还在',
  /body\.n26-on::after\s*\{[^}]*mix-blend-mode:\s*overlay/.test(HTML) &&
  /#n26WarmTint\s*\{[^}]*mix-blend-mode:\s*multiply/.test(HTML) &&
  /\.n26-orb[\s\S]{0,400}?mix-blend-mode:\s*screen/.test(HTML));
ok('★ v2.10.34 起 perf.css 已无全文档通配降级，且 GoLight 仍不进降级名单',
  !/body\.n26-gpu-safe\s*\*/.test(PERF) && !/body\.n26-gpu-safe #n26GoLight/.test(PERF));

/* ---------- 4. 三条注入路径与戳同步 ---------- */
ok('★ 主壳 / _app.js / _theme-adapter.js 三处 CSS 引用全部 go6',
  has(HTML, 'href="ui/n26-glass-optics.css?v=go6"') &&
  has(APPJS, "'../ui/n26-glass-optics.css?v=go6'") &&
  has(ADAPTER, "'../ui/n26-glass-optics.css?v=go6'"));
ok('★ 三处 JS 引用全部 go6',
  has(HTML, 'src="ui/n26-glass-optics.js?v=go6"') &&
  has(APPJS, "'../ui/n26-glass-optics.js?v=go6'") &&
  has(ADAPTER, "'../ui/n26-glass-optics.js?v=go6'"));
ok('★ 全项目资源引用里零 go2 残留（历史 changelog 文字不算）',
  !/(?:href|src)="[^"]*n26-glass-optics[^"]*go2|new URL\('[^']*n26-glass-optics[^']*go2/.test(
    HTML + APPJS + ADAPTER));
ok('★ 对外 API 文档同步为 go6', has(API, '同为戳 `go6`'));
ok('★ 31 个 apps 页（含子目录）引用戳已 bump 到 2.9.103，无 2.9.99 残留', (function () {
  let bumped = 0, stale = 0;
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f), st = fs.statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!f.endsWith('.html') || f.indexOf('backup-') === 0) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (has(s, '_app.js?v=2.9.103')) bumped++;
      if (has(s, '_app.js?v=2.9.99')) stale++;
    }
  })(path.join(ROOT, 'apps'));
  return bumped >= 30 && stale === 0;
})());
ok('★ 三个打包产物补上 _theme-adapter.js?v=ta5',
  ['apps/float/index.html', 'apps/reelix/index.html', 'apps/strata/index.html']
    .every(function (f) { return has(read(f), 'src="../_theme-adapter.js?v=ta5"'); }));
ok('★ _app.js 仍把光学层注入全部第一方 iframe（没被「一刀切」删掉）',
  has(APPJS, 'script[src*="n26-glass-optics.js"]') && has(APPJS, 'goS.async = false'));

/* ---------- 5. 三协议等价 / 侧栏逻辑未动 ---------- */
ok('★ 光学层内部零协议分支：file / http / https 共用同一套视觉',
  !/location\.protocol|location\.href\s*===\s*['"]file/.test(GOC_RAW + GOJ));
ok('★ 主壳协议分支仍只判 file: 一次（https 官网能力未误伤）',
  (HTML.match(/location\.protocol\s*===\s*['"]file:/g) || []).length === 1);
ok('★ 静态托管入口与相对路径仍在（https 可部署）',
  has(HTML, 'ui/n26-glass-optics.css?v=go6') &&
  !/(?:src|href)="\/(?:ui|apps)\//.test(HTML) &&
  !has(HTML, 'file:///'));
ok('★ 侧栏业务逻辑没被重写：docknav 注册表与 switchSettingsTab 仍在',
  has(read('ui/n26-docknav.js'), ".settings-sidebar[data-n26dock]") &&
  has(HTML, 'function switchSettingsTab(id)') && has(HTML, 'panel.offsetHeight;'));

/* ---------- 6. GitHub 对照物只作对照 ---------- */
const GH_MAIN = path.join(ROOT, '..', '_github-Nexus-OS-26', 'export-main', 'Nexus OS 26.html');
const GH_OLD = path.join(ROOT, '..', '_github-Nexus-OS-26', 'export-pre-rewrite', 'Nexus OS 26.html');
ok('★ GitHub 对照包仍在：main = v2.10.15 / pre-rewrite = v2.9.57',
  fs.existsSync(GH_MAIN) && fs.existsSync(GH_OLD) &&
  has(fs.readFileSync(GH_MAIN, 'utf8'), "NEXUS_OS_VERSION = 'v2.10.15'") &&
  has(fs.readFileSync(GH_OLD, 'utf8'), "NEXUS_OS_VERSION = 'v2.9.57'"));
ok('★ 对照版主壳确实不含光学层（分界线的硬证据没被污染）',
  !has(fs.readFileSync(GH_MAIN, 'utf8'), 'n26-glass-optics.css?v=') &&
  !has(fs.readFileSync(GH_OLD, 'utf8'), 'n26-glass-optics.css?v='));

/* ---------- 7. 工程卫生 ---------- */
ok('★ 全面禁紫：新增 CSS 里无 purple 色值',
  !/purple|#8b5cf6|#a855f7|rgba\(139,\s*92,\s*246/i.test(GOC_RAW));
ok('★ 光学层 CSS 花括号配平',
  (GOC.match(/\{/g) || []).length === (GOC.match(/\}/g) || []).length);
ok('★ 无临时脚本残留', !fs.existsSync(path.join(ROOT, '_n26_bump33.js')));
ok('★ 光学层 JS 语法通过 vm.Script', (function () {
  const vm = require('vm');
  try { new vm.Script(GOJ, { filename: 'n26-glass-optics.js' }); return true; }
  catch (e) { return false; }
})());

console.log('PASS ' + PASS + ' FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);
