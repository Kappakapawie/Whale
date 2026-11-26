// Endless seabed, generated in chunks around the whale.
// The floor height is a pure function of x (seeded), so chunks can be thrown away and rebuilt identically.
// Rocks and pillars come from a per-chunk seeded RNG, so they're the same every time a chunk is rebuilt.
class World {
  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
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

  // 0 = shallow shelf, 1 = abyss. The start area (around x = 0) is always shelf.
  abyssness(x) {
    const c = CONFIG.world;
    let m = this.noise1(x, 5000, 1);
    m = clamp((m - c.abyssBias) / 0.3, 0, 1); m = m * m * (3 - 2 * m);
    return m * clamp((Math.abs(x) - c.startShelfHalfWidth) / c.startShelfFalloff, 0, 1);
  }

  floorRaw(x) {
    const c = CONFIG.world, m = this.abyssness(x);
    let d = lerp(c.shelfDepth, c.abyssDepth, m);
    const ridge = Math.max(0, this.noise1(x, 1100, 2) - 0.65) / 0.35; // occasional undersea ridges
    d -= m * CONFIG.world.ridgeHeight * ridge * ridge * (3 - 2 * ridge);
    const p = this.ph, rough = lerp(0.35, 1, m);
    d += rough * (140 * Math.sin(x / 520 + p[0]) + 70 * Math.sin(x / 190 + p[1]) +
                  28 * Math.sin(x / 61 + p[2]) + 10 * Math.sin(x / 17 + p[3]));
    const co = coastNear(x); // coasts: shallow sandy plateaus (see fauna.js)
    if (co.c > 0) d = lerp(d, CONFIG.coast.depth + 15 * Math.sin(x / 240 + p[1]), co.c);
    return d;
  }

  // Sampled on the same grid as the floor polygons so collision matches what sonar sees.
  floorAt(x) {
    const i = Math.floor(x / this.step), x0 = i * this.step;
    return lerp(this.floorRaw(x0), this.floorRaw(x0 + this.step), (x - x0) / this.step);
  }

  // Load chunks within `radius` of x, drop chunks further away.
  ensureAround(x, radius) {
    const cw = this.chunkW, c0 = Math.floor((x - radius) / cw), c1 = Math.floor((x + radius) / cw);
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
      if (this.abyssness(x) > 0.8) {
        const w = 200 + rng() * 250, base = this.deepestFloor(x, w * 0.7) + 40;
        const h = Math.min(1000 + rng() * 2200, base - 600); // pillar tops stay well below the surface
        if (h > 300) rocks.push(makeSolid('terrain', this.pillarPoly(x, base, h, w, rng)));
      }
    }
    // Seafloor cable lying along the seabed across the whole chunk (consistent: built from the seeded rng).
    const cables = [];
    if (rng() < CONFIG.cables.chancePerChunk && Math.abs(x0) > 800) {
      const line = [];
      for (let x = x0; x <= x0 + cw; x += this.step) line.push([x, this.floorRaw(x) - CONFIG.cables.lift]);
      const poly = [...line.map(p => [p[0], p[1] - 3]), ...line.slice().reverse().map(p => [p[0], p[1] + 3])];
      const solid = makeSolid('cable', poly);
      cables.push({ line, solid, x0: solid.x0, x1: solid.x1, y0: solid.y0, y1: solid.y1 });
    }
    const decor = buildDecor(this, x0, cw, rng);
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
