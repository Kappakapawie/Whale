// Ocean life that is NOT part of the food chain: ambient fauna (blue whales, dolphins, glowing deep-sea
// animals, crabs...), human swimmers at the coasts (edible - but raises your WANTED level), and seabed
// decorations (kelp, corals, sponges, sea pens, whale falls). Glowing things are drawn after the darkness
// overlay, so they can be seen in the deep without sonar (they emit their own light).

Object.assign(SHAPES, {
  baleen: [[50, 0], [46, -6], [30, -10], [0, -11], [-25, -8], [-38, -4], [-46, -2], [-52, -12], [-48, 0], [-52, 12],
           [-46, 2], [-38, 4], [-10, 9], [20, 10], [40, 7]],
  dolphin: [[50, 1], [38, -3], [30, -8], [10, -12], [2, -22], [-6, -11], [-30, -7], [-42, -2], [-50, -10], [-46, 0],
            [-50, 10], [-42, 2], [-20, 8], [20, 10], [40, 5]],
  turtle: [[50, 0], [42, -4], [30, -5], [22, -16], [-10, -20], [-35, -12], [-50, -2], [-40, 2], [-20, 8], [-30, 20],
           [-12, 12], [10, 12], [28, 24], [22, 8], [38, 4]],
  seal: [[50, 0], [44, -6], [30, -10], [0, -13], [-30, -9], [-45, -4], [-52, -10], [-48, 0], [-52, 10], [-45, 4],
         [-20, 10], [10, 12], [35, 8]],
  jelly: [[30, 0], [26, -14], [14, -22], [0, -24], [-6, -18], [-10, -12], [-50, -10], [-12, -6], [-50, -2], [-12, 0],
          [-50, 6], [-12, 6], [-10, 12], [-6, 18], [0, 24], [14, 22], [26, 14]],
  angler: [[50, 6], [40, -10], [20, -22], [-5, -24], [-25, -16], [-35, -6], [-50, -16], [-46, 2], [-50, 18], [-35, 10],
           [-10, 18], [20, 20], [40, 16], [48, 12]],
  crab: [[40, 0], [50, -10], [42, -14], [30, -6], [20, -14], [-20, -14], [-30, -6], [-42, -14], [-50, -10], [-40, 0],
         [-30, 8], [-36, 14], [-20, 8], [20, 8], [36, 14], [30, 8]],
  // mythical creatures (and the Star Serpent): long and thin, frilled, horned
  serpent: [[50, 0], [46, -5], [38, -6], [30, -3], [20, -5], [10, -3], [0, -5], [-10, -3], [-20, -5], [-30, -3], [-40, -4],
            [-50, -8], [-46, 0], [-50, 4], [-40, 3], [-30, 3], [-20, 4], [-10, 3], [0, 4], [10, 3], [20, 4], [30, 3], [38, 5], [46, 4]],
  leviathan: [[50, 2], [44, -10], [34, -14], [30, -22], [24, -15], [10, -18], [4, -28], [-4, -18], [-20, -16], [-24, -24],
              [-30, -14], [-42, -8], [-50, -18], [-46, 0], [-50, 16], [-40, 6], [-20, 12], [0, 14], [20, 13], [38, 9]],
  dragon: [[50, 2], [42, -6], [30, -8], [22, -14], [12, -10], [-10, -9], [-18, -18], [-24, -8], [-40, -5], [-50, -14],
           [-46, 0], [-50, 10], [-38, 4], [-10, 8], [0, 16], [8, 8], [30, 7], [44, 5]],
  swimmer: [[50, 0], [46, -5], [40, -6], [36, -3], [30, -3], [10, -4], [-20, -3], [-50, -2], [-50, 2], [-20, 4],
            [10, 5], [30, 4], [36, 4], [40, 6], [46, 5]],
});

