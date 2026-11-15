/* ==========================================================================
   ui/n26-widget-music-legacy.js · 戳 ml4 · 2026-11-14
   --------------------------------------------------------------------------
   ★ 用户原话：「音乐小组件你还是去那个 GitHub 上面找……那个音乐小组件是我最
     满意的，专门单独把那个音乐小组件的代码复制粘贴一下，就复制那个 2×2 的
     音乐小组件播放的那个就可以，另外的音乐小组件照着去做。」

   来源（已核对）：
     remote  https://github.com/xiaofangstudio/Nexus-OS-26
     HEAD    d71b82112160faed4a2d22a5e1f4b1306ef82e13
     文件    _github-Nexus-OS-26/export-main/Nexus OS 26.html
     区间    renderMusicWidget(settings) 50804-50896，其中 2×2 分支 50846-50854
     校验    该区间与当前工作区主壳 50804-50896 逐字节相同（6588 chars）。

   ★ 结论：老版那段 JS 从来没丢，主壳现在仍是原文。被改掉的是后来叠上来的
     CSS —— n26-widget-redesign.css §6.4b / §8.4 把「圆角封面 + 下面一行曲名
     + 一个播放键 + 底边 2px 进度」改成了「封面负 margin 铺满整卡 + 底部
     40px 渐变压字」。所以本模块做两件事：
       ① 把老版 2×2 分支**单独逐字复制**成一个独立渲染器，通过主壳现成的
          window.N26W2 扩展钩子接管 music 的 2×2 / 1×1 / 2×1 档；
       ② 其余尺寸与其它 4 个音乐小组件仍走原渲染器，由
          ui/n26-widget-music-legacy.css 统一对齐到这套深色唱片语言。
     主壳业务逻辑零改动，只多 1 个 <link> + 1 个 <script>。

   ★ 11-14 修订：卡面的视觉权威已换成 ui/n26-widget-music-legacy.css 的 ml4
     （中性磨砂玻璃 + 中性白高光 + 昼墨夜白），不再是深蓝唱片面。本 JS 的
     渲染结果不变：2×2 分支与主壳 renderMusicWidget 的 2×2 分支逐字一致，
     尺寸密度仍由主壳渲染器按 cols/rows 给不同 DOM，本模块只负责接管小档。

   ★ 依赖说明：MEDIA_META / N26_NO_DRAG / widgetMediaState / widgetMusicState
     是主壳大内联 script 的顶层 const —— classic script 之间按**裸名**共享，
     不是 window 属性，所以这里保留原文的裸名写法，不改成 window.XXX。
     readMediaNow / n26mCoverHTML 等是顶层 function 声明，裸名同样可达。
     任何依赖缺失时由 renderWidgetContent 的 try/catch 自动回落旧实现。
   ========================================================================== */
(function () {
    'use strict';
    if (window.N26MusicLegacy) return;

    /* ----------------------------------------------------------------------
       逐字复制开始 · GitHub main d71b821 / 50806-50833 + 50846-50854
       只把函数名换掉，其余（含注释、拼接顺序、id、onclick）一字未动。
       ---------------------------------------------------------------------- */
    function renderLegacyMini(settings) {
        settings = settings || {};
        var sel = readMediaNow();
        var src = sel ? sel.src : 'music';
        var M = MEDIA_META[src] || MEDIA_META.music;
        var d = (sel && sel.data) || {};
        var has = !!sel;
        var playing = sel ? !!sel.playing : false;
        var pct = has ? Math.max(0, Math.min(100, mediaEstimated(sel))) : 0;
        var cover = String(d.cover || '');
        var art = (src === 'music' && cover) ? n26mUrl(cover) : '';
        var ttl = has ? mediaTitle(sel) : '未在播放';
        var playIcon = playing ? 'pause' : 'play';
        widgetMediaState.src = src;
        widgetMediaState.live = sel ? !!sel.live : false;
        widgetMediaState.coverKey = has ? (src + '|' + cover) : '';
        widgetMusicState.hasNow = has;
        widgetMusicState.playing = playing;

        var rootStyle = art ? ' style="--n26-music-art:url(\'' + art + '\')"' : '';
        var rootCls = 'nx nx-mu' + (art ? ' has-art' : '');
        var bg = '<div class="nx-mu-bg"></div>';
        var bar = '<span class="nx-mu-prog"><i id="widgetMusicProgress" style="width:' + pct.toFixed(1) + '%"></i></span>';

        /* 2×2：只有封面 + 一行曲名 + 一个播放键 */
        return '<div class="' + rootCls + ' is-mini" ' + N26_NO_DRAG + rootStyle + '>' + bg
            + '<div class="nx-mu-cover is-mini-cv" id="widgetMusicCover">' + n26mCoverHTML(sel) + '</div>'
            + '<div class="nx-mu-mini-row">'
            + '<b class="nx-mu-tt" id="widgetMusicSong">' + n26Esc(ttl) + '</b>'
            + '<button type="button" class="nx-mu-btn is-play sm" id="widgetMusicPlayBtn" onclick="widgetMusicCmd(\'toggle\', event)" title="播放/暂停"><i class="fas fa-' + playIcon + '"></i></button>'
            + '</div>' + bar + '</div>';
    }
    /* 逐字复制结束 -------------------------------------------------------- */

    /* 2×2 及其以下（1×1 / 2×1 的方正小档）走老版；胶囊档与中/大档仍走主壳原文。
       注意：必须直接调 renderMusicWidget 本体，不能调 renderWidgetContent，
       否则会再进 N26W2.music 造成自递归。 */
    function music(settings) {
        var c = Number(settings && settings.__cols) || 2;
        var r = Number(settings && settings.__rows) || 2;   /* drw4：默认回到用户钦定的 2×2 */
        if (r !== 1 && c <= 2 && r <= 2) return renderLegacyMini(settings);
        return renderMusicWidget(settings);
    }

    var W2 = window.N26W2 || (window.N26W2 = {});
    W2.music = music;

    window.N26MusicLegacy = {
        renderMini: renderLegacyMini,
        source: 'github.com/xiaofangstudio/Nexus-OS-26@d71b821 · export-main 50846-50854'
    };
})();
