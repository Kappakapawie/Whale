// 3D creature models (render only). Every creature is drawn as a small lit 3D mesh instead of a flat polygon:
// a body lofted from cross-sections (elliptical rings), plus flat fins and trailing lines (tentacles, arms, legs).
// Each creature keeps a 3D orientation that follows how it moves: it yaws (turns around its vertical axis) toward
// the way it is facing - so reversing turns it through a head-on view instead of flipping - drifts between side
// and three-quarter views, banks into turns and pitches up/down with its path. The body undulates while swimming
// (fish side to side, whales up and down, rays flap their wings).
// Collision, sonar and holograms still use the flat SHAPES polygons; this file only changes how creatures look.
//
// Model coordinates use the same frame as the creature's SHAPES entry (x forward, y down, z toward the viewer),
// so `scale` maps them to world units the same way.
//   body:  [x, top, bottom, halfWidth] cross-sections from nose to tail
//   fins:  { p: 'v', pts: [[x, y]...] }          a vertical plate (z = 0): tail fins, dorsal fins
//          { p: 'h', y, pts: [[x, z]...], mirror } a horizontal plate at height y: flukes, pectorals, ray wings
//   lines: { from: [x, y, z], len, n, spread, w } trailing strands (arms, tentacles, legs), waving
//   wave:  'z' side-to-side (fish), 'y' up-and-down (whales, dolphins), 'flap' (rays: wing tips beat)

