/* ===== App: board UI, lessons, coach ===== */
(function () {
  'use strict';
  const E = Engine;
  const $ = (s, r) => (r || document).querySelector(s);
  const GLYPH = { k: ['♚', '♔'], q: ['♛', '♕'], r: ['♜', '♖'], b: ['♝', '♗'], n: ['♞', '♘'], p: ['♟', '♙'] };
  const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const later = (fn, ms) => setTimeout(fn, ms || 30);

  /* ---------- progress (per-viewer convenience) ---------- */
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem('cvtb-progress') || '{}') || {}; } catch (e) { progress = {}; }
  // display options: square names and piece names on the board (on by default for beginners)
  let opts = { sqNames: true, pieceNames: true };
  try { Object.assign(opts, JSON.parse(localStorage.getItem('cvtb-opts') || '{}')); } catch (e) { /* ignore */ }
  const saveOpts = () => { try { localStorage.setItem('cvtb-opts', JSON.stringify(opts)); } catch (e) { /* ignore */ } };
  const LETTER = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
  const saveProgress = () => { try { localStorage.setItem('cvtb-progress', JSON.stringify(progress)); } catch (e) { /* ignore */ } };
  const isDone = (lv, si) => !!progress[lv + '-' + si];
  const levelDone = (L) => L.steps.filter((_, i) => isDone(L.id, i)).length;

  /* ---------- state ---------- */
  let view = 'home', LV = null, SI = 0, S = null; // S = session
  let drag = null;

  function pieceHTML(p) {
    const t = p.toLowerCase();
    return p < 'a'
      ? `<span class="pc pw"><i class="pf">${GLYPH[t][0]}</i><i class="po">${GLYPH[t][1]}</i></span>`
      : `<span class="pc pb"><i class="pf">${GLYPH[t][0]}</i></span>`;
  }
  const NAMEP = (p) => E.NAME[p.toLowerCase()];
  function mv(m) { return `<b class="mv" data-from="${m.from}" data-to="${m.to}"><span class="gl">${GLYPH[m.p.toLowerCase()][0]}</span>${esc(E.moveText(m))}</b>`; }
  const sqref = (n) => `<span class="sqref" data-peek="${n}">${n}</span>`;
  // the same move, told in everyday words (no chess notation needed)
  function plain(m) {
    const t = m.p.toLowerCase(), nm = E.NAME[t], mine = E.colorOf(m.p) === 'w';
    const who = mine ? ' của bạn' : ' đen';
    if (m.fl === 3 || m.fl === 4) {
      const side = m.fl === 3 ? 'phải' : 'trái', other = m.fl === 3 ? 'trái' : 'phải';
      return `Vua${who} đi 2 ô sang ${side}, Xe ở góc bên ${side} nhảy qua đứng sát bên ${other} Vua. Nước đặc biệt này gọi là <b>nhập thành</b>, giúp Vua trốn vào góc an toàn.`;
    }
    const df = (m.to & 7) - (m.from & 7), dr = (m.from >> 3) - (m.to >> 3);
    const ud = dr > 0 ? 'lên' : 'xuống', lr = df > 0 ? 'phải' : 'trái';
    let path;
    if (t === 'n') path = `nhảy hình chữ L (${ud} ${Math.abs(dr)} hàng, sang ${lr} ${Math.abs(df)} cột)`;
    else if (df === 0) path = `đi thẳng ${ud} ${Math.abs(dr)} ô`;
    else if (dr === 0) path = `đi ngang sang ${lr} ${Math.abs(df)} ô`;
    else path = `đi chéo ${ud} về bên ${lr} ${Math.abs(df)} ô`;
    const to = E.sqName(m.to);
    let s = `${nm}${who} đang đứng ở ô ${sqref(E.sqName(m.from))} ${path}, tới ô ${sqref(to)} (cột ${to[0]}, hàng ${to[1]})`;
    if (m.fl === 2) s += ', ăn Tốt đứng ngay bên cạnh (luật bắt tốt qua đường)';
    else if (m.cap) s += `, ăn ${E.NAME[m.cap.toLowerCase()]} ${mine ? 'của đen' : 'của bạn'} đang đứng ở đó`;
    if (m.promo) s += `, rồi biến thành ${E.NAME[m.promo]}`;
    return s + '.';
  }
  const plainP = (m, extra) => `<p class="plain">${plain(m)}${extra ? ' ' + extra : ''}</p>`;
  function sanVi(m) {
    if (m.fl === 3 || m.fl === 4) return 'Nhập thành';
    return `${E.NAME[m.p.toLowerCase()]} ${m.cap ? 'ăn quân ở' : 'đến'} ${E.sqName(m.to)}${m.promo ? ', thành ' + E.NAME[m.promo] : ''}`;
  }
  // wrap square names (e4, f7…) in plain text so hovering/tapping them lights up the square
  function linkSquares(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.sqref, .mv, .san, button, .tag') ? NodeFilter.FILTER_REJECT : /\b[a-h][1-8]\b/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const span = document.createElement('span');
      span.innerHTML = esc(n.nodeValue).replace(/\b([a-h][1-8])\b/g, (x) => sqref(x));
      n.replaceWith(...span.childNodes);
    }
  }

  /* ---------- session ---------- */
  function newSession(step) {
    const pos = new E.Position(step.fen);
    return {
      step, pos, keys: [pos.key()], hist: [], feed: [], selected: -1,
      arrows: [], lastMove: step.lastMove ? [E.sqIdx(step.lastMove[0]), E.sqIdx(step.lastMove[1])] : null,
      stars: new Set((step.stars || []).map(E.sqIdx)), moveCount: 0, solIdx: 0, wrong: 0, hintStage: 0,
      busy: false, status: '', done: false, over: false, analysis: null, evalScore: null, hintsUsed: 0, celebrate: false, peek: null
    };
  }
  function interactive() {
    return S && S.step.type !== 'info' && !S.busy && !S.over && !(S.step.type === 'puzzle' && S.done) && S.pos.turn === 'w';
  }
  function legalFrom(sq) {
    if (!S) return [];
    const p = S.pos.b[sq];
    if (!p || E.colorOf(p) !== 'w') return [];
    if (S.step.only && p !== S.step.only) return [];
    return S.pos.legal().filter((m) => m.from === sq);
  }
  function push(item) { S.feed.unshift(item); if (S.feed.length > 40) S.feed.length = 40; }

  /* ---------- rendering ---------- */
  function render() {
    renderHeader();
    $('#home').hidden = view !== 'home';
    $('#lesson').hidden = view !== 'lesson';
    if (view === 'home') renderHome(); else renderLesson();
  }
  function renderHeader() {
    $('#lvnav').innerHTML = LEVELS.map((L) => {
      const d = levelDone(L), n = L.steps.length, cur = view === 'lesson' && LV && LV.id === L.id;
      return `<button class="lvchip${cur ? ' cur' : ''}${d === n ? ' full' : ''}" data-lv="${L.id}" aria-label="Cấp ${L.id}: ${esc(L.name)}"><span class="n">${L.id}</span><span class="t">${esc(L.name)}</span></button>`;
    }).join('');
  }
  function nextTodo() {
    for (const L of LEVELS) for (let i = 0; i < L.steps.length; i++) if (!isDone(L.id, i)) return [L.id, i];
    return [6, 1];
  }
  function renderHome() {
    const total = LEVELS.reduce((a, L) => a + L.steps.length, 0), done = LEVELS.reduce((a, L) => a + levelDone(L), 0);
    const [nl, ns] = nextTodo();
    $('#resume').textContent = done ? `Học tiếp: Cấp ${nl}, bài ${ns + 1}` : 'Bắt đầu từ Cấp 1';
    $('#resume').dataset.go = `${nl}-${ns}`;
    $('#overall').innerHTML = `<span class="num">${done}</span>/<span>${total}</span> bài đã hoàn thành`;
    $('#levels').innerHTML = LEVELS.map((L) => {
      const d = levelDone(L), n = L.steps.length, pct = Math.round((d / n) * 100);
      const kinds = { info: 0, stars: 0, puzzle: 0, game: 0 };
      L.steps.forEach((s) => kinds[s.type]++);
      const meta = [kinds.info + kinds.stars ? `${kinds.info + kinds.stars} bài học` : '', kinds.puzzle ? `${kinds.puzzle} câu đố` : '', kinds.game ? `${kinds.game} ván đấu` : ''].filter(Boolean).join(' · ');
      return `<article class="lvcard" data-lv="${L.id}" tabindex="0" role="button" aria-label="Mở cấp ${L.id}">
        <div class="lvtop"><span class="lvno">Cấp ${L.id}</span><span class="lvstate ${d === n ? 'full' : d ? 'part' : ''}">${d === n ? 'Đã xong' : d ? 'Đang học' : 'Chưa học'}</span></div>
        <h3>${esc(L.name)}</h3><p class="lvshort">${esc(L.short)}</p><p class="lvintro">${esc(L.intro)}</p>
        <div class="lvfoot"><span class="lvmeta">${meta}</span><span class="bar"><i style="width:${pct}%"></i></span></div>
      </article>`;
    }).join('');
  }
  function renderLesson() {
    const st = S.step;
    $('#lvtitle').textContent = `Cấp ${LV.id} · ${LV.name}`;
    $('#steps').innerHTML = LV.steps.map((s, i) => {
      const k = { info: 'Bài học', stars: 'Luyện tập', puzzle: 'Câu đố', game: 'Ván đấu' }[s.type];
      return `<button class="step${i === SI ? ' cur' : ''}${isDone(LV.id, i) ? ' done' : ''}" data-si="${i}"><span class="sn">${isDone(LV.id, i) ? '✓' : i + 1}</span><span class="sx"><span class="sk">${k}</span><span class="st">${esc(s.title)}</span></span></button>`;
    }).join('');
    const cur = $('#steps .cur'); if (cur && cur.scrollIntoView && window.innerWidth < 1100) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    $('#stepkind').textContent = `Bài ${SI + 1}/${LV.steps.length} · ${{ info: 'Bài học', stars: 'Luyện tập', puzzle: 'Câu đố', game: 'Ván đấu' }[st.type]}`;
    $('#steptitle').textContent = st.title;
    $('#steptext').innerHTML = st.text;
    linkSquares($('#steptext'));
    renderControls();
    renderBoard();
    renderFeed();
    renderMoves();
    renderEval();
  }
  function renderControls() {
    const st = S.step, t = st.type;
    const btn = (id, label, cls, show, dis) => show ? `<button id="${id}" class="btn ${cls || ''}"${dis ? ' disabled' : ''}>${label}</button>` : '';
    const last = SI >= LV.steps.length - 1;
    const nextLabel = last ? (LV.id < 6 ? `Sang cấp ${LV.id + 1} →` : 'Về trang chủ') : 'Bài tiếp theo →';
    $('#controls').innerHTML =
      (t === 'info' ? btn('b-next', 'Tiếp tục →', 'primary', true) : '') +
      btn('b-hint', t === 'game' ? 'Gợi ý nước đi' : 'Gợi ý', 'hint', t !== 'info', S.busy || S.over || S.done && t !== 'game') +
      btn('b-undo', 'Đi lại', '', t === 'game', S.busy || S.hist.length < 1) +
      btn('b-reset', t === 'game' ? 'Ván mới' : 'Làm lại', '', t !== 'info', S.busy) +
      (t !== 'info' ? btn('b-next', nextLabel, S.done ? 'primary' : 'ghost', true) : '');
    $('#status').innerHTML = S.status || '';
    $('#status').hidden = !S.status;
  }
  function renderBoard() {
    const pos = S.pos, board = $('#board');
    const targets = S.selected >= 0 ? legalFrom(S.selected).map((m) => m.to) : [];
    const checkSq = pos.inCheck('w') ? pos.kw : pos.inCheck('b') ? pos.kb : -1;
    const marks = (S.step.marks || []).map(E.sqIdx);
    let h = '';
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7, light = (r + c) % 2 === 0, p = pos.b[i];
      let cls = 'sq ' + (light ? 'l' : 'd');
      if (S.lastMove && S.lastMove.includes(i)) cls += ' last';
      if (i === S.selected) cls += ' sel';
      if (marks.includes(i)) cls += ' mark';
      if (S.peek && S.peek.includes(i)) cls += ' peek';
      if (i === checkSq) cls += ' check';
      if (targets.includes(i)) cls += p ? ' cap' : ' tgt';
      if (drag && drag.from === i && drag.moved) cls += ' lift';
      let inner = '';
      if (opts.sqNames) inner += `<span class="sqn${p ? ' corner' : ''}">${E.sqName(i)}</span>`;
      else {
        if (c === 0) inner += `<span class="co rk">${8 - r}</span>`;
        if (r === 7) inner += `<span class="co fl">${'abcdefgh'[c]}</span>`;
      }
      if (S.stars.has(i)) inner += STAR;
      if (p) inner += pieceHTML(p);
      if (p && opts.pieceNames) inner += `<span class="pnm ${p < 'a' ? 'w' : 'b'}">${E.NAME[p.toLowerCase()]}<b>${LETTER[p.toLowerCase()]}</b></span><span class="pl ${p < 'a' ? 'w' : 'b'}">${LETTER[p.toLowerCase()]}</span>`;
      h += `<div class="${cls}" data-sq="${i}">${inner}</div>`;
    }
    h += arrowsSVG();
    board.innerHTML = h;
    board.classList.toggle('locked', !interactive());
    board.classList.toggle('celebrate', !!S.celebrate);
    board.classList.toggle('named', opts.pieceNames);
    for (const [id, on] of [['t-sq', opts.sqNames], ['t-pc', opts.pieceNames]]) { const t = $('#' + id); t.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    $('#boardwrap').classList.toggle('noeval', S.step.type !== 'game' || !!S.step.goal && S.step.goal !== 'win');
  }
  function arrowsSVG() {
    const list = (S.step.type === 'info' ? (S.step.arrows || []).map(([a, b]) => [E.sqIdx(a), E.sqIdx(b), 'info']) : []).concat(S.arrows);
    if (S.peek && S.peek.length === 2) list.push([S.peek[0], S.peek[1], 'peek']);
    if (!list.length) return '';
    let s = '<svg class="arrows" viewBox="0 0 8 8" aria-hidden="true">';
    for (const [f, t, kind] of list) {
      const x1 = (f & 7) + 0.5, y1 = (f >> 3) + 0.5, x2 = (t & 7) + 0.5, y2 = (t >> 3) + 0.5;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const hx = x2 - ux * 0.12, hy = y2 - uy * 0.12, bx = hx - ux * 0.42, by = hy - uy * 0.42;
      const nx = -uy * 0.24, ny = ux * 0.24;
      const sx = x1 + ux * 0.22, sy = y1 + uy * 0.22;
      s += `<g class="arw ${kind || 'hint'}"><line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}"/><polygon points="${hx},${hy} ${bx + nx},${by + ny} ${bx - nx},${by - ny}"/></g>`;
    }
    return s + '</svg>';
  }
  const KIND = { best: 'Nước đi tốt nhất', good: 'Nước đi tốt', inacc: 'Chưa chính xác', blunder: 'Sai lầm', hint: 'Gợi ý', warn: 'Cẩn thận', win: 'Chiến thắng', lose: 'Thua', draw: 'Hòa', info: 'Huấn luyện viên', ok: 'Đúng rồi', no: 'Chưa đúng', bot: 'Đen vừa đi' };
  function renderFeed() {
    const f = $('#feed');
    if (!S.feed.length) {
      f.innerHTML = `<div class="empty">${S.step.type === 'info' ? 'Đọc phần hướng dẫn, quan sát bàn cờ, rồi bấm "Tiếp tục".' : S.step.type === 'game' ? 'Bạn đi trước. Huấn luyện viên sẽ nhận xét từng nước đi ở đây.' : 'Thực hiện nước đi trên bàn cờ. Nhận xét sẽ hiện ở đây.'}</div>`;
      return;
    }
    f.innerHTML = S.feed.map((it, idx) => `<div class="fi k-${it.kind}${idx === 0 ? ' new' : ''}">
      <div class="fh"><span class="tag ${it.kind}">${esc(it.label || KIND[it.kind] || '')}</span>${it.title ? `<span class="ft">${it.title}</span>` : ''}</div>
      ${it.body ? `<div class="fb">${it.body}</div>` : ''}
      ${it.actions && idx === 0 ? `<div class="fa">${it.actions.map((a, j) => `<button class="btn sm ${a.cls || ''}" data-act="${j}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`).join('');
    linkSquares(f);
  }
  function renderMoves() {
    const box = $('#moves');
    if (S.step.type !== 'game') { box.hidden = true; return; }
    box.hidden = false;
    if (!S.hist.length) { box.innerHTML = '<span class="mvempty">Chưa có nước đi nào</span>'; return; }
    const cell = (x) => x ? `<span class="mvc" data-from="${x.m.from}" data-to="${x.m.to}"><span class="san">${esc(x.san)}</span><span class="vi">${esc(sanVi(x.m))}</span></span>` : '<span></span>';
    let h = '<span class="mh"></span><span class="mh">Bạn (Trắng)</span><span class="mh">Đen</span>';
    for (let i = 0; i < S.hist.length; i += 2) {
      h += `<span class="mvn">${i / 2 + 1}.</span>${cell(S.hist[i])}${cell(S.hist[i + 1])}`;
    }
    box.innerHTML = h;
    box.scrollTop = box.scrollHeight;
  }
  function fmtScore(sc) {
    if (sc == null) return '0.0';
    if (Math.abs(sc) > E.MATE - 1000) { const n = Math.ceil((E.MATE - Math.abs(sc)) / 2); return (sc > 0 ? '' : '-') + 'M' + Math.max(1, n); }
    return (sc > 0 ? '+' : '') + (sc / 100).toFixed(1);
  }
  function renderEval() {
    const sc = S.evalScore;
    let pct = 50;
    if (sc != null) pct = Math.abs(sc) > E.MATE - 1000 ? (sc > 0 ? 100 : 0) : 50 + 50 * Math.tanh(sc / 600);
    $('#evalfill').style.height = pct + '%';
    $('#evaltxt').textContent = fmtScore(sc);
    $('#evalbar').title = 'Đánh giá thế cờ (dương = Trắng tốt hơn): ' + fmtScore(sc);
  }

  /* ---------- navigation ---------- */
  function openStep(lv, si, noHash) {
    LV = LEVELS.find((L) => L.id === lv) || LEVELS[0];
    SI = Math.max(0, Math.min(si, LV.steps.length - 1));
    const lvChanged = !S || !LV || S._lv !== lv;
    S = newSession(LV.steps[SI]);
    S._lv = lv;
    if (lvChanged) $('#legend').open = LV.id <= 3;
    view = 'lesson';
    if (!noHash) setHash(`cap${LV.id}-bai${SI + 1}`);
    render();
    window.scrollTo({ top: 0 });
    if (S.step.type === 'game' && S.step.coach === 'auto') coachTurn(null);
  }
  function goHome(noHash) { view = 'home'; S = null; LV = null; if (!noHash) setHash(''); render(); window.scrollTo({ top: 0 }); }
  function setHash(h) {
    try { if (h) history.replaceState(null, '', '#' + h); else history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  function fromHash() {
    const m = /^#cap(\d)(?:-bai(\d+))?$/.exec(location.hash || '');
    if (m) openStep(+m[1], m[2] ? +m[2] - 1 : 0, true); else goHome(true);
  }
  function markDone() {
    if (!S.done) { S.done = true; progress[LV.id + '-' + SI] = 1; saveProgress(); }
  }
  function nextStep() {
    if (S.step.type === 'info') markDone();
    if (SI < LV.steps.length - 1) openStep(LV.id, SI + 1);
    else if (LV.id < 6) openStep(LV.id + 1, 0);
    else goHome();
  }

  /* ---------- moves from the board ---------- */
  function tryMove(from, to) {
    const cands = legalFrom(from).filter((m) => m.to === to);
    if (!cands.length) return false;
    S.selected = -1;
    if (cands.length > 1 && cands[0].promo) { askPromo(cands); return true; }
    userMove(cands[0]);
    return true;
  }
  function askPromo(cands) {
    const box = $('#promo');
    box.innerHTML = '<div class="pbox"><p>Phong cấp thành:</p><div class="prow">' + ['q', 'r', 'b', 'n'].map((t) => `<button class="pbtn" data-pr="${t}" aria-label="${E.NAME[t]}">${pieceHTML(t.toUpperCase())}<span>${E.NAME[t]}</span></button>`).join('') + '</div></div>';
    box.hidden = false;
    box.onclick = (e) => {
      const b = e.target.closest('[data-pr]'); if (!b) return;
      box.hidden = true; box.onclick = null;
      userMove(cands.find((m) => m.promo === b.dataset.pr));
    };
  }
  function applyMove(m) {
    const legal = S.pos.legal();
    const san = S.pos.san(m, legal);
    S.pos.make(m);
    S.keys.push(S.pos.key());
    S.hist.push({ m, san });
    S.lastMove = [m.from, m.to];
  }
  function userMove(m) {
    S.arrows = [];
    const t = S.step.type;
    if (t === 'stars') return starsMove(m);
    if (t === 'puzzle') return puzzleMove(m);
    if (t === 'game') return gameMove(m);
  }

  /* ---------- stars lessons ---------- */
  function starsMove(m) {
    S.pos.make(m);
    S.pos.turn = 'w'; S.pos.ep = -1; S.pos.hist = [];
    S.lastMove = [m.from, m.to];
    S.moveCount++;
    let got = false;
    if (S.stars.has(m.to)) { S.stars.delete(m.to); got = true; }
    const blacksLeft = S.pos.b.filter((p) => p && E.colorOf(p) === 'b').length;
    const complete = S.stars.size === 0 && (!S.step.captureAll || blacksLeft === 0);
    if (complete) {
      markDone(); S.celebrate = true;
      push({ kind: 'win', label: 'Hoàn thành', title: `Xong sau ${S.moveCount} nước`, body: 'Bạn đã nắm được cách đi của quân này. Bấm <b>"Bài tiếp theo"</b> để học tiếp.' });
    } else if (m.cap) {
      push({ kind: 'ok', title: `Ăn ${NAMEP(m.cap)} ở ${E.sqName(m.to)}`, body: S.step.captureAll ? `Còn ${blacksLeft} quân đen.` : '' });
    } else if (got) {
      push({ kind: 'ok', title: `Lấy được ngôi sao ${E.sqName(m.to)}`, body: `Còn ${S.stars.size} ngôi sao.` });
    } else if (!S.pos.legal().some((x) => !S.step.only || x.p === S.step.only)) {
      push({ kind: 'warn', title: 'Hết nước đi', body: 'Quân của bạn không còn đường đi. Bấm "Làm lại" để thử lại.' });
    }
    render();
  }

  /* ---------- puzzles ---------- */
  function puzzleMove(m) {
    const st = S.step, u = E.uci(m);
    const pre = S.pos.clone();
    applyMove(m);
    const mate = S.pos.inCheck() && !S.pos.legal().length;
    const stale = !S.pos.inCheck() && !S.pos.legal().length;
    let ok = false;
    if (mate && (st.goal === 'mate' || st.goal === 'line')) ok = true;
    else if (st.goal === 'check') ok = S.pos.inCheck();
    else if (st.goal === 'castle') ok = m.fl === 3 || m.fl === 4;
    else if (st.goal === 'promote') ok = !!m.promo;
    else if (st.goal === 'ep') ok = m.fl === 2;
    else if (st.goal === 'accept') ok = st.accept.includes(u);
    else if (st.goal === 'line') ok = u === st.solution[S.solIdx] || u + 'q' === st.solution[S.solIdx];
    if (!ok) {
      S.wrong++;
      let why = (st.wrong && st.wrong[u]) || '';
      if (!why && stale) why = '<b>Hòa pat!</b> Vua đen không bị chiếu nhưng không còn nước đi nào: ván cờ hòa. Hãy tìm nước chiếu hết.';
      if (!why && st.goal === 'mate' && S.pos.inCheck()) why = 'Đó là nước chiếu, nhưng Vua đen vẫn còn đường thoát.';
      if (!why && st.goal === 'castle' && m.p === 'K') why = 'Để nhập thành, Vua đi <b>2 ô</b> sang ngang về phía Xe.';
      if (!why && st.goal === 'ep') why = 'Hãy dùng Tốt e5 ăn chéo sang ô d6 (ô mà Tốt đen vừa đi qua).';
      if (!why) why = 'Nước này chưa giải được bài. Thử lại nhé!';
      if (S.wrong >= 2 && st.hint) why += `<br><span class="sub">Gợi ý: ${esc(st.hint)}</span>`;
      push({ kind: 'no', title: mv(m), body: why });
      S.busy = true; render();
      later(() => { S.pos.unmake(); S.keys.pop(); S.hist.pop(); S.lastMove = st.lastMove ? [E.sqIdx(st.lastMove[0]), E.sqIdx(st.lastMove[1])] : null; S.busy = false; render(); }, 900);
      return;
    }
    const finished = mate || st.goal !== 'line' || S.solIdx + 1 >= st.solution.length;
    if (finished) {
      markDone(); S.celebrate = true;
      const reasons = E.explain(pre, m);
      push({ kind: 'win', label: 'Chính xác', title: mv(m), body: `${esc(st.success || 'Giải đúng rồi!')}${reasons.length && !mate ? `<ul class="why">${reasons.slice(0, 2).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}` });
      render();
      return;
    }
    S.solIdx++;
    push({ kind: 'ok', title: mv(m), body: esc(E.explain(pre, m)[0] || 'Đúng hướng!') + ' Giờ chờ đen đáp lại…' });
    S.busy = true; S.status = 'Đen đang suy nghĩ…'; render();
    later(() => {
      const reply = st.solution[S.solIdx] ? S.pos.find(st.solution[S.solIdx]) : (E.think(S.pos, { maxDepth: 3, timeMs: 500 }) || {}).move;
      if (reply) { applyMove(reply); push({ kind: 'bot', title: mv(reply), body: plainP(reply) + '<p>Đến lượt bạn: hoàn thành đòn đánh!</p>' }); }
      S.solIdx++;
      S.busy = false; S.status = ''; S.hintStage = 0; render();
    }, 650);
  }

  /* ---------- games with the coach ---------- */
  function analysisFor(pos) {
    const key = pos.key();
    if (S.analysis && S.analysis.key === key) return S.analysis;
    const few = pos.b.filter(Boolean).length <= 7;
    const r = E.think(pos, { maxDepth: few ? 8 : 5, timeMs: few ? 650 : 700, avoid: new Set(S.keys.slice(0, -1)) });
    if (!r) return null;
    let best = r.move, score = r.score;
    // in the opening, prefer a "principled" move if it is about as good
    if (pos.full <= 10 && S.step.fen.startsWith('rnbqkbnr/pppppppp')) {
      const pr = principled(pos);
      let top = null;
      for (const m of pr.slice(0, 4)) {
        if (m.from === best.from && m.to === best.to) { top = null; break; }
        const sc = E.scoreMove(pos, m, Math.min(r.depth, 4), 400);
        if (sc != null && sc >= score - 25 && (!top || sc > top.sc)) top = { m, sc };
      }
      if (top) { best = top.m; score = Math.min(score, top.sc); }
    }
    S.analysis = { key, best, score, depth: r.depth };
    return S.analysis;
  }
  function principled(pos) {
    const out = [];
    for (const m of pos.legal()) {
      let pri = 0;
      const t = m.p.toLowerCase();
      if (m.fl === 3) pri = 5;
      else if (t === 'p' && (m.to === E.sqIdx('e4') || m.to === E.sqIdx('d4'))) pri = 4;
      else if (t === 'n' && (m.from >> 3) === 7 && [E.sqIdx('f3'), E.sqIdx('c3')].includes(m.to)) pri = 3;
      else if (t === 'b' && (m.from >> 3) === 7 && [E.sqIdx('c4'), E.sqIdx('b5'), E.sqIdx('e2'), E.sqIdx('d3'), E.sqIdx('f4'), E.sqIdx('g5'), E.sqIdx('e3')].includes(m.to)) pri = 2;
      if (pri) out.push({ m, pri });
    }
    return out.sort((a, b) => b.pri - a.pri).map((x) => x.m);
  }
  function whiteScore(score) { return score; } // analysis is computed with white to move
  function showHint(a, withThreats) {
    if (!a) return;
    S.arrows = [[a.best.from, a.best.to, 'hint']];
    const reasons = E.explain(S.pos, a.best);
    let body = `<ul class="why">${reasons.slice(0, 3).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    if (Math.abs(a.score) > E.MATE - 1000 && a.score > 0) body += `<p class="sub">Bạn có thể chiếu hết trong ${Math.ceil((E.MATE - a.score) / 2)} nước!</p>`;
    push({ kind: 'hint', title: `Nên đi: ${mv(a.best)}`, body: plainP(a.best, 'Xem mũi tên vàng trên bàn cờ.') + '<p class="whyh">Vì sao?</p>' + body });
  }
  function threatNote() {
    const th = E.threatsAgainst(S.pos, 'w');
    if (!th.length) return '';
    const t = th[0];
    return `${NAMEP(t.piece)} của bạn ở <b>${E.sqName(t.sq)}</b> đang bị ${esc(NAMEP(t.byPiece))} ${E.sqName(t.by)} tấn công${S.pos.attacked(t.sq, 'w') ? ' (quân tấn công rẻ hơn)' : ' và không được bảo vệ'}.`;
  }
  // called when it is white's turn in a game
  function coachTurn(botMoveDone) {
    const auto = S.step.coach === 'auto';
    S.busy = true; S.status = auto ? 'Huấn luyện viên đang xem thế cờ…' : '';
    render();
    later(() => {
      let a = null;
      if (auto) a = analysisFor(S.pos);
      if (a) S.evalScore = whiteScore(a.score);
      const warn = threatNote();
      if (botMoveDone) {
        const body = [];
        if (botMoveDone.cap) body.push(`Đen đã ăn ${NAMEP(botMoveDone.cap)} của bạn ở ${E.sqName(botMoveDone.to)}.`);
        if (S.pos.inCheck('w')) body.push('<b>Bạn đang bị chiếu!</b> Phải thoát chiếu: chạy Vua, chặn, hoặc ăn quân chiếu.');
        if (warn && (auto || S.step.coach === 'ask')) body.push(auto ? warn : 'Hãy kiểm tra xem quân nào của bạn đang bị đe dọa.');
        push({ kind: 'bot', title: mv(botMoveDone), body: plainP(botMoveDone) + (body.length ? `<p>${body.join(' ')}</p>` : auto ? '<p>Đến lượt bạn.</p>' : '') });
      } else if (warn && auto) push({ kind: 'warn', body: warn });
      if (auto && a) showHint(a);
      S.busy = false; S.status = '';
      render();
    }, 40);
  }
  function gameMove(m) {
    const pre = S.pos.clone();
    const preKeys = S.keys.slice();
    applyMove(m);
    S.busy = true; S.status = 'Huấn luyện viên đang chấm nước đi…';
    render();
    later(() => {
      // evaluate the user's move
      let rating = null;
      const a = S.step.coach === 'auto' && S.analysis && S.analysis.key === pre.key() ? S.analysis : (() => {
        const keep = S.keys; S.keys = preKeys; const savePos = S.pos; S.pos = pre; S.analysis = null;
        const r = analysisFor(pre); S.pos = savePos; S.keys = keep; return r;
      })();
      const goalDone = checkGoal(m);
      if (a && !goalDone) {
        const same = a.best.from === m.from && a.best.to === m.to && a.best.promo === m.promo;
        const us = same ? a.score : E.scoreMove(pre, m, a.depth, 1500);
        if (us != null) {
          const clamp = (x) => Math.abs(x) > E.MATE - 1000 ? (x > 0 ? 5000 + x / 1000 : -5000 + x / 1000) : Math.max(-3000, Math.min(3000, x));
          const diff = clamp(a.score) - clamp(us);
          rating = same || diff <= 15 ? 'best' : diff <= 50 ? 'good' : diff <= 140 ? 'inacc' : 'blunder';
          if (a.score > E.MATE - 1000 && us < E.MATE - 1000 && rating !== 'best') rating = diff > 140 ? 'blunder' : 'inacc';
          S.evalScore = us;
          const reasons = E.explain(pre, m);
          let body = '';
          if (rating === 'best' || rating === 'good') {
            body = `<ul class="why">${reasons.slice(0, 2).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
          } else {
            const better = E.explain(pre, a.best);
            body = `<p>Tốt hơn là ${mv(a.best)}</p>${plainP(a.best)}<p>Lý do: ${esc(better[0] || '')}</p>`;
            if (rating === 'blunder') {
              const ref = E.think(S.pos, { maxDepth: 3, timeMs: 400 });
              if (ref) {
                const rm = ref.move;
                let r;
                if (ref.score > E.MATE - 1000) r = `Đen có thể chiếu hết bạn, bắt đầu bằng ${mv(rm)}.`;
                else if (rm.cap) r = `Đen có thể đáp ${mv(rm)} và ăn ${NAMEP(rm.cap)} của bạn.`;
                else r = `Đen có nước đáp mạnh: ${mv(rm)}.`;
                body += `<p class="danger">${r}</p>${plainP(rm)}`;
              }
            }
          }
          push({ kind: rating, title: mv(m), body, actions: rating === 'blunder' || rating === 'inacc' ? [{ label: 'Đi lại nước này', fn: undo, cls: 'primary' }] : null });
        }
      }
      if (endCheck()) return;
      // bot's turn
      S.status = 'Đen đang suy nghĩ…'; render();
      later(() => {
        const t0 = Date.now();
        const bm = E.botMove(S.pos, S.step.bot || { depth: 2 });
        const wait = Math.max(0, 450 - (Date.now() - t0));
        later(() => {
          if (!bm) { endCheck(); return; }
          applyMove(bm);
          S.analysis = null;
          if (endCheck(bm)) return;
          coachTurn(bm);
        }, wait);
      }, 60);
    }, 40);
  }
  function checkGoal(m) {
    if (S.step.goal === 'promote' && m.promo) return true;
    return false;
  }
  // returns true if the game ended
  function endCheck(lastBot) {
    const last = S.hist[S.hist.length - 1];
    const goal = S.step.goal;
    let res = null;
    if (goal === 'promote' && last && last.m.promo) {
      res = S.pos.turn === 'b' ? { result: 'white', reason: 'promote' } : { result: 'black', reason: 'promote' };
    }
    if (!res) {
      const st = E.gameStatus(S.pos, S.keys);
      if (st.over) res = st;
    }
    if (!res) { S.busy = false; S.status = ''; if (!lastBot) render(); return false; }
    S.over = true; S.busy = false; S.status = ''; S.arrows = [];
    const again = [{ label: S.step.type === 'game' ? 'Chơi lại' : 'Làm lại', fn: reset }];
    if (res.result === 'white') {
      markDone(); S.celebrate = true;
      S.evalScore = E.MATE;
      const how = res.reason === 'promote' ? 'Tốt của bạn đã về đích trước!' : 'Chiếu hết! Vua đen không còn đường thoát.';
      push({ kind: 'win', label: 'Bạn thắng', title: how, body: `Ván cờ kéo dài ${Math.ceil(S.hist.length / 2)} nước${S.hintsUsed ? `, dùng ${S.hintsUsed} lần gợi ý` : ''}. Bấm <b>"${SI < LV.steps.length - 1 ? 'Bài tiếp theo' : 'Sang cấp tiếp'}"</b> để tiếp tục.` });
    } else if (res.result === 'black') {
      S.evalScore = -E.MATE;
      push({ kind: 'lose', label: 'Bạn thua', title: res.reason === 'promote' ? 'Đen đã phong cấp trước.' : 'Vua trắng bị chiếu hết.', body: 'Đừng nản! Bấm "Đi lại" để xem lại vài nước trước, hoặc chơi ván mới. Bấm "Gợi ý" khi chưa chắc chắn.', actions: [{ label: 'Đi lại', fn: undo, cls: 'primary' }].concat(again) });
    } else {
      S.evalScore = 0;
      const why = { stalemate: 'Hòa pat: bên đến lượt không bị chiếu nhưng hết nước đi.', material: 'Không đủ quân để chiếu hết.', fifty: '50 nước không ăn quân và không đi Tốt.', repetition: 'Thế cờ lặp lại 3 lần.' }[res.reason] || '';
      push({ kind: 'draw', label: 'Hòa', title: why, body: goal === 'win' || goal === 'mate' ? 'Gần thắng rồi! Hãy thử lại và tránh để hòa.' : '', actions: [{ label: 'Đi lại', fn: undo, cls: 'primary' }].concat(again) });
    }
    render();
    return true;
  }
  function undo() {
    if (!S || S.busy || S.step.type !== 'game' || !S.hist.length) return;
    let n = S.pos.turn === 'w' ? 2 : 1;
    if (S.hist.length < n) n = S.hist.length;
    for (let i = 0; i < n; i++) { S.pos.unmake(); S.keys.pop(); S.hist.pop(); }
    if (S.pos.turn !== 'w' && S.hist.length) { S.pos.unmake(); S.keys.pop(); S.hist.pop(); }
    const lm = S.hist[S.hist.length - 1];
    S.lastMove = lm ? [lm.m.from, lm.m.to] : null;
    S.over = false; S.celebrate = false; S.arrows = []; S.analysis = null; S.selected = -1;
    push({ kind: 'info', title: 'Đã đi lại', body: 'Thế cờ đã quay về trước nước đi của bạn. Hãy suy nghĩ kỹ hơn nhé.' });
    if (S.step.coach === 'auto') coachTurn(null); else render();
  }
  function reset() { openStep(LV.id, SI, true); }
  function hint() {
    if (!S || S.busy) return;
    const st = S.step;
    if (st.type === 'stars') {
      push({ kind: 'hint', title: 'Gợi ý', body: esc(st.hint || 'Hãy nhớ lại cách đi của quân này.') });
      render(); return;
    }
    if (st.type === 'puzzle') {
      S.hintStage++;
      const target = st.goal === 'line' ? st.solution[S.solIdx] : st.hintMove;
      if (S.hintStage === 1 && st.hint) push({ kind: 'hint', title: 'Gợi ý', body: esc(st.hint) });
      else if (target) {
        const m = S.pos.find(target);
        if (m) { S.arrows = [[m.from, m.to, 'hint']]; push({ kind: 'hint', title: `Đáp án: ${mv(m)}`, body: plainP(m, 'Mũi tên vàng chỉ nước đi đúng. Hãy đi thử!') }); }
      }
      render(); return;
    }
    if (st.type === 'game' && !S.over) {
      S.busy = true; S.status = 'Huấn luyện viên đang tính toán…'; render();
      later(() => {
        const a = analysisFor(S.pos);
        S.hintsUsed++;
        if (a) { S.evalScore = a.score; showHint(a); }
        S.busy = false; S.status = ''; render();
      }, 40);
    }
  }

  /* ---------- pointer input ---------- */
  function sqFromPoint(x, y) {
    const r = $('#board').getBoundingClientRect();
    if (x < r.left || y < r.top || x >= r.right || y >= r.bottom) return -1;
    const c = Math.floor(((x - r.left) / r.width) * 8), rr = Math.floor(((y - r.top) / r.height) * 8);
    return rr * 8 + c;
  }
  function onDown(e) {
    if (!S || !interactive()) return;
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (sq < 0) return;
    if (S.selected >= 0 && S.selected !== sq && tryMove(S.selected, sq)) { e.preventDefault(); return; }
    const own = legalFrom(sq);
    if (S.pos.b[sq] && E.colorOf(S.pos.b[sq]) === 'w') {
      if (S.step.only && S.pos.b[sq] !== S.step.only) { S.selected = -1; renderBoard(); return; }
      e.preventDefault();
      const wasSel = S.selected === sq;
      S.selected = sq;
      drag = { from: sq, x: e.clientX, y: e.clientY, moved: false, wasSel, id: e.pointerId };
      try { $('#board').setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!own.length && S.step.type !== 'info') { /* no moves */ }
      renderBoard();
    } else { S.selected = -1; renderBoard(); }
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    let g = $('#ghost');
    if (!drag.moved) {
      drag.moved = true;
      const size = $('#board').getBoundingClientRect().width / 8;
      g.style.width = g.style.height = size + 'px';
      g.innerHTML = pieceHTML(S.pos.b[drag.from]);
      g.hidden = false;
      renderBoard();
    }
    g.style.transform = `translate(${e.clientX - g.offsetWidth / 2}px, ${e.clientY - g.offsetHeight / 2}px)`;
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    $('#ghost').hidden = true;
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (d.moved) {
      if (sq >= 0 && sq !== d.from && tryMove(d.from, sq)) return;
      renderBoard(); return;
    }
    if (d.wasSel && sq === d.from) { S.selected = -1; renderBoard(); }
  }

  /* ---------- wiring ---------- */
  function wire() {
    const board = $('#board');
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', () => { drag = null; $('#ghost').hidden = true; if (S) renderBoard(); });
    document.addEventListener('click', (e) => {
      const lv = e.target.closest('[data-lv]');
      if (lv) { const id = +lv.dataset.lv; const L = LEVELS.find((x) => x.id === id); const first = L.steps.findIndex((_, i) => !isDone(id, i)); openStep(id, first < 0 ? 0 : first); return; }
      const si = e.target.closest('[data-si]');
      if (si) { openStep(LV.id, +si.dataset.si); return; }
      const act = e.target.closest('[data-act]');
      if (act && S && S.feed[0] && S.feed[0].actions) { S.feed[0].actions[+act.dataset.act].fn(); return; }
      const id = e.target.closest('button') && e.target.closest('button').id;
      if (id === 'b-next') nextStep();
      else if (id === 'b-hint') hint();
      else if (id === 'b-undo') undo();
      else if (id === 'b-reset') reset();
      else if (id === 'b-home' || id === 'brand') goHome();
      else if (id === 'resume') { const [a, b] = e.target.dataset.go.split('-').map(Number); openStep(a, b); }
      else if (id === 't-sq' || id === 't-pc') {
        if (id === 't-sq') opts.sqNames = !opts.sqNames; else opts.pieceNames = !opts.pieceNames;
        saveOpts(); renderBoard();
      }
      else if (id === 'b-resetall') {
        const c = $('#confirmreset'); c.hidden = false;
      } else if (id === 'b-resetyes') { progress = {}; saveProgress(); $('#confirmreset').hidden = true; render(); }
      else if (id === 'b-resetno') { $('#confirmreset').hidden = true; }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('lvcard')) e.target.click();
    });
    window.addEventListener('hashchange', fromHash);
    const peekOf = (el) => {
      if (el.dataset.peek) return [E.sqIdx(el.dataset.peek)];
      return [+el.dataset.from, +el.dataset.to];
    };
    let peekTimer = null;
    const setPeek = (sqs) => { if (!S || view !== 'lesson') return; const same = JSON.stringify(S.peek) === JSON.stringify(sqs); if (same) return; S.peek = sqs; renderBoard(); };
    document.addEventListener('mouseover', (e) => { const el = e.target.closest('.sqref, [data-from]'); if (el) { clearTimeout(peekTimer); setPeek(peekOf(el)); } });
    document.addEventListener('mouseout', (e) => { const el = e.target.closest('.sqref, [data-from]'); if (el && !el.contains(e.relatedTarget)) setPeek(null); });
    document.addEventListener('click', (e) => {
      const el = e.target.closest('.sqref, [data-from]');
      if (!el) return;
      setPeek(peekOf(el)); clearTimeout(peekTimer); peekTimer = setTimeout(() => setPeek(null), 2500);
      if (window.innerWidth < 860) $('#board').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function start() {
    wire();
    fromHash();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
