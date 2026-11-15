/* ============================================================================
   verify-n26-307.js · v2.10.25 歌词翻译真因修复守门（第二十套）
   主通道 tl=zh / 回显拒收 / 换通道重试 / 小批并发 / 脏缓存作废 / 元信息过滤
   纯 Node 静态 + vm 假 DOM + 假 fetch，不开任何自动化浏览器
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
const MUSIC = read('apps/music.html');
const M = noComments(MUSIC);
const API = read('Nexus-对外API.md');
const G301 = read('verify-n26-301.js');

console.log('=== verify-n26-307 · v2.10.25 歌词翻译真因修复 ===');

/* ---------- 1. 版本 / changelog / 文档 ---------- */
const VER = (HTML.match(/const NEXUS_OS_VERSION = '(v2\.\d+\.\d+)'/) || [])[1] || '';
ok('★ 版本号格式合法（弹性：≥ 2.10.25）', (function () {
  if (!/^v2\.\d+\.\d+$/.test(VER)) return false;
  const p = VER.slice(2).split('.').map(Number);
  return p[1] > 10 || (p[1] === 10 && p[2] >= 25);
})());
ok('★ changelog 首条与版本号一致', (function () {
  const m = HTML.match(/class="changelog"[\s\S]{0,600}?class="changelog-version">([^<]+)</);
  return !!m && m[1] === VER;
})());
ok('★ changelog 四条改动全在',
  ['这回是真翻出中文了', '回显拒收 / 换通道重试 / 小批并发 / 脏缓存作废',
   '元信息不翻、语种判据不再被中文元信息带偏', '用真实接口数据复现并固化']
    .every(function (k) { return has(HTML, k); }));
ok('★ API 文档补 2.7.5 歌词翻译链路与 tl 缓存键铁律',
  has(API, '#### 2.7.5 歌词翻译链路') && has(API, '缓存键含 `tl`') && has(API, 'trEcho'));
ok('★ 旧 301 守门的失败文案断言已改版本弹性',
  has(G301, '版本弹性') && has(G301, 'trBtn') && has(G301, '未响应|原文|重试') &&
  !has(G301, "has(MUSIC, '翻译服务未就绪')"));

/* ---------- 2. 真因对应的常量与判据 ---------- */
ok('★ 主通道改成干净的 tl=zh（zh-CN 通道已被脏缓存污染）',
  /var TR_TL = 'zh';/.test(M) && !/var TR_TL = 'zh-CN';/.test(M));
ok('★ 备用通道 tl=zh-CN 用于回显重试（缓存键不同）',
  /var TR_TL_ALT = 'zh-CN';/.test(M) && has(M, 'TR_TL_ALT'));
ok('★ 小批 8 句 × 3 路并发，不再 40 句串行',
  /var TR_BATCH = 8;/.test(M) && /var TR_CONC = 3;/.test(M) &&
  !/var TR_BATCH = 40;/.test(M));
ok('★ trEcho 归一化判回显：相同 / 无汉字一律拒收',
  /function trEcho\(src, txt\)[\s\S]{0,400}?a === b/.test(M) &&
  /\\u4e00-\\u9fa5/.test(M) && has(M, 'function trNorm'));
ok('★ trPost 支持传 tl，主通道与重试通道走不同缓存键',
  /function trPost\(batch, tl\)/.test(M) && /tl: tl \|\| TR_TL/.test(M) &&
  /trPost\(batch, TR_TL\)/.test(M) && /trPost\(batch, TR_TL_ALT\)/.test(M));
ok('★ 写回前一律过 trEcho，回显绝不进 S.lrc',
  /if \(trEcho\(src\.text, txt\)\)/.test(M) &&
  !/S\.lrc\[src\.i\]\.tr = txt;\s*got = true;\s*\}\s*\}\s*step\(\)/.test(M));
