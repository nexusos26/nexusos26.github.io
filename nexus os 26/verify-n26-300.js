/* ============================================================================
   verify-n26-300.js · v2.10.17 守门
   七个冷门应用功能补齐 + 统一导入/导出语义 + 视觉铁律
   纯 Node 静态 + vm 假 DOM，不开任何自动化浏览器
   ============================================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = __dirname;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function exists(f) { return fs.existsSync(path.join(ROOT, f)); }
let PASS = 0, FAIL = 0;
function ok(name, cond) {
  if (cond) { PASS++; }
  else { FAIL++; console.log('  ✗ ' + name); }
}
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function has(s, k) { return s.indexOf(k) >= 0; }
function allOf(s, keys) { return keys.every(function (k) { return has(s, k); }); }

const HTML = read('Nexus OS 26.html');
const APPS = ['alarm', 'novel', 'tips', 'vm', 'focus', 'game2048', 'monitor'];
const SRC = {};
APPS.forEach(function (a) { SRC[a] = read('apps/' + a + '.html'); });

console.log('=== verify-n26-300 · v2.10.18 ===');

/* ---------- 1. 版本与更新日志（版本弹性，以后 bump 不用改断言） ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
ok('★ 主壳版本号格式合法', /^v2\.\d+\.\d+$/.test(VER));
ok('★ changelog 首条与主壳版本一致', (function () {
  var m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('changelog 记录七个应用与导入导出语义',
  has(HTML, '七个应用') && has(HTML, 'apps/_project-io.js') && has(HTML, '浏览器下载'));
ok('★ v2.10.18 changelog 记录实时工程闭环',
  has(HTML, '实时工程') && has(HTML, 'L.getState().project'));

/* ---------- 2. 七个应用的功能落地 ---------- */
ok('★ 闹钟：重复周期 / 铃声 / 贪睡 / 标签编辑 / 独立偏好键',
  allOf(SRC.alarm, ['isDueOn', 'repeatText', 'weekdays', "'custom'", 'soundOptions',
    'playSound(a.sound)', 'snoozeAlarm', 'snoozeLeft', 'alarmEditModal', 'alarmPrefs', 'alarmLabelInput']));
ok('★ 小说：书签 / 夜间 / 字号微调 / 进度记忆',
  allOf(SRC.novel, ['addBookmark', 'jumpBookmark', 'novelBookmarks', 'n26-novel-night',
    'novelNight', 'bumpFont', 'updateProgress', 'novelProgress', 'ratio']));
ok('★ 技巧：新手/进阶/开发者 + 搜索 + 收藏',
  allOf(SRC.tips, ['LEVELS', 'LEVEL_OF', "'beginner'", "'advanced'", "'dev'",
    'n26TipLevel', 'n26TipFavOnly', 'tipsFavorites', 'favStar', 'tipsQ']));
ok('★ 虚拟机：多机管理 / 快照 / 资源滑块',
  allOf(SRC.vm, ['vmMachines', 'openVmLib', 'launchVm', 'takeSnapshot', 'restoreSnapshot',
    'sliderRow', "'cpu'", "'ram'", "'disk'", 'vmCfg_', 'input type="range"', 'curVm']));
ok('★ 专注：白名单 / 统计 / 结束提醒',
  allOf(SRC.focus, ['focusWhitelist', 'focusRemind', 'openWhitelist', 'paintWeek',
    'getProcesses', 'preEndFired', 'if (state.remind) chime()', 'focus_stats']));
ok('★ 2048：最高分 / 撤销 / 应用内深色模式',
  allOf(SRC.game2048, ['game2048_best', 'btnUndo', 'function undo()',
    'game2048Theme', 'applyGTheme', 'cycleTheme', 'btnTheme']));
ok('★ 监视器：CPU/内存 canvas 曲线 + 进程列表增强',
  allOf(SRC.monitor, ['drawResChart', 'sampleRes', 'resCpu', 'resMem', 'longMs',
    'paintProcs', 'procQ', 'procState', '#resChart'.slice(1)]));