// ---------------------------------------------------------------- ambient fauna
class Fauna extends Creature {
  constructor(def, x, y, leader = null) {
    const len = def.length * rand(0.85, 1.15);
    super('prey', def.shape, x, y, len / 100);
    this.def = def; this.length = len; this.leader = leader;
    this.ox = rand(-1, 1) * Math.max(60, len * 1.5); this.oy = rand(-1, 1) * Math.max(30, len * 0.6);
    this.wx = x; this.wy = y; this.wt = 0; this.phase = rand(0, TAU); this.pauseT = 0; this.dir = Math.random() < 0.5 ? -1 : 1;
  }
  bodyRadius() { return Math.min(this.length * 0.12, 60); }

  update(dt, game) {
    const d = this.def, w = game.whale, t = game.time;
    if (this.orbit) { // the gathering at the trench floor: circle the whale on a ring, facing along it
      const o = this.orbit, A = CONFIG.ascension, k = game.ascend ? clamp(game.ascend.t / A.gatherTime, 0, 1) : 0;
      o.a += A.ringSpeed * o.dir * dt; o.r = lerp(o.r0, o.r0 * A.ringTighten, k * k); // the ring closes in slowly
      const tx = w.x + Math.cos(o.a) * o.r, ty = w.y + Math.sin(o.a) * o.r * 0.6;
      const d = dist(this.x, this.y, tx, ty), step = Math.min(d, A.arriveSpeed * w.size * dt);
      if (d > 1) { this.x += (tx - this.x) / d * step; this.y += (ty - this.y) / d * step; }
      // swim toward the ring while arriving, then face along it
      this.angle = d > o.r0 * 0.25 ? Math.atan2(ty - this.y, tx - this.x) : o.a + o.dir * Math.PI / 2;
      this.updatePoly();
      return;
    }
    if (d.bottom) { // crawl along the seabed, stop and go
      this.pauseT -= dt;
      if (this.pauseT <= 0) { this.pauseT = rand(1, 4); if (Math.random() < 0.3) this.dir *= -1; this.crawl = Math.random() < 0.6; }
      const food = d.scavenger ? game.nearestCarcass(this.x, this.y, 500) : null;
      if (food && food.landed) { // crabs crawl to carcasses on the seabed and pick at them
        this.dir = food.x > this.x ? 1 : -1; this.crawl = Math.abs(food.x - this.x) > 15;
        if (!this.crawl) food.meat -= CONFIG.carcass.scavengeRate * 0.4 * dt;
      }
      if (this.crawl) this.x += this.dir * d.speed * dt;
      const f = game.world.floorAt(this.x);
      this.y = f - this.bodyRadius() * 0.6;
      this.angle = Math.atan2(game.world.floorAt(this.x + 10) - game.world.floorAt(this.x - 10), 20);
      this.updatePoly();
      return;
    }
    const dd = dist(this.x, this.y, w.x, w.y);
    if (d.shy && w.alive && dd < 200 + 160 * w.size) {
      this.steer(this.x + (this.x - w.x), this.y + (this.y - w.y), d.speed * 1.8, dt, 3);
    } else if (this.leader && !this.leader.dead) {
      this.steer(this.leader.x + this.ox, this.leader.y + this.oy, d.speed * 1.3, dt, 2);
    } else {
      this.wt -= dt;
      if (this.wt <= 0 || dist(this.x, this.y, this.wx, this.wy) < 40) {
        this.wx = this.x + rand(-800, 800) * Math.max(1, this.length / 150);
        const floor = game.world.floorAt(this.wx);
        this.wy = clamp(rand(d.depthMin, d.depthMax), 10, floor - 150 - this.bodyRadius());
        this.wt = rand(6, 14);
      }
      this.steer(this.wx, this.wy + (d.drift ? Math.sin(t * 0.8 + this.phase) * 30 : 0), d.speed, dt, d.drift ? 0.6 : 1.2);
    }
    if (this.y < d.depthMin) this.vy += 30 * dt;
    if (this.y > d.depthMax) this.vy -= 30 * dt;
    this.avoidTerrain(dt, game, clamp(100 + this.length * 0.3, 100, 400));
    this.integrate(dt, game, this.bodyRadius());
    if (d.drift) { this.angle = -Math.PI / 2 + Math.sin(t * 1.3 + this.phase) * 0.15; this.updatePoly(); } // jellies: bell up
  }
}

