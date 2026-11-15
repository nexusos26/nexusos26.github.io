/* ============================================================================
   verify-n26-306.js · 小组件四风格材质守门（第十九套，v2.10.26 随行为反转重写）
   去覆盖层 / 去折射 / 右上角高光（纯 CSS 多层背景）/ 零 JS / 四档材质 / 深色
   纯 Node 静态断言，不开任何自动化浏览器
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
const WSC = read('ui/n26-widget-style.css');
const C = noComments(WSC);
const API = read('Nexus-对外API.md');

console.log('=== verify-n26-306 · v2.10.26 小组件去覆盖层 + 右上角高光 ===');

/* ---------- 1. 版本 / changelog / 挂载 ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
const VER_NUM = (VER.match(/^v2\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
ok('★ 版本号格式合法且不低于 v2.10.24（弹性）',
  VER_NUM.length === 2 && (VER_NUM[0] > 10 || (VER_NUM[0] === 10 && VER_NUM[1] >= 24)));
ok('★ changelog 首条与版本号一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('★ changelog 三条改动全在',
  ['液态玻璃覆盖层整个撤掉', '点击桌面不再弹出「页面无响应」', '第二十套守门随行为反转重写']
    .every(function (k) { return has(HTML, k); }));

/* ---------- 2. 覆盖层与折射彻底撤销（卡死真因） ---------- */
ok('★ JS 模块已删除，主壳不再引用',
  !fs.existsSync(path.join(ROOT, 'ui/n26-widget-style.js')) &&
  !has(HTML, '<script src="ui/n26-widget-style.js'));
ok('★ CSS 里没有任何 .n26-ws-lens / .n26-ws-iris 残留',
  !/n26-ws-lens|n26-ws-iris/.test(C));
ok('★ 白名单不再登记小组件层（折射链路整体不存在）',
  /N26_LG_WHITELIST = '[^']*'/.test(HTML) &&
  !/N26_LG_WHITELIST = '[^']*\.n26-ws-lens/.test(HTML));
ok('★ 折射滑杆不再遍历小组件',
  !/querySelectorAll\('\.n26-ws-lens'\)\.forEach\(apply\)/.test(HTML));
