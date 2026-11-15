/* ============================================================================
   Nexus OS 26 · AI 省钱层 · frg1
   ----------------------------------------------------------------------------
   为什么有这一层（用户原话）：
     「AI 小方太耗钱了……问它两个问题，给最便宜的 Deepseek 都给烧穿了，
       20 块钱没了，我严重怀疑它是直接给整个网页源代码喂进去了，
       应该只需要喂用户输入就行。网页源代码这些的话，应该由 FangClaw 去解决，
       而且 FangClaw 也是一个好端端的 Agent 产品，也需要有缓存命中之类的。」

   本层负责四件事，其它层只管调：
     1. 出站净化   —— 发出去的 messages 逐条过白名单，剥 dataURL / base64 /
                      script / style / 整页源码，并按角色给硬上限。
     2. 稳定前缀   —— system 提示词永远第一条、字节不变、不含动态日期，
                      工具定义按名字排序后序列化；这是 prompt cache 命中的前提。
     3. 本地缓存   —— 同一份「模型 + 消息」30 分钟内重问，直接回本地结果，
                      一次请求都不发。
     4. 真实记账   —— 从响应里的 usage 读 prompt / completion /
                      prompt_cache_hit_tokens（兼容 OpenAI 的
                      prompt_tokens_details.cached_tokens），写进按天账本，
                      给出命中率。这是唯一能自证「缓存到底有没有生效」的东西。

   纪律：
     - 不改主壳业务，不接管 fetch，不注入 DOM。
     - 零 MutationObserver / 零 requestAnimationFrame 循环 / 零常驻定时器。
     - file:// 下 localStorage 可能抛异常，全部 try 包住。
     - 同一份文件在宿主和 iframe 里都能跑（_app.js / _theme-adapter.js 会带进来）。
   ============================================================================ */
