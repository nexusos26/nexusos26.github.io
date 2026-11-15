/* ============================================================================
   verify-n26-301.js · v2.10.19 第一批守门
   七方向缩放 / 启动台模态 / 侧栏静止灰底 / Dock 居中 / 歌词伪译文
   纯 Node 静态 + vm 抠函数，不开任何自动化浏览器
   ============================================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = __dirname;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function exists(f) { return fs.existsSync(path.join(ROOT, f)); }
function has(s, k) { return s.indexOf(k) >= 0; }
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
let PASS = 0, FAIL = 0;
function ok(name, cond) { if (cond) PASS++; else { FAIL++; console.log('  ✗ ' + name); } }

const HTML = read('Nexus OS 26.html');
const RJS = read('ui/n26-resize.js');
const DNAVJ = read('ui/n26-docknav.js');
const DNAVC = read('ui/n26-docknav.css');
const START = read('ui/n26-startmenu.css');
const LPC = exists('ui/n26-launchpad-modal.css') ? read('ui/n26-launchpad-modal.css') : '';
const MUSIC = read('apps/music.html');

console.log('=== verify-n26-301 · v2.10.19 第一批 ===');

/* ---------- 1. 版本（弹性） ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
ok('★ 主壳版本号格式合法', /^v2\.\d+\.\d+$/.test(VER));
ok('★ changelog 首条与主壳版本一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('changelog 记录第一批三项', has(HTML, '七个方向') && has(HTML, '静止灰底') && has(HTML, '统一退场'));

/* ---------- 2. 七方向缩放 ---------- */
const dirsLine = (HTML.match(/var dirs = \[([^\]]+)\]/) || [])[1] || '';
const dirList = (dirsLine.match(/'[a-z]+'/g) || []).map(function (x) { return x.slice(1, -1); });
ok('★ 缩放把手恰好 7 个方向', dirList.length === 7);
ok('★ 左上角 nw 已从把手列表移除', dirList.indexOf('nw') < 0 && dirList.indexOf('ne') >= 0 &&
  dirList.indexOf('sw') >= 0 && dirList.indexOf('se') >= 0);
ok('★ 主壳 .window-rz.nw 禁用', /\.window-rz\.nw \{ display: none !important; \}/.test(HTML));
ok('★ 指针兜底 dirOf 拦截 nw', /if \(v === 'n' && h === 'w'\) return '';/.test(RJS));

/* vm 抠函数：逐点验证方向真值 */
(function () {
  const m = RJS.match(/function dirOf\(r, x, y\) \{[\s\S]*?\n    \}/);
  if (!m) { ok('★ vm 抠出 dirOf', false); return; }
  let fn;
  try { fn = vm.runInNewContext('var IN = 9, OUT = 2;\n' + m[0] + '\ndirOf;', {}); }
  catch (e) { ok('★ vm 抠出 dirOf', false); return; }
  ok('★ vm 抠出 dirOf', typeof fn === 'function');
  const R = { left: 0, top: 0, right: 400, bottom: 300 };
  const cases = [
    ['左上角', 4, 4, ''], ['上边', 200, 4, 'n'], ['下边', 200, 296, 's'],
    ['左边', 4, 150, 'w'], ['右边', 396, 150, 'e'],
    ['右上角', 396, 4, 'ne'], ['左下角', 4, 296, 'sw'], ['右下角', 396, 296, 'se'],
    ['正中', 200, 150, '']
  ];
  let good = true, seen = {};
  for (const c of cases) {
    const got = fn(R, c[1], c[2]);
    if (got !== c[3]) { good = false; console.log('    · ' + c[0] + ' 期望 ' + JSON.stringify(c[3]) + ' 实得 ' + JSON.stringify(got)); }
    if (got) seen[got] = 1;
  }
  ok('★ vm：左上角不起手，其余 7 方向逐点正确', good);
  ok('★ vm：可达方向集合恰好 7 个且不含 nw', Object.keys(seen).length === 7 && !seen.nw);
})();

/* ---------- 3. 资源戳同步（铁律） ---------- */
const STAMPS = [
  ['ui/n26-startmenu.css?v=235', 'ui/n26-startmenu.css?v=234'],
  ['ui/n26-docknav.css?v=2980', 'ui/n26-docknav.css?v=2979'],
  ['ui/n26-docknav.js?v=dn15', 'ui/n26-docknav.js?v=dn12'],
  ['ui/n26-resize.js?v=rz2', 'ui/n26-resize.js?v=rz1']
];
for (const [nw, old] of STAMPS) ok('★ 主壳戳 ' + nw, has(HTML, nw));
ok('★ 新模块 ui/n26-launchpad-modal.css?v=lp1 挂在最后',
  has(HTML, 'ui/n26-launchpad-modal.css?v=lp1') &&
  HTML.indexOf('n26-launchpad-modal.css') > HTML.indexOf('n26-dockbar-pos.css'));
(function () {
  function walk(dir, out) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = dir + '/' + name;
      const st = fs.statSync(path.join(ROOT, rel));
      if (st.isDirectory()) { if (name !== '.trash' && name !== 'node_modules') walk(rel, out); }
      else if (/\.html$/i.test(name)) out.push(rel);
    }
    return out;
  }
  const all = ['Nexus OS 26.html'].concat(walk('apps', []));
  let stale = 0;
  for (const f of all) {
    const s = read(f);
    for (const [, old] of STAMPS) if (has(s, old)) stale++;
  }
  ok('★ 全项目无旧戳残留（所有引用处同步 bump）', stale === 0);
})();

