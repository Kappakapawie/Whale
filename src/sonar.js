// Echolocation. A click casts rays; each ray stops at the FIRST edge it hits.
// Neighbouring rays that hit the same object close together are joined into a "face" line.
// Only those face fragments are ever shown — never full outlines.
//
// emit() takes multipliers from the whale (size + upgrades):
//   { rangeMult, coneMult, cdMult, lifeMult, speedMult }
class Sonar {
  constructor() {
    this.pings = [];   // expanding wavefronts (visual)
    this.echoes = [];  // revealed face fragments
    this.models = [];  // hologram snapshots of scanned creatures (see Game.scanCreature)
    this.cool = { beam: 0, burst: 0 };
    this.maxCool = { beam: 1, burst: 1 };
  }

  update(dt, time) {
    this.cool.beam = Math.max(0, this.cool.beam - dt);
    this.cool.burst = Math.max(0, this.cool.burst - dt);
    this.pings = this.pings.filter(p => time - p.t0 < p.range / p.speed);
    this.echoes = this.echoes.filter(e => time - e.t < e.life);
    this.models = this.models.filter(m => time - m.t < m.life);
  }

  emit(type, x, y, aim, solids, time, o) {
    const S = CONFIG.sonar, cfg = S[type];
    if (this.cool[type] > 0) return null;
    this.cool[type] = this.maxCool[type] = cfg.cooldown * o.cdMult;

    const range = cfg.range * o.rangeMult, speed = S.speed * o.speedMult, life = S.echoLife * o.lifeMult;
    const coneDeg = cfg.coneDeg >= 360 ? 360 : Math.min(300, cfg.coneDeg * o.coneMult);
    const full = coneDeg >= 360;
    const cone = full ? TAU : coneDeg * Math.PI / 180;
    const joinDist = S.faceJoinDist * o.rangeMult;
    const cls = o.classify || (s => s.kind); // echo color class: terrain | edible | inedible | cable
    const skip = o.skipEcho || (() => false); // fully learned creatures show only their model, no hit lines
    this.pings.push({ x, y, angle: aim, cone, full, range, speed, t0: time });

    const cands = [];
    for (const s of solids) {
      if (s.poly.length > 1 && dist(x, y, s.bx, s.by) < range + s.br) cands.push(s);
    }

    const n = cfg.rays, hits = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = full ? i / n * TAU : aim - cone / 2 + cone * i / (n - 1);
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = range, bs = null, bj = -1;
      for (const s of cands) {
        const p = s.poly, m = p.length;
        for (let j = 0; j < m; j++) {
          const A = p[j], B = p[(j + 1) % m];
          const t = raySeg(x, y, dx, dy, A[0], A[1], B[0], B[1]);
          if (t > 0.5 && t < best) { best = t; bs = s; bj = j; }
        }
      }
      if (!bs) { hits[i] = null; continue; }
      const A = bs.poly[bj], B = bs.poly[(bj + 1) % bs.poly.length];
      let nx = -(B[1] - A[1]), ny = B[0] - A[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const facing = Math.abs(dx * nx + dy * ny); // head-on faces echo brighter
      const inten = (0.25 + 0.75 * facing) * (1 - 0.55 * best / range);
      hits[i] = { x: x + dx * best, y: y + dy * best, d: best, s: bs, i: inten };
      if (o.onRayHit) o.onRayHit(bs, bj); // per-ray hook (the kraken is revealed edge by edge)
    }

    const joined = new Uint8Array(n);
    const hitSolids = new Map();
    for (let i = 0; i < n; i++) {
      const h = hits[i];
      if (!h) continue;
      const prev = hitSolids.get(h.s);
      if (prev === undefined || h.d < prev) hitSolids.set(h.s, h.d);
      if (skip(h.s)) continue;
      const j = i + 1;
      if (j >= n && !full) continue;
      const g = hits[j % n];
      if (!g || g.s !== h.s) continue;
      if (dist(h.x, h.y, g.x, g.y) > joinDist) continue;
      joined[i] = 1; joined[j % n] = 1;
      this.echoes.push({ line: true, x1: h.x, y1: h.y, x2: g.x, y2: g.y,
        t: time + Math.min(h.d, g.d) / speed, life, i: (h.i + g.i) / 2, kind: cls(h.s), owner: h.s.owner,
        vx: (h.s.owner && h.s.owner.vx) || 0, vy: (h.s.owner && h.s.owner.vy) || 0 }); // keeps gliding with its heading
    }
    for (let i = 0; i < n; i++) {
      const h = hits[i];
      if (h && !joined[i] && !skip(h.s)) this.echoes.push({ line: false, x1: h.x, y1: h.y, t: time + h.d / speed, life, i: h.i, kind: cls(h.s), owner: h.s.owner, vx: (h.s.owner && h.s.owner.vx) || 0, vy: (h.s.owner && h.s.owner.vy) || 0 });
    }
    return { hitSolids, range, speed, loudness: cfg.loudness };
  }
}
