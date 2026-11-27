// The Kraken: a gigantic deep-sea monster. Not food - a hazard and a discovery.
//
// It is scanned DIFFERENTLY from fish. Fish are learned per species by click count. The kraken's body is split
// into scan cells (every edge of the mantle polygon + every segment of every arm). A sonar ray that hits a cell
// reveals it permanently (whale.krakenKnown). Its hologram only ever shows the cells you have revealed, drawn
// in its current pose, so the monster is pieced together bit by bit as you sweep your sonar over it.
// It is "complete" at kraken.completeAt of all cells (some edges can always hide behind others).

// Mantle + head, normalized like other shapes (length 100 overall; the body takes x 0..50, arms trail into -x).
SHAPES.krakenBody = [[50, 0], [47, -6], [38, -11], [24, -13], [12, -12], [5, -9], [0, -10], [-4, -6],
                     [-4, 6], [0, 10], [5, 9], [12, 12], [24, 13], [38, 11], [47, 6]];

class Kraken {
  constructor(x, y) {
    const K = CONFIG.kraken;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.angle = Math.random() < 0.5 ? 0 : Math.PI;
    this.scale = K.length / 100; this.t = rand(0, 100);
    this.homeX = x; this.homeY = y; this.wx = x; this.wy = y; this.wt = 0;
    this.grabT = 0; this.dead = false;
    this.bodySolid = makeSolid('predator', [], this); this.bodySolid.part = 'body';
    this.armSolids = [];
    for (let a = 0; a < K.arms; a++) { const s = makeSolid('predator', [], this); s.part = 'arm' + a; this.armSolids.push(s); }
    this.solids = [this.bodySolid, ...this.armSolids];
    this.updatePolys();
  }

  static totalCells() { const K = CONFIG.kraken; return SHAPES.krakenBody.length + K.arms * K.armSegments; }

  // Local (normalized) arm centerline + half-widths for animation time t.
  static armLocal(a, t) {
    const K = CONFIG.kraken, N = K.armSegments, f = a / (K.arms - 1);
    const baseY = lerp(-8, 8, f), spread = lerp(-0.55, 0.55, f);
    const len = (a === 2 || a === 5 ? 62 : 44 + hash(a, 3) * 10); // two long feeding tentacles
    const pts = [[-2, baseY]], half = [];
    let x = -2, y = baseY;
    for (let k = 1; k <= N; k++) {
      const s = k / N;
      const ang = Math.PI + spread * (0.4 + s) + Math.sin(t * K.waveSpeed + a * 1.7 + s * 3.2) * K.waveAmp * s;
      x += Math.cos(ang) * len / N; y += Math.sin(ang) * len / N;
      pts.push([x, y]);
    }
    for (let k = 0; k <= N; k++) half.push(lerp(2.4, 0.35, k / N));
    return { pts, half };
  }

