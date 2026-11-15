/* ============================================================================
   apps/_project-io.js · Nexus OS 26 v2.10.18
   统一「导入工程 / 导出工程」语义（加层不改层，不动三个打包产物的内部代码）

   · 导入工程 = 从本地电脑用 <input type="file"> 选文件，不从 Nexus OS 内部路径选
   · 导出工程 = Blob + <a download> 触发浏览器下载，不写回虚拟文件系统就算完
   · 覆盖 Strata / Reelix / Float IDE 三个 Tauri 移植应用
   · 三个页面只需在 body 末尾挂一行 <script src="../_project-io.js?v=pio2"></script>
   · v2.10.18：Reelix 接入实时 store，导出正在编辑的工程 + 新建/示例工程闭环
   ============================================================================ */
(function () {
  'use strict';

  var DEBUG = false;
  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, ['[N26ProjectIO]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function baseName(p) { return String(p || '').split(/[\\/]/).pop() || ''; }
  function safeName(name, fallback) {
    var n = baseName(name) || fallback || 'project';
    n = n.replace(/[^\w\u4e00-\u9fa5.\- ()（）]/g, '_').replace(/^\.+/, '');
    return n || fallback || 'project';
  }
  function mimeOf(name) {
    var ext = (String(name).split('.').pop() || '').toLowerCase();
    var map = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
      json: 'application/json;charset=utf-8', txt: 'text/plain;charset=utf-8',
      md: 'text/markdown;charset=utf-8', html: 'text/html;charset=utf-8',
      css: 'text/css;charset=utf-8', js: 'text/javascript;charset=utf-8',
      ts: 'text/plain;charset=utf-8', co: 'text/plain;charset=utf-8',
      cw: 'application/zip', zip: 'application/zip', pdf: 'application/pdf',
      strata: 'application/octet-stream', rlx: 'application/json;charset=utf-8'
    };
    return map[ext] || 'application/octet-stream';
  }

  /* ---------- 下载：浏览器原生 <a download> ---------- */
  function download(name, data, mime) {
    var fileName = safeName(name, 'project');
    var blob;
    if (data instanceof Blob) blob = data;
    else if (data instanceof Uint8Array) blob = new Blob([data], { type: mime || mimeOf(fileName) });
    else if (Array.isArray(data)) blob = new Blob([Uint8Array.from(data)], { type: mime || mimeOf(fileName) });
    else if (typeof data === 'string') blob = new Blob([data], { type: mime || mimeOf(fileName) });
    else blob = new Blob([JSON.stringify(data == null ? {} : data, null, 2)], { type: 'application/json;charset=utf-8' });
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      a.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
      (document.body || document.documentElement).appendChild(a);
      try { a.click(); } catch (e) {}
      setTimeout(function () {
        try { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); } catch (e) {}
      }, 6000);
      log('download', fileName, blob.size + 'B');
      return fileName;
    } catch (e) { log('download failed', e); return null; }
  }

  /* ---------- 选本地文件：浏览器原生 <input type="file"> ---------- */
  function pickFiles(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = !!opt.multiple;
      if (opt.accept) input.setAttribute('accept', String(opt.accept));
      if (opt.directory) { input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', ''); }
      input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      (document.body || document.documentElement).appendChild(input);
      var done = false;
      function finish(fs) {
        if (done) return;
        done = true;
        try { if (input.parentNode) input.parentNode.removeChild(input); } catch (e) {}
        resolve(fs || []);
      }
      input.onchange = function () { finish([].slice.call(input.files || [])); };
      input.addEventListener('cancel', function () { finish([]); });
      try { input.click(); } catch (e) { finish([]); }
    });
  }
  function readText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(r.error || new Error('读取失败')); };
      r.readAsText(file, 'UTF-8');
    });
  }
  function readBytes(file) {
    if (file.arrayBuffer) return file.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result || new ArrayBuffer(0))); };
      r.onerror = function () { reject(r.error || new Error('读取失败')); };
      r.readAsArrayBuffer(file);
    });
  }

  /* ---------- 应用内文件名输入（不用浏览器原生 prompt） ---------- */
  function askName(defaultName, title) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'padding:18px;background:rgba(6,10,20,.55);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      wrap.innerHTML =
        '<div style="width:min(370px,100%);box-sizing:border-box;background:#1c2230;color:#eef2f9;' +
        'border-radius:16px;padding:18px;box-shadow:0 26px 70px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12)">' +
          '<div style="font-size:14px;font-weight:700;margin-bottom:8px">' + esc(title || '导出文件') + '</div>' +
          '<div style="font-size:11.5px;line-height:1.65;color:rgba(226,232,240,.66);margin-bottom:12px">' +
          '文件会下载到这台电脑（浏览器的下载目录），不是在 Nexus OS 里另存一份。</div>' +
          '<input id="n26ioName" type="text" spellcheck="false" value="' + esc(defaultName || 'project.json') + '" ' +
          'style="width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;font:inherit;font-size:13px;' +
          'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#eef2f9;outline:none">' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">' +
            '<button id="n26ioCancel" style="padding:7px 14px;border-radius:9px;font:inherit;font-size:12.5px;cursor:pointer;' +
              'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#eef2f9">取消</button>' +
            '<button id="n26ioOk" style="padding:7px 16px;border-radius:9px;font:inherit;font-size:12.5px;cursor:pointer;' +
              'background:#38bdf8;border:1px solid #38bdf8;color:#04121e;font-weight:700">下载</button>' +
          '</div></div>';
      (document.body || document.documentElement).appendChild(wrap);
      var input = wrap.querySelector('#n26ioName');
      function close(v) { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) {} resolve(v); }
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(null); });
      wrap.querySelector('#n26ioCancel').addEventListener('click', function () { close(null); });
      wrap.querySelector('#n26ioOk').addEventListener('click', function () {
        close(safeName(input.value, 'project.json'));
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); close(safeName(input.value, 'project.json')); }
        else if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
      try { input.focus(); input.select(); } catch (e) {}
    });
  }

  /* =======================================================================
     Strata：pick() 已经是本地选文件，这里补齐三件事
       1. 提供 __TAURI_INTERNALS__（页面里原本只有调用、没有实现）
       2. read_file_bytes 从本地选中的 File 读回真实字节
       3. write_file_bytes 触发浏览器下载（导出 / 批量导出 / Droplet）
     ======================================================================= */
  function installStrata() {
    var T = window.__TAURI_INTERNALS__;
    if (!T) {
      T = window.__TAURI_INTERNALS__ = {
        transformCallback: function () { return 0; },
        metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
        invoke: function () { return Promise.resolve(undefined); }
      };
    }
    if (T.__n26IO) return;
    var base = T.invoke ? T.invoke.bind(T) : function () { return Promise.resolve(undefined); };
    T.__n26IO = 'strata';
    var pendingName = '';
    if (window.N26StrataIO && typeof window.N26StrataIO.save === 'function') {
      var origSave = window.N26StrataIO.save;
      window.N26StrataIO.save = function (o) {
        pendingName = (o && (o.defaultPath || o.defaultName)) || pendingName;
        return origSave.call(window.N26StrataIO, o);
      };
    }
    T.invoke = function (cmd, args) {
      args = args || {};
      if (cmd === 'write_file_bytes') {
        var nm = safeName(baseName(args.path) || baseName(pendingName) || 'untitled.png', 'untitled.png');
        var d = args.data;
        var bytes = (d instanceof Uint8Array) ? d : (Array.isArray(d) ? Uint8Array.from(d) : d);
        download(nm, bytes);
        return Promise.resolve(null);
      }
      if (cmd === 'read_file_bytes') {
        var p = String(args.path || '');
        var rec = (window.__n26StrataFiles || {})[p];
        if (rec && rec.file) return readBytes(rec.file).then(function (u8) { return Array.from(u8); });
        if (p.indexOf('blob:') === 0 && typeof fetch === 'function') {
          return fetch(p).then(function (r) { return r.arrayBuffer(); })
            .then(function (b) { return Array.from(new Uint8Array(b)); })
            .catch(function () { return []; });
        }
        return Promise.resolve([]);
      }
      if (cmd === 'files_stat') return Promise.resolve({ exists: false, size: 0, modified: null });
      return base(cmd, args);
    };
    log('Strata IO 就绪：导入走本地选文件，导出走浏览器下载');
  }

  /* =======================================================================
     Reelix：原 __TAURI_INTERNALS__.invoke 是空壳（一律返回 undefined），
     导致「打开工程 / 保存 / 另存为」点了没反应。这里补上最小真实闭环：
       · pick_project_file → 本地选 .json/.reelix 工程文件，读进内存
       · open_project     → 返回解析后的真实工程对象
       · pick_save_path   → 应用内输入文件名（不弹系统路径选择器）
       · save_project     → 序列化 + 浏览器下载
     v2.10.18：接上实时 store。Reelix 是 classic script，顶层 const L 与
     function aq 位于全局词法环境，用 Function() 在全局作用域求值即可读到，
     打包产物一行都不用改。这样「导出」拿到的是正在编辑的工程，而不是
     v2.10.17 那个「打开/新建时的静态快照」；get_project 同理，避免
     refreshProject 把编辑态冲回旧对象。
     ======================================================================= */
  function reelixState() {
    try {
      var store = Function('return typeof L !== "undefined" ? L : null')();
      if (store && typeof store.getState === 'function') return store.getState();
    } catch (e) { }
    return null;
  }
  function liveProject() {
    var st = reelixState();
    return st && st.project ? st.project : null;
  }
  function emptyLike(o, depth) {
    if (!o || typeof o !== 'object' || depth > 4) return o;
    if (Array.isArray(o)) return [];
    var r = {};
    Object.keys(o).forEach(function (k) { r[k] = emptyLike(o[k], depth + 1); });
    return r;
  }
  function blankProject(name, opt) {
    opt = opt || {};
    var sample = null, p = null;
    try {
      sample = Function('return typeof aq === "function" ? aq() : null')();
      if (sample && typeof sample === 'object') p = JSON.parse(JSON.stringify(sample));
    } catch (e) { p = null; }
    if (!p) p = { sequences: [], assets: [], bins: [], markers: [], effects: {} };
    var rawSeq = sample && Array.isArray(sample.sequences) ? sample.sequences[0] : null;
    var seq = rawSeq ? emptyLike(rawSeq, 0) : {};
    seq.id = 'seq-' + Date.now();
    seq.name = '序列 1';
    seq.tracks = [];
    p = emptyLike(p, 0);
    ['assets', 'bins', 'markers', 'renderQueue'].forEach(function (k) { p[k] = []; });
    p.sequences = [seq];
    p.name = String(name || '未命名项目');
    p.width = opt.width || 1920;
    p.height = opt.height || 1080;
    p.frameRate = opt.frameRate || 25;
    return p;
  }

  function installReelix() {
    var T = window.__TAURI_INTERNALS__;
    if (!T) return;
    if (T.__n26IO) return;
    var base = T.invoke ? T.invoke.bind(T) : function () { return Promise.resolve(undefined); };
    T.__n26IO = 'reelix';
    var imported = {};       // 标记路径 -> 工程文件原文
    var project = null;      // 兜底工程对象（实时态取不到时才用）
    var projName = 'untitled.reelix.json';

    T.invoke = function (cmd, args) {
      args = args || {};
      switch (cmd) {
        case 'pick_project_file':
          return pickFiles({ multiple: false, accept: '.json,.reelix,.rlx,.txt' }).then(function (fs) {
            if (!fs.length) return null;
            var f = fs[0];
            return readText(f).then(function (text) {
              var key = 'n26:/' + f.name;
              imported[key] = text;
              projName = f.name;
              return key;
            });
          });
        case 'open_project': {
          var text = imported[String(args.path || '')];
          if (!text) return Promise.resolve(null);
          try {
            project = JSON.parse(text);
            if (project && project.__n26Export) delete project.__n26Export;
            return Promise.resolve(project);
          } catch (e) {
            return Promise.reject(new Error('工程文件不是有效的 JSON：' + e.message));
          }
        }
        case 'pick_save_path':
          return askName(String(args.defaultName || projName), '导出 Reelix 工程').then(function (name) {
            if (!name) return null;
            projName = name;
            return 'n26:/导出/' + name;
          });
        case 'save_project': {
          var outName = safeName(baseName(args.path) || projName, 'untitled.reelix.json');
          // ★ 导出的是正在编辑的工程，不是打开/新建时的静态快照
          var body = liveProject() || project || {};
          project = body;
          var payload = Object.assign({}, body, {
            __n26Export: { from: 'Nexus OS 26 · Reelix', exportedAt: new Date().toISOString(), live: !!liveProject() }
          });
          download(outName, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
          return Promise.resolve({ path: 'n26:/导出/' + outName });
        }
        case 'get_project': return Promise.resolve(liveProject() || project);
        case 'get_project_path': return Promise.resolve((liveProject() || project) ? 'n26:/导出/' + projName : null);
        case 'project_is_dirty':
          // 浏览器下载语义下自动保存会反复弹下载框，故意恒 false；
          // 手动「保存 / 另存为」才是唯一的导出下载入口。
          return Promise.resolve(false);
        case 'new_project': {
          project = blankProject(args.name, args);
          projName = project.name + '.reelix.json';
          return Promise.resolve(project);
        }
        case 'write_text_file':
          imported[String(args.path || '')] = String(args.contents == null ? '' : args.contents);
          return Promise.resolve(true);
        case 'read_text_file':
          return Promise.resolve(imported[String(args.path || '')] || null);
        case 'home_dir': return Promise.resolve('n26:/');
        case 'close_project': project = null; return Promise.resolve(true);
        case 'pick_media_files':
          return pickFiles({ multiple: true, accept: 'video/*,audio/*,image/*' }).then(function (fs) {
            return fs.map(function (f) {
              var u = URL.createObjectURL(f);
              (window.__n26ReelixMedia || (window.__n26ReelixMedia = {}))[u] = f;
              return u;
            });
          });
        default:
          return base(cmd, args);
      }
    };
    log('Reelix IO 就绪：打开工程走本地选文件，保存/另存为走浏览器下载');
  }

  /* =======================================================================
     Float IDE：自带完整 shim，导入（pick_folder / pick_open_file）与
     project_export_zip 本来就是本地选文件 + 下载。只需修正「另存为」语义：
       · 旧 saveAs 在没有默认名时会让用户去挑一个「已存在的文件」当目标
       · 现在改成应用内输入文件名 → 返回导出标记路径 → 写该文件时触发下载
     ======================================================================= */
  function installFloat() {
    var T = window.__TAURI_INTERNALS__;
    if (!T || !T.invoke || T.__n26IO) return;
    var base = T.invoke.bind(T);
    T.__n26IO = 'float';

    T.invoke = function (cmd, args) {
      args = args || {};
      if (cmd === 'pick_save_file' || cmd === 'plugin:dialog|save') {
        var opts = (cmd === 'plugin:dialog|save') ? (args.options || args || {}) : args;
        var def = safeName(opts.defaultName || opts.defaultPath || 'untitled.txt', 'untitled.txt');
        return askName(def, '另存为 / 导出文件').then(function (name) {
          return name ? 'n26:/导出/' + name : null;
        });
      }
      if ((cmd === 'fs_write' || cmd === 'fs_write_checked' ||
           cmd === 'plugin:fs|writeTextFile' || cmd === 'plugin:fs|write_file' ||
           cmd === 'plugin:fs|writeFile') &&
          String(args.path || '').indexOf('n26:/导出/') === 0) {
        var nm = safeName(baseName(args.path), 'untitled.txt');
        var content = args.contents != null ? args.contents : (args.data != null ? args.data : '');
        download(nm, String(content));
      }
      return base(cmd, args);
    };
    log('Float IO 就绪：另存为改文件名输入 + 下载，导入仍走本地选文件');
  }

  /* ---------- 按页面路由，只装一套 ---------- */
  var p = String(location.pathname || '').replace(/\\/g, '/');
  try {
    if (p.indexOf('/strata/') >= 0) installStrata();
    else if (p.indexOf('/reelix/') >= 0) installReelix();
    else if (p.indexOf('/float/') >= 0) installFloat();
    else log('未匹配的页面，跳过', p);
  } catch (e) { log('安装失败', e); }

  window.N26ProjectIO = {
    version: '1.1-v2.10.18',
    download: download,
    pickFiles: pickFiles,
    readText: readText,
    readBytes: readBytes,
    askName: askName,
    safeName: safeName
  };
})();
