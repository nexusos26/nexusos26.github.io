/* ============================================================================
   verify-n26-311 · v2.10.36 效果零删减 + 桌面对照包
   ★ v2.10.36 需求反转：用户明确要求「减少不相干的抗御代码 / 系统 UI 完全不变 /
     官网 https 静态托管优先、不要 BAT」。原守门锁的是已被证伪的交互期 GPU 保护，
     现改为锁死「防御层确已移除 + 效果一条不减」。纯 Node 静态断言 + vm，
     不开任何自动化浏览器。
   ============================================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function has(s, k) { return s.indexOf(k) >= 0; }
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
let PASS = 0, FAIL = 0;
function ok(n, c) { if (c) PASS++; else { FAIL++; console.log('  x ' + n); } }
const HTML = read('Nexus OS 26.html');
const PERF = noComments(read('ui/n26-perf.css'));
const DIAG = read('ui/n26-diag.js');
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
const V = (VER.match(/^v2\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
const STYLES = (HTML.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
const CHANGELOG_AT = STYLES.indexOf('class="changelog"');
const CSS = noComments(CHANGELOG_AT > 100000 ? STYLES.slice(0, CHANGELOG_AT) : STYLES);
const NO_GUARD_SCRIPT = !/<script[^>]+n26-gpu-guard\.js/.test(HTML);
const GUARD_GONE = !fs.existsSync(path.join(ROOT, 'ui/n26-gpu-guard.js'));
const NO_BAT = fs.readdirSync(ROOT).filter(function (f) { return /\.bat$/i.test(f); }).length === 0;
console.log('=== verify-n26-311 · v2.10.36 效果零删减 + 桌面对照包 ===');
const GOC = noComments(read('ui/n26-glass-optics.css'));
const DESKTOP_PKG = 'D:/20533/Desktop/Nexus OS 26 - GitHub v2.10.15/Nexus OS 26.html';
const OLDER = path.join(ROOT, '..', '_github-Nexus-OS-26', '_desktop-removed-v2.9.57', 'Nexus OS 26.html');
ok('★ 版本合法且 >= v2.10.34（弹性）', V.length === 2 && (V[0] > 10 || (V[0] === 10 && V[1] >= 34)));
ok('★ perf.css 里通配降级 / 任何 gpu-safe 规则彻底为 0',
  !/n26-gpu-safe/.test(PERF) && !/body\.n26-gpu-safe\s*\*/.test(PERF));
ok('★ 主壳模糊层声明仍完整', (HTML.match(/backdrop-filter\s*:/g) || []).length >= 200);
ok('★ switchSettingsTab 里已无 panel.offsetHeight 强制同步布局', (function () {
  const at = HTML.indexOf('function switchSettingsTab(id)');
  const body = HTML.slice(at, at + 1800);
  return at > 0 && !/panel\.offsetHeight/.test(body) &&
    has(body, "panel.classList.remove('animating')") && has(body, "panel.classList.add('animating')");
})());
ok('★ 只删设置链路那一次读布局，不误伤其它业务的几何读取',
  has(HTML, 'var w = panel.offsetWidth, h = panel.offsetHeight;'));
ok('★ 静止效果：overlay 噪点 / 护眼 multiply / orb screen 全在',
  /body\.n26-on::after\s*\{[^}]*mix-blend-mode:\s*overlay/.test(HTML) &&
  /#n26WarmTint\s*\{[^}]*mix-blend-mode:\s*multiply/.test(HTML) &&
  /\.n26-orb[\s\S]{0,400}?mix-blend-mode:\s*screen/.test(HTML));
ok('★ 未回到「永久删效果」老路', !/body\.n26-on::after\s*\{\s*content:\s*none/.test(HTML));
ok('★ v2.10.33 成果不回退：光学层零 screen、亮光与彩虹全在',
  !/mix-blend-mode\s*:\s*screen/i.test(GOC) &&
  has(GOC, '#n26GoLight.is-active { visibility: visible; }') &&
  has(GOC, 'linear-gradient(135deg') && has(GOC, 'rgba(255, 255, 255, .78)'));
ok('★ 戳 gg3 / go6 三条注入路径同步',
  has(HTML, 'n26-perf.css?v=gg3') && has(HTML, 'ui/n26-glass-optics.css?v=go6') &&
  has(read('apps/_app.js'), "'../ui/n26-glass-optics.css?v=go6'") &&
  has(read('apps/_theme-adapter.js'), "'../ui/n26-glass-optics.css?v=go6'"));
ok('★ file:// 一等支持未误伤 / 三协议视觉一致',
  (HTML.match(/location\.protocol\s*===\s*['"]file:/g) || []).length === 1 &&
  !/location\.protocol/.test(GOC) && has(HTML, 'file://') && !has(HTML, 'file:///'));
ok('★ 桌面只留 GitHub v2.10.15（用户纠正后的定案）',
  fs.existsSync(DESKTOP_PKG) && has(fs.readFileSync(DESKTOP_PKG, 'utf8'), "NEXUS_OS_VERSION = 'v2.10.15'"));
ok('★ 更旧的 v2.9.57 已移出桌面、进 D 盘对照目录（未删除）',
  fs.existsSync(OLDER) && has(fs.readFileSync(OLDER, 'utf8'), "NEXUS_OS_VERSION = 'v2.9.57'"));
ok('★ 两个对照包都不含新版光学层 / guard（保持纯对照）',
  !has(fs.readFileSync(DESKTOP_PKG, 'utf8'), 'n26-glass-optics.css?v=') &&
  !has(fs.readFileSync(OLDER, 'utf8'), 'n26-gpu-guard.js'));
ok('★ 全面禁紫', !/purple|#8b5cf6|#a855f7/i.test(PERF + GOC));
ok('★ perf.css 花括号配平 + 光学 JS 语法', (function () {
  try { new vm.Script(read('ui/n26-glass-optics.js'));
    return (PERF.match(/\{/g)||[]).length === (PERF.match(/\}/g)||[]).length; }
  catch (e) { return false; }
})());
ok('★ 无临时下载脚本残留', !fs.existsSync(path.join(ROOT, '_dl_old.js')))
console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-311 全绿');
process.exit(FAIL === 0 ? 0 : 1);