/* ---------- 3. 视觉 / 工程铁律 ---------- */
APPS.forEach(function (a) {
  const s = noComments(SRC[a]);
  const purple = (s.match(/#(?:8b5cf6|a855f7|7c3aed|6d28d9|9c8cff|6c5ce7|b4a7ff)/gi) || []).length;
  const ta = (s.match(/transition:.{0,6}all/gi) || []).length;
  ok('★ ' + a + '：全面禁紫', purple === 0);
  ok('★ ' + a + '：transition: all 为 0', ta === 0);
  ok(a + '：祖先不写 filter（会废掉子玻璃折射）', (s.match(/^\s*filter:/gm) || []).length === 0);
  /* 内联脚本语法 */
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0, bad = 0;
  while ((m = re.exec(SRC[a]))) {
    n++;
    try { new vm.Script(m[1], { filename: a + '-inline-' + n }); } catch (e) { bad++; }
  }
  ok(a + '：内联脚本 ' + n + ' 段语法全过', n > 0 && bad === 0);
});
ok('关键偏好都走独立键，不塞 settings',
  !/setUserLS\(['"]settings['"]/.test(APPS.map(function (a) { return SRC[a]; }).join('\n')));

/* ---------- 4. 统一导入 / 导出语义 ---------- */
const IO = 'apps/_project-io.js';
ok('★ 统一适配层存在', exists(IO));
const IOJS = read(IO);
try { new vm.Script(IOJS, { filename: '_project-io.js' }); ok('★ _project-io.js 语法通过', true); }
catch (e) { ok('★ _project-io.js 语法通过（' + e.message + '）', false); }

ok('★ 导入走浏览器原生本地选文件',
  /input\.type = 'file'/.test(IOJS) && /input\.click\(\)/.test(IOJS));
ok('★ 导出走 Blob + <a download> 浏览器下载',
  /URL\.createObjectURL/.test(IOJS) && /a\.download = fileName/.test(IOJS) && /a\.click\(\)/.test(IOJS));
ok('★ 三套适配各自生效', ['installStrata', 'installReelix', 'installFloat'].every(function (k) { return has(IOJS, k); }));
ok('★ Strata：写字节即下载', /cmd === 'write_file_bytes'/.test(IOJS) && /download\(nm, bytes\)/.test(IOJS));
ok('★ Reelix：打开工程本地选 + 保存工程下载',
  /case 'pick_project_file'/.test(IOJS) && /case 'save_project'/.test(IOJS) && /pickFiles\(\{ multiple: false/.test(IOJS));
ok('★ Float：另存为不再让用户挑已存在文件',
  /cmd === 'pick_save_file'/.test(IOJS) && /askName\(def/.test(IOJS) && !/pickFiles\(\{ multiple: false, accept: accept/.test(IOJS));
ok('★ 应用内文件名弹窗（不用浏览器 prompt）', /function askName\(/.test(IOJS) && !/window\.prompt\(/.test(IOJS));

/* ---------- 4b. v2.10.18 · Reelix 实时工程闭环 ---------- */
ok('★ 导出取实时 store，不再导出打开时的静态快照',
  /function reelixState\(/.test(IOJS) && /function liveProject\(/.test(IOJS) &&
  /var body = liveProject\(\) \|\| project \|\| \{\}/.test(IOJS));
ok('★ get_project 同样取实时态（refreshProject 不会冲掉编辑内容）',
  /case 'get_project': return Promise\.resolve\(liveProject\(\) \|\| project\)/.test(IOJS));
ok('★ 新建工程 / 示例工程链路接通',
  allOf(IOJS, ["case 'new_project'", "case 'write_text_file'", "case 'read_text_file'",
    "case 'home_dir'", "case 'close_project'", 'blankProject', 'emptyLike']));
ok('★ 自动保存不弹下载（dirty 恒 false，手动保存才是导出入口）',
  /case 'project_is_dirty'[\s\S]{0,300}?return Promise\.resolve\(false\)/.test(IOJS));
ok('★ 实时态靠全局只读求值，不改打包产物',
  /Function\('return typeof L !== "undefined" \? L : null'\)/.test(IOJS) &&
  /typeof aq === "function"/.test(IOJS));

['apps/strata/index.html', 'apps/reelix/index.html', 'apps/float/index.html'].forEach(function (f) {
  const s = read(f);
  ok('★ ' + f + ' 挂载统一 IO 层且只挂一次（戳版本弹性）',
    (s.match(/_project-io\.js\?v=pio\d+/g) || []).length === 1);
  ok(f + ' 挂载在 _theme-adapter.js 之后',
    s.indexOf('_theme-adapter.js') >= 0 && s.indexOf('_project-io.js') > s.indexOf('_theme-adapter.js'));
});

/* ---------- 5. vm 假 DOM 冒烟：下载链路真的触发 ---------- */
function makeEnv(pathname, tauri) {
  const downloads = [];
  const blobs = [];
  const body = { appendChild: function (el) { el.parentNode = body; }, removeChild: function () {} };
  const doc = {
    body: body,
    documentElement: { appendChild: function (x) { x.parentNode = doc.documentElement; }, removeChild: function () {} },
    createElement: function () {
      return {
        style: { cssText: '' }, parentNode: null, value: '', files: [],
        setAttribute: function () {}, addEventListener: function () {},
        appendChild: function () {}, removeChild: function () {},
        querySelector: function () { return { addEventListener: function () {}, focus: function () {}, select: function () {}, value: 'x.txt' }; },
        click: function () { if (this.download) downloads.push(this.download); },
        focus: function () {}, select: function () {}
      };
    },
    addEventListener: function () {}
  };
  const win = {
    document: doc, location: { pathname: pathname }, __TAURI_INTERNALS__: tauri,
    console: console, setTimeout: function () { return 0; }, clearTimeout: function () {},
    Promise: Promise, Uint8Array: Uint8Array, ArrayBuffer: ArrayBuffer, JSON: JSON,
    Date: Date, Math: Math, String: String, Object: Object, Array: Array, Error: Error,
    RegExp: RegExp, URL: { createObjectURL: function () { return 'blob:fake'; }, revokeObjectURL: function () {} },
    Blob: function (p, o) { this.parts = p; this.type = (o || {}).type || ''; this.size = 1; blobs.push(p); },
    FileReader: function () {}, fetch: function () { return Promise.reject(new Error('no fetch')); }
  };
  win.window = win;
  return { env: win, downloads: downloads, blobs: blobs };
}

(async function () {
  {
    const t = makeEnv('/apps/strata/index.html', undefined);
    vm.runInNewContext(IOJS, t.env);
    ok('★ 冒烟：Strata 自动补齐 Tauri 桥', t.env.__TAURI_INTERNALS__.__n26IO === 'strata');
    await t.env.__TAURI_INTERNALS__.invoke('write_file_bytes', { path: 'C:\\a\\封面.png', data: [1, 2] });
    ok('★ 冒烟：Strata 导出触发下载', t.downloads.indexOf('封面.png') >= 0);
  }
  {
    const t = makeEnv('/apps/reelix/index.html', { invoke: function () { return Promise.resolve(undefined); } });
    vm.runInNewContext(IOJS, t.env);
    ok('★ 冒烟：Reelix 空壳 invoke 被替换', t.env.__TAURI_INTERNALS__.__n26IO === 'reelix');
    await t.env.__TAURI_INTERNALS__.invoke('save_project', { path: 'n26:/导出/工程.json' });
    ok('★ 冒烟：Reelix 保存工程触发下载', t.downloads.indexOf('工程.json') >= 0);
  }
  {
    // 模拟 Reelix classic script 顶层 const L（全局词法环境里的 store）
    const t = makeEnv('/apps/reelix/index.html', { invoke: function () { return Promise.resolve(undefined); } });
    const prelude = 'const L = { getState: function () { return { project: ' +
      '{ name: "实时编辑工程", sequences: [{ id: "s1", tracks: [] }] } }; } };\n';
    vm.runInNewContext(prelude + IOJS, t.env);
    ok('★ 冒烟：全局 store 注入后适配层仍正常装载', t.env.__TAURI_INTERNALS__.__n26IO === 'reelix');
    await t.env.__TAURI_INTERNALS__.invoke('save_project', { path: 'n26:/导出/live.reelix.json' });
    const dumped = t.blobs.map(function (p) { return (p || []).join(''); }).join('');
    ok('★ 冒烟：导出内容来自实时 store，不是打开时的旧快照',
      dumped.indexOf('实时编辑工程') >= 0 && dumped.indexOf('"live": true') >= 0);
    const gp = await t.env.__TAURI_INTERNALS__.invoke('get_project');
    ok('★ 冒烟：get_project 返回实时工程', !!gp && gp.name === '实时编辑工程');
    const np = await t.env.__TAURI_INTERNALS__.invoke('new_project', { name: '新工程' });
    ok('★ 冒烟：新建工程返回带空序列的合法骨架',
      !!np && np.name === '新工程' && Array.isArray(np.sequences) &&
      np.sequences.length === 1 && Array.isArray(np.sequences[0].tracks));
    const hd = await t.env.__TAURI_INTERNALS__.invoke('home_dir');
    await t.env.__TAURI_INTERNALS__.invoke('write_text_file', { path: hd + 'Documents/示例.reelix', contents: '{"name":"示例"}' });
    const op = await t.env.__TAURI_INTERNALS__.invoke('open_project', { path: hd + 'Documents/示例.reelix' });
    ok('★ 冒烟：示例工程写内存后能打开', !!op && op.name === '示例');
  }
  {
    const t = makeEnv('/apps/float/index.html', { invoke: function (c) { return Promise.resolve('base:' + c); } });
    vm.runInNewContext(IOJS, t.env);
    await t.env.__TAURI_INTERNALS__.invoke('fs_write', { path: 'n26:/导出/main.co', contents: 'print(1)' });
    ok('★ 冒烟：Float 另存为代码触发下载', t.downloads.indexOf('main.co') >= 0);
    const n = t.downloads.length;
    await t.env.__TAURI_INTERNALS__.invoke('fs_write', { path: 'n26:/src/main.co', contents: 'print(2)' });
    ok('★ 冒烟：普通编辑保存不误触发下载', t.downloads.length === n);
    const r = await t.env.__TAURI_INTERNALS__.invoke('fs_read', { path: 'x' });
    ok('★ 冒烟：其余命令回落原 shim', r === 'base:fs_read');
  }
  {
    const t = makeEnv('/apps/notes.html', undefined);
    vm.runInNewContext(IOJS, t.env);
    ok('★ 冒烟：无关应用不被注入 shim', !t.env.__TAURI_INTERNALS__);
  }

  console.log('PASS ' + PASS + '  FAIL ' + FAIL);
  if (FAIL) { console.log('verify-n26-300 未通过'); process.exitCode = 1; }
  else console.log('verify-n26-300 全绿');
})();