const MODELS3D = {
  fish: { body: [[50, -1, 1, 1], [44, -8, 7, 5], [30, -15, 14, 8], [10, -18, 17, 9], [-10, -14, 13, 7], [-25, -8, 8, 4.5], [-37, -3.5, 3.5, 2]],
    fins: [{ p: 'v', pts: [[-36, -3], [-50, -20], [-45, 0], [-50, 20], [-36, 3]] }, { p: 'v', pts: [[8, -17], [-2, -27], [-14, -14]] },
           { p: 'v', pts: [[-14, 12], [-22, 19], [-26, 8]] }, { p: 'h', y: 6, pts: [[24, 0], [14, 12], [16, 0]], mirror: true }],
    wave: 'z', eye: [40, -4] },
  fatfish: { body: [[50, 2, 4, 2], [42, -12, 14, 10], [25, -24, 24, 15], [0, -27, 25, 15], [-20, -18, 18, 10], [-34, -8, 8, 5]],
    fins: [{ p: 'v', pts: [[-33, -6], [-50, -24], [-45, 0], [-50, 24], [-33, 6]] }, { p: 'v', pts: [[20, -24], [8, -34], [-22, -26], [-26, -16]] },
           { p: 'h', y: 8, pts: [[28, 0], [16, 16], [18, 0]], mirror: true }],
    wave: 'z', eye: [38, -6] },
  tuna: { body: [[50, 0, 1, 1], [44, -8, 7, 6], [30, -16, 14, 12], [10, -21, 19, 14], [-10, -17, 15, 11], [-28, -9, 8, 5], [-40, -3, 3, 2]],
    fins: [{ p: 'v', pts: [[-40, -3], [-50, -27], [-46, 0], [-50, 27], [-40, 3]] }, { p: 'v', pts: [[6, -20], [2, -34], [-6, -19]] },
           { p: 'v', pts: [[-8, 15], [-12, 28], [-18, 14]] }, { p: 'h', y: 4, pts: [[16, 0], [2, 18], [8, 0]], mirror: true }],
    wave: 'z', eye: [38, -4] },
  swordfish: { body: [[50, -0.6, 0.6, 0.6], [20, -2, 2, 2], [14, -6, 5, 5], [2, -10, 9, 8], [-14, -9, 8, 7], [-30, -5, 4, 3.5], [-40, -2, 2, 1.5]],
    fins: [{ p: 'v', pts: [[-40, -2], [-50, -20], [-46, 0], [-50, 20], [-40, 2]] }, { p: 'v', pts: [[0, -9], [-4, -30], [-12, -9]] },
           { p: 'h', y: 5, pts: [[6, 0], [-6, 16], [-2, 0]], mirror: true }],
    wave: 'z', eye: [14, -3] },
  shark: { body: [[50, 1, 4, 3], [40, -7, 9, 9], [20, -11, 11, 11], [0, -12, 10, 10], [-20, -9, 8, 7], [-35, -5, 5, 4], [-42, -3, 3, 2]],
    fins: [{ p: 'v', pts: [[-41, -3], [-50, -25], [-47, 0], [-50, 10], [-40, 3]] }, { p: 'v', pts: [[-2, -12], [-6, -27], [-13, -11]] },
           { p: 'v', pts: [[-24, -9], [-27, -15], [-31, -8]] }, { p: 'h', y: 8, pts: [[18, 0], [4, 26], [8, 0]], mirror: true }],
    wave: 'z', eye: [38, -3] },
  // Manta ray: a flat diamond disc with huge wings that beat, horn-like cephalic fins and a thin tail.
  ray: { body: [[50, -2, 3, 9], [40, -5, 6, 14], [26, -7, 8, 16], [12, -6, 7, 13], [2, -4, 4, 7], [-6, -2, 2, 2.5], [-50, -0.6, 0.6, 0.6]],
    fins: [{ p: 'h', y: 0, pts: [[42, 10], [24, 62], [10, 92], [4, 80], [6, 40], [0, 8]], mirror: true, wing: true },
           { p: 'h', y: 2, pts: [[50, 6], [60, 7], [56, 11], [48, 10]], mirror: true }],
    wave: 'flap', eye: [46, -2], flat: true, viewRoll: 0.95, flapAmp: 0.22 }, // tilted toward you: you see its back
  octopus: { body: [[50, -4, 4, 4], [42, -18, 12, 15], [28, -24, 17, 20], [14, -20, 15, 17], [4, -8, 10, 9]],
    lines: [{ from: [2, 4, 0], len: 55, n: 8, spread: 9, w: 3.2 }], wave: 'z', eye: [18, -6] },
  squid: { body: [[46, 0, 0, 0.6], [38, -7, 7, 6], [24, -11, 11, 9], [8, -11, 11, 9], [-6, -8, 8, 7], [-12, -5, 5, 5]],
    fins: [{ p: 'h', y: 0, pts: [[44, 0], [32, 15], [26, 0]], mirror: true }],
    lines: [{ from: [-12, 0, 0], len: 40, n: 8, spread: 5, w: 2 }, { from: [-12, 0, 0], len: 52, n: 2, spread: 3, w: 1.4 }],
    wave: 'z', eye: [-8, -3] },
  giantSquid: { body: [[50, 0, 0, 0.6], [40, -7, 7, 6], [24, -9, 9, 8], [12, -8, 8, 7], [6, -6, 6, 6]],
    fins: [{ p: 'h', y: 0, pts: [[48, 0], [38, 12], [32, 0]], mirror: true }],
    lines: [{ from: [6, 0, 0], len: 52, n: 8, spread: 5, w: 2.2 }, { from: [6, 0, 0], len: 62, n: 2, spread: 4, w: 1.4 }],
    wave: 'z', eye: [8, -3] },
  oarfish: { body: [[50, -3, 4, 2], [44, -6, 6, 2.5], [10, -6, 6, 2.5], [-25, -4, 4, 2], [-50, -1, 1, 1]],
    fins: [{ p: 'v', pts: [[47, -5], [45, -18], [40, -14], [36, -6]], red: true },
           { p: 'v', pts: [[38, -6], [30, -10], [0, -10], [-30, -7], [-48, -2], [-48, -1], [-30, -4], [0, -6]], red: true }],
    wave: 'y', eye: [46, -2] },
  orca: { body: [[52, 1, 3, 3], [44, -6, 8, 8], [30, -12, 11, 12], [10, -14, 12, 13], [-10, -11, 9, 10], [-30, -6, 5, 6], [-46, -2, 2, 2.5]],
    fins: [{ p: 'h', y: 0, pts: [[-46, 0], [-58, -16], [-53, 0]], mirror: true }, { p: 'v', pts: [[2, -14], [-2, -38], [-10, -12]] },
           { p: 'h', y: 8, pts: [[24, 0], [12, 20], [16, 0]], mirror: true }],
    wave: 'y', eye: [34, -5], belly: '#e8eef0', patch: true },
  baleen: { body: [[50, -1, 4, 4], [42, -7, 9, 9], [25, -10, 11, 11], [0, -11, 10, 11], [-25, -8, 7, 8], [-40, -4, 3, 4], [-48, -2, 2, 2]],
    fins: [{ p: 'h', y: 0, pts: [[-46, 0], [-56, -14], [-51, 0]], mirror: true }, { p: 'v', pts: [[-22, -8], [-27, -13], [-31, -7]] },
           { p: 'h', y: 8, pts: [[26, 0], [10, 22], [16, 0]], mirror: true }],
    wave: 'y', eye: [36, 2] },
  dolphin: { body: [[50, 1, 2, 1.5], [40, -3, 4, 4], [32, -8, 9, 8], [10, -12, 10, 10], [-15, -9, 7, 7], [-32, -4, 3, 3.5], [-44, -2, 2, 2]],
    fins: [{ p: 'h', y: 0, pts: [[-43, 0], [-52, -14], [-48, 0]], mirror: true }, { p: 'v', pts: [[4, -12], [-2, -24], [-8, -10]] },
           { p: 'h', y: 8, pts: [[22, 0], [12, 14], [14, 0]], mirror: true }],
    wave: 'y', eye: [32, -2] },
  turtle: { body: [[50, -3, 3, 3], [42, -5, 4, 4], [32, -5, 4, 4], [24, -12, 6, 16], [5, -19, 8, 22], [-15, -15, 7, 18], [-30, -6, 4, 8], [-40, -2, 2, 2]],
    fins: [{ p: 'h', y: 5, pts: [[22, 14], [30, 40], [8, 30], [8, 14]], mirror: true, wing: true }, { p: 'h', y: 5, pts: [[-22, 12], [-30, 24], [-34, 12]], mirror: true }],
    wave: 'flap', eye: [46, -2], shell: true, viewRoll: 0.45 },
  seal: { body: [[50, -3, 3, 3], [42, -7, 6, 6], [25, -11, 10, 10], [0, -12, 11, 11], [-25, -8, 8, 8], [-40, -4, 4, 4]],
    fins: [{ p: 'h', y: 0, pts: [[-40, 0], [-54, -12], [-50, 0]], mirror: true }, { p: 'h', y: 8, pts: [[20, 0], [10, 16], [12, 0]], mirror: true }],
    wave: 'y', eye: [44, -3] },
  jelly: { body: [[30, -2, 2, 2], [26, -14, 14, 14], [14, -22, 22, 22], [2, -24, 24, 24], [-6, -20, 20, 20], [-10, -12, 12, 12]],
    lines: [{ from: [-10, 0, 0], len: 42, n: 10, spread: 14, w: 1.2 }], wave: 'pulse', alpha: 0.6 },
  angler: { body: [[50, 4, 10, 8], [40, -10, 16, 14], [20, -22, 20, 20], [-5, -24, 18, 18], [-25, -16, 10, 12], [-35, -6, 6, 6]],
    fins: [{ p: 'v', pts: [[-34, -5], [-50, -16], [-46, 2], [-50, 18], [-34, 6]] }, { p: 'h', y: 10, pts: [[10, 0], [0, 18], [2, 0]], mirror: true }],
    lines: [{ from: [20, -22, 0], len: 0, path: [[20, -22], [36, -40], [62, -42]], w: 1.5 }], wave: 'z', eye: [34, -8] },
  crab: { body: [[34, -6, 2, 18], [18, -12, 4, 28], [-18, -12, 4, 28], [-34, -6, 2, 18]],
    lines: [{ from: [0, 2, 0], len: 30, n: 8, spread: 30, w: 2.4, legs: true }], wave: 'none' },
  serpent: { body: [[50, -2, 3, 2.5], [46, -5, 5, 4], [36, -5, 5, 4], [0, -4.5, 4.5, 3.5], [-30, -4, 4, 3], [-46, -2, 2, 1.5]],
    fins: [{ p: 'v', pts: [[44, -5], [30, -10], [0, -9], [-30, -8], [-46, -3], [-30, -4], [0, -5], [30, -5]] },
           { p: 'v', pts: [[-46, -2], [-50, -8], [-48, 0], [-50, 6], [-46, 2]] }],
    wave: 'z', eye: [46, -2], waveAmp: 2.2 },
  leviathan: { body: [[50, 0, 8, 8], [44, -12, 12, 14], [28, -16, 14, 16], [0, -18, 14, 18], [-28, -14, 10, 14], [-42, -6, 4, 6]],
    fins: [{ p: 'h', y: 0, pts: [[-42, 0], [-52, -18], [-47, 0]], mirror: true },
           { p: 'v', pts: [[32, -15], [28, -24], [22, -16]] }, { p: 'v', pts: [[10, -17], [4, -30], [-2, -18]] },
           { p: 'v', pts: [[-12, -17], [-18, -27], [-24, -15]] }, { p: 'h', y: 10, pts: [[20, 0], [6, 26], [10, 0]], mirror: true }],
    wave: 'y', eye: [40, -6] },
  dragon: { body: [[50, 0, 5, 4], [40, -8, 8, 7], [20, -10, 10, 9], [0, -10, 9, 8], [-25, -6, 6, 5], [-42, -3, 3, 2]],
    fins: [{ p: 'v', pts: [[-42, -3], [-50, -14], [-46, 0], [-50, 10], [-42, 3]] }, { p: 'v', pts: [[14, -10], [6, -20], [-10, -18], [-14, -9]] },
           { p: 'h', y: 4, pts: [[16, 0], [2, 30], [-6, 26], [4, 0]], mirror: true, wing: true }],
    wave: 'z', eye: [40, -4] },
};

