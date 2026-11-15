/* ============================================================================
   verify-n26-309 · v2.10.36 官网 https 优先 + 三协议等价
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
console.log('=== verify-n26-309 · v2.10.36 官网 https 优先 + 三协议等价 ===');
const DEPLOY = read('../部署与跨机器运行说明.md');
ok('★ 版本合法且 >= v2.10.31（弹性）', V.length === 2 && (V[0] > 10 || (V[0] === 10 && V[1] >= 31)));
ok('★ changelog 明确记录 file:// / blob: Worker 被禁 / 主线程 CPU',
  has(HTML, 'blob: Worker 被禁') && has(HTML, 'file://'));
ok('★ 协议分支只判 file: 一次，http/https 走完整路径',
  (HTML.match(/location\.protocol === 'file:'/g) || []).length === 1 &&
  !/location\.protocol === 'https\?'/.test(HTML) &&
  has(HTML, "window.location.protocol + '//' + window.location.host"));
ok('★ 环境自检不对 file:// 弹负面提示', has(HTML, '不弹任何提示'));
ok('★ 静止效果：overlay 噪点 / 护眼 multiply 全在',
  /body\.n26-on::after\s*\{[^}]*mix-blend-mode:\s*overlay/.test(CSS) &&
  /#n26WarmTint\s*\{[^}]*mix-blend-mode:\s*multiply/.test(CSS));
ok('★ 视觉规则零协议差异', !/protocol[^{]*\{[^}]*backdrop-filter/.test(CSS));
ok('★ 官网静态托管说明仍在（Vercel / Netlify / Cloudflare Pages / GitHub Pages）',
  has(DEPLOY, 'Vercel / Netlify / Cloudflare Pages / GitHub Pages'));
ok('★ 官网入口完整：全相对路径 / 无 file:/// 硬编码 / 无 CSP meta 硬拦',
  !/(?:src|href)="\/[A-Za-z]/.test(HTML) && !has(HTML, 'file:///') &&
  !/http-equiv="Content-Security-Policy"/i.test(HTML));
ok('★ 主壳 changelog 明确「官网 https / Cloudflare Pages 为主体验入口」',
  has(HTML, 'Cloudflare Pages') && has(HTML, '主体验入口'));
ok('★ 仓库内无 .bat（用户定案：CF 静态站点不需要 Windows 批处理）', NO_BAT);
ok('★ N26GpuGuard 整层已删（不再有交互期 body 类 / 帧率熔断 / iframe 同步）',
  GUARD_GONE && NO_GUARD_SCRIPT && !/n26-gpu-safe/.test(PERF));
ok('★ diag 取证边界：LoAF/longtask + noFx + 黑匣子 + 心跳，仍零包装零布局读',
  /po\.observe\(\{ entryTypes: \['long-animation-frame'\] \}\)/.test(DIAG) &&
  /po\.observe\(\{ entryTypes: \['longtask'\] \}\)/.test(DIAG) &&
  has(DIAG, 'noFx') && has(DIAG, 'blackboxSave') &&
  has(DIAG, 'setInterval(heartbeat, 1000)') &&
  (DIAG.match(/setInterval\(/g) || []).length === 1 &&
  !/__n26DiagWrapped|forEach\(wrap\)/.test(DIAG) &&
  !/getBoundingClientRect|offsetWidth|offsetHeight|getComputedStyle/.test(DIAG));
ok('★ diag 语法通过 vm.Script', (function () { try { new vm.Script(DIAG); return true; } catch (e) { return false; } })());
ok('★ diag 戳 dg8 已 bump 且无旧值残留',
  has(HTML, 'n26-diag.js?v=dg8') && !has(HTML, 'n26-diag.js?v=dg3'));
ok('★ 全面禁紫', !/purple|rebeccapurple|violet|#8b5cf6|#a855f7|#7c3aed/i.test(DIAG));
ok('★ 临时探针文件无残留', !fs.existsSync(path.join(ROOT, '_dbg309.js')))
console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-309 全绿');
process.exit(FAIL === 0 ? 0 : 1);