// ---------------------------------------------------------------- dead fish
// A carcass of a food-chain species: belly up, slowly sinking, then lying on the seabed until eaten or rotted.
const FLIPPED_SHAPES = {};
class Carcass extends Creature {
  constructor(sp, x, y) {
    super('prey', sp.shape, x, y, sp.length / 100 * rand(0.9, 1.1));
    this.sp = sp; this.length = this.scale * 100; this.radius = this.length * 0.3;
    this.meat = 1; this.age = 0; this.landed = false; this.vx = rand(-4, 4);
    this.angle = rand(-0.4, 0.4) + (Math.random() < 0.5 ? 0 : Math.PI);
    this.updatePoly();
  }
  updatePoly() { // belly up: mirror the shape vertically
    const n = this.shapeName;
    if (!FLIPPED_SHAPES[n]) FLIPPED_SHAPES[n] = SHAPES[n].map(p => [p[0], -p[1]]);
    this.poly = transformShape(FLIPPED_SHAPES[n], this.x, this.y, this.angle, this.scale);
    this.solid.poly = this.poly; refreshSolid(this.solid);
  }
  update(dt, game) {
    const C = CONFIG.carcass;
    this.age += dt;
    const floor = game.world.floorAt(this.x) - Math.max(4, this.length * 0.08);
    if (this.y < floor) { this.y += C.sinkSpeed * dt; this.x += this.vx * dt; this.angle += Math.sin(this.age * 0.5) * 0.05 * dt; }
    else { this.y = floor; this.landed = true; }
    if (this.meat <= 0 || this.age > C.life) this.dead = true;
    this.updatePoly();
  }
}

// ---------------------------------------------------------------- human swimmers (coasts only)
class Swimmer extends Creature {
  constructor(x, y, coastX, halfW) {
    const c = CONFIG.swimmers;
    super('human', 'swimmer', x, y, c.length / 100);
    this.length = c.length; this.coastX = coastX; this.halfW = halfW; this.radius = c.length * 0.3;
    this.dir = Math.random() < 0.5 ? -1 : 1; this.t = rand(0, 10); this.baseY = y;
  }
  update(dt, game) {
    const c = CONFIG.swimmers, w = game.whale;
    this.t += dt;
    const near = w.alive && dist(this.x, this.y, w.x, w.y) < 250 + 200 * w.size;
    if (near) this.dir = this.x > w.x ? 1 : -1; // swim away from the whale, as fast as they can
    else if (Math.abs(this.x - this.coastX) > this.halfW * 0.7) this.dir = this.x > this.coastX ? -1 : 1;
    else if (Math.random() < dt * 0.05) this.dir *= -1;
    this.vx = this.dir * (near ? c.fleeSpeed : c.speed); this.vy = 0;
    this.x += this.vx * dt; this.y = this.baseY + Math.sin(this.t * 2) * 2;
    this.angle = this.dir > 0 ? 0 : Math.PI;
    this.updatePoly();
  }
}

// ---------------------------------------------------------------- coasts
// Coasts are the beach segments of the world (World.coastNear / beachesIn).