// ---- per-creature orientation (yaw / roll / pitch) and swim animation, advanced at draw time
function anim3d(c, t) {
  const v = c.v3 || (c.v3 = { yaw: Math.cos(c.angle) >= 0 ? 0 : Math.PI, roll: 0, phase: Math.random() * 10, t, a: c.angle, seed: Math.random() * 10 });
  const dt = clamp(t - v.t, 0, 0.1); v.t = t;
  const facingRight = Math.cos(c.angle) >= 0;
  // drift between side and three-quarter views, so you see each animal from several angles
  const wander = CONFIG.models3d.yawWander * Math.sin(t * 0.23 + v.seed) + 0.25 * Math.sin(t * 0.61 + v.seed * 2);
  const target = (facingRight ? 0 : Math.PI) + (facingRight ? wander : -wander);
  v.yaw += clamp(angleDiff(v.yaw, target), -CONFIG.models3d.yawRate * dt, CONFIG.models3d.yawRate * dt);
  const turn = angleDiff(v.a, c.angle) / Math.max(dt, 1e-3); v.a = c.angle;
  v.roll = lerp(v.roll, clamp(-turn * 0.35, -0.6, 0.6) + 0.12 * Math.sin(t * 0.7 + v.seed), Math.min(1, dt * 3));
  const sp = Math.hypot(c.vx || 0, c.vy || 0) / Math.max(20, 60 * c.scale);
  v.phase += dt * (1.5 + 5 * clamp(sp, 0, 1.5));
  v.amp = lerp(v.amp || 0.3, 0.3 + clamp(sp, 0, 1.2), Math.min(1, dt * 2));
  return v;
}

