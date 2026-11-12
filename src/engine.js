/* ===== Chess engine: rules, search, coaching analysis ===== */
const Engine = (function () {
  'use strict';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const NAME = { p: 'Tốt', n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu', k: 'Vua' };
  const MATE = 100000, INF = 1e9;

  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    km: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
  };
  const PASSED = [0, 0, 10, 20, 35, 60, 100, 0]; // by ranks advanced from start

  // precomputed geometry (index 0 = a8, 63 = h1)
  const KN = [], KG = [], RD = [], RO = [];
  for (let s = 0; s < 64; s++) {
    const r = s >> 3, c = s & 7;
    const jump = (ds) => ds.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < 8 && b >= 0 && b < 8).map(([a, b]) => a * 8 + b);
    KN[s] = jump([[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]);
    KG[s] = jump([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
    const ray = (dirs) => dirs.map(([dr, dc]) => { const a = []; let nr = r + dr, nc = c + dc; while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { a.push(nr * 8 + nc); nr += dr; nc += dc; } return a; });
    RD[s] = ray([[-1,-1],[-1,1],[1,-1],[1,1]]);
    RO[s] = ray([[-1,0],[1,0],[0,-1],[0,1]]);
  }
  const CR = new Array(64).fill(15);
  CR[60] = 12; CR[63] = 14; CR[56] = 13; CR[4] = 3; CR[7] = 11; CR[0] = 7;

  const sqName = (s) => 'abcdefgh'[s & 7] + (8 - (s >> 3));
  const sqIdx = (n) => (8 - +n[1]) * 8 + 'abcdefgh'.indexOf(n[0]);
  const colorOf = (p) => (p ? (p < 'a' ? 'w' : 'b') : null);
  const opp = (c) => (c === 'w' ? 'b' : 'w');
  const uci = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');

  class Position {
    constructor(fen) { this.load(fen || START); }
    load(fen) {
      const [bd, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
      this.b = new Array(64).fill(null);
      let s = 0;
      for (const ch of bd) { if (ch === '/') continue; if (ch >= '1' && ch <= '8') s += +ch; else this.b[s++] = ch; }
      this.turn = turn || 'w';
      this.castle = 0;
      if (cast && cast !== '-') { if (cast.includes('K')) this.castle |= 1; if (cast.includes('Q')) this.castle |= 2; if (cast.includes('k')) this.castle |= 4; if (cast.includes('q')) this.castle |= 8; }
      this.ep = ep && ep !== '-' ? sqIdx(ep) : -1;
      this.half = +half || 0; this.full = +full || 1;
      this.kw = this.b.indexOf('K'); this.kb = this.b.indexOf('k');
      this.hist = [];
    }
    fen() {
      let out = '';
      for (let r = 0; r < 8; r++) {
        let e = 0;
        for (let c = 0; c < 8; c++) { const p = this.b[r * 8 + c]; if (!p) e++; else { if (e) { out += e; e = 0; } out += p; } }
        if (e) out += e; if (r < 7) out += '/';
      }
      let cs = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : '');
      return `${out} ${this.turn} ${cs || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }
    key() { return this.b.map((p) => p || '.').join('') + this.turn + this.castle + (this.ep >= 0 ? this.ep : ''); }
    clone() { const p = new Position('8/8/8/8/8/8/8/8 w - - 0 1'); p.b = this.b.slice(); p.turn = this.turn; p.castle = this.castle; p.ep = this.ep; p.half = this.half; p.full = this.full; p.kw = this.kw; p.kb = this.kb; return p; }

    attacked(sq, by) {
      const b = this.b, r = sq >> 3, c = sq & 7;
      if (by === 'w') { if (r < 7) { if (c > 0 && b[sq + 7] === 'P') return true; if (c < 7 && b[sq + 9] === 'P') return true; } }
      else { if (r > 0) { if (c > 0 && b[sq - 9] === 'p') return true; if (c < 7 && b[sq - 7] === 'p') return true; } }
      const w = by === 'w';
      const N = w ? 'N' : 'n', K = w ? 'K' : 'k', B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
      for (const t of KN[sq]) if (b[t] === N) return true;
      for (const t of KG[sq]) if (b[t] === K) return true;
      for (const ray of RD[sq]) for (const t of ray) { const p = b[t]; if (p) { if (p === B || p === Q) return true; break; } }
      for (const ray of RO[sq]) for (const t of ray) { const p = b[t]; if (p) { if (p === R || p === Q) return true; break; } }
      return false;
    }
    // squares of pieces of color `by` attacking sq
    attackers(sq, by) {
      const b = this.b, r = sq >> 3, c = sq & 7, out = [], w = by === 'w';
      if (w) { if (r < 7) { if (c > 0 && b[sq + 7] === 'P') out.push(sq + 7); if (c < 7 && b[sq + 9] === 'P') out.push(sq + 9); } }
      else { if (r > 0) { if (c > 0 && b[sq - 9] === 'p') out.push(sq - 9); if (c < 7 && b[sq - 7] === 'p') out.push(sq - 7); } }
      const N = w ? 'N' : 'n', K = w ? 'K' : 'k', B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
      for (const t of KN[sq]) if (b[t] === N) out.push(t);
      for (const t of KG[sq]) if (b[t] === K) out.push(t);
      for (const ray of RD[sq]) for (const t of ray) { const p = b[t]; if (p) { if (p === B || p === Q) out.push(t); break; } }
      for (const ray of RO[sq]) for (const t of ray) { const p = b[t]; if (p) { if (p === R || p === Q) out.push(t); break; } }
      return out;
    }
    inCheck(color) {
      color = color || this.turn;
      const k = color === 'w' ? this.kw : this.kb;
      return k >= 0 && this.attacked(k, opp(color));
    }
    pseudo(capsOnly) {
      const b = this.b, us = this.turn, W = us === 'w', out = [];
      const isEnemy = (p) => p && (p < 'a') !== W;
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (!p || (p < 'a') !== W) continue;
        const t = p.toLowerCase();
        if (t === 'p') {
          const dir = W ? -8 : 8, r = s >> 3, c = s & 7, startR = W ? 6 : 1, promoR = W ? 0 : 7;
          const one = s + dir;
          if (one >= 0 && one < 64 && !b[one]) {
            if ((one >> 3) === promoR) { for (const pr of capsOnly ? ['q'] : ['q', 'r', 'b', 'n']) out.push({ from: s, to: one, p, cap: null, promo: pr, fl: 0 }); }
            else if (!capsOnly) {
              out.push({ from: s, to: one, p, cap: null, promo: null, fl: 0 });
              if (r === startR && !b[one + dir]) out.push({ from: s, to: one + dir, p, cap: null, promo: null, fl: 1 });
            }
          }
          for (const dc of [-1, 1]) {
            const nc = c + dc; if (nc < 0 || nc > 7) continue;
            const to = one + dc; if (to < 0 || to > 63) continue;
            if (isEnemy(b[to])) {
              if ((to >> 3) === promoR) { for (const pr of capsOnly ? ['q'] : ['q', 'r', 'b', 'n']) out.push({ from: s, to, p, cap: b[to], promo: pr, fl: 0 }); }
              else out.push({ from: s, to, p, cap: b[to], promo: null, fl: 0 });
            } else if (to === this.ep && !b[to]) out.push({ from: s, to, p, cap: W ? 'p' : 'P', promo: null, fl: 2 });
          }
        } else if (t === 'n' || t === 'k') {
          for (const to of (t === 'n' ? KN : KG)[s]) {
            const q = b[to];
            if (!q) { if (!capsOnly) out.push({ from: s, to, p, cap: null, promo: null, fl: 0 }); }
            else if (isEnemy(q)) out.push({ from: s, to, p, cap: q, promo: null, fl: 0 });
          }
          if (t === 'k' && !capsOnly) {
            if (W && s === 60) {
              if ((this.castle & 1) && !b[61] && !b[62] && b[63] === 'R' && !this.attacked(60, 'b') && !this.attacked(61, 'b') && !this.attacked(62, 'b')) out.push({ from: 60, to: 62, p, cap: null, promo: null, fl: 3 });
              if ((this.castle & 2) && !b[59] && !b[58] && !b[57] && b[56] === 'R' && !this.attacked(60, 'b') && !this.attacked(59, 'b') && !this.attacked(58, 'b')) out.push({ from: 60, to: 58, p, cap: null, promo: null, fl: 4 });
            } else if (!W && s === 4) {
              if ((this.castle & 4) && !b[5] && !b[6] && b[7] === 'r' && !this.attacked(4, 'w') && !this.attacked(5, 'w') && !this.attacked(6, 'w')) out.push({ from: 4, to: 6, p, cap: null, promo: null, fl: 3 });
              if ((this.castle & 8) && !b[3] && !b[2] && !b[1] && b[0] === 'r' && !this.attacked(4, 'w') && !this.attacked(3, 'w') && !this.attacked(2, 'w')) out.push({ from: 4, to: 2, p, cap: null, promo: null, fl: 4 });
            }
          }
        } else {
          const rays = t === 'b' ? RD[s] : t === 'r' ? RO[s] : RD[s].concat(RO[s]);
          for (const ray of rays) for (const to of ray) {
            const q = b[to];
            if (!q) { if (!capsOnly) out.push({ from: s, to, p, cap: null, promo: null, fl: 0 }); }
            else { if (isEnemy(q)) out.push({ from: s, to, p, cap: q, promo: null, fl: 0 }); break; }
          }
        }
      }
      return out;
    }
    make(m) {
      const b = this.b, us = this.turn;
      this.hist.push({ m, castle: this.castle, ep: this.ep, half: this.half, kw: this.kw, kb: this.kb });
      b[m.from] = null;
      if (m.fl === 2) b[us === 'w' ? m.to + 8 : m.to - 8] = null;
      b[m.to] = m.promo ? (us === 'w' ? m.promo.toUpperCase() : m.promo) : m.p;
      if (m.fl === 3) { if (us === 'w') { b[63] = null; b[61] = 'R'; } else { b[7] = null; b[5] = 'r'; } }
      if (m.fl === 4) { if (us === 'w') { b[56] = null; b[59] = 'R'; } else { b[0] = null; b[3] = 'r'; } }
      if (m.p === 'K') this.kw = m.to; else if (m.p === 'k') this.kb = m.to;
      this.castle &= CR[m.from] & CR[m.to];
      this.ep = m.fl === 1 ? (us === 'w' ? m.from - 8 : m.from + 8) : -1;
      this.half = (m.p === 'P' || m.p === 'p' || m.cap) ? 0 : this.half + 1;
      if (us === 'b') this.full++;
      this.turn = opp(us);
    }
    unmake() {
      const h = this.hist.pop(), m = h.m, b = this.b;
      this.turn = opp(this.turn);
      const us = this.turn;
      if (us === 'b') this.full--;
      b[m.from] = m.p;
      if (m.fl === 2) { b[m.to] = null; b[us === 'w' ? m.to + 8 : m.to - 8] = us === 'w' ? 'p' : 'P'; }
      else b[m.to] = m.cap || null;
      if (m.fl === 3) { if (us === 'w') { b[63] = 'R'; b[61] = null; } else { b[7] = 'r'; b[5] = null; } }
      if (m.fl === 4) { if (us === 'w') { b[56] = 'R'; b[59] = null; } else { b[0] = 'r'; b[3] = null; } }
      this.castle = h.castle; this.ep = h.ep; this.half = h.half; this.kw = h.kw; this.kb = h.kb;
    }
    legal() {
      const out = [], us = this.turn;
      for (const m of this.pseudo(false)) { this.make(m); if (!this.inCheck(us)) out.push(m); this.unmake(); }
      return out;
    }
    find(u) { return this.legal().find((m) => uci(m) === u || (uci(m) === u + 'q')) || null; }
    san(m, legalList) {
      if (m.fl === 3) return this._suffix(m, 'O-O');
      if (m.fl === 4) return this._suffix(m, 'O-O-O');
      const t = m.p.toLowerCase();
      let s = '';
      if (t === 'p') {
        if (m.cap) s = 'abcdefgh'[m.from & 7] + 'x';
        s += sqName(m.to);
        if (m.promo) s += '=' + m.promo.toUpperCase();
      } else {
        s = t.toUpperCase();
        const amb = (legalList || this.legal()).filter((o) => o.p === m.p && o.to === m.to && o.from !== m.from);
        if (amb.length) {
          const sf = amb.some((o) => (o.from & 7) === (m.from & 7)), sr = amb.some((o) => (o.from >> 3) === (m.from >> 3));
          if (!sf) s += 'abcdefgh'[m.from & 7]; else if (!sr) s += 8 - (m.from >> 3); else s += sqName(m.from);
        }
        if (m.cap) s += 'x';
        s += sqName(m.to);
      }
      return this._suffix(m, s);
    }
    _suffix(m, s) {
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }
    material(color) {
      let v = 0; for (const p of this.b) if (p && colorOf(p) === color) v += VAL[p.toLowerCase()];
      return v;
    }
  }

  /* ---------- evaluation (white's point of view) ---------- */
  function evaluate(pos) {
    const b = pos.b;
    let npm = 0, wb = 0, bb = 0, wMat = 0, bMat = 0, wPawns = 0, bPawns = 0;
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (!p) continue;
      const t = p.toLowerCase();
      if (t !== 'p' && t !== 'k') npm += VAL[t];
      if (p === 'B') wb++; else if (p === 'b') bb++;
      if (p < 'a') { wMat += VAL[t]; if (t === 'p') wPawns++; } else { bMat += VAL[t]; if (t === 'p') bPawns++; }
    }
    const endgame = npm <= 1400;
    let sc = 0;
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (!p) continue;
      const w = p < 'a', t = p.toLowerCase(), i = w ? s : s ^ 56;
      let v = VAL[t];
      if (t === 'k') v += endgame ? PST.ke[i] : PST.km[i];
      else v += PST[t][i];
      if (t === 'p' && endgame) {
        const adv = w ? 6 - (s >> 3) : (s >> 3) - 1; // squares advanced
        v += PASSED[adv + 1] || 0;
      }
      sc += w ? v : -v;
    }
    if (wb >= 2) sc += 30; if (bb >= 2) sc -= 30;
    // mop-up: help the stronger side drive a bare king to the edge
    if (pos.kw >= 0 && pos.kb >= 0 && endgame) {
      const diff = wMat - bMat;
      if (Math.abs(diff) >= 400 && (diff > 0 ? bPawns === 0 : wPawns === 0)) {
        const loser = diff > 0 ? pos.kb : pos.kw, winner = diff > 0 ? pos.kw : pos.kb;
        const lr = loser >> 3, lc = loser & 7, wr = winner >> 3, wc = winner & 7;
        const cmd = Math.max(3 - lr, lr - 4) + Math.max(3 - lc, lc - 4);
        const dist = Math.abs(lr - wr) + Math.abs(lc - wc);
        // how many squares can the bare king still reach (smaller box = better)
        let room = 0;
        const by = diff > 0 ? 'w' : 'b';
        for (const t of KG[loser]) { const q = pos.b[t]; if ((!q || colorOf(q) === by) && !pos.attacked(t, by)) room++; }
        const bonus = cmd * 14 + (14 - dist) * 6 - room * 8;
        sc += diff > 0 ? bonus : -bonus;
      }
    }
    return sc;
  }

  /* ---------- search ---------- */
  let nodes = 0, deadline = Infinity, stopped = false;
  const killers = [];
  function orderMoves(ms, ply, first) {
    for (const m of ms) {
      let s = 0;
      if (first && m.from === first.from && m.to === first.to && m.promo === first.promo) s = 1e6;
      else if (m.cap) s = 10000 + VAL[m.cap.toLowerCase()] * 10 - VAL[m.p.toLowerCase()] / 10;
      else if (m.promo) s = 9000;
      else if (killers[ply] && killers[ply].some((k) => k && k.from === m.from && k.to === m.to)) s = 5000;
      m._o = s;
    }
    ms.sort((a, c) => c._o - a._o);
    return ms;
  }
  function tick() { if ((++nodes & 1023) === 0 && Date.now() > deadline) stopped = true; return stopped; }
  function qs(pos, alpha, beta, qd) {
    if (tick()) return 0;
    const sign = pos.turn === 'w' ? 1 : -1;
    const stand = evaluate(pos) * sign;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd >= 6) return stand;
    const us = pos.turn;
    const ms = orderMoves(pos.pseudo(true), 0, null);
    for (const m of ms) {
      pos.make(m);
      if (pos.inCheck(us)) { pos.unmake(); continue; }
      const sc = -qs(pos, -beta, -alpha, qd + 1);
      pos.unmake();
      if (stopped) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function negamax(pos, depth, alpha, beta, ply) {
    if (tick()) return 0;
    const us = pos.turn;
    const chk = pos.inCheck(us);
    if (chk && ply < 10) depth++;
    if (depth <= 0) return qs(pos, alpha, beta, 0);
    if (pos.half >= 100) return 0;
    let best = -INF, any = false;
    const ms = orderMoves(pos.pseudo(false), ply, null);
    for (const m of ms) {
      pos.make(m);
      if (pos.inCheck(us)) { pos.unmake(); continue; }
      any = true;
      const sc = -negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      pos.unmake();
      if (stopped) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!m.cap) { killers[ply] = killers[ply] || []; killers[ply].unshift(m); killers[ply].length = 2; }
        break;
      }
    }
    if (!any) return chk ? -MATE + ply : 0;
    return best;
  }

  // iterative deepening; returns { move, score (side-to-move POV), depth, scored }
  function think(pos, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth || 4, timeMs = opts.timeMs || 800;
    const root = pos.legal();
    if (!root.length) return null;
    const t0 = Date.now();
    let scored = root.map((m) => ({ m, s: 0 }));
    // light initial ordering: captures first
    orderMoves(root, 0, null);
    scored = root.map((m) => ({ m, s: 0 }));
    let result = null;
    for (let d = 1; d <= maxDepth; d++) {
      stopped = false; nodes = 0;
      deadline = d === 1 ? Infinity : t0 + timeMs;
      let alpha = -INF;
      for (const it of scored) {
        pos.make(it.m);
        const rep = opts.avoid && opts.avoid.has(pos.key());
        const sc = rep ? 0 : -negamax(pos, d - 1, -INF, -alpha, 1);
        pos.unmake();
        if (stopped) break;
        it.s = sc;
        if (sc > alpha) alpha = sc;
      }
      if (stopped) break;
      scored.sort((a, c) => c.s - a.s);
      result = { move: scored[0].m, score: scored[0].s, depth: d };
      if (Math.abs(scored[0].s) > MATE - 1000) break;
      if (Date.now() - t0 > timeMs * 0.45) break;
    }
    deadline = Infinity; stopped = false;
    return result;
  }
  // exact score (mover POV) of every root move at fixed depth
  function rootScores(pos, depth, timeMs) {
    const root = pos.legal();
    deadline = timeMs ? Date.now() + timeMs : Infinity; stopped = false; nodes = 0;
    const out = [];
    for (const m of root) {
      pos.make(m);
      const sc = -negamax(pos, depth - 1, -INF, INF, 1);
      pos.unmake();
      if (stopped) break;
      out.push({ m, s: sc });
    }
    deadline = Infinity; stopped = false;
    out.sort((a, c) => c.s - a.s);
    return out;
  }
  // score of a specific move (mover POV) at depth
  function scoreMove(pos, m, depth, timeMs) {
    deadline = Date.now() + (timeMs || 1500); stopped = false; nodes = 0;
    pos.make(m);
    const sc = -negamax(pos, depth - 1, -INF, INF, 1);
    pos.unmake();
    const ok = !stopped;
    deadline = Infinity; stopped = false;
    return ok ? sc : null;
  }
  function botMove(pos, cfg) {
    const legal = pos.legal();
    if (!legal.length) return null;
    if (cfg.blunder && Math.random() < cfg.blunder) return legal[Math.floor(Math.random() * legal.length)];
    if (cfg.noise) {
      const sc = rootScores(pos, cfg.depth || 2, 2500);
      if (!sc.length) return legal[0];
      const best = sc[0].s;
      if (best > MATE - 1000) return sc[0].m;
      const pool = sc.filter((x) => x.s >= best - cfg.noise);
      return pool[Math.floor(Math.random() * pool.length)].m;
    }
    const r = think(pos, { maxDepth: cfg.depth || 3, timeMs: cfg.timeMs || 1200 });
    return r ? r.move : legal[0];
  }

  /* ---------- coaching helpers ---------- */
  function minAttackerVal(pos, sq, by) {
    let v = Infinity;
    for (const a of pos.attackers(sq, by)) { const t = pos.b[a].toLowerCase(); const x = t === 'k' ? 2000 : VAL[t]; if (x < v) v = x; }
    return v;
  }
  // is the piece on sq (belonging to color) under a real threat?
  function threatened(pos, sq) {
    const p = pos.b[sq]; if (!p) return false;
    const c = colorOf(p), t = p.toLowerCase();
    if (t === 'k') return false;
    const them = opp(c);
    if (!pos.attacked(sq, them)) return false;
    const defended = pos.attacked(sq, c);
    if (!defended) return true;
    return minAttackerVal(pos, sq, them) < VAL[t];
  }
  function hangingPieces(pos, color) {
    const out = [];
    for (let s = 0; s < 64; s++) { const p = pos.b[s]; if (p && colorOf(p) === color && p.toLowerCase() !== 'k' && threatened(pos, s)) out.push(s); }
    out.sort((a, c) => VAL[pos.b[c].toLowerCase()] - VAL[pos.b[a].toLowerCase()]);
    return out;
  }
  function pname(p) { return NAME[p.toLowerCase()]; }

  // Vietnamese reasons why move m (by side to move) is useful
  function explain(pos, m) {
    const us = pos.turn, them = opp(us), t = m.p.toLowerCase();
    const reasons = [];
    const nm = NAME[t];
    const wasThreat = threatened(pos, m.from);
    const hangBefore = hangingPieces(pos, us).filter((s) => s !== m.from);
    const centre = [27, 28, 35, 36];
    pos.make(m);
    const check = pos.inCheck(them);
    const replies = pos.legal().length;
    if (!replies && check) { pos.unmake(); return ['Chiếu hết! Vua đối phương không còn đường thoát.']; }
    if (!replies) reasons.push('Cẩn thận: sau nước này đối phương hết nước đi mà không bị chiếu, ván cờ sẽ HÒA (hòa pat).');
    if (m.fl === 3 || m.fl === 4) reasons.push('Nhập thành: đưa Vua vào góc an toàn và đưa Xe ra hoạt động.');
    if (m.promo) reasons.push(`Phong cấp: Tốt về đích trở thành ${NAME[m.promo]}.`);
    if (m.fl === 2) reasons.push(`Bắt Tốt qua đường: ăn Tốt ở ${sqName(us === 'w' ? m.to + 8 : m.to - 8)} vừa đi 2 ô.`);
    else if (m.cap) {
      const ct = m.cap.toLowerCase();
      const defended = pos.attacked(m.to, them);
      if (!defended) reasons.push(`Ăn ${NAME[ct]} ở ${sqName(m.to)} miễn phí, quân này không được bảo vệ.`);
      else if (VAL[ct] > VAL[t] && t !== 'k') reasons.push(`Dùng ${nm} (${VAL[t] / 100 | 0} điểm) đổi lấy ${NAME[ct]} (${VAL[ct] / 100 | 0} điểm), có lời.`);
      else if (VAL[ct] === VAL[t] || (ct === 'b' && t === 'n') || (ct === 'n' && t === 'b')) reasons.push(`Đổi ${nm} lấy ${NAME[ct]} ngang giá.`);
      else reasons.push(`Ăn ${NAME[ct]} ở ${sqName(m.to)}.`);
    }
    if (check) reasons.push('Chiếu Vua, buộc đối phương phải đối phó ngay.');
    // threats created by the moved piece
    const mover = pos.b[m.to];
    const targets = [];
    const myVal = VAL[mover.toLowerCase()] || 0;
    const enemySqAttacked = (sq) => {
      // does the piece on m.to attack sq? check via attackers list
      return pos.attackers(sq, us).includes(m.to);
    };
    for (let s = 0; s < 64; s++) {
      const p = pos.b[s];
      if (!p || colorOf(p) !== them) continue;
      if (!enemySqAttacked(s)) continue;
      const pt = p.toLowerCase();
      if (pt === 'k') { targets.push({ s, pt }); continue; }
      if (VAL[pt] > myVal || !pos.attacked(s, them)) targets.push({ s, pt });
    }
    const safeHere = !threatened(pos, m.to);
    if (targets.length >= 2 && safeHere) {
      reasons.push(`Đòn chĩa: ${nm} tấn công cùng lúc ${targets.map((x) => NAME[x.pt] + ' ' + sqName(x.s)).join(' và ')}. Đối phương không thể cứu hết.`);
    } else if (targets.length === 1 && targets[0].pt !== 'k' && safeHere) {
      reasons.push(`Đe dọa ăn ${NAME[targets[0].pt]} ở ${sqName(targets[0].s)}.`);
    }
    if (wasThreat && safeHere && !m.cap) reasons.push(`Đưa ${nm} thoát khỏi chỗ đang bị tấn công.`);
    const saved = hangBefore.filter((s) => s !== m.to && pos.b[s] && !threatened(pos, s));
    if (saved.length && !m.cap) reasons.push(`Bảo vệ ${pname(pos.b[saved[0]])} ở ${sqName(saved[0])} đang bị đe dọa.`);
    const backRank = us === 'w' ? 7 : 0;
    if ((t === 'n' || t === 'b') && (m.from >> 3) === backRank && pos.full <= 15) reasons.push(`Phát triển ${nm} ra trận, sẵn sàng tham chiến.`);
    if (t === 'p' && centre.includes(m.to)) reasons.push('Chiếm trung tâm bàn cờ, tạo không gian cho các quân khác.');
    if (!safeHere && !check && t !== 'k') reasons.push(`Lưu ý: ${nm} ở ${sqName(m.to)} có thể bị bắt, nhưng máy tính tính được nước này vẫn tốt.`);
    pos.unmake();
    if (!reasons.length) {
      if (t === 'k') reasons.push('Đưa Vua đến gần hơn để hỗ trợ (trong tàn cuộc Vua là một quân chiến đấu).');
      else if (t === 'p') reasons.push('Đẩy Tốt lên, giành thêm không gian.');
      else if (t === 'r') reasons.push('Đưa Xe đến hàng hoặc cột tốt hơn, giúp Xe hoạt động mạnh hơn.');
      else reasons.push(`Đưa ${nm} đến vị trí hoạt động tốt hơn.`);
    }
    return reasons;
  }
  // threats the opponent makes right now against `color` (it is `color`'s turn)
  function threatsAgainst(pos, color) {
    const out = [];
    for (const s of hangingPieces(pos, color)) {
      const by = pos.attackers(s, opp(color)).sort((a, c) => (VAL[pos.b[a].toLowerCase()] || 2000) - (VAL[pos.b[c].toLowerCase()] || 2000))[0];
      out.push({ sq: s, piece: pos.b[s], by, byPiece: pos.b[by] });
    }
    return out;
  }
  function moveText(m) {
    if (m.fl === 3) return 'Nhập thành cánh Vua (O-O)';
    if (m.fl === 4) return 'Nhập thành cánh Hậu (O-O-O)';
    return `${NAME[m.p.toLowerCase()]} ${sqName(m.from)} → ${sqName(m.to)}${m.promo ? ' (phong ' + NAME[m.promo] + ')' : ''}`;
  }
  function gameStatus(pos, keys) {
    const legal = pos.legal();
    if (!legal.length) return pos.inCheck() ? { over: true, result: pos.turn === 'w' ? 'black' : 'white', reason: 'mate' } : { over: true, result: 'draw', reason: 'stalemate' };
    // insufficient material
    const pcs = pos.b.filter((p) => p && p.toLowerCase() !== 'k');
    if (pos.kw >= 0 && pos.kb >= 0 && (pcs.length === 0 || (pcs.length === 1 && 'nbNB'.includes(pcs[0])))) return { over: true, result: 'draw', reason: 'material' };
    if (pos.half >= 100) return { over: true, result: 'draw', reason: 'fifty' };
    if (keys) { const k = pos.key(); if (keys.filter((x) => x === k).length >= 3) return { over: true, result: 'draw', reason: 'repetition' }; }
    return { over: false };
  }

  return { Position, START, VAL, NAME, MATE, sqName, sqIdx, uci, colorOf, opp, evaluate, think, rootScores, scoreMove, botMove, explain, threatsAgainst, threatened, hangingPieces, moveText, gameStatus };
})();
if (typeof module !== 'undefined') module.exports = Engine;