// Land on the horizon above a coast: beach, dunes, palms and parasols.
function drawCoastLand(ctx, x0, x1, t, world) {
  for (const b of world.beachesIn(x0 - 400, x1 + 400)) {
    const L = b.cx - b.half + 150, R = b.cx + b.half - 150;
    if (R < x0 || L > x1) continue;
    ctx.fillStyle = '#7a9a6a';
    ctx.beginPath(); ctx.moveTo(L, 0);
    for (let x = L; x <= R; x += 80) ctx.lineTo(x, -40 - 70 * Math.sin((x - L) / (R - L) * Math.PI) - 18 * Math.sin(x / 130));
    ctx.lineTo(R, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8d6a0'; ctx.fillRect(L, -16, R - L, 16); // beach
    for (let x = L + 150; x < R - 100; x += 420) { // palms + parasols
      const h = hash(x, 5);
      if (h < 0.5) {
        ctx.strokeStyle = '#6b5236'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x, -16); ctx.quadraticCurveTo(x + 15, -70, x + 8, -120); ctx.stroke();
        ctx.strokeStyle = '#4f7a3a'; ctx.lineWidth = 5;
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.6 + Math.sin(t + i) * 0.05;
          ctx.beginPath(); ctx.moveTo(x + 8, -120); ctx.quadraticCurveTo(x + 8 + Math.cos(a) * 30, -120 + Math.sin(a) * 10, x + 8 + Math.cos(a) * 55, -120 + Math.sin(a) * 35 + 25); ctx.stroke(); }
      } else {
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, -16); ctx.lineTo(x, -55); ctx.stroke();
        ctx.fillStyle = h > 0.75 ? '#e86a4a' : '#4a8ae8';
        ctx.beginPath(); ctx.moveTo(x - 30, -48); ctx.quadraticCurveTo(x, -72, x + 30, -48); ctx.closePath(); ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------- seabed decorations
// Built per chunk from the seeded rng, so they are the same every time a chunk is rebuilt.
function buildDecor(world, x0, cw, rng) {
  const [a, b] = CONFIG.decor.perChunk, n = a + Math.floor(rng() * (b - a + 1)), out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * cw, y = world.floorAt(x) + 4, r = rng();
    let type;
    if (y < 450) type = r < 0.35 ? 'kelp' : r < 0.6 ? 'reef' : r < 0.8 ? 'anemone' : r < 0.9 ? 'seafan' : 'seastar';
    else if (y < 2500) type = r < 0.3 ? 'sponge' : r < 0.55 ? 'seafan' : r < 0.75 ? 'lophelia' : r < 0.9 ? 'seastar' : 'cucumber';
    else type = r < 0.3 ? 'seapen' : r < 0.5 ? 'tubeworms' : r < 0.7 ? 'glassponge' : r < 0.85 ? 'cucumber' : r < 0.97 ? 'seastar' : 'whalefall';
    const h = { kelp: 180 + rng() * 300, reef: 40 + rng() * 60, anemone: 14 + rng() * 10, seafan: 50 + rng() * 60, seastar: 8,
                sponge: 30 + rng() * 40, lophelia: 40 + rng() * 50, cucumber: 8, seapen: 40 + rng() * 40, tubeworms: 30 + rng() * 40,
                glassponge: 60 + rng() * 60, whalefall: 120 }[type] * (type === 'kelp' ? Math.min(1, (y - 25) / 480) : 1);
    if (type !== 'seastar' && type !== 'cucumber' && h > y - 30) continue; // never poke out of the water
    const d = { type, x, y, h, seed: rng() * 1000, w: h * (type === 'kelp' ? 0.08 : type === 'whalefall' ? 4 : 0.6) };
    // simple polygon so sonar can pick it up (tiny things are skipped)
    if (!['seastar', 'cucumber', 'anemone'].includes(type)) {
      d.solid = makeSolid('terrain', [[x - d.w, y], [x - d.w * 0.4, y - h], [x + d.w * 0.4, y - h], [x + d.w, y]]);
    }
    out.push(d);
  }
  return out;
}

function drawDecor(ctx, list, x0, x1, t) {
  for (const d of list) {
    if (d.x + d.w + 60 < x0 || d.x - d.w - 60 > x1) continue;
    const { x, y, h, seed } = d;
    switch (d.type) {
      case 'kelp': {
        ctx.strokeStyle = '#4f6a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 1; k <= 10; k++) ctx.lineTo(x + Math.sin(t * 0.8 + seed + k * 0.5) * k * 2.5, y - h * k / 10);
        ctx.stroke();
        ctx.fillStyle = '#5f7f32';
        for (let k = 2; k <= 9; k += 2) { const lx = x + Math.sin(t * 0.8 + seed + k * 0.5) * k * 2.5, ly = y - h * k / 10;
          ctx.beginPath(); ctx.ellipse(lx + 10, ly, 12, 4, 0.5, 0, TAU); ctx.fill(); }
        break; }
      case 'reef': case 'lophelia': case 'seafan': {
        const col = d.type === 'lophelia' ? '#d8d2c4' : d.type === 'seafan' ? '#c07ab0' : ['#e08a6a', '#d0a040', '#a070c0'][Math.floor(seed) % 3];
        ctx.strokeStyle = col; ctx.lineWidth = d.type === 'seafan' ? 1.5 : 3;
        const branches = d.type === 'seafan' ? 9 : 6;
        for (let i = 0; i < branches; i++) {
          const a = -Math.PI / 2 + (i / (branches - 1) - 0.5) * 1.6, len = h * (0.6 + 0.4 * hash(seed, i));
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
          if (d.type !== 'seafan') { ctx.beginPath(); ctx.arc(x + Math.cos(a) * len, y + Math.sin(a) * len, 3, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
        }
        break; }
      case 'anemone': {
        ctx.fillStyle = '#d88a9a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 8, 6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#f0b0c0'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.25 + Math.sin(t * 2 + i + seed) * 0.15;
          ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + Math.cos(a) * h, y - 8 + Math.sin(a) * h); ctx.stroke(); }
        break; }
      case 'seastar': {
        ctx.fillStyle = '#d08040'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + seed, r = i % 2 ? 3 : 9; ctx.lineTo(x + Math.cos(a) * r, y - 3 + Math.sin(a) * r * 0.4); }
        ctx.closePath(); ctx.fill(); break; }
      case 'cucumber': ctx.fillStyle = '#8a6a8a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 12, 4, 0, 0, TAU); ctx.fill(); break;
      case 'sponge': case 'glassponge': {
        ctx.fillStyle = d.type === 'sponge' ? '#c8a040' : '#dfe6ea'; ctx.globalAlpha = d.type === 'sponge' ? 1 : 0.8;
        ctx.beginPath(); ctx.moveTo(x - d.w * 0.4, y); ctx.lineTo(x - d.w * 0.6, y - h); ctx.lineTo(x + d.w * 0.6, y - h); ctx.lineTo(x + d.w * 0.4, y);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; break; }
      case 'seapen': {
        ctx.strokeStyle = '#b8a0d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
        ctx.fillStyle = '#c8b0e0'; ctx.beginPath(); ctx.ellipse(x, y - h * 0.7, 6, h * 0.3, 0, 0, TAU); ctx.fill(); break; }
      case 'tubeworms': {
        for (let i = 0; i < 7; i++) { const tx = x + (i - 3) * 5, th = h * (0.5 + 0.5 * hash(seed, i));
          ctx.strokeStyle = '#e6e2d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y - th); ctx.stroke();
          ctx.fillStyle = '#e8a0a0'; ctx.beginPath(); ctx.arc(tx, y - th, 3, 0, TAU); ctx.fill(); }
        break; }
      case 'whalefall': { // the skeleton of a dead whale: spine + ribs
        ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - d.w, y - 10); ctx.lineTo(x + d.w, y - 14); ctx.stroke();
        for (let i = 0; i < 14; i++) { const rx = x - d.w * 0.8 + i * d.w * 0.12;
          ctx.beginPath(); ctx.moveTo(rx, y - 12); ctx.quadraticCurveTo(rx + 12, y - 50, rx + 4, y - 70 + i * 2); ctx.stroke(); }
        ctx.fillStyle = '#e8e0cc'; ctx.beginPath(); ctx.ellipse(x + d.w + 30, y - 18, 40, 16, 0, 0, TAU); ctx.fill();
        break; }
    }
  }
}

