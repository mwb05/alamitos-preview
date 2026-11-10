// HR Site Editor — see index.html. Plain JS, no build step.
//
// Two screens, picked by the URL hash:
//   #               the site cards + "who are you" (name and access code, kept in this browser)
//   #<siteId>       the editor for that site: the live site in a frame, pins, the edits panel
//
// The frame is same-origin (this page and both sites live on mwb05.github.io), so the page can
// read and decorate the site's document exactly like the Jarvis Site Editor does through its
// proxy. Every edit is saved to Jarvis the moment it is added ("Add edit"), so Matt sees it too;
// "Submit" turns the pending ones into a batch that Jarvis applies and publishes.
(function () {
  'use strict';

  // ── config ──────────────────────────────────────────────────────────────────────────────────
  // Jarvis's public front door (Tailscale Funnel → houses-edge → /api/site-editor/hr).
  // A different address can be pasted on the home screen (kept in this browser) if this one moves.
  var DEFAULT_API = 'https://gmktec-jarvis.tail8696fc.ts.net:10000';
  var SITES = [
    { id: 'alamitosgroup', title: 'Alamitos Group', blurb: 'The Alamitos Group site (Jiffy Lube).', liveUrl: 'https://mwb05.github.io/alamitos-preview/', accent: '#c8102e' },
    { id: 'goldenwest', title: 'Golden West Tire Centers', blurb: 'The Golden West Tire Centers site (Big O Tires).', liveUrl: 'https://mwb05.github.io/goldenwest-preview/', accent: '#ed0c0e' },
  ];
  var STATUS = {
    pending: { label: 'Pending', cls: 'pend' },
    in_progress: { label: 'In progress', cls: 'prog' },
    done: { label: 'Done', cls: 'done' },
    failed: { label: 'Failed', cls: 'fail' },
    rejected: { label: 'Rejected', cls: 'fail' },
  };
  var TABS = [['all', 'All'], ['pending', 'Pending'], ['in_progress', 'In progress'], ['done', 'Done'], ['failed', 'Failed']];
  var INLINE_TAGS = { SPAN: 1, STRONG: 1, EM: 1, B: 1, I: 1, SMALL: 1, SUP: 1, SUB: 1, MARK: 1, ABBR: 1 };
  var FRAME_STYLE = '.jse-hover{outline:2px dashed #ff8a00!important;outline-offset:2px!important;cursor:crosshair!important}'
    + '.jse-pin{outline:3px solid #ff3b7a!important;outline-offset:2px!important}'
    + '.jse-flash{animation:jseFlash 1.6s ease-out 1}'
    + '.jse-editing{outline:2px solid #2f7cff!important;outline-offset:2px!important;background:rgba(47,124,255,.08)!important}'
    + '@keyframes jseFlash{0%{box-shadow:0 0 0 6px rgba(255,59,122,.7)}100%{box-shadow:0 0 0 0 rgba(255,59,122,0)}}';

  // ── small helpers ───────────────────────────────────────────────────────────────────────────
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var norm = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  var cssEsc = function (s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'); };
  var store = {
    get: function (k) { try { return localStorage.getItem('hrse.' + k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { localStorage.setItem('hrse.' + k, v); } catch (e) {} },
  };
  function ago(iso) {
    if (!iso) return '';
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }
  function hostOf(u) { try { var x = new URL(u); return x.host + x.pathname.replace(/\/$/, ''); } catch (e) { return u; } }
  var toastTimer = 0;
  function say(t) {
    var el = $('#toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }
  function apiBase() { return (store.get('api') || DEFAULT_API).replace(/\/+$/, ''); }
  function siteById(id) { for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i]; return null; }

  // ── talking to Jarvis ───────────────────────────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'x-site-editor-code': store.get('code') };
    if (opts.body) headers['content-type'] = 'application/json';
    return fetch(apiBase() + '/api/site-editor/hr' + path, {
      method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    }, function () {
      throw new Error('Could not reach Jarvis. Check your internet, or ask Matt whether Jarvis is up.');
    });
  }

  // ── the element descriptions (same as the Jarvis Site Editor, so briefs read the same) ──────
  function cssPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
      if (node.tagName === 'BODY') { parts.unshift('body'); break; }
      if (node.id && /^[A-Za-z][\w:.-]*$/.test(node.id)) { parts.unshift('#' + cssEsc(node.id)); break; }
      var sel = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(sel);
      node = parent;
    }
    return parts.join(' > ');
  }
  function domPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node.tagName !== 'HTML' && node.tagName !== 'BODY') {
      var s = node.tagName.toLowerCase();
      if (node.id) s += '#' + node.id;
      else if (node.classList.length) s += '.' + Array.prototype.filter.call(node.classList, function (c) { return c.indexOf('jse-') !== 0 && c !== 'in'; }).slice(0, 2).join('.');
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function sectionOf(el) {
    var sec = el.closest('section, header, footer, nav, aside, article');
    if (!sec) return '';
    var tag = sec.tagName.toLowerCase();
    if (sec.id) return tag + '#' + sec.id;
    var labelled = sec.getAttribute('aria-labelledby');
    var h = (labelled && sec.ownerDocument.getElementById(labelled)) || sec.querySelector('h1, h2, h3');
    var title = h ? norm(h.textContent).slice(0, 60) : '';
    return title ? tag + ' "' + title + '"' : tag;
  }
  function pickTarget(t) {
    var el = t && t.nodeType === 3 ? t.parentElement : t;
    if (!el || el.nodeType !== 1) return null;
    if (INLINE_TAGS[el.tagName] && el.parentElement && el.parentElement.tagName !== 'BODY' && !el.id && !el.classList.length) el = el.parentElement;
    if (el.tagName === 'HTML' || el.tagName === 'BODY') return null;
    return el;
  }
  function describe(el, win) {
    var r = el.getBoundingClientRect();
    var img = el.tagName === 'IMG' ? el : (el.querySelector ? el.querySelector('img') : null);
    return {
      selector: cssPath(el), domPath: domPath(el), tag: el.tagName.toLowerCase(), section: sectionOf(el),
      text: norm(el.textContent).slice(0, 2000), html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 1200),
      rect: { x: Math.round(r.left + win.scrollX), y: Math.round(r.top + win.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      scrollY: Math.round(win.scrollY),
      src: img ? img.getAttribute('src') : null,
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
    };
  }
  var textOnly = function (el) { return el.children.length === 0 && norm(el.textContent).length > 0 && el.tagName !== 'IMG'; };

  // ── home screen ─────────────────────────────────────────────────────────────────────────────
  function renderHome() {
    stopEditor();
    var app = $('#app');
    app.className = 'app';
    app.innerHTML = ''
      + '<header class="home-head"><div class="title"><strong>Site Editor</strong><span>Pick a site to mark up and send edits for.</span></div></header>'
      + '<section class="who">'
      + '  <label class="field">Your name<input id="who-name" placeholder="e.g. Maria in HR" value="' + esc(store.get('name')) + '"></label>'
      + '  <label class="field">Access code (from Matt)<input id="who-code" placeholder="XXXX-XXXX" autocapitalize="characters" value="' + esc(store.get('code')) + '"></label>'
      + '  <div class="note">Your name goes on every edit so Matt knows who asked. The code is your own, from Matt; it is remembered on this device.</div>'
      + '</section>'
      + '<div id="home-err" class="err" hidden></div>'
      + '<main class="grid">' + SITES.map(function (s) {
        return '<button type="button" class="card" data-site="' + s.id + '" style="--card-accent:' + s.accent + '">'
          + '<span class="bar"></span><span class="name">' + esc(s.title) + '</span><span class="blurb">' + esc(s.blurb) + '</span>'
          + '<span class="url">' + esc(hostOf(s.liveUrl)) + '</span>'
          + '<span class="meta" id="meta-' + s.id + '"><i>Open edits: checking</i><b>Open editor &rarr;</b></span></button>';
      }).join('') + '</main>'
      + '<footer class="home-foot">How it works: open a site, click anything on it to pin a comment ("make this shorter", "swap this photo"), or double-click text to retype it in place. Add as many edits as you like, then press Submit. Exact text changes are applied straight away; anything else is done by Jarvis within the hour. Each edit shows Pending, In progress and Done as it goes.'
      + ' <span class="dim">Jarvis address: <a href="#" id="api-link">' + esc(hostOf(apiBase())) + '</a></span></footer>';

    $('#who-name').addEventListener('input', function (ev) { store.set('name', norm(ev.target.value)); });
    var codeTimer = 0;
    $('#who-code').addEventListener('input', function (ev) {
      store.set('code', ev.target.value.trim().toUpperCase());
      // A moment after they stop typing, ask Jarvis again with the new code.
      clearTimeout(codeTimer);
      codeTimer = setTimeout(loadHomeCounts, 600);
    });
    $('#api-link').addEventListener('click', function (ev) {
      ev.preventDefault();
      var v = window.prompt('Jarvis address (leave empty for the default):', store.get('api') || '');
      if (v === null) return;
      store.set('api', v.trim());
      renderHome();
    });
    $$('.card').forEach(function (c) {
      c.addEventListener('click', function () {
        if (!norm(store.get('name'))) { say('Type your name first.'); $('#who-name').focus(); return; }
        if (!store.get('code')) { say('Type the access code first.'); $('#who-code').focus(); return; }
        location.hash = '#' + c.getAttribute('data-site');
      });
    });
    loadHomeCounts();
  }

  /** The open-edit counts on the home cards, from Jarvis (needs the code). */
  function loadHomeCounts() {
    if (!$('#home-err')) return;
    if (!store.get('code')) {
      $$('.card .meta').forEach(function (m) { m.innerHTML = '<i>Enter the access code to see open edits</i><b>Open editor &rarr;</b>'; });
      return;
    }
    api('?list=1').then(function (j) {
      if (!$('#home-err')) return;
      $('#home-err').hidden = true;
      // Each person's code opens only their sites (Jose: Golden West only); hide the rest.
      var open = (j.sites || []).map(function (s) { return s.id; });
      $$('.card').forEach(function (c) { c.style.display = open.indexOf(c.getAttribute('data-site')) < 0 ? 'none' : ''; });
      if (j.you && !norm(store.get('name'))) { store.set('name', j.you); var n = $('#who-name'); if (n) n.value = j.you; }
      (j.sites || []).forEach(function (s) {
        var m = $('#meta-' + s.id);
        if (!m) return;
        var bits = [];
        if (s.pending) bits.push('<i class="pend">' + s.pending + ' pending</i>');
        if (s.inProgress) bits.push('<i class="prog">' + s.inProgress + ' in progress</i>');
        if (!bits.length) bits.push('<i>No open edits</i>');
        m.innerHTML = bits.join('') + '<b>Open editor &rarr;</b>';
      });
    }).catch(function (e) {
      var el = $('#home-err');
      if (!el) return;
      el.textContent = e.message; el.hidden = false;
      $$('.card .meta').forEach(function (m) { m.innerHTML = '<i>Open edits: unknown</i><b>Open editor &rarr;</b>'; });
    });
  }

  // ── editor screen ───────────────────────────────────────────────────────────────────────────
  var ed = null; // the editor's live state while one is open

  function stopEditor() {
    if (!ed) return;
    clearInterval(ed.poll);
    ed = null;
  }

  function renderEditor(site) {
    stopEditor();
    var narrow = window.matchMedia('(max-width: 720px)').matches;
    ed = {
      site: site, data: null, edits: [], editMode: true, viewport: narrow ? 'mobile' : 'desktop', framePath: '/', nonce: 0,
      draft: null, draftMode: 'comment', tab: 'all', open: null, panelOpen: !narrow, busy: false, pins: [],
      hover: null, editing: null, pendingJump: null, poll: 0, pollEvery: 15000, lastPoll: 0,
    };
    var app = $('#app');
    app.className = 'app editor';
    app.innerHTML = ''
      + '<header class="head">'
      + '  <button type="button" class="back" id="back" title="All sites" aria-label="Back to the site list">&larr;</button>'
      + '  <div class="title"><strong>Site Editor</strong><span id="sub">' + esc(site.title) + ' &middot; <a href="' + esc(site.liveUrl) + '" target="_blank" rel="noreferrer">live site</a> &middot; you are ' + esc(store.get('name')) + '</span></div>'
      + '  <div class="tools">'
      + '    <label class="toggle on" id="editmode"><input type="checkbox" checked><span>Edit mode</span></label>'
      + '    <div class="seg" role="group" aria-label="Frame size"><button type="button" data-vp="desktop">Desktop</button><button type="button" data-vp="mobile">Phone</button></div>'
      + '    <select class="pages" id="pages" aria-label="Page"><option value="/">Home</option></select>'
      + '    <button type="button" class="btn ghost" id="reload" title="Reload the frame">Reload</button>'
      + '    <button type="button" class="btn drawer-btn" id="drawer">Edits</button>'
      + '  </div>'
      + '</header>'
      + '<div id="err" class="err" hidden></div>'
      + '<div class="body">'
      + '  <div class="stage" id="stage">'
      + '    <div class="hint" id="hint"></div>'
      + '    <div class="framewrap" id="framewrap"><iframe class="frame" id="frame" title="' + esc(site.title) + '"></iframe><div id="pins"></div><div id="draft" class="draft" hidden></div></div>'
      + '  </div>'
      + '  <aside class="panel" id="panel">'
      + '    <div class="panel-top"><div class="tabs" id="tabs"></div><button type="button" class="btn submit" id="submit">Submit edits</button></div>'
      + '    <div id="batches"></div>'
      + '    <ul class="list" id="list"></ul>'
      + '    <div class="panel-foot" id="foot" hidden><button type="button" class="btn ghost" id="clear">Clear finished</button><span class="dim">Done edits are live on the site.</span></div>'
      + '  </aside>'
      + '</div>';

    $('#back').addEventListener('click', function () { location.hash = ''; });
    $('#editmode input').addEventListener('change', function (ev) {
      ed.editMode = ev.target.checked;
      $('#editmode').classList.toggle('on', ed.editMode);
      if (!ed.editMode) cancelDraft();
      renderHint();
    });
    $$('.seg [data-vp]').forEach(function (b) { b.addEventListener('click', function () { setViewport(b.getAttribute('data-vp')); }); });
    $('#pages').addEventListener('change', function (ev) { goTo(ev.target.value); });
    $('#reload').addEventListener('click', function () { loadFrame(); });
    $('#drawer').addEventListener('click', function () { setPanel(!ed.panelOpen); });
    $('#submit').addEventListener('click', submit);
    $('#clear').addEventListener('click', function () { post({ op: 'clear' }); });
    $('#frame').addEventListener('load', onFrameLoad);
    document.addEventListener('visibilitychange', visiblePoll);

    setViewport(ed.viewport);
    setPanel(ed.panelOpen);
    renderHint();
    renderTabs();
    loadFrame();
    load();
    ed.poll = setInterval(visiblePoll, 1000);
  }

  function renderHint() {
    var narrow = window.matchMedia('(max-width: 720px)').matches;
    $('#hint').textContent = ed.editMode
      ? (narrow ? 'Tap anything on the site to pin a comment on it. Double-tap text to retype it.' : 'Click anything on the site to pin a comment on it. Double-click text to retype it in place.')
      : 'Edit mode is off: the site works normally. Turn it on to pin edits.';
  }
  function setViewport(vp) {
    ed.viewport = vp;
    $$('.seg [data-vp]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-vp') === vp); });
    $('#framewrap').classList.toggle('phone', vp === 'mobile');
    setTimeout(refreshPins, 200);
  }
  function setPanel(open) {
    ed.panelOpen = open;
    $('#panel').classList.toggle('closed', !open);
    $('#stage').classList.toggle('parked', open && window.matchMedia('(max-width: 720px)').matches);
    renderDrawerBtn();
  }
  function renderDrawerBtn() {
    var n = ed.edits.filter(function (e) { return e.status === 'pending'; }).length;
    $('#drawer').textContent = ed.panelOpen ? 'Site' : ('Edits (' + n + ')');
  }

  // ── data ────────────────────────────────────────────────────────────────────────────────────
  function visiblePoll() {
    if (!ed || document.visibilityState !== 'visible') return;
    if (Date.now() - ed.lastPoll < ed.pollEvery) return;
    load();
  }
  function load() {
    if (!ed) return;
    var site = ed.site;
    ed.lastPoll = Date.now();
    return api('?site=' + encodeURIComponent(site.id)).then(function (j) {
      if (!ed || ed.site !== site) return;
      ed.data = j; ed.edits = j.edits || [];
      var running = (j.batches || []).some(function (b) { return b.status === 'running'; });
      var applying = (j.batches || []).some(function (b) { return b.status === 'running' && !b.waitingLive; });
      ed.pollEvery = applying ? 4000 : (running ? 10000 : 15000);
      $('#err').hidden = true;
      renderPages();
      renderPanel();
      refreshPins();
    }).catch(function (e) {
      if (!ed) return;
      var el = $('#err');
      el.textContent = e.message + (e.status === 401 ? ' Go back and check the access code.' : ''); el.hidden = false;
    });
  }
  function post(payload) {
    if (!ed) return Promise.resolve(null);
    ed.busy = true; renderButtons();
    var body = { site: ed.site.id, by: norm(store.get('name')) };
    for (var k in payload) body[k] = payload[k];
    return api('', { method: 'POST', body: body }).then(function (j) {
      return load().then(function () { return j; });
    }).catch(function (e) { say(e.message); return null; })
      .then(function (j) { if (ed) { ed.busy = false; renderButtons(); } return j; });
  }
  function renderButtons() {
    var pending = ed.edits.filter(function (e) { return e.status === 'pending'; }).length;
    var running = (ed.data && ed.data.batches || []).some(function (b) { return b.status === 'running'; });
    var b = $('#submit');
    b.disabled = ed.busy || running || !pending;
    b.textContent = running ? 'Applying…' : ('Submit ' + (pending ? pending + ' edit' + (pending === 1 ? '' : 's') : 'edits'));
    $('#clear').disabled = ed.busy;
  }

  // ── the frame ───────────────────────────────────────────────────────────────────────────────
  function liveBasePath() { return new URL(ed.site.liveUrl).pathname.replace(/\/?$/, '/'); }
  function frameUrl(page) {
    var base = ed.site.liveUrl.replace(/\/+$/, '') + '/';
    if (!page || page === '/') return base + 'index.html';
    return base + page.replace(/^\/+/, '');
  }
  function loadFrame() {
    ed.nonce += 1;
    cancelDraft();
    $('#frame').src = frameUrl(ed.framePath) + '?edit=' + ed.nonce;
  }
  function pathFromFrame() {
    try {
      var p = $('#frame').contentWindow.location.pathname || '';
      var base = liveBasePath();
      if (p.indexOf(base) !== 0) return '/';
      var rel = '/' + p.slice(base.length);
      rel = rel.replace(/\/index\.html?$/, '/');
      if (rel !== '/' && !/\.html?$/i.test(rel) && rel.slice(-1) !== '/') rel += '/';
      return rel || '/';
    } catch (e) { return '/'; }
  }
  function frameDoc() {
    var f = $('#frame');
    try { return f.contentDocument && f.contentWindow ? { doc: f.contentDocument, win: f.contentWindow } : null; } catch (e) { return null; }
  }
  function goTo(page) {
    var f = $('#frame');
    try { f.contentWindow.location.href = frameUrl(page); } catch (e) { f.src = frameUrl(page); }
  }
  function renderPages() {
    var sel = $('#pages');
    var pages = (ed.data && ed.data.site && ed.data.site.pages) || [{ path: '/', title: 'Home' }];
    var cur = ed.framePath;
    var html = pages.map(function (p) { return '<option value="' + esc(p.path) + '">' + esc(p.title) + '</option>'; }).join('');
    if (!pages.some(function (p) { return p.path === cur; })) html += '<option value="' + esc(cur) + '">' + esc(cur) + '</option>';
    if (sel.innerHTML !== html) sel.innerHTML = html;
    sel.value = cur;
  }

  function onFrameLoad() {
    if (!ed) return;
    var fd = frameDoc();
    if (!fd) {
      var el = $('#err');
      el.textContent = 'The site cannot be edited from this address: this page must be opened on mwb05.github.io (the same place as the site) to read what is inside the frame.';
      el.hidden = false;
      return;
    }
    var doc = fd.doc; var win = fd.win;
    ed.framePath = pathFromFrame();
    renderPages();
    if (!doc.getElementById('jse-style')) {
      var st = doc.createElement('style'); st.id = 'jse-style'; st.textContent = FRAME_STYLE; doc.head.appendChild(st);
    }
    var clearHover = function () { if (ed && ed.hover) { ed.hover.classList.remove('jse-hover'); ed.hover = null; } };
    doc.addEventListener('mouseover', function (ev) {
      if (!ed || !ed.editMode || ed.editing) return;
      var el = pickTarget(ev.target);
      if (!el || el === ed.hover) return;
      clearHover(); el.classList.add('jse-hover'); ed.hover = el;
    }, true);
    doc.addEventListener('mouseleave', clearHover, true);
    doc.addEventListener('click', function (ev) {
      if (!ed || !ed.editMode) return;
      if (ed.editing) {
        if (ed.editing.el.contains(ev.target)) return;
        finishInlineEdit(true);
      }
      ev.preventDefault(); ev.stopPropagation();
      var el = pickTarget(ev.target);
      if (!el) return;
      clearHover();
      $$('.jse-pin', doc).forEach(function (x) { x.classList.remove('jse-pin'); });
      el.classList.add('jse-pin');
      var info = describe(el, win);
      ed.draft = info; ed.draft.el = el; ed.draft.canInline = textOnly(el);
      ed.draftMode = 'comment';
      renderDraft();
      if (window.matchMedia('(max-width: 720px)').matches) setPanel(false);
    }, true);
    doc.addEventListener('dblclick', function (ev) {
      if (!ed || !ed.editMode) return;
      var el = pickTarget(ev.target);
      if (!el || !textOnly(el)) return;
      ev.preventDefault(); ev.stopPropagation();
      if (ed.editing && ed.editing.el !== el) finishInlineEdit(true);
      cancelDraft();
      $$('.jse-pin', doc).forEach(function (x) { x.classList.remove('jse-pin'); });
      ed.editing = { el: el, before: norm(el.textContent), info: describe(el, win) };
      el.classList.add('jse-editing');
      el.contentEditable = 'true';
      el.focus();
      try { var s = win.getSelection(); var range = doc.createRange(); range.selectNodeContents(el); s.removeAllRanges(); s.addRange(range); } catch (e) {}
    }, true);
    doc.addEventListener('keydown', function (ev) {
      if (!ed || !ed.editing) return;
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finishInlineEdit(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); finishInlineEdit(false); }
    }, true);
    var raf = 0;
    var onScroll = function () { if (!raf) raf = win.requestAnimationFrame(function () { raf = 0; refreshPins(); }); };
    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('resize', onScroll);
    setTimeout(refreshPins, 300);
    if (ed.pendingJump) {
      var sel = ed.pendingJump; ed.pendingJump = null;
      setTimeout(function () { jumpTo(sel); }, 350);
    }
  }

  function finishInlineEdit(commit) {
    var cur = ed && ed.editing;
    if (!cur) return;
    ed.editing = null;
    var el = cur.el;
    el.contentEditable = 'false';
    el.classList.remove('jse-editing');
    var after = norm(el.textContent);
    // The frame always shows the site as it is: the retyped text lives in the edit.
    el.textContent = cur.before;
    if (!commit || !after || after === cur.before) return;
    var edit = {};
    for (var k in cur.info) edit[k] = cur.info[k];
    edit.kind = 'replace'; edit.before = cur.before; edit.after = after; edit.page = pathFromFrame(); edit.viewport = ed.viewport;
    post({ op: 'add', edit: edit }).then(function (j) { if (j && j.ok) say('Text edit saved.'); });
  }

  function jumpTo(selector) {
    var fd = frameDoc();
    if (!fd) return;
    var el = null;
    try { el = fd.doc.querySelector(selector); } catch (e) {}
    if (!el) { say('That element is not on this page any more.'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $$('.jse-pin', fd.doc).forEach(function (x) { x.classList.remove('jse-pin'); });
    el.classList.add('jse-pin'); el.classList.add('jse-flash');
    setTimeout(function () { el.classList.remove('jse-flash'); }, 1700);
  }
  function jumpToEdit(e) {
    if (window.matchMedia('(max-width: 720px)').matches) setPanel(false);
    if (e.viewport !== ed.viewport) setViewport(e.viewport);
    if (e.page !== pathFromFrame()) { ed.pendingJump = e.selector; goTo(e.page); }
    else jumpTo(e.selector);
  }

  function refreshPins() {
    if (!ed) return;
    var fd = frameDoc();
    var out = [];
    if (fd) {
      var page = pathFromFrame();
      ed.edits.forEach(function (e, i) {
        if (e.page !== page) return;
        var el = null;
        try { el = fd.doc.querySelector(e.selector); } catch (x) {}
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        out.push({ id: e.id, n: ed.edits.length - i, x: Math.round(r.left), y: Math.round(r.top), status: e.status });
      });
    }
    var same = out.length === ed.pins.length && out.every(function (p, i) { var q = ed.pins[i]; return q.id === p.id && q.x === p.x && q.y === p.y && q.status === p.status && q.n === p.n; });
    if (same) return;
    ed.pins = out;
    $('#pins').innerHTML = out.map(function (p) {
      var s = STATUS[p.status] || STATUS.pending;
      return '<button type="button" class="pinbadge ' + s.cls + '" data-id="' + esc(p.id) + '" style="left:' + Math.max(0, p.x - 10) + 'px;top:' + Math.max(0, p.y - 10) + 'px" title="Open this edit">' + p.n + '</button>';
    }).join('');
    $$('#pins .pinbadge').forEach(function (b) {
      b.addEventListener('click', function () { ed.open = b.getAttribute('data-id'); ed.tab = 'all'; renderPanel(); setPanel(true); });
    });
  }

  // ── the draft (comment / replace) box ───────────────────────────────────────────────────────
  function renderDraft() {
    var box = $('#draft');
    var d = ed.draft;
    if (!d) { box.hidden = true; box.innerHTML = ''; return; }
    var wrapW = $('#framewrap').clientWidth || 800;
    var narrow = window.matchMedia('(max-width: 720px)').matches;
    if (!narrow) box.style.left = Math.min(Math.max(8, d.rect.x), Math.max(8, wrapW - 360)) + 'px';
    var t = d.text.slice(0, 160) + (d.text.length > 160 ? '…' : '');
    box.innerHTML = ''
      + '<div class="el"><span class="tag">&lt;' + esc(d.tag) + '&gt;</span>' + (d.section ? '<span class="sec">' + esc(d.section) + '</span>' : '') + '</div>'
      + (d.text ? '<div class="text">&ldquo;' + esc(t) + '&rdquo;</div>' : '')
      + (d.src ? '<div class="text">image: ' + esc(d.src) + '</div>' : '')
      + (d.canInline ? '<div class="seg small"><button type="button" data-m="comment"' + (ed.draftMode === 'comment' ? ' class="on"' : '') + '>Comment</button><button type="button" data-m="replace"' + (ed.draftMode === 'replace' ? ' class="on"' : '') + '>Replace text</button></div>' : '')
      + (ed.draftMode === 'replace'
        ? '<textarea id="draft-after" rows="3" placeholder="The new text, exactly">' + esc(d.after != null ? d.after : d.text) + '</textarea>'
        : '<textarea id="draft-text" rows="3" placeholder="What should change here? (&quot;make this shorter&quot;, &quot;swap this image&quot;, &quot;this button should go to the contact form&quot;)">' + esc(d.instruction || '') + '</textarea>')
      + '<div class="actions"><button type="button" class="btn" id="draft-add"' + (ed.busy ? ' disabled' : '') + '>Add edit</button><button type="button" class="btn ghost" id="draft-cancel">Cancel</button></div>';
    box.hidden = false;
    $$('.seg [data-m]', box).forEach(function (b) {
      b.addEventListener('click', function () { rememberDraftText(); ed.draftMode = b.getAttribute('data-m'); renderDraft(); });
    });
    var ta = $('textarea', box);
    ta.focus();
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) saveDraft(); });
    $('#draft-add').addEventListener('click', saveDraft);
    $('#draft-cancel').addEventListener('click', cancelDraft);
  }
  function rememberDraftText() {
    if (!ed.draft) return;
    var a = $('#draft-after'); var t = $('#draft-text');
    if (a) ed.draft.after = a.value;
    if (t) ed.draft.instruction = t.value;
  }
  function saveDraft() {
    var d = ed.draft;
    if (!d) return;
    rememberDraftText();
    var edit = { selector: d.selector, domPath: d.domPath, tag: d.tag, section: d.section, text: d.text, html: d.html, rect: d.rect, scrollY: d.scrollY, page: pathFromFrame(), viewport: ed.viewport };
    if (ed.draftMode === 'replace') { edit.kind = 'replace'; edit.before = d.text; edit.after = norm(d.after); }
    else { edit.kind = 'instruction'; edit.instruction = norm(d.instruction); }
    if (edit.kind === 'instruction' && !edit.instruction) { say('Type what you want changed.'); return; }
    if (edit.kind === 'replace' && (!edit.after || edit.after === edit.before)) { say('Type the new text.'); return; }
    post({ op: 'add', edit: edit }).then(function (j) { if (j && j.ok) { say('Edit added.'); cancelDraft(); } });
  }
  function cancelDraft() {
    if (!ed) return;
    try { if (ed.draft && ed.draft.el) ed.draft.el.classList.remove('jse-pin'); } catch (e) {}
    ed.draft = null;
    renderDraft();
  }

  function submit() {
    var n = ed.edits.filter(function (e) { return e.status === 'pending'; }).length;
    if (!n) { say('Nothing pending to submit.'); return; }
    post({ op: 'submit' }).then(function (j) {
      if (!j || !j.ok) return;
      if (j.mode === 'direct') say('Applying ' + n + ' text edit' + (n === 1 ? '' : 's') + ' now; the live site updates in a few minutes.');
      else say('Sent to Jarvis' + (j.note || '') + '. It usually lands within the hour.');
    });
  }

  // ── the edits panel ─────────────────────────────────────────────────────────────────────────
  function counts() {
    var c = { all: ed.edits.length, pending: 0, in_progress: 0, done: 0, failed: 0 };
    ed.edits.forEach(function (e) { if (e.status === 'rejected') c.failed += 1; else if (c[e.status] !== undefined) c[e.status] += 1; });
    return c;
  }
  function renderTabs() {
    var c = counts();
    $('#tabs').innerHTML = TABS.map(function (t) {
      return '<button type="button" data-tab="' + t[0] + '"' + (ed.tab === t[0] ? ' class="on"' : '') + '>' + t[1] + (c[t[0]] ? '<i>' + c[t[0]] + '</i>' : '') + '</button>';
    }).join('');
    $$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { ed.tab = b.getAttribute('data-tab'); renderPanel(); }); });
  }
  function renderBatches() {
    var running = (ed.data && ed.data.batches || []).filter(function (b) { return b.status === 'running'; });
    $('#batches').innerHTML = running.map(function (b) {
      var what = b.waitingLive ? 'Committed ' + esc(b.commit || '') + ', waiting for GitHub to publish it'
        : (b.mode === 'direct' ? 'Applying directly' : (b.jobName ? 'Jarvis is working on it (' + esc(b.jobName) + ')' : 'Waiting for a Jarvis slot'));
      var job = b.jobName && ed.data.jobs && ed.data.jobs[b.jobName];
      var last = b.steps && b.steps.length ? b.steps[b.steps.length - 1] : null;
      return '<div class="batch"><div class="bh"><span class="spin"></span> ' + what + ' &middot; ' + b.editIds.length + ' edit' + (b.editIds.length === 1 ? '' : 's') + '</div>'
        + (job && job.lastActivity ? '<div class="bs">' + esc(job.lastActivity) + '</div>' : '')
        + (last ? '<div class="bs">' + esc(last.text) + ' <span class="dim">' + esc(ago(last.at)) + '</span></div>' : '')
        + '</div>';
    }).join('');
  }
  function renderPanel() {
    renderTabs();
    renderBatches();
    renderButtons();
    renderDrawerBtn();
    var c = counts();
    $('#foot').hidden = !(c.done || c.failed);
    var shown = ed.edits.filter(function (e) { return ed.tab === 'all' || e.status === ed.tab || (ed.tab === 'failed' && e.status === 'rejected'); });
    var list = $('#list');
    if (!shown.length) {
      list.innerHTML = '<li class="empty">' + (ed.edits.length ? 'Nothing in this tab.' : (ed.editMode ? 'No edits yet. Click something on the site to start.' : 'No edits yet.')) + '</li>';
      return;
    }
    list.innerHTML = shown.map(function (e) { return itemHtml(e, ed.edits.length - ed.edits.indexOf(e)); }).join('');
    $$('#list .item').forEach(function (li) {
      var id = li.getAttribute('data-id');
      var e = ed.edits.filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      $('.item-row', li).addEventListener('click', function () { ed.open = ed.open === id ? null : id; renderPanel(); });
      var jump = $('[data-act="jump"]', li); if (jump) jump.addEventListener('click', function () { jumpToEdit(e); });
      var save = $('[data-act="save"]', li); if (save) save.addEventListener('click', function () {
        var ta = $('textarea', li);
        var patch = e.kind === 'replace' ? { after: norm(ta.value) } : { instruction: ta.value.trim() };
        post({ op: 'update', id: id, patch: patch }).then(function (j) { if (j && j.ok) say('Saved.'); });
      });
      var ta = $('textarea', li); if (ta) ta.addEventListener('input', function () { var s = $('[data-act="save"]', li); if (s) s.hidden = false; });
      var del = $('[data-act="delete"]', li); if (del) del.addEventListener('click', function () { if (window.confirm('Delete this edit?')) post({ op: 'delete', id: id }); });
      var retry = $('[data-act="retry"]', li); if (retry) retry.addEventListener('click', function () { post({ op: 'update', id: id, patch: { status: 'pending' } }); });
    });
  }
  function itemHtml(e, n) {
    var s = STATUS[e.status] || STATUS.pending;
    var open = ed.open === e.id;
    var editable = e.status === 'pending';
    var what = e.kind === 'replace' ? '<s>' + esc(e.before) + '</s><span class="arrow">&rarr;</span><b>' + esc(e.after) + '</b>' : esc(e.instruction);
    var sec = e.section ? (e.section.length > 28 ? e.section.slice(0, 28) + '…' : e.section) : '';
    var html = '<li class="item" data-id="' + esc(e.id) + '">'
      + '<div class="item-row" role="button" tabindex="0"><span class="num ' + s.cls + '">' + n + '</span><div class="item-main"><div class="what">' + what + '</div>'
      + '<div class="item-meta"><span class="pill ' + s.cls + '">' + s.label + '</span>' + (e.by ? '<span class="pill who">' + esc(e.by) + '</span>' : '') + '<span>' + esc(e.page) + '</span><span>&lt;' + esc(e.tag) + '&gt;</span>'
      + (sec ? '<span title="' + esc(e.section) + '">' + esc(sec) + '</span>' : '') + '<span>' + esc(e.viewport) + '</span><span>' + esc(ago(e.createdAt)) + '</span></div></div></div>';
    if (open) {
      html += '<div class="detail">'
        + (e.kind === 'instruction' && e.text ? '<div class="kv">Current text: &ldquo;' + esc(e.text.slice(0, 240)) + (e.text.length > 240 ? '…' : '') + '&rdquo;</div>' : '')
        + '<div class="kv">Where: <code>' + esc(e.domPath || e.selector) + '</code></div>'
        + (e.kind === 'replace'
          ? '<label>Replacement text</label><textarea rows="2"' + (editable ? '' : ' disabled') + '>' + esc(e.after || '') + '</textarea>'
          : '<label>What you want changed</label><textarea rows="3"' + (editable ? '' : ' disabled') + '>' + esc(e.instruction || '') + '</textarea>')
        + (e.result && e.result.note ? '<div class="note">' + esc(e.result.note) + ' <span class="dim">' + esc(ago(e.result.at)) + '</span></div>' : '')
        + '<div class="item-actions"><button type="button" class="btn ghost" data-act="jump">Jump to element</button>'
        + (editable ? '<button type="button" class="btn" data-act="save" hidden>Save</button>' : '')
        + (['failed', 'rejected', 'done'].indexOf(e.status) >= 0 ? '<button type="button" class="btn ghost" data-act="retry">' + (e.status === 'done' ? 'Submit again' : 'Retry') + '</button>' : '')
        + (e.status !== 'in_progress' ? '<button type="button" class="btn danger" data-act="delete">Delete</button>' : '')
        + '</div></div>';
    }
    return html + '</li>';
  }

  // ── routing ─────────────────────────────────────────────────────────────────────────────────
  function route() {
    var id = location.hash.replace(/^#\/?/, '');
    var site = id ? siteById(id) : null;
    if (site && norm(store.get('name')) && store.get('code')) renderEditor(site);
    else {
      if (id && !site) say('There is no site called "' + id + '".');
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      renderHome();
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();