// rotate a model point into screen space; returns [sx, sy, depth]
function m3dTransform(c, v, M, x, y, z) {
  // pitch from the travel angle (positive = nose down), applied in the screen plane, scaled by how side-on we are
  const a = c.angle, e = Math.atan2(Math.sin(a), Math.abs(Math.cos(a))), th = e * Math.cos(v.yaw);
  const R = v.roll + (M.viewRoll || 0), cr = Math.cos(R), sr = Math.sin(R), cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), ct = Math.cos(th), st = Math.sin(th);
  const y1 = y * cr - z * sr, z1 = y * sr + z * cr;
  const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
  const X = x2 * ct - y1 * st, Y = x2 * st + y1 * ct, s = c.scale;
  return [c.x + X * s, c.y + Y * s, z2 * s]; // depth in world units too, so normals are true 3D
}

// body wave offset for a point at model x (amount grows toward the tail)
function m3dWave(M, v, x) {
  if (M.wave === 'none' || M.wave === 'flap' || M.wave === 'pulse') return 0;
  const tail = clamp((30 - x) / 80, 0, 1);
  return Math.sin(v.phase - x * 0.08) * tail * tail * 6 * (M.waveAmp || 1) * v.amp;
}

function shadeColor(rgb, k) { return `rgb(${Math.min(255, rgb[0] * k) | 0},${Math.min(255, rgb[1] * k) | 0},${Math.min(255, rgb[2] * k) | 0})`; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// direction TO the light: from above (-y) and a little from the viewer's side (-z = toward the viewer)
const M3D_LIGHT = (() => { const l = [0.25, -0.85, -0.55], n = Math.hypot(...l); return l.map(q => q / n); })();

// Draw a creature as a 3D model. opts: { color, belly, alpha, bellyUp (dead fish), dark (0..1, dims it) }
// Level of detail: set M3D_VIEW.px (world units per screen pixel) once per frame. Tiny creatures use fewer
// segments; specks smaller than minPx on screen are left to the flat polygon (return false).
const M3D_VIEW = { px: 1 };
function drawCreature3D(ctx, c, t, opts = {}) {
  const M = MODELS3D[c.shapeName];
  if (!M) return false;
  const onScreen = 100 * c.scale / M3D_VIEW.px, MC = CONFIG.models3d;
  if (onScreen < MC.minPx) return false;
  const v = anim3d(c, t);
  if (opts.bellyUp) v.roll = Math.PI; // carcasses float belly up
  const base = hexRgb(opts.color || '#888888'), belly = hexRgb(M.belly || opts.belly || mixHex(opts.color || '#888888', '#ffffff', 0.45));
  const RING = onScreen < MC.lowPx ? MC.lowRing : MC.ring, items = [];
  const flap = M.wave === 'flap' ? Math.sin(v.phase * 0.8) * (M.flapAmp || 0.4) * (1 + v.amp) : 0;
  const pulse = M.wave === 'pulse' ? 1 + 0.12 * Math.sin(v.phase * 1.4) : 1;
  // body rings
  const rings = M.body.map(([x, top, bot, hw]) => {
    const cy = (top + bot) / 2, ry = (bot - top) / 2 * pulse, rz = hw * pulse, dz = m3dWave(M, v, x), dy = M.wave === 'y' ? m3dWave(M, v, x) * 0.7 : 0;
    const pts = [];
    for (let j = 0; j < RING; j++) {
      const f = j / RING * TAU, ly = cy + dy - ry * Math.cos(f), lz = rz * Math.sin(f) + (M.wave === 'y' ? 0 : dz);
      pts.push({ p: m3dTransform(c, v, M, x, ly, lz), lower: Math.cos(f) < -0.2, local: [x, ly, lz] });
    }
    return pts;
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < RING; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % RING], cc = rings[i + 1][(j + 1) % RING], d = rings[i + 1][j];
      const n = triNormal(a.p, b.p, d.p);
      if (n[2] > 0.02) continue; // back face: the viewer looks along +z, so faces pointing +z are hidden
      const lit = 0.38 + 0.62 * Math.max(0, n[0] * M3D_LIGHT[0] + n[1] * M3D_LIGHT[1] + n[2] * M3D_LIGHT[2]);
      const col = (a.lower && d.lower) ? belly : base;
      items.push({ z: (a.p[2] + b.p[2] + cc.p[2] + d.p[2]) / 4, pts: [a.p, b.p, cc.p, d.p], fill: shadeColor(col, lit * (M.shell && !a.lower ? 0.9 : 1)) });
    }
  }
  // fins (double sided plates)
  for (const F of M.fins || []) {
    const sides = F.mirror ? [1, -1] : [1];
    for (const sgn of sides) {
      const pts = F.pts.map(([px, q]) => {
        if (F.p === 'v') return m3dTransform(c, v, M, px, q, m3dWave(M, v, px));
        const z = q * sgn, wingLift = F.wing ? -flap * Math.abs(q) * 0.5 : 0;
        return m3dTransform(c, v, M, px, F.y + wingLift + (M.wave === 'y' ? m3dWave(M, v, px) * 0.7 : 0), z + (M.wave === 'z' ? m3dWave(M, v, px) : 0));
      });
      if (pts.length < 3) continue;
      const n = triNormal(pts[0], pts[1], pts[2]);
      const lit = 0.45 + 0.55 * Math.abs(n[0] * M3D_LIGHT[0] + n[1] * M3D_LIGHT[1] + n[2] * M3D_LIGHT[2]);
      const fc = F.red ? [200, 60, 60] : base;
      items.push({ z: pts.reduce((s, p) => s + p[2], 0) / pts.length - 0.01, pts, fill: shadeColor(fc, lit * 0.85) });
    }
  }
  // trailing strands (arms, tentacles, legs, lures)
  const strands = [];
  for (const L of M.lines || []) {
    if (L.path) { strands.push({ pts: L.path.map(([px, py]) => m3dTransform(c, v, M, px, py, 0)), w: L.w }); continue; }
    for (let k = 0; k < L.n; k++) {
      const ang = k / L.n * TAU, oy = Math.cos(ang) * L.spread * 0.6, oz = Math.sin(ang) * L.spread, pts = [];
      for (let s = 0; s <= 6; s++) {
        const f = s / 6, x = L.from[0] - (L.legs ? 0 : L.len * f);
        const sway = Math.sin(v.phase * 0.9 - f * 3 + k) * 4 * f;
        const y = L.legs ? L.from[1] + f * 14 : L.from[1] + oy * (0.5 + f) + sway;
        const z = L.legs ? Math.sign(oz || 1) * (8 + f * L.len) : oz * (0.6 + f * 0.8) + sway * 0.6;
        pts.push(m3dTransform(c, v, M, L.legs ? L.from[0] + (k - L.n / 2) * 6 : x, y, z));
      }
      strands.push({ pts, w: L.w });
    }
  }
  items.sort((p, q) => q.z - p.z); // far (large z after our winding) first
  ctx.save();
  ctx.globalAlpha = (opts.alpha ?? M.alpha ?? 1);
  ctx.lineJoin = 'round';
  for (const s of strands) {
    ctx.strokeStyle = shadeColor(base, 0.75); ctx.lineWidth = s.w * c.scale; ctx.lineCap = 'round';
    ctx.beginPath(); s.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
  }
  for (const it of items) {
    ctx.fillStyle = it.fill; ctx.strokeStyle = it.fill; ctx.lineWidth = 0.6 * c.scale; // the thin stroke hides seams
    ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // eye on the side facing the viewer (local -z faces the viewer when yaw = 0, +z when yaw = pi)
  if (M.eye && Math.abs(Math.cos(v.yaw)) > 0.15) {
    const rz = eyeZ(M, M.eye[0]) * 0.9, side = Math.cos(v.yaw) >= 0 ? -1 : 1;
    const e = m3dTransform(c, v, M, M.eye[0], M.eye[1], rz * side);
    ctx.fillStyle = '#0c0e10'; ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(0.8, 1.6 * c.scale * (M.flat ? 0.8 : 1)), 0, TAU); ctx.fill();
  }
  ctx.restore();
  return true;
}

function eyeZ(M, x) { // half width of the body at model x (for placing the eye on the surface)
  const B = M.body;
  for (let i = 1; i < B.length; i++) if (x >= B[i][0]) { const f = (x - B[i][0]) / (B[i - 1][0] - B[i][0]); return lerp(B[i][3], B[i - 1][3], f); }
  return B[B.length - 1][3];
}
function triNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
function mixHex(a, b, f) {
  const p = hexRgb(a), q = hexRgb(b);
  return '#' + p.map((v, i) => Math.round(lerp(v, q[i], f)).toString(16).padStart(2, '0')).join('');
}

// Where a model-space point (e.g. a glow spot given in SHAPES coordinates) is on screen right now.
function project3d(c, pts, t) {
  const M = MODELS3D[c.shapeName];
  if (!M || !c.v3) return transformShape(pts, c.x, c.y, c.angle, c.scale);
  return pts.map(([x, y]) => { const p = m3dTransform(c, c.v3, M, x, y, 0); return [p[0], p[1]]; });
}