// ---------------------------------------------------------------- glow pass (after the darkness overlay)
function glowDot(ctx, x, y, r, c, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`);
  g.addColorStop(0.35, `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.4).toFixed(3)})`);
  g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

function drawGlows(ctx, game, x0, x1, y0, y1, px) {
  const t = game.time;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of game.fauna) {
    const G = f.def.glow;
    if (!G || f.x < x0 - 200 || f.x > x1 + 200 || f.y < y0 - 200 || f.y > y1 + 200) continue;
    const dark = Math.max(1 - lightAt(f.y), f.orbit ? 1 : 0);
    if (dark < 0.5) continue;
    const pulse = 0.55 + 0.45 * Math.sin(t * (G.speed || 2) + f.phase);
    const pts = transformShape(G.pts, f.x, f.y, f.angle, f.scale);
    // soft halo (at least 12 screen px) + bright core, so glows read at every zoom level
    const r = Math.max(G.r * Math.max(0.6, f.scale) * 2.5, 12 * px);
    for (const p of pts) {
      glowDot(ctx, p[0], p[1], r, G.c, pulse * dark * 0.7);
      glowDot(ctx, p[0], p[1], Math.max(r * 0.2, 2.5 * px), [230, 250, 255], pulse * dark);
    }
  }
  for (const p of game.prey) { // glowing food-chain species (the cosmic ones; hidden by the paint sense)
    const G = p.sp.glow;
    if (game.cosmic && !CONFIG.paint.showFish) break;
    if (!G || p.x < x0 - 300 || p.x > x1 + 300 || p.y < y0 - 300 || p.y > y1 + 300) continue;
    const pulse = 0.6 + 0.4 * Math.sin(t * (G.speed || 2) + p.x * 0.01);
    const r = Math.max(G.r * Math.max(0.6, p.scale) * 2.5, 12 * px);
    for (const q of transformShape(G.pts, p.x, p.y, p.angle, p.scale)) {
      glowDot(ctx, q[0], q[1], r, G.c, pulse * 0.6);
      glowDot(ctx, q[0], q[1], Math.max(r * 0.2, 2.5 * px), [240, 250, 255], pulse * 0.9);
    }
  }
  for (const d of game.world.decor) {
    if (d.type !== 'seapen' || d.x < x0 - 100 || d.x > x1 + 100 || d.y < y0 - 100 || d.y > y1 + 100) continue;
    const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(t * 1.5 + d.seed));
    glowDot(ctx, d.x, d.y - d.h * 0.7, Math.max(30, 16 * px), [170, 120, 255], pulse * 0.6);
    glowDot(ctx, d.x, d.y - d.h * 0.7, Math.max(6, 3 * px), [235, 220, 255], pulse * 0.8);
  }
  ctx.restore();
}

function drawFaunaBodies(ctx, game, inView) {
  for (const f of game.fauna) {
    if (!inView(f.solid, 40)) continue;
    ctx.fillStyle = f.def.color; ctx.globalAlpha = f.def.drift ? 0.6 : 1;
    tracePoly(ctx, f.poly); ctx.fill(); ctx.globalAlpha = 1;
    if (f.def.lure) { // anglerfish lure stalk
      const [a, b] = transformShape([[20, -22], [62, -42]], f.x, f.y, f.angle, f.scale);
      ctx.strokeStyle = f.def.color; ctx.lineWidth = Math.max(1, f.scale * 1.5);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(a[0], b[1], b[0], b[1]); ctx.stroke();
    }
  }
  for (const c of game.carcasses) {
    if (!inView(c.solid, 40)) continue;
    ctx.globalAlpha = 0.35 + 0.5 * Math.max(0, c.meat); ctx.fillStyle = '#8e8a7e';
    tracePoly(ctx, c.poly); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const s of game.swimmers) {
    if (!inView(s.solid, 40)) continue;
    ctx.fillStyle = '#e0b090'; tracePoly(ctx, s.poly); ctx.fill();
    const [hd] = transformShape([[44, 0]], s.x, s.y, s.angle, s.scale);
    ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.arc(hd[0], hd[1] - 1, 3.5 * s.scale, 0, TAU); ctx.fill(); // hair
    const stroke = Math.sin(s.t * 6) * 0.9; // arm stroke
    const [sh] = transformShape([[30, -3]], s.x, s.y, s.angle, s.scale);
    ctx.strokeStyle = '#e0b090'; ctx.lineWidth = 2.5 * s.scale;
    ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(sh[0] + Math.cos(stroke) * 18 * s.scale * (s.dir), sh[1] - Math.sin(stroke) * 18 * s.scale); ctx.stroke();
  }
}