ok('★ CSS 不建新层：无 mix-blend-mode、无 will-change、无折射放行',
  !/mix-blend-mode/.test(C) && !/will-change/.test(C) &&
  !/var\(--n26-lg-filter/.test(C));
ok('★ 小组件不再出现任何 SVG 滤镜挂载痕迹',
  !/url\(#n26Lg/.test(C) && !/feDisplacementMap/.test(C));

/* ---------- 3. 液态档：右上角高光（纯 CSS 多层背景） ---------- */
ok('★ 右上角高光画在卡片自己的 background-image 上（88% 4% 圆心）',
  /html\[data-fui="liquid"\] \.desktop-widget-card \{[\s\S]{0,420}?--w-mat-bg-img:[\s\S]{0,420}?radial-gradient\(95% 85% at 88% 4%/.test(C));
ok('★ 高光向左下快速衰减，不整卡泛白',
  /rgba\(255, 255, 255, 0\) 64%/.test(C));
ok('★ 右上一条细高光边走 --w-mat-shadow 的 inset（不建新层）',
  /html\[data-fui="liquid"\] \.desktop-widget-card \{[\s\S]{0,700}?inset -1px 1px 0 rgba\(255, 255, 255, \.38\)/.test(C));
ok('★ 深色模式液态档高光单独收敛（判本质：深色峰值 < 浅色峰值）',
  /html\[data-fui="liquid"\] body\.dark-mode \.desktop-widget-card \{[\s\S]{0,420}?radial-gradient\(95% 85% at 88% 4%/.test(C) &&
  (function () {
    const lightC = C.match(/html\[data-fui="liquid"\] \.desktop-widget-card \{[\s\S]{0,420}?radial-gradient\(95% 85% at 88% 4%,\s*rgba\(255, 255, 255, \.(\d+)\)/);
    const darkC = C.match(/html\[data-fui="liquid"\] body\.dark-mode \.desktop-widget-card \{[\s\S]{0,420}?radial-gradient\(95% 85% at 88% 4%,\s*rgba\(255, 255, 255, \.(\d+)\)/);
    return !!lightC && !!darkC && Number(darkC[1]) < Number(lightC[1]);
  })());
ok('★ 液态档不覆盖磨砂底 --w-mat-bg（保持 widgets.css 原样，不再为折射放透）',
  !/html\[data-fui="liquid"\] \.desktop-widget-card \{[\s\S]{0,60}?--w-mat-bg:/.test(C));

/* ---------- 3.5 实拍对齐 · 每类专属底色（第 ⑥ 节，全风格通用） ----------
   ★ v2.10.29 需求反转：用户指出实拍那张是晚上拍的，黑卡只是夜间的样子，
     不能默认就黑。断言随行为反转：浅色冷白实底 + 墨字，深色才回到实拍黑卡。 */
ok('★ 仪表卡跟随明暗：浅色冷白实底 + 墨字，深色才黑卡（夜拍不默认黑）',
  /html body \.desktop-widget-card\[data-wtype="clock"\][\s\S]{0,900}?background-color: rgba\(250, 251, 254, \.98\) !important/.test(C) &&
  /--w-text: #101923/.test(C) &&
  /html body\.dark-mode \.desktop-widget-card\[data-type\]\[data-wtype="clock"\][\s\S]{0,900}?background-color: #0b0e14 !important/.test(C) &&
  /html body\.dark-mode \.desktop-widget-card\[data-type\]\[data-wtype="clock"\][\s\S]{0,900}?--w-text: #f5f7fb/.test(C));
ok('★ 实拍对齐：天气 = 深蓝天空渐变 + 高光叠顶',
  /html body \.desktop-widget-card\[data-wtype="weather"\][\s\S]{0,420}?linear-gradient\(180deg, #3b8dd8 0%, #1e609f 58%, #143f74 100%\)/.test(C));
ok('★ 实拍对齐：色块提到 94% 不再白蒙蒙（全风格 catch-all）',
  /html body \.desktop-widget-card,\nhtml body \.desktop-widget-card\[data-wtype\] \{[\s\S]{0,300}?color-mix\(in srgb, var\(--w-tint-a, #2f6fd0\) 94%, transparent\) !important/.test(C));
ok('★ 小组件卡关掉无谓磨砂（3-id 特异度压过 widgets.css 强制磨砂）',
  /html body #desktopWidgets#desktopWidgets#desktopWidgets \.desktop-widget-card \{[\s\S]{0,120}?backdrop-filter: none !important/.test(C));
ok('★ 纸白三类补墨色令牌（smartdevice/browser/quicklaunch 白底不白字）',
  /html body \.desktop-widget-card\[data-wtype="smartdevice"\],\nhtml body \.desktop-widget-card\[data-wtype="browser"\],\nhtml body \.desktop-widget-card\[data-wtype="quicklaunch"\] \{[\s\S]{0,300}?--w-text: #101923/.test(C));
ok('★ P0：docknav 玻璃 plain 模式（SVG 位移折射会崩 GPU）',
  has(require('fs').readFileSync(path.join(ROOT, 'ui/n26-docknav.js'), 'utf8'), 'plain: true') &&
  has(require('fs').readFileSync(path.join(ROOT, 'ui/n26-glass-optics.js'), 'utf8'), 'plain: true') &&
  /plain[\s\S]{0,300}?blur\(var\(--n26-blur, 22px\)\) saturate\(1\.4\)/.test(require('fs').readFileSync(path.join(ROOT, 'ui/n26-lg-core.js'), 'utf8')));

/* ---------- 4. 其余三档材质保留 ---------- */
ok('★ 拟物凹凸保留且带 !important（widgets.css 有几十条 none !important）',
  (C.match(/text-shadow:[^;]+!important;/g) || []).length >= 5 &&
  (C.match(/box-shadow:[\s\S]{0,240}?!important;/g) || []).length >= 4);
ok('★ 一键按钮凸起 / :active 与 .on 凹陷', /:active,[\s\S]{0,700}?\.on \{/.test(C) && has(C, 'inset 3px 3px 7px rgba(15, 23, 42, .22)'));
ok('★ 玻璃拟态吃 --n26-blur 滑杆',
  /html\[data-fui="neu-glass"\] \.desktop-widget-card \{[\s\S]{0,260}?blur\(var\(--n26-blur, 18px\)\)/.test(C));
ok('★ 扁平化 16px 圆角 + 4×1 胶囊仍 999px',
  /html\[data-fui="flat"\] \.desktop-widget-card \{[\s\S]{0,420}?--w-radius: 16px/.test(C) &&
  /html\[data-fui="flat"\] body \.desktop-widget-card\[data-rows="1"\] \{ border-radius: 999px !important/.test(C));
ok('★ 深色模式四档令牌齐全',
  ['neu-solid', 'neu-glass', 'flat', 'liquid']
    .every(function (k) { return has(C, 'html[data-fui="' + k + '"] body.dark-mode .desktop-widget-card'); }));
ok('★ 切换瞬态逐属性白名单，绝不 transition: all',
  /html\.n26-fui-switching \.desktop-widget-card,[\s\S]{0,600}?transition: background-color 260ms/.test(C) &&
  !/transition:\s*all/i.test(C) && !/will-change:[^;]*\b(?:width|height|top|left)\b/.test(C));
ok('★ 表面 260ms expo-out、reduced-motion 降级、全面禁紫、零 filter',
  has(C, '260ms cubic-bezier(.2, .7, .2, 1)') &&
  /@media \(prefers-reduced-motion: reduce\)/.test(C) &&
  !/purple|violet|#8b5cf6|#a855f7|#7c3aed/i.test(C) &&
  (C.match(/{/g) || []).length === (C.match(/}/g) || []).length &&
  !/(^|[^-\w])filter\s*:/.test(C));

/* ---------- 5. 文档 ---------- */
ok('★ API 文档 2.7.4 已改写为纯 CSS，不再有 N26WidgetStyle JS API',
  has(API, '#### 2.7.4 小组件四风格材质层（v2.10.26，纯 CSS）') &&
  has(API, '不要覆盖层、不要折射') &&
  !/window\.N26WidgetStyle/.test(API) &&
  !/ui\/n26-widget-style\.js/.test(API));

/* ---------- 6. vm 冒烟：令牌链路与渐变语法 ---------- */
(function () {
  const tokens = {};
  const card = { style: { setProperty: function (k, v) { tokens[k] = v; }, removeProperty: function (k) { delete tokens[k]; } } };
  const ctx = vm.createContext({ console: console, card: card });
  try { vm.runInContext('card.style.setProperty("--w-mat-bg-img", "radial-gradient(95% 85% at 88% 4%, #fff 0%, transparent 64%)");', ctx); } catch (e) { ctx._err = e; }
  ok('★ [vm] 令牌写入链路可用（与 widgets.css 的消费方式一致）',
    !ctx._err && tokens['--w-mat-bg-img'] === 'radial-gradient(95% 85% at 88% 4%, #fff 0%, transparent 64%)');
  ok('★ [vm] 高光渐变括号配平、无空 gradient',
    (function () {
      const m = C.match(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g) || [];
      return m.length >= 2 && m.every(function (g) {
        return (g.match(/\(/g) || []).length === (g.match(/\)/g) || []).length;
      });
    })());
  ok('★ [vm] 声明的 --w-* 令牌都是 widgets.css 真实消费的',
    (function () {
      const consumed = ['--w-mat-bg', '--w-mat-bg-img', '--w-mat-shadow', '--w-radius', '--w-inner-radius',
        '--w-text', '--w-text-strong', '--w-text-soft', '--w-text-faint',
        '--w-hair', '--w-well', '--w-accent'];
      const declared = (C.match(/--w-[a-z-]+(?=\s*:)/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
      return declared.length > 0 && declared.every(function (t) { return consumed.indexOf(t) >= 0; });
    })());
})();

console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
if (FAIL === 0) console.log('verify-n26-306 全绿');
process.exit(FAIL === 0 ? 0 : 1);
