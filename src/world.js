// Endless seabed, stitched together from SEGMENTS (beach, shelf, open sea, deep sea - CONFIG.segments).
// Segments are added outward from the start as the whale gets near them; each new one is rolled with weights that
// depend on the whale's progress (progressFn: 0 = new whale, 1 = fully grown + upgraded), so a developed whale
// mostly finds open and deep sea. Once made, a segment is remembered, so the floor at x never changes after that:
// chunks can be thrown away and rebuilt identically. Neighbouring segments blend over a smooth slope.
// Rocks and pillars come from a per-chunk seeded RNG, so they're the same every time a chunk is rebuilt.
class World {
  // opts.cosmic: the space reskin after the ascension - only 'void' segments (CONFIG.cosmic.types), no decor or cables.
  constructor(seed = Math.floor(Math.random() * 1e9), progressFn = () => 0, opts = {}) {
    this.seed = seed;
    this.progressFn = progressFn;
    this.cosmic = !!opts.cosmic;
    this.types = this.cosmic ? CONFIG.cosmic.types : CONFIG.segments.types;
    const S = CONFIG.segments;
    this.segRng = { L: mulberry32((seed ^ 0x51ED27) >>> 0), R: mulberry32((seed ^ 0xA11CE5) >>> 0) };
    this.segCount = { L: 0, R: 0 };
    this.segs = this.cosmic ? [{ type: 'void', x0: -3000, x1: 3000, depth: 6600 }]
      : [{ type: S.start.type, x0: -S.start.halfWidth, x1: S.start.halfWidth, depth: CONFIG.world.shelfDepth }];
    this.D = CONFIG.world.depth;
    this.step = 50;
    this.chunkW = CONFIG.world.chunkWidth;
    const r = mulberry32(seed);
    this.ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
    this.salt = r() * 1000;
    this.chunks = new Map();
    this.solids = []; // active sonar-hittable terrain
    this.rocks = [];  // active rocks/pillars (collision)
    this.cables = []; // active seafloor cables (hurt on contact)
    this.decor = [];  // seabed decorations (fauna.js)
  }

  // Smooth 1D value noise in 0..1
  noise1(x, scale, k) {
    const xi = Math.floor(x / scale), t = x / scale - xi, s = t * t * (3 - 2 * t);
    return lerp(hash(xi, this.salt + k), hash(xi + 1, this.salt + k), s);
  }

  // ---- segments
  rollType(rng) {
    // weights follow progress on a curve (sqrt): a growing whale reaches the deep-sea mix early
    const T = this.types, p = Math.pow(clamp(this.progressFn(), 0, 1), CONFIG.segments.progressCurve);
    const ws = Object.keys(T).map(k => [k, lerp(T[k].weight[0], T[k].weight[1], p)]);
    let r = rng() * ws.reduce((a, e) => a + e[1], 0);
    for (const [k, w] of ws) if ((r -= w) <= 0) return k;
    return ws[ws.length - 1][0];
  }

  extend(side) {
    const S = CONFIG.segments, rng = this.segRng[side], n = this.segCount[side]++;
    const roll = this.rollType(rng);
    const type = this.cosmic ? roll : n === 0 ? S.start.neighbour : roll; // open water is always right next to the start
    const T = this.types[type], w = lerp(T.width[0], T.width[1], rng()), depth = lerp(T.depth[0], T.depth[1], rng());
    if (side === 'R') { const e = this.segs[this.segs.length - 1]; this.segs.push({ type, x0: e.x1, x1: e.x1 + w, depth }); }
    else { const e = this.segs[0]; this.segs.unshift({ type, x0: e.x0 - w, x1: e.x0, depth }); }
  }

  // Make sure segments exist from x0 to x1 (new ones use the whale's progress right now).
  cover(x0, x1) {
    while (x1 >= this.segs[this.segs.length - 1].x1) this.extend('R');
    while (x0 < this.segs[0].x0) this.extend('L');
  }
  isGenerated(x) { return x >= this.segs[0].x0 && x < this.segs[this.segs.length - 1].x1; }