  // Thin polygon around a centerline: left side base->tip, then right side tip->base.
  // Edge j maps to arm segment: j < N -> j; j == N (tip cap) -> N-1; then N+1+i -> N-1-i; last (base cap) -> 0.
  static armPoly({ pts, half }) {
    const L = [], R = [];
    for (let k = 0; k < pts.length; k++) {
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[Math.min(pts.length - 1, k + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      L.push([pts[k][0] + nx * half[k], pts[k][1] + ny * half[k]]);
      R.push([pts[k][0] - nx * half[k], pts[k][1] - ny * half[k]]);
    }
    return [...L, ...R.reverse()];
  }
  static armEdgeToSegment(j) {
    const N = CONFIG.kraken.armSegments;
    if (j < N) return j;
    if (j === N) return N - 1;
    if (j <= 2 * N) return Math.max(0, 2 * N - j);
    return 0;
  }
  // Scan cell key for a ray hit on one of our solids at polygon edge j.
  static cellKey(solid, j) {
    return solid.part === 'body' ? `body:${j}` : `${solid.part}:${Kraken.armEdgeToSegment(j)}`;
  }

  updatePolys() {
    const K = CONFIG.kraken;
    this.bodySolid.poly = transformShape(SHAPES.krakenBody, this.x, this.y, this.angle, this.scale);
    refreshSolid(this.bodySolid);
    this.armWorld = [];
    for (let a = 0; a < K.arms; a++) {
      const loc = Kraken.armLocal(a, this.t);
      const s = this.armSolids[a];
      s.poly = transformShape(Kraken.armPoly(loc), this.x, this.y, this.angle, this.scale);
      refreshSolid(s);
      this.armWorld.push({ pts: transformShape(loc.pts, this.x, this.y, this.angle, this.scale),
                           half: loc.half.map(h => h * this.scale) });
    }
  }

  update(dt, game) {
    const K = CONFIG.kraken, w = game.whale;
    this.t += dt; this.grabT -= dt;
    const d = dist(this.x, this.y, w.x, w.y);
    let tx, ty, speed;
    if (w.alive && d < K.senseRange * Math.max(1, w.size * 0.7)) {
      // slowly turns toward and creeps closer to anything that comes near
      tx = w.x; ty = Math.max(w.y, K.depthMin); speed = K.huntSpeed;
    } else {
      this.wt -= dt;
      if (this.wt <= 0 || dist(this.x, this.y, this.wx, this.wy) < 100) {
        this.wx = this.homeX + rand(-1500, 1500);
        this.wy = Math.max(K.depthMin, game.world.floorAt(this.wx) - K.hover + rand(-300, 300));
        this.wt = rand(15, 30);
      }
      tx = this.wx; ty = this.wy; speed = K.speed;
    }
    const dx = tx - this.x, dy = ty - this.y, dl = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * 0.5);
    this.vx += (dx / dl * speed - this.vx) * k; this.vy += (dy / dl * speed - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.y = Math.min(this.y, game.world.floorAt(this.x) - K.hover * 0.5);
    // Side view: face left or right (flip only after moving the other way for a while), tilt a little with vy.
    this.facing = this.facing || (Math.cos(this.angle) >= 0 ? 1 : -1);
    this.turnT = this.vx * this.facing < -6 ? (this.turnT || 0) + dt : 0;
    if (this.turnT > 2) { this.facing *= -1; this.turnT = 0; }
    const tilt = clamp(this.vy / Math.max(10, K.huntSpeed) * 0.25, -0.25, 0.25);
    const targetA = this.facing > 0 ? tilt : Math.PI - tilt;
    this.angle = wrapAngle(this.angle + angleDiff(this.angle, targetA) * Math.min(1, dt * 1.5));
    if (Math.cos(this.angle) * this.facing < 0) this.angle = targetA; // never sweep through vertical
    this.updatePolys();

    // Arms grab whatever they touch: damage + drag toward the mantle.
    if (!w.alive || d > K.length * 1.2 + 300 * w.size || w.apex.has('abyss')) return; // a ruler of the Abyss is left alone
    let grabbed = false;
    for (const arm of this.armWorld) {
      for (let k = 2; k < arm.pts.length && !grabbed; k++) {
        const p = arm.pts[k];
        if (dist(p[0], p[1], w.x, w.y) < 45 * w.size + arm.half[k] ||
            dist(p[0], p[1], w.head.x, w.head.y) < 25 * w.size + arm.half[k]) grabbed = true;
      }
      if (grabbed) break;
    }
    if (grabbed) {
      w.vx += (this.x - w.x) / (d || 1) * K.pull * dt; w.vy += (this.y - w.y) / (d || 1) * K.pull * dt;
      if (this.grabT <= 0) {
        w.damage(K.damage, 'Dragged into the abyss by the Kraken.', game);
        this.grabT = K.grabCooldown;
        game.say('The Kraken has you — swim away!', 2, '#ffd166');
      }
    }
  }
}

// Lit drawing (before the darkness overlay): a dark mass you will practically never see this deep.
function drawKrakenBody(ctx, k) {
  ctx.fillStyle = '#2a2026'; tracePoly(ctx, k.bodySolid.poly); ctx.fill();
  for (const s of k.armSolids) { tracePoly(ctx, s.poly); ctx.fill(); }
}

// Hologram of the kraken from a sonar snapshot: only the scan cells in m.known are drawn, in the pose the
// monster had when the click hit it. Revealed mantle edges reveal the shaded body around them; revealed arm
// segments are drawn as 3D tubes with suckers.
function drawKrakenModel(ctx, m, col, a, px) {
  const K = CONFIG.kraken, flip = Math.cos(m.angle) < 0 ? -1 : 1, lw = px / m.scale;
  ctx.save();
  ctx.translate(m.x, m.y); ctx.rotate(m.angle); ctx.scale(m.scale, m.scale * flip);
  const body = SHAPES.krakenBody;

  // --- mantle: clip to patches around revealed edges
  const known = [];
  for (let j = 0; j < body.length; j++) if (m.known.has(`body:${j}`)) known.push(j);
  if (known.length) {
    ctx.save();
    if (known.length < body.length) {
      ctx.beginPath();
      for (const j of known) {
        const A = body[j], B = body[(j + 1) % body.length];
        const r = Math.max(7, Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.9);
        ctx.moveTo((A[0] + B[0]) / 2 + r, (A[1] + B[1]) / 2);
        ctx.arc((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, r, 0, TAU);
      }
      ctx.clip();
    }
    const g = ctx.createLinearGradient(0, -13, 0, 13);
    g.addColorStop(0, col(a * 0.35)); g.addColorStop(1, col(a * 0.04));
    ctx.fillStyle = g; tracePoly(ctx, body); ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = col(a * 0.45);
    const { ribs } = shapeRibs('krakenBody');
    for (const r of ribs) {
      const half = (r[2] - r[1]) / 2;
      ctx.beginPath(); ctx.ellipse(r[0], r[1] + half, half * 0.3, half, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = lw * 1.6; ctx.strokeStyle = col(a);
    for (const j of known) {
      const A = body[j], B = body[(j + 1) % body.length];
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    }
  }

  // --- arms: revealed segments as tubes
  ctx.lineCap = 'round';
  for (let i = 0; i < K.arms; i++) {
    const { pts, half } = Kraken.armLocal(i, m.animT);
    for (let k = 0; k < pts.length - 1; k++) {
      if (!m.known.has(`arm${i}:${k}`)) continue;
      const A = pts[k], B = pts[k + 1], hw = (half[k] + half[k + 1]) / 2;
      ctx.strokeStyle = col(a * 0.25); ctx.lineWidth = hw * 2;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.strokeStyle = col(a * 0.8); ctx.lineWidth = lw * 1.4;
      ctx.beginPath(); ctx.moveTo(A[0], A[1] - hw * 0.6); ctx.lineTo(B[0], B[1] - hw * 0.6); ctx.stroke();
      ctx.fillStyle = col(a * 0.6); // suckers
      ctx.beginPath(); ctx.arc((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + hw * 0.5, Math.max(lw * 1.5, hw * 0.25), 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