ok('★ 并发池 + 回显收集 + 两轮才收尾',
  /active < TR_CONC/.test(M) && /retrying/.test(M) && /finished/.test(M) &&
  /if \(echo\.length\) retryEcho\(\); else finish\(\)/.test(M));
ok('★ 两轮都失败才 trBtn(fail)，并写明返回的是原文',
  /if \(got\) \{[\s\S]{0,200}?trBtn\('on'\);[\s\S]{0,200}?trBtn\('fail'\)/.test(M) &&
  has(M, '翻译服务返回的仍是原文') && !has(M, '翻译服务未就绪（ai.fanggame.company'));
ok('★ trCacheGet 作废并删除存着原文回显的老缓存',
  /function trCacheGet\(t, lines\)/.test(M) &&
  /if \(o\.lines\[i\] && trEcho\(/.test(M) && /removeItem\(trKey\(t\)\)/.test(M));
ok('★ trCacheSet 只写真译文，一条真译文都没有就不落盘',
  /if \(v && !trEcho\(src, v\)\) ok = true; else v = ''/.test(M) && /if \(!ok\) return/.test(M));
ok('★ trFill 用 trEcho 清伪译文、用新签名读缓存',
  /trCacheGet\(t, S\.lrc\)/.test(M) && /trEcho\(_L\.text, _L\.tr\)/.test(M) &&
  /!trEcho\(S\.lrc\[i\]\.text, cached\[i\]\)/.test(M));
ok('★ 元信息行不送翻译，也不拉低 trNeeded 的拉丁占比',
  /if \(!txt \|\| trIsMeta\(txt\)\) continue/.test(M) &&
  /if \(trIsMeta\(lines\[i\]\.text\)\) continue/.test(M) &&
  /var TR_META = [\s\S]{0,80}?作词/.test(M));
ok('★ 端点是 POST + JSON，仍只认 data.items（旧链路没被改坏）',
  has(M, "var TR_API = 'https://ai.fanggame.company/api/translate'") &&
  /method: 'POST'/.test(M) && /j\.data\.items/.test(M));

/* ---------- 3. vm 假 DOM + 假 fetch ---------- */
const start = MUSIC.indexOf('function lrcText(');
const end = MUSIC.indexOf('function trCacheGet(');
const s2 = MUSIC.indexOf('function trCacheGet(');
const e2 = MUSIC.indexOf('/* ---- v2.10.6');
const CODE = MUSIC.slice(start, end) + MUSIC.slice(s2, e2);

function makeCtx(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const calls = [];
  const states = [];
  const btn = { title: '', classList: { add() { }, remove() { }, contains: () => false, toggle() { } } };
  const lines = (opts.lines || [
    'Yesterday, all my troubles seemed so far away',
    'Now I need a place to hide away',
    'Oh, I believe in yesterday.',
    '作词 : Paul McCartney',
    'There is a shadow hanging over me'
  ]).map(function (x, i) { return { t: i * 3, text: x, tr: '' }; });
  const ctx = {
    console: console, Math: Math, Date: Date, JSON: JSON, String: String,
    Array: Array, Object: Object, Number: Number, parseInt: parseInt,
    isNaN: isNaN, RegExp: RegExp,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    AbortController: AbortController,
    TR_CACHE: 'n26:lyric:tr:', TR_TL: 'zh', TR_TL_ALT: 'zh-CN',
    TR_BATCH: 8, TR_CONC: 3, TR_CHARS: 1900, TR_TTL: 604800000,
    TR_LONG: 900, TR_JOB: 0, TR_BUSY: '',
    TR_API: 'https://ai.fanggame.company/api/translate',
    TR_META: /^(?:作词|作曲|编曲|制作人|lyrics?\s*(?:by)?)\s*[:：]/i,
    S: { cur: { id: 'T1' }, lrc: lines }, A: { currentTime: 0 },
    tid: function (t) { return String(t.id); },
    same: function () { return true; },
    trBtn: function (s) { states.push(s); },
    trPaint: function () { ctx._painted = (ctx._painted || 0) + 1; },
    renderLrc: function () { }, syncLrc: function () { }, placeLrc: function () { },
    layoutLrc: function () { }, imm: function () { return {}; }, immSetLine: function () { },
    toast: function () { }, esc: function (s) { return String(s); },
    document: { getElementById: function (id) { return id === 'lrcTrBtn' ? btn : null; }, body: { classList: {} } },
    localStorage: {
      getItem: function (k) { return k in store ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; ctx._removed = k; }
    },
    fetch: function (url, opt) {
      const body = JSON.parse(opt.body);
      calls.push({ tl: body.tl, q: body.q.slice() });
      const items = body.q.map(function (q, i) {
        const out = opts.reply ? opts.reply(body.tl, q, i) : q;
        return { i: i, t: out };
      });
      return Promise.resolve({
        ok: true,
        text: function () { return Promise.resolve(JSON.stringify({ ok: true, code: 0, data: { items: items } })); }
      });
    },
    _calls: calls, _states: states, _store: store, _btn: btn, _lines: lines
  };
  return vm.createContext(ctx);
}
function boot(c) {
  try { vm.runInContext(CODE, c, { filename: 'music-tr.js' }); } catch (e) { c._bootErr = e; }
  /* ★ 抠出来的代码里有 trPaint 的函数声明，会覆盖 sandbox 里的桩；
     runInContext 之后再换回计数桩（trBtn 定义在切片之外，不受影响）。 */
  c.trPaint = function () { c._painted = (c._painted || 0) + 1; };
}
function settled() { return new Promise(function (r) { setTimeout(r, 30); }); }
const CN = '昨天,我所有的麻烦似乎都那么遥远';

(async function () {
  /* 3.1 trEcho 单元判据 */
  {
    const c = makeCtx(); boot(c);
    ok('★ [vm] 模块可执行', !c._bootErr && typeof c.trEcho === 'function');
    ok('★ [vm] 英文原样回显 → 拒收', c.trEcho('Oh, I believe in yesterday.', 'Oh, I believe in yesterday.') === true);
    ok('★ [vm] 标点/大小写差异的回显也拒收', c.trEcho('Oh, I believe in yesterday!', 'oh i believe in yesterday') === true);
    ok('★ [vm] 真中文译文 → 收下', c.trEcho('Oh, I believe in yesterday.', CN) === false);
    ok('★ [vm] 空译文 → 拒收', c.trEcho('Hello', '') === true);
    ok('★ [vm] 元信息识别', c.trIsMeta('作词 : Paul McCartney') === true && c.trIsMeta('Yesterday') === false);
  }

  /* 3.2 主通道直接给中文 */
  {
    const c = makeCtx({ reply: function (tl, q) { return CN; } }); boot(c);
    c.trFill(c.S.cur, true);
    await settled();
    const got = c._lines.filter(function (x) { return x.tr; });
    ok('★ [vm] 主通道给真译文：4 行歌词全翻、元信息不翻',
      got.length === 4 && c._lines[3].tr === '' && got[0].tr === CN);
    ok('★ [vm] 只发主通道 tl=zh，且 q 里没有元信息',
      c._calls.length >= 1 && c._calls.every(function (x) { return x.tl === 'zh'; }) &&
      c._calls.every(function (x) { return x.q.every(function (q) { return !/^作词/.test(q); }); }));
    ok('★ [vm] 成功态 on + 重绘，且没有假 fail',
      c._states.indexOf('on') >= 0 && c._states.indexOf('fail') < 0 && c._painted >= 1);
  }

  /* 3.3 主通道全回显 → 换 tl=zh-CN 重试成功 */
  {
    const c = makeCtx({ reply: function (tl, q) { return tl === 'zh' ? q : CN; } }); boot(c);
    c.trFill(c.S.cur, true);
    await settled();
    const got = c._lines.filter(function (x) { return x.tr; });
    ok('★ [vm] 主通道回显时绝不把原文写上屏',
      c._lines.every(function (x) { return !x.tr || x.tr === CN; }));
    ok('★ [vm] 换通道重试拿到真中文（缓存键不同）',
      got.length === 4 && c._calls.some(function (x) { return x.tl === 'zh-CN'; }) &&
      c._states.indexOf('on') >= 0);
    ok('★ [vm] 重试只带被拒的句子，不重发元信息',
      c._calls.filter(function (x) { return x.tl === 'zh-CN'; })
        .every(function (x) { return x.q.every(function (q) { return !/^作词/.test(q); }); }));
  }

  /* 3.4 两个通道都回显 → 诚实 fail */
  {
    const c = makeCtx({ reply: function (tl, q) { return q; } }); boot(c);
    c.trFill(c.S.cur, true);
    await settled();
    ok('★ [vm] 两轮都回显：一行译文都不写，诚实 fail',
      c._lines.every(function (x) { return !x.tr; }) && c._states.indexOf('fail') >= 0 &&
      c._states.indexOf('on') < 0);
    ok('★ [vm] 失败时写明「返回的是原文」，不假装成功',
      /返回的仍是原文/.test(c._btn.title));
    ok('★ [vm] 失败不写本地缓存', Object.keys(c._store).length === 0);
  }

  /* 3.5 老脏缓存作废 */
  {
    const dirtyLines = [
      'Yesterday, all my troubles seemed so far away',
      'Yesterday, all my troubles seemed so far away',
      'Oh, I believe in yesterday.',
      '作词 : Paul McCartney',
      'There is a shadow hanging over me'
    ];
    const c = makeCtx({
      store: { 'n26:lyric:tr:T1': JSON.stringify({ at: Date.now(), lang: 'zh-CN', lines: dirtyLines }) },
      reply: function () { return CN; }
    }); boot(c);
    c.trFill(c.S.cur, true);
    await settled();
    /* 删掉后 trCacheSet 会立刻写回一份干净缓存，所以判「删过」而不是「键不存在」 */
    ok('★ [vm] 存着原文回显的老缓存被整份删除',
      c._removed === 'n26:lyric:tr:T1');
    ok('★ [vm] 作废后重新请求，拿到真中文而不是从缓存拿回英文',
      c._calls.length >= 1 && c._lines[0].tr === CN);
    ok('★ [vm] 新写的缓存里没有回显', (function () {
      const raw = c._store['n26:lyric:tr:T1'];
      if (!raw) return false;
      const arr = JSON.parse(raw).lines;
      return arr.every(function (v) { return !v || v === CN; });
    })());
  }

  /* 3.6 trNeeded 不被中文元信息带偏 */
  {
    const c = makeCtx(); boot(c);
    const withMeta = [
      { text: '作词 : 许嵩', tr: '' }, { text: '作曲 : 许嵩', tr: '' },
      { text: '编曲 : 许嵩', tr: '' }, { text: '制作人 : 许嵩', tr: '' },
      { text: 'Yesterday, all my troubles seemed so far away', tr: '' }
    ];
    ok('★ [vm] 开头四行中文元信息不会把英文歌误判成中文歌',
      c.trNeeded(withMeta) === true && c.trNeeded([{ text: '天空好想下雨', tr: '' }]) === false);
    const batches = c.trBatches(withMeta);
    ok('★ [vm] 分批跳过元信息，只送 1 句真歌词',
      batches.length === 1 && batches[0].length === 1 &&
      batches[0][0].text.indexOf('Yesterday') === 0);
  }

  console.log('\nPASS ' + PASS + '  FAIL ' + FAIL);
  if (FAIL === 0) console.log('verify-n26-307 全绿');
  process.exit(FAIL === 0 ? 0 : 1);
})();
