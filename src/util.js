const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function angleDiff(a, b) { return wrapAngle(b - a); }
// Small seeded RNG (returns 0..1)
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(a, b) { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }

// 1 at the surface, falling off exponentially with depth.
function lightAt(y) { return y <= 0 ? 1 : Math.exp(-y / CONFIG.light.falloff); }

// Ray (o + t*d) vs segment AB. Returns t >= 0 or -1.
function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
  const sx = bx - ax, sy = by - ay;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const qx = ax - ox, qy = ay - oy;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * dy - qy * dx) / den;
  return (t >= 0 && u >= 0 && u <= 1) ? t : -1;
}

// Local shapes face +x. Facing left mirrors vertically first so the back stays up.
function transformShape(shape, x, y, angle, scale = 1) {
  const flip = Math.cos(angle) < 0 ? -1 : 1;
  const c = Math.cos(angle), s = Math.sin(angle);
  const out = new Array(shape.length);
  for (let i = 0; i < shape.length; i++) {
    const lx = shape[i][0] * scale, ly = shape[i][1] * scale * flip;
    out[i] = [x + lx * c - ly * s, y + lx * s + ly * c];
  }
  return out;
}

function closestOnSeg(px, py, ax, ay, bx, by) {
  const sx = bx - ax, sy = by - ay, l2 = sx * sx + sy * sy;
  const t = l2 ? clamp(((px - ax) * sx + (py - ay) * sy) / l2, 0, 1) : 0;
  return [ax + sx * t, ay + sy * t];
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function tracePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// A "solid" is anything sonar can hit.
function makeSolid(kind, poly, owner = null) {
  const s = { kind, poly, bx: 0, by: 0, br: 0, owner };
  refreshSolid(s);
  return s;
}
function refreshSolid(s) {
  if (!s.poly.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.poly) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  s.bx = (x0 + x1) / 2; s.by = (y0 + y1) / 2;
  s.br = Math.hypot(x1 - x0, y1 - y0) / 2;
  s.x0 = x0; s.y0 = y0; s.x1 = x1; s.y1 = y1;
}