/* ---------- 4. 启动台模态 ---------- */
ok('★ openLaunchpad 挂 n26-lp-open', /lp\.classList\.add\('show'\);[\s\S]{0,220}document\.body\.classList\.add\('n26-lp-open'\)/.test(HTML));
ok('★ closeLaunchpad 退场动画走完才摘类',
  /lp\.classList\.remove\('closing'\);[\s\S]{0,180}document\.body\.classList\.remove\('n26-lp-open'\)/.test(HTML));
ok('★ 启动台模态 CSS 存在', LPC.length > 200);
ok('★ 六段 Dock 全部收起', ['#dock,', '#dockBar,', '#finder-bar,', '#n26LeftDock,', '#n26RightDock,', '#n26DesktopShelf'].every(function (k) { return has(LPC, k); }));
ok('★ 收起期间禁止交互', has(LPC, 'pointer-events: none !important'));
ok('★ 主 Dock 位移保留 translateX(-50%) 居中', has(LPC, 'transform: translateX(-50%) translateY(140%) !important'));
ok('★ 顶部档同时覆盖独立 translate 属性', has(LPC, 'translate: 0 -160% !important'));
ok('★ 单一 260ms 表面缓动，不叠 backdrop-filter',
  has(LPC, '0.26s cubic-bezier(.2, .7, .2, 1)') && !/backdrop-filter/.test(noComments(LPC)));
ok('★ reduced-motion 降级', has(LPC, 'prefers-reduced-motion'));
ok('★ 启动台渲染签名：内容没变不重建 DOM',
  /__n26LpSig === _sig\) return;/.test(HTML) && /n26:icon-pack/.test(HTML));

/* ---------- 5. 侧栏玻璃：静止灰底 / 按下才液态 ---------- */
ok('★ 玻璃静止态 opacity:0', /pointer-events: none;\n[\s\S]{0,180}opacity: 0;/.test(DNAVC));
ok('★ 只有 .n26-dng-on 才显示玻璃', has(DNAVC, '.n26-dng.n26-dng-on { opacity: 1; }'));
ok('★ 静止灰底回归（:not(hold/drag) 高特异性覆盖）',
  has(DNAVC, 'v2.10.19 静止态灰底回归') && has(DNAVC, ':not(.n26-docknav-hold):not(.n26-docknav-drag)') &&
  has(DNAVC, 'rgba(125, 135, 155, 0.16) !important'));
ok('★ hover 不再建合成层', !/\.n26-docknav-host:hover > \.n26-dng \{\s*will-change/.test(noComments(DNAVC)));
ok('★ hover 不再改 box-shadow / 不再触发折射重挂', !has(noComments(DNAVC), '.n26-docknav-host:hover > .n26-dng.n26-liquid-on {'));
ok('★ JS 静止收玻璃', /glass\.style\.opacity = '0';\s*glass\.classList\.remove\('n26-dng-on'\)/.test(DNAVJ));
ok('★ JS 点击与长按都挂 n26-dng-on', (DNAVJ.match(/classList\.add\('n26-dng-on'\)/g) || []).length >= 2);
ok('★ 静止态不重建折射贴图（消抖/消闪）',
  /if \(busy \|\| glass\.classList\.contains\('n26-dng-on'\)\) lgSchedule\(\);/.test(DNAVJ));
ok('★ 侧栏 CSS 无 transition: all', !/transition:\s*all/i.test(noComments(DNAVC)));
ok('★ 侧栏 CSS 无祖先 filter（不许废掉子玻璃折射）', !/^\s*filter\s*:/m.test(noComments(DNAVC)));

/* ---------- 6. 隐藏 Dock 唤出居中 ---------- */
ok('★ dock-hidden 保留 translateX(-50%)', has(START, 'transform: translateX(-50%) translateY(140%) !important'));
ok('★ dock-peek 保留 translateX(-50%)', has(START, 'transform: translateX(-50%) translateY(0) !important'));

/* ---------- 7. 歌词翻译伪译文 ---------- */
ok('★ 同时间戳第二行不再无条件塞进 tr',
  has(MUSIC, 'lrcIsTranslation') && /if \(!out\[i\]\.tr && lrcIsTranslation\(out\[i\]\.text, text\)\)/.test(MUSIC));
ok('★ 语种判据覆盖假名/韩文/西里尔/汉字', /\\u3040-\\u30ff/.test(MUSIC) && /\\u4e00-\\u9fa5/.test(MUSIC));
ok('★ trFill 先清伪译文再判 has', /_L\.tr = ''/.test(MUSIC) && /先清掉/.test(MUSIC));
/* ★ 版本弹性：v2.10.25 起失败真因改为「返回原文回显」，不写死旧文案；
   本质判据是「失败态必须写 title 说明 + 有重试按钮」。 */
ok('★ 翻译失败给出真实原因而非无限重试',
  /trBtn\('fail'\)/.test(MUSIC) && /b\.title = '[^']*(?:未响应|原文|重试)/.test(MUSIC) &&
  has(MUSIC, 'lrcTrBtn'));

/* ---------- 8. 语法与铁律 ---------- */
(function () {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let total = 0, bad = 0, m;
  for (const f of ['Nexus OS 26.html', 'apps/music.html']) {
    const s = read(f); re.lastIndex = 0;
    while ((m = re.exec(s))) { total++; try { new vm.Script(m[1]); } catch (e) { bad++; } }
  }
  ok('★ 主壳 + 音乐内联脚本全部可编译', total >= 10 && bad === 0);
})();
ok('★ 新启动台 CSS 全面禁紫（键名不算）',
  !/#\s*(8b5cf6|a855f7|9c8cff|6c5ce7|b4a7ff|c4b8ff)/i.test(LPC));
ok('★ 新启动台 CSS 无 transition: all', !/transition:\s*all/i.test(noComments(LPC)));

console.log('PASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL) { console.log('verify-n26-301 未通过'); process.exitCode = 1; }
else console.log('verify-n26-301 全绿');
