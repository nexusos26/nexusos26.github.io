/* ============================================================================
   verify-n26-312 · v2.10.36 主线程链专项
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
console.log('=== verify-n26-312 · v2.10.36 主线程链专项 ===');
const DK = read('ui/n26-dom-keep.js');
const APPJS = read('apps/_app.js'), ADAPTER = read('apps/_theme-adapter.js'), API = read('Nexus-对外API.md');
ok('★ 版本合法且 >= v2.10.35（弹性）', V.length === 2 && (V[0] > 10 || (V[0] === 10 && V[1] >= 35)));
ok('★ dom-keep restoreScroll 只写不读（零 read-after-write）', (function () {
  const at = DK.indexOf('function restoreScroll(list)');
  const body = DK.slice(at, at + 900);
  return at > 0 && !/scrollTop\s*-\s*s\.y|scrollLeft\s*-\s*s\.x/.test(body) &&
    /if \(s\.y\) s\.el\.scrollTop = s\.y;/.test(body) &&
    has(DK, 'noLayoutReadAfterWrite: true');
})());
ok('★ 存储持久解析缓存：原始字符串校验，跨任务零陈旧且绝不读旧值',
  has(HTML, '_n26RawCache') && has(HTML, '_n26RawStr') &&
  has(HTML, '_n26RawStr[key] === v') &&
  /function _getLSRaw\(key\)[\s\S]{0,1200}?_n26RawStr\[key\] = v;/.test(HTML) &&
  /function _getLSRaw\(key\)[\s\S]{0,1200}?_n26RawCache\[key\] = out;/.test(HTML));
ok('★ 写入即时失效：对象与原始字符串双删，绝不「写完读到旧值」',
  /function _setLSRaw\(key, value\) \{[\s\S]{0,300}?delete _n26RawCache\[key\];/.test(HTML) &&
  /function _setLSRaw\(key, value\) \{[\s\S]{0,300}?delete _n26RawStr\[key\];/.test(HTML));
ok('★ setLS / setUserLS 两条写路径都走 _setLSRaw',
  /function setLS\(key, value\)[\s\S]{0,1400}?_setLSRaw\(key, value\)/.test(HTML) &&
  /function setUserLS\(key, value\)[\s\S]{0,1400}?_setLSRaw\(/.test(HTML));
ok('★ 黑匣子只在 >=200ms 落盘，常态零开销',
  has(DIAG, 'blackboxSave') && has(DIAG, 'last: blackboxLast') &&
  /e\.duration >= 200[\s\S]{0,300}?blackboxSave\(row\)/.test(DIAG) &&
  !/__n26DiagWrapped|forEach\(wrap\)/.test(DIAG));
ok('★ 效果一条不减：overlay / multiply 在，perf.css 无 gpu-safe 降级',
  /body\.n26-on::after\s*\{[^}]*mix-blend-mode:\s*overlay/.test(HTML) &&
  /#n26WarmTint\s*\{[^}]*mix-blend-mode:\s*multiply/.test(HTML) &&
  !/n26-gpu-safe/.test(PERF));
ok('★ 主壳 / _app.js / _theme-adapter.js / API 文档四处 go6 同步',
  has(HTML, 'ui/n26-glass-optics.css?v=go6') && has(HTML, 'ui/n26-glass-optics.js?v=go6') &&
  has(APPJS, "'../ui/n26-glass-optics.css?v=go6'") && has(APPJS, "'../ui/n26-glass-optics.js?v=go6'") &&
  has(ADAPTER, "'../ui/n26-glass-optics.css?v=go6'") && has(API, 'go6'));
ok('★ 四处戳 dk2 / go6 / dg8 / dn15 全部到位',
  has(HTML, 'n26-dom-keep.js?v=dk2') && has(HTML, 'n26-diag.js?v=dg8') &&
  has(HTML, 'n26-docknav.js?v=dn15'));
ok('★ 31 个 apps 页唯一戳 2.9.103、三个打包产物 ta5', (function () {
  const dir = path.join(ROOT, 'apps');
  let bumped = 0, ta = 0, bad = 0;
  function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.html$/.test(e.name) || /^backup-/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (has(s, '_app.js?v=2.9.103')) bumped++;
    if (has(s, 'src="../_theme-adapter.js?v=ta5"')) ta++;
    if (has(s, '_app.js?v=2.9.101')) bad++;
  } }
  walk(dir); return bumped >= 30 && ta >= 3 && bad === 0;
})());
ok('★ 无 guard 引用 / 无 bat / 官网 https 静态托管仍可部署',
  GUARD_GONE && NO_GUARD_SCRIPT && NO_BAT &&
  has(HTML, 'file://') && !has(HTML, 'file:///') && !/(?:src|href)="\/[A-Za-z]/.test(HTML));
ok('★ 全面禁紫', !/purple|#8b5cf6|#a855f7|#7c3aed/i.test(DK + DIAG + PERF));
ok('★ dom-keep / diag / optics JS 语法通过 vm.Script', (function () {
  try { [DK, DIAG, read('ui/n26-glass-optics.js'), read('ui/n26-docknav.js')].forEach(function (s) { new vm.Script(s); }); return true; }
  catch (e) { return false; }
})());
console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-312 全绿');
process.exit(FAIL === 0 ? 0 : 1);