(function (global) {
    'use strict';

    var VERSION = 'frg1';

    var LIMIT = {
        system: 1800,   /* system 提示词字符上限：一行都不能多付一次全价 */
        user: 2000,     /* 单条用户输入 */
        assistant: 900, /* 单条模型回复回填 */
        tool: 300,      /* 工具结果 */
        total: 5600,    /* 整包字符上限 ≈ 3500 token 输入 */
        turns: 6,       /* 最多保留的轮次数 */
        depth: 4,
        fields: 48,
        arr: 32
    };

    var CACHE_KEY = 'n26:ai:cache';
    var USAGE_KEY = 'n26:ai:usage';
    var CACHE_TTL = 30 * 60 * 1000;
    var CACHE_MAX = 24;

    function lsGet(k) {
        try { return global.localStorage.getItem(k); } catch (e) { return null; }
    }
    function lsSet(k, v) {
        try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; }
    }
    function lsDel(k) {
        try { global.localStorage.removeItem(k); } catch (e) { }
    }
    function sz(s) { return typeof s === 'string' ? s.length : 0; }

    /* ------------------------------------------------------------------
       1 · 出站净化
       ------------------------------------------------------------------ */

    /* base64 图片 / 二进制：一条就能顶几十万 token，任何字段里出现都清掉 */
    function stripData(s) {
        if (!s) return '';
        s = s.replace(/data:[a-z0-9.+\/-]{0,64};base64,[A-Za-z0-9+\/=]{80,}/gi, '[图片数据已省略]');
        /* 超长且几乎全是 base64 字符集的可疑串 */
        s = s.replace(/[A-Za-z0-9+\/=]{2000,}/g, function (m) {
            return /^[A-Za-z0-9+\/=]+$/.test(m) ? '[疑似二进制数据已省略 ' + Math.round(m.length / 1024) + 'KB]' : m;
        });
        return s;
    }

    /* 判断这段文本到底是不是「标记语言」。
       不能只看长度——一段 200 字的 HTML 片段照样能把 token 顶穿；
       也不能只看有没有尖括号——用户问「a < b 怎么写」不是源码。
       判据：真标签 ≥3 个，或命中常见块级 / 脚本标签名。 */
    function looksLikeMarkup(s) {
        if (!s) return false;
        var tags = s.match(/<\/?[a-zA-Z][a-zA-Z0-9-]{0,12}(?:\s[^<>]{0,300})?\/?>/g);
        if (!tags) return false;
        if (tags.length >= 3) return true;
        return /<\/?(?:html|head|body|script|style|div|span|table|ul|ol|li|img|svg|section|nav|header|footer|meta|link|input|button|iframe|template)\b/i.test(s);
    }

    /* 整页源码 / HTML 片段：只对「上下文类」内容下手，不动用户自己输入的内容
       （用户可能就是在问一段代码，替他删掉才是错的） */
    function stripSource(s) {
        if (!s || !looksLikeMarkup(s)) return s;
        var t = s
            .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' ');
        /* 确认过是「源码形态」才把标签也剥掉，纯文本里的 < > 不动 */
        t = t.replace(/<[^>]{1,600}>/g, ' ')
            .replace(/[ \t\u00a0]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return t;
    }

    /* 结构化值递归净化：工具返回的 JSON 常常带着整棵文件树 / 设置对象 */
    function cleanValue(v, depth) {
        depth = depth || 0;
        if (v == null) return v;
        if (typeof v === 'string') {
            var s = stripSource(stripData(v));
            return s.length > 400 ? s.slice(0, 400) + '…[已压缩]' : s;
        }
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        if (Array.isArray(v)) {
            var a = [], i;
            for (i = 0; i < v.length && i < LIMIT.arr; i++) a.push(cleanValue(v[i], depth + 1));
            if (v.length > LIMIT.arr) a.push('…还有 ' + (v.length - LIMIT.arr) + ' 项');
            return a;
        }
        if (typeof v === 'object') {
            if (depth >= LIMIT.depth) return '[层级过深]';
            var o = {}, n = 0, k;
            for (k in v) {
                if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
                if (++n > LIMIT.fields) { o['…'] = '[字段过多]'; break; }
                o[k] = cleanValue(v[k], depth + 1);
            }
            return o;
        }
        return String(v);
    }

    /* 上下文片段（页面内容、工具结果、文件正文）统一入口：
       剥源码 + 剥 dataURL + 压到 n 字符。这是「网页源码不该进模型」的唯一闸口。 */
    function cleanContext(value, maxChars) {
        maxChars = maxChars || 600;
        var s;
        try {
            s = (typeof value === 'string') ? value : JSON.stringify(cleanValue(value, 0));
        } catch (e) {
            s = String(value);
        }
        if (s == null) return '';
        s = stripSource(stripData(s));
        if (s.length > maxChars) s = s.slice(0, maxChars) + '…[已截断]';
        return s;
    }

    /* 用户本轮输入：只剥 dataURL 与封顶，绝不剥 HTML / 代码（他在问这个） */
    function cleanUserText(text) {
        var s = stripData(String(text == null ? '' : text));
        if (s.length > LIMIT.user) s = s.slice(0, LIMIT.user) + '…[输入过长已截断]';
        return s;
    }

    /* -------- messages 白名单 --------
       只放行 role / content / tool_calls / tool_call_id / name，
       其余字段一律丢弃（历史里混进过整个设置对象的副本，就是这么烧起来的）。 */
    function guardMessages(messages, opts) {
        opts = opts || {};
        var lim = {
            system: opts.system || LIMIT.system,
            user: opts.user || LIMIT.user,
            assistant: opts.assistant || LIMIT.assistant,
            tool: opts.tool || LIMIT.tool
        };
        if (!Array.isArray(messages)) return [];
        var out = [], sys = null, rest = [];

        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (!m || typeof m !== 'object') continue;
            var role = m.role;
            if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') continue;

            var isSystem = (role === 'system');
            var cap = lim[role] || 600;
            var c = m.content;

            if (c != null) {
                if (isSystem) {
                    /* system 只清 dataURL，不剥 HTML（提示词里出现尖括号是正常的） */
                    c = stripData(String(c));
                } else if (role === 'tool') {
                    c = cleanContext(c, cap);
                } else if (role === 'user') {
                    c = cleanUserText(String(c));
                    if (c.length > cap) c = c.slice(0, cap) + '…';
                } else {
                    c = stripData(String(c));
                    if (c.length > cap) c = c.slice(0, cap) + '…[已压缩]';
                }
                if (isSystem && c.length > lim.system) c = c.slice(0, lim.system) + '…';
            }

            var o = { role: role, content: (c == null ? '' : c) };
            if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
                o.tool_calls = m.tool_calls.slice(0, 4).map(function (tc) {
                    var f = (tc && tc.function) || {};
                    var args = String(f.arguments == null ? '{}' : f.arguments);
                    if (args.length > 400) args = args.slice(0, 400) + '…';
                    return {
                        id: tc && tc.id,
                        type: 'function',
                        function: { name: String(f.name || ''), arguments: args }
                    };
                });
            }
            if (role === 'tool' && m.tool_call_id) o.tool_call_id = m.tool_call_id;
            if (m.name) o.name = String(m.name);

            if (isSystem) { if (!sys) sys = o; }
            else rest.push(o);
        }

        /* system 恒在第一位且唯一：多条 system 合并，保证前缀字节稳定 */
        var list = sys ? [sys].concat(rest) : rest;

        /* 只留最近 turns 条（system 不动），再从最早的一条开始丢到总预算内 */
        var budget = opts.total || LIMIT.total;
        var turns = opts.turns || LIMIT.turns;
        if (list.length > turns + 1) {
            var head = sys ? list[0] : null;
            var tail = list.slice(list.length - turns);
            list = head ? [head].concat(tail) : tail;
        }
        var total = 0, j;
        for (j = 0; j < list.length; j++) total += sz(list[j].content);
        while (total > budget && list.length > 2) {
            total -= sz(list[1].content);
            list.splice(1, 1);
        }
        /* 丢完整条之后可能留下「孤儿 tool」——它的 assistant tool_calls 已经被丢了，
           这种消息发出去会被接口判 400。整段前缀一起清掉，宁少不多。 */
        while (list.length > 1 && list[1].role === 'tool') list.splice(1, 1);
        return list;
    }

    /* ------------------------------------------------------------------
       2 · 稳定前缀：工具定义按名字排序后序列化
       prompt cache 按「前缀字节」命中，函数顺序抖一次就全 miss
       ------------------------------------------------------------------ */
    function stableTools(tools) {
        if (!Array.isArray(tools) || !tools.length) return null;
        var copy = tools.slice().sort(function (a, b) {
            var an = (a && a.function && a.function.name) || '';
            var bn = (b && b.function && b.function.name) || '';
            return an < bn ? -1 : (an > bn ? 1 : 0);
        });
        return copy;
    }

    /* ------------------------------------------------------------------
       3 · 本地响应缓存：同问不重发
       ------------------------------------------------------------------ */
    function readCache() {
        var raw = lsGet(CACHE_KEY);
        var arr = null;
        try { arr = JSON.parse(raw || '[]'); } catch (e) { arr = null; }
        if (!Array.isArray(arr)) arr = [];
        var now = Date.now(), keep = [];
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (it && it.k && typeof it.t === 'string' && (now - (it.at || 0)) < CACHE_TTL) keep.push(it);
        }
        return keep;
    }

    /* djb2：只做本地键，不参与任何加密用途 */
    function hash(str) {
        var h = 5381, i;
        for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }

    function cacheKey(model, messages, extra) {
        var basis = String(model || '') + '|' + JSON.stringify(messages || []) + '|' + String(extra || '');
        return hash(basis) + ':' + basis.length;
    }

    function cacheGet(key) {
        if (!key) return null;
        var arr = readCache();
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].k === key) return arr[i].t;
        }
        return null;
    }

    function cacheSet(key, text) {
        if (!key || typeof text !== 'string' || !text) return false;
        var arr = readCache();
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].k === key) { arr[i].at = Date.now(); arr[i].t = text; lsSet(CACHE_KEY, JSON.stringify(arr)); return true; }
        }
        arr.push({ k: key, t: text, at: Date.now() });
        if (arr.length > CACHE_MAX) arr = arr.slice(arr.length - CACHE_MAX);
        return lsSet(CACHE_KEY, JSON.stringify(arr));
    }

    function cacheClear() {
        lsDel(CACHE_KEY);
        return true;
    }

    /* ------------------------------------------------------------------
       4 · 真实记账：只认 API 自己吐的 usage，不猜
       ------------------------------------------------------------------ */
    function today() {
        var d = new Date();
        var m = d.getMonth() + 1, dd = d.getDate();
        return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
    }

    function readUsage() {
        var v = null;
        try { v = JSON.parse(lsGet(USAGE_KEY) || 'null'); } catch (e) { v = null; }
        if (!v || v.date !== today()) {
            v = { date: today(), prompt: 0, completion: 0, hit: 0, miss: 0, calls: 0, cached: 0 };
        }
        return v;
    }

    /* 从响应体里抽用量；兼容 DeepSeek（prompt_cache_hit_tokens / miss）
       与 OpenAI 系（prompt_tokens_details.cached_tokens） */
    function pickUsage(json) {
        var u = (json && json.usage) || null;
        if (!u) return null;
        var prompt = Number(u.prompt_tokens != null ? u.prompt_tokens : u.input_tokens) || 0;
        var completion = Number(u.completion_tokens != null ? u.completion_tokens : u.output_tokens) || 0;
        var hit = Number(u.prompt_cache_hit_tokens) || 0;
        var miss = Number(u.prompt_cache_miss_tokens) || 0;
        if (!hit && u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens != null) {
            hit = Number(u.prompt_tokens_details.cached_tokens) || 0;
        }
        if (!hit && u.cached_tokens != null) hit = Number(u.cached_tokens) || 0;
        if (!miss && prompt) miss = Math.max(0, prompt - hit);
        return { prompt: prompt, completion: completion, hit: hit, miss: miss };
    }

    /* 记一次调用。cached=true 表示本地命中、没发请求。 */
    function recordUsage(json, cached) {
        var v = readUsage();
        v.calls += 1;
        if (cached) {
            v.cached += 1;
            lsSet(USAGE_KEY, JSON.stringify(v));
            return v;
        }
        var p = pickUsage(json);
        if (p) {
            v.prompt += p.prompt;
            v.completion += p.completion;
            v.hit += p.hit;
            v.miss += p.miss;
        }
        lsSet(USAGE_KEY, JSON.stringify(v));
        /* 不再回写主壳那本「估算账」：coviAgentChat 自己已经按字符估过一次，
           这里再记一遍就是双份，止损线会提前误触发。真账只看这本。 */
        return v;
    }

    /* 命中率：本地缓存命中 + 上游前缀缓存命中，两个口径分开报，别混 */
    function stats() {
        var v = readUsage();
        var upTotal = v.hit + v.miss;
        return {
            date: v.date,
            calls: v.calls,
            localHits: v.cached,
            prompt: v.prompt,
            completion: v.completion,
            cacheHit: v.hit,
            cacheMiss: v.miss,
            promptHitRate: upTotal ? (v.hit / upTotal) : 0
        };
    }

    function resetStats() { lsDel(USAGE_KEY); return true; }

    /* ------------------------------------------------------------------
       5 · 页面摘要：给 FangClaw 用的「本地解析」，绝不发源码
       返回结构化短摘要（标题 / 应用名 / 小标题 / 可见正文前 600 字）
       ------------------------------------------------------------------ */
    function pageDigest() {
        var doc = global.document;
        if (!doc) return { title: '', app: '', headings: [], text: '' };
        function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

        var host = doc.getElementById('desktop');
        var scope = host || doc.body;
        var out = {
            title: String(doc.title || '').slice(0, 80),
            app: '',
            headings: [],
            text: ''
        };

        /* 当前活动窗口名（宿主） */
        try {
            var aw = doc.querySelector('.window.active .window-title, .window.focused .window-title');
            if (aw) out.app = txt(aw).slice(0, 40);
        } catch (e) { }

        /* 小标题（h1~h3 + 常见卡片标题），最多 10 条 */
        try {
            var hs = scope.querySelectorAll('h1, h2, h3, .widget-panel-header, .sec-title');
            for (var i = 0; i < hs.length && out.headings.length < 10; i++) {
                var t = txt(hs[i]);
                if (t && t.length <= 60) out.headings.push(t);
            }
        } catch (e) { }

        /* 可见正文：只取文字，不取标签；仍过一次源码净化 */
        try {
            var raw = String(scope.innerText || scope.textContent || '');
            out.text = cleanContext(raw, 600);
        } catch (e) { }

        return out;
    }

    /* 页面内检索：TreeWalker 一次性走文本节点，返回命中小段，不带标签 */
    function pageFind(query, limit) {
        limit = limit || 5;
        var q = String(query || '').trim();
        if (!q) return [];
        var doc = global.document;
        if (!doc || !doc.createTreeWalker) return [];
        var hits = [], node, guard = 0;
        try {
            var walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */, null, false);
            while ((node = walker.nextNode()) && hits.length < limit && guard < 20000) {
                guard++;
                var s = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
                if (s.length < 4) continue;
                var at = s.toLowerCase().indexOf(q.toLowerCase());
                if (at < 0) continue;
                var from = Math.max(0, at - 60);
                hits.push(s.slice(from, from + 160));
            }
        } catch (e) { }
        return hits;
    }

    /* ------------------------------------------------------------------
       对外
       ------------------------------------------------------------------ */
    var API = {
        version: VERSION,
        limit: LIMIT,

        /* 净化 */
        stripData: stripData,
        stripSource: stripSource,
        cleanContext: cleanContext,
        cleanUserText: cleanUserText,
        cleanValue: cleanValue,
        guardMessages: guardMessages,
        stableTools: stableTools,

        /* 缓存 */
        cacheKey: cacheKey,
        cacheGet: cacheGet,
        cacheSet: cacheSet,
        cacheClear: cacheClear,

        /* 记账 */
        recordUsage: recordUsage,
        pickUsage: pickUsage,
        stats: stats,
        resetStats: resetStats,

        /* 页面：交给 Agent 用，不进普通聊天 */
        pageDigest: pageDigest,
        pageFind: pageFind
    };

    /* 命名空间不覆盖：宿主先加载时保留既有方法 */
    var prev = global.N26Frugal;
    if (prev && typeof prev === 'object') {
        for (var k in prev) if (Object.prototype.hasOwnProperty.call(prev, k) && !(k in API)) API[k] = prev[k];
    }
    global.N26Frugal = API;

})(typeof window !== 'undefined' ? window : this);
