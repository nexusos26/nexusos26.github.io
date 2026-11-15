/* ============================================================================
   verify-n26-308 · v2.10.36 抗御代码清理（效果全保留）
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
console.log('=== verify-n26-308 · v2.10.36 抗御代码清理（效果全保留） ===');
const WSC = noComments(read('ui/n26-widget-style.css'));
ok('★ 版本合法且 >= v2.10.30（弹性）', V.length === 2 && (V[0] > 10 || (V[0] === 10 && V[1] >= 30)));
ok('★ changelog 首条 / 标题自证', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER && has(HTML, '<title>Nexus OS 26 · ' + VER + '</title>');
})());
ok('★ 内联 CSS 提取有效', /body\.n26-on::after\s*\{/.test(CSS) && /#n26WarmTint\s*\{/.test(CSS));
ok('★ 全局噪点 overlay 完整（fixed / inset:0 / feTurbulence）',
  /body\.n26-on::after\s*\{[^}]*content:\s*''[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*mix-blend-mode:\s*overlay[^}]*feTurbulence/.test(CSS));
ok('★ 护眼暖色 multiply 完整', /#n26WarmTint\s*\{[^}]*mix-blend-mode:\s*multiply/.test(CSS));
ok('★ 无任何「永久删效果」常驻规则回归',
  !/body\.n26-on::after\s*\{\s*content:\s*none/.test(CSS) && !/13\. v2\.10\.29 P0/.test(PERF));
ok('★ N26GpuGuard 整层已删：文件不存在 / 主壳无脚本引用 / 切页无 arm()', (function () {
  const at = HTML.indexOf('function switchSettingsTab(id)');
  const body = HTML.slice(at, at + 1800);
  return GUARD_GONE && NO_GUARD_SCRIPT && at > 0 && !/N26GpuGuard/.test(noComments(body));
})());
ok('★ perf.css 交互期降级规则整段移除（gpu-safe 为 0，效果反而更完整）',
  !/n26-gpu-safe/.test(PERF) && !/body\.n26-gpu-safe\s*\*/.test(PERF) &&
  (PERF.match(/\{/g) || []).length === (PERF.match(/\}/g) || []).length);
ok('★ 主壳模糊层声明仍完整（没有靠删模糊修 bug）', (HTML.match(/backdrop-filter\s*:/g) || []).length >= 200);
ok('★ diag 六函数包装链已删（不包装任何业务函数）',
  !/__n26DiagWrapped|forEach\(wrap\)|function wrap\(/.test(DIAG) &&
  /PerformanceObserver/.test(DIAG) && /longtask/.test(DIAG));
ok('★ diag 卡死现场黑匣子就位（>=200ms 才落盘 / last() 可取回）',
  has(DIAG, 'blackboxSave') && has(DIAG, 'last: blackboxLast') &&
  has(DIAG, "'n26:diag:blackbox'") && /e\.duration >= 200[\s\S]{0,300}?blackboxSave\(row\)/.test(DIAG));
ok('★ 仓库内无任何 .bat / 本地启动脚本（官网 https 静态托管优先）', NO_BAT);
ok('★ 戳 gg3 / ws6 / dg8 到位且无 dg3 残留',
  has(HTML, 'n26-perf.css?v=gg3') && has(HTML, 'n26-widget-style.css?v=ws6') &&
  has(HTML, 'n26-diag.js?v=dg8') && !has(HTML, 'n26-diag.js?v=dg3'));
ok('★ 时钟浅色冷白 + 墨字、深色才黑卡',
  /background-color: rgba\(250, 251, 254, \.98\) !important/.test(WSC) && /--w-text: #101923/.test(WSC));
ok('★ 全面禁紫', !/purple|rebeccapurple|violet|#8b5cf6|#a855f7|#7c3aed/i.test(PERF + WSC + DIAG));
ok('★ CSS 花括号配平 + diag 语法', (function () {
  try { new vm.Script(DIAG); return (PERF.match(/\{/g)||[]).length === (PERF.match(/\}/g)||[]).length; }
  catch (e) { return false; }
})());
ok('★ switchSettingsTab 仍在（未误伤设置链路）', has(HTML, 'function switchSettingsTab(id)'));
console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-308 全绿');
process.exit(FAIL === 0 ? 0 : 1);