  segIndex(x) {
    let lo = 0, hi = this.segs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.segs[mid].x0 <= x) lo = mid; else hi = mid - 1; }
    return lo;
  }
  segAt(x) { this.cover(x, x); return this.segs[this.segIndex(x)]; }

  // The seabed shape of one segment type at x, before blending with its neighbours.
  segProfile(seg, x) {
    const c = CONFIG.world, p = this.ph;
    if (seg.type === 'beach') return seg.depth + 15 * Math.sin(x / 240 + p[1]); // flat sandy plateau
    const m = clamp((seg.depth - c.shelfDepth) / (c.abyssDepth - c.shelfDepth), 0, 1);
    let d = seg.depth;
    if (seg.type !== 'shelf' && seg.type !== 'trench' && seg.type !== 'pelagic') { // (trench = deepest point; open ocean stays flat)
      const ridge = Math.max(0, this.noise1(x, 1100, 2) - 0.65) / 0.35; // occasional undersea ridges
      d -= m * c.ridgeHeight * ridge * ridge * (3 - 2 * ridge);
    }
    const rough = lerp(0.35, 1, m);
    return d + rough * (140 * Math.sin(x / 520 + p[0]) + 70 * Math.sin(x / 190 + p[1]) +
                        28 * Math.sin(x / 61 + p[2]) + 10 * Math.sin(x / 17 + p[3]));
  }

  // The slope between two neighbouring segments lies entirely inside the DEEPER one (so beaches and shelves keep
  // their flat tops). It gets longer the bigger the depth difference, capped so it never fills the deep segment.
  // Returns the x range of the slope.
  slopeBetween(a, b) {
    const S = CONFIG.segments, deeperB = b.depth > a.depth, deep = deeperB ? b : a;
    const r = Math.min(Math.max(S.ramp, Math.abs(b.depth - a.depth) * S.rampPerDepth), (deep.x1 - deep.x0) * S.maxRampShare);
    return deeperB ? [a.x1, a.x1 + r] : [a.x1 - r, a.x1];
  }

  // 0 = shallow shelf, 1 = abyss (deep sea segments). Used for pillars.
  abyssness(x) {
    const s = this.segAt(x), c = CONFIG.world;
    return s.type === 'deep' || s.type === 'trench' || s.type === 'void' ? 1 : s.type === 'beach' ? 0 : clamp((s.depth - c.shelfDepth) / (c.abyssDepth - c.shelfDepth), 0, 1);
  }

  floorRaw(x) {
    const S = CONFIG.segments, R = 9000 * S.maxRampShare; // the widest segment's longest slope
    this.cover(x - R, x + R);
    const i = this.segIndex(x), s = this.segs[i], prev = this.segs[i - 1], next = this.segs[i + 1];
    if (prev) { const [lo, hi] = this.slopeBetween(prev, s); if (x >= lo && x < hi) return this.blend(prev, s, x, lo, hi); }
    if (next) { const [lo, hi] = this.slopeBetween(s, next); if (x >= lo && x < hi) return this.blend(s, next, x, lo, hi); }
    return this.segProfile(s, x);
  }
  blend(a, b, x, lo, hi) {
    let t = clamp((x - lo) / (hi - lo), 0, 1); t = t * t * (3 - 2 * t);
    return lerp(this.segProfile(a, x), this.segProfile(b, x), t);
  }

  // Beaches (coasts): the beach segment at or next to x, with c = 1 on the plateau fading to 0 down its slopes.
  coastNear(x) {
    const S = CONFIG.segments, i = this.segIndex(x);
    let best = { cx: 0, half: 0, c: 0 };
    for (let k = i - 1; k <= i + 1; k++) {
      const s = this.segs[k];
      if (!s || s.type !== 'beach') continue;
      const cx = (s.x0 + s.x1) / 2, half = (s.x1 - s.x0) / 2;
      let c = 1 - clamp((Math.abs(x - cx) - half) / S.ramp, 0, 1);
      c = c * c * (3 - 2 * c);
      if (c > best.c) best = { cx, half, c };
    }
    return best;
  }
  beachesIn(x0, x1) {
    return this.segs.filter(s => s.type === 'beach' && s.x1 > x0 && s.x0 < x1)
      .map(s => ({ cx: (s.x0 + s.x1) / 2, half: (s.x1 - s.x0) / 2 }));
  }

  // Sampled on the same grid as the floor polygons so collision matches what sonar sees.
  floorAt(x) {
    const i = Math.floor(x / this.step), x0 = i * this.step;
    return lerp(this.floorRaw(x0), this.floorRaw(x0 + this.step), (x - x0) / this.step);
  }

  // Load chunks within `radius` of x, drop chunks further away.
  ensureAround(x, radius) {
    const cw = this.chunkW, c0 = Math.floor((x - radius) / cw), c1 = Math.floor((x + radius) / cw);
    const look = CONFIG.segments.lookahead;
    this.cover(x - radius - look, x + radius + look); // decide upcoming segments a little ahead
    // No memory: segments well behind you are forgotten; coming back rolls new ones at your current progress.
    const keep = radius + look + CONFIG.segments.forgetMargin;
    while (this.segs.length > 1 && this.segs[0].x1 < x - keep) { this.segs.shift(); this.segCount.L = Math.max(1, this.segCount.L); }
    while (this.segs.length > 1 && this.segs[this.segs.length - 1].x0 > x + keep) { this.segs.pop(); this.segCount.R = Math.max(1, this.segCount.R); }
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      if (!this.chunks.has(c)) { this.chunks.set(c, this.buildChunk(c)); changed = true; }
    }
    for (const k of this.chunks.keys()) {
      if (k < c0 - 1 || k > c1 + 1) { this.chunks.delete(k); changed = true; }
    }
    if (changed) {
      this.solids = []; this.rocks = []; this.cables = []; this.decor = [];
      for (const ch of this.chunks.values()) {
        this.solids.push(ch.floor, ...ch.rocks); this.rocks.push(...ch.rocks); this.cables.push(...ch.cables); this.decor.push(...ch.decor);
      }
    }
  }

  buildChunk(c) {
    const cw = this.chunkW, x0 = c * cw, D = this.D;
    const rng = mulberry32((this.seed ^ Math.imul(c, 0x9E3779B1)) >>> 0);
    const pts = [];
    for (let x = x0; x <= x0 + cw; x += this.step) pts.push([x, this.floorRaw(x)]);
    pts.push([x0 + cw, D + 800], [x0, D + 800]);
    const floor = makeSolid('terrain', pts); floor.isFloor = true;

    const rocks = [];
    const [rMin, rMax] = CONFIG.world.rocksPerChunk;
    const nRocks = rMin + Math.floor(rng() * (rMax - rMin + 1));
    for (let i = 0; i < nRocks; i++) {
      const x = x0 + rng() * cw;
      if (Math.abs(x) < 400) continue; // keep the spawn point clear
      // never let a rock reach the surface (coasts are shallow)
      const r = Math.min(35 + rng() * 115, (this.floorAt(x) - 40) / 1.3);
      if (r < 15) continue;
      // Sit the rock on the DEEPEST floor point under it, so no thin gap (a trap) forms between rock and slope.
      rocks.push(makeSolid('terrain', this.blobPoly(x, this.deepestFloor(x, r * 1.2) + r * 0.05, r, rng)));
    }
    if (rng() < CONFIG.world.pillarChance) {
      const x = x0 + rng() * cw;
      if (this.abyssness(x) > 0.8 && this.segAt(x).type !== 'pelagic') { // no pillars in the open ocean
        const w = 200 + rng() * 250, base = this.deepestFloor(x, w * 0.7) + 40;
        const h = Math.min(1000 + rng() * 2200, base - 600); // pillar tops stay well below the surface
        if (h > 300) rocks.push(makeSolid('terrain', this.pillarPoly(x, base, h, w, rng)));
      }
    }
    // Seafloor cable lying along the seabed across the whole chunk (consistent: built from the seeded rng).
    const cables = [];
    if (!this.cosmic && rng() < CONFIG.cables.chancePerChunk && Math.abs(x0) > 800) {
      const line = [];
      for (let x = x0; x <= x0 + cw; x += this.step) line.push([x, this.floorRaw(x) - CONFIG.cables.lift]);
      const poly = [...line.map(p => [p[0], p[1] - 3]), ...line.slice().reverse().map(p => [p[0], p[1] + 3])];
      const solid = makeSolid('cable', poly);
      cables.push({ line, solid, x0: solid.x0, x1: solid.x1, y0: solid.y0, y1: solid.y1 });
    }
    const decor = this.cosmic ? [] : buildDecor(this, x0, cw, rng);
    return { floor, rocks, cables, decor };
  }

  deepestFloor(x, halfW) {
    let d = -Infinity;
    for (let s = -halfW; s <= halfW; s += 20) d = Math.max(d, this.floorAt(x + s));
    return d;
  }

  blobPoly(cx, cy, r, rng) {
    const n = 7 + Math.floor(rng() * 5), pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (rng() - 0.5) * 0.4, rr = r * (0.7 + rng() * 0.45);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8]);
    }
    return pts;
  }

  pillarPoly(x, baseY, h, w, rng) {
    const pts = [], steps = 8, j = () => (rng() - 0.5) * 50;
    for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push([x - w / 2 * (1 - t * 0.6) + j(), baseY - h * t]); }
    pts.push([x + j() * 0.8, baseY - h - 20 - rng() * 40]);
    for (let i = steps; i >= 0; i--) { const t = i / steps; pts.push([x + w / 2 * (1 - t * 0.6) + j(), baseY - h * t]); }
    return pts;
  }

  // Push a circle out of the seabed and rocks.
  // Returns the corrected position and the outward surface normal so callers can slide along it.
  resolveCircle(x, y, r) {
    let hit = false, nx = 0, ny = 0;
    const f = this.floorAt(x);
    if (y > f - r) {
      const dy = this.floorAt(x + 20) - this.floorAt(x - 20);
      const l = Math.hypot(dy, 40);
      y = f - r; hit = true; nx = dy / l; ny = -40 / l;
    }
    for (const rock of this.rocks) {
      if (x < rock.x0 - r || x > rock.x1 + r || y < rock.y0 - r || y > rock.y1 + r) continue;
      const p = rock.poly, m = p.length;
      let best = Infinity, cx = 0, cy = 0;
      for (let j = 0; j < m; j++) {
        const A = p[j], B = p[(j + 1) % m];
        const c = closestOnSeg(x, y, A[0], A[1], B[0], B[1]);
        const d = (c[0] - x) ** 2 + (c[1] - y) ** 2;
        if (d < best) { best = d; cx = c[0]; cy = c[1]; }
      }
      const d = Math.sqrt(best) || 0.001;
      const inside = pointInPoly(x, y, p);
      if (!inside && d >= r) continue;
      const ox = inside ? (cx - x) / d : (x - cx) / d, oy = inside ? (cy - y) / d : (y - cy) / d;
      x = cx + ox * r; y = cy + oy * r;
      hit = true; nx = ox; ny = oy;
    }
    return { x, y, hit, nx, ny };
  }

  blocked(x, y) {
    if (y > this.floorAt(x)) return true;
    for (const r of this.rocks) {
      if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
      if (pointInPoly(x, y, r.poly)) return true;
    }
    return false;
  }
}
