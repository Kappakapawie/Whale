// Drawing. Order matters: world -> darkness overlay -> things the whale can "see" in the dark -> HUD.
// The camera zooms out as the whale grows: world drawing uses scale cam.z; line widths divide by z
// so lines stay the same thickness on screen.

function buildGradients(ctx) {
  const D = CONFIG.world.depth, sky = CONFIG.world.skyHeight, g = {};
  g.sky = ctx.createLinearGradient(0, -sky, 0, 0);
  g.sky.addColorStop(0, '#6fa9d6'); g.sky.addColorStop(1, '#d9eef8');

  g.water = ctx.createLinearGradient(0, 0, 0, D);
  [[0, '#3aa0d4'], [250, '#1f73a8'], [800, '#0d3f66'], [1800, '#06203a'], [D, '#020b16']]
    .forEach(([y, c]) => g.water.addColorStop(y / D, c));

  g.terrain = ctx.createLinearGradient(0, 0, 0, D);
  [[0, '#b3a26c'], [700, '#6e6649'], [1600, '#3b3d36'], [D, '#22262a']]
    .forEach(([y, c]) => g.terrain.addColorStop(y / D, c));

  g.dark = ctx.createLinearGradient(0, 0, 0, D);
  for (let i = 0; i <= 40; i++) {
    const f = (i / 40) ** 2, y = f * D;
    const a = Math.min(CONFIG.light.maxDarkness, 1 - lightAt(y));
    g.dark.addColorStop(f, `rgba(0,3,10,${a.toFixed(3)})`);
  }

  g.ray = ctx.createLinearGradient(0, 0, 0, 700);
  g.ray.addColorStop(0, 'rgba(255,255,230,0.14)'); g.ray.addColorStop(1, 'rgba(255,255,230,0)');
  return g;
}

function drawGame(game) {
  const ctx = game.ctx, W = game.cw, H = game.ch, t = game.time, z = game.cam.z;
  const VW = W / z, VH = H / z, px = 1 / z; // view size in world units; px = one screen pixel
  const cx = game.cam.x, cy = game.cam.y;
  const x0 = cx, y0 = cy, x1 = cx + VW, y1 = cy + VH;
  const inView = (s, m = 0) => s.x1 > x0 - m && s.x0 < x1 + m && s.y1 > y0 - m && s.y0 < y1 + m;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);

  // --- Sky and water
  if (y0 < 0) { ctx.fillStyle = game.grad.sky; ctx.fillRect(x0, y0, VW, -y0); drawCoastLand(ctx, x0, x1, t); }
  const wy = Math.max(0, y0);
  ctx.fillStyle = game.grad.water; ctx.fillRect(x0, wy, VW, y1 - wy);

  // --- God rays near the surface
  if (y0 < 700) {
    ctx.fillStyle = game.grad.ray;
    const k0 = Math.floor(x0 / 320) - 2, k1 = Math.ceil(x1 / 320) + 1;
    for (let k = k0; k <= k1; k++) {
      const h = hash(k, 7); if (h < 0.35) continue;
      const x = k * 320 + Math.sin(t * 0.4 + k) * 40, w = 30 + h * 70;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w + 260, 700); ctx.lineTo(x + 180, 700);
      ctx.closePath(); ctx.fill();
    }
  }

  // --- Terrain
  ctx.fillStyle = game.grad.terrain;
  for (const s of game.world.solids) {
    if (!inView(s)) continue;
    tracePoly(ctx, s.poly); ctx.fill();
  }

  // --- Creatures, humans
  for (const p of game.prey) {
    if (!inView(p.solid, 20)) continue;
    ctx.fillStyle = p.sp.color; tracePoly(ctx, p.poly); ctx.fill();
  }
  drawDecor(ctx, game.world.decor, x0, x1, t);
  drawFaunaBodies(ctx, game, inView);
  for (const o of game.orcas) {
    if (!inView(o.solid, 20)) continue;
    ctx.fillStyle = '#0c0d10'; tracePoly(ctx, o.poly); ctx.fill();
    ctx.fillStyle = '#e8eef0';
    tracePoly(ctx, transformShape(SHAPES.orcaEye, o.x, o.y, o.angle, o.scale)); ctx.fill();
    tracePoly(ctx, transformShape(SHAPES.orcaBelly, o.x, o.y, o.angle, o.scale)); ctx.fill();
  }
  ctx.strokeStyle = '#2b2630'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
  for (const cb of game.world.cables) {
    if (cb.x1 < x0 || cb.x0 > x1 || cb.y1 < y0 || cb.y0 > y1) continue;
    ctx.beginPath(); cb.line.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
  }
  if (game.kraken) drawKrakenBody(ctx, game.kraken);
  for (const s of game.ships) drawShip(ctx, s);
  ctx.fillStyle = '#c9c2b0';
  for (const h of game.harpoons) {
    tracePoly(ctx, transformShape(SHAPES.harpoon, h.x, h.y, h.angle)); ctx.fill();
    if (h.y > -10) { // rope back to the surface
      ctx.strokeStyle = 'rgba(220,210,180,0.5)'; ctx.lineWidth = px;
      ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x - h.vx * 0.15, -5); ctx.stroke();
    }
  }

  // --- Whale (lit)
  const w = game.whale;
  const blink = w.invuln > 0 && Math.floor(t * 20) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = w.alive ? '#76808c' : '#3b3f45';
    tracePoly(ctx, w.poly); ctx.fill();
    const eye = transformShape([[38, 8]], w.x, w.y, w.angle, w.size)[0];
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(eye[0], eye[1], 2.5 * w.size, 0, TAU); ctx.fill();
  }

  // ================= DARKNESS =================
  ctx.fillStyle = game.grad.dark; ctx.fillRect(x0, wy, VW, y1 - wy);

  // Faint self-outline so the player can find themself in the dark
  const selfA = 0.5 * (1 - lightAt(w.y));
  if (selfA > 0.02 && !blink) {
    ctx.strokeStyle = `rgba(150,180,210,${selfA})`; ctx.lineWidth = 1.5 * px;
    tracePoly(ctx, w.poly); ctx.stroke();
  }

  // Surface line
  if (y0 < 30) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2 * px; ctx.beginPath();
    const sx0 = Math.floor(x0 / 20) * 20;
    for (let x = sx0; x <= x1 + 20; x += 20) {
      const y = Math.sin(x * 0.015 + t * 1.8) * 3;
      x === sx0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Spout / particles
  for (const p of game.particles) {
    ctx.fillStyle = p.spark ? `rgba(230,180,255,${(p.life / p.max).toFixed(3)})` : `rgba(235,245,255,${(p.life / p.max) * 0.7})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }

  // Bioluminescent specks (also give a sense of motion in total darkness)
  const cs = 140;
  for (let gx = Math.floor(x0 / cs); gx <= Math.ceil(x1 / cs); gx++) {
    for (let gy = Math.max(2, Math.floor(y0 / cs)); gy <= Math.ceil(y1 / cs); gy++) {
      const h = hash(gx, gy); if (h > 0.55) continue;
      const bx = gx * cs + hash(gy, gx) * cs + Math.sin(t * 0.2 + h * 10) * 10;
      const by = gy * cs + hash(gx + 3, gy - 5) * cs;
      const fl = 0.5 + 0.5 * Math.sin(t * (0.6 + h * 2) + h * 50);
      const a = (1 - lightAt(by)) * fl * fl * 0.5;
      if (a < 0.03) continue;
      ctx.fillStyle = `rgba(120,255,220,${a.toFixed(3)})`; ctx.fillRect(bx, by, 2 * px, 2 * px);
    }
  }

  drawGlows(ctx, game, x0, x1, y0, y1, px);
  drawModels(ctx, game, px);
  drawSonar(ctx, game, px);

  // Floating "+EP" texts
  ctx.textAlign = 'center'; ctx.font = `bold ${14 * px}px system-ui, sans-serif`;
  for (const p of game.popups) {
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  // ================= SCREEN SPACE =================
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (game.flash > 0) { ctx.fillStyle = `rgba(200,0,0,${game.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  drawHUD(ctx, game);
  updateCursor(game);
}

// The system cursor is hidden only during play (the sonar crosshair replaces it).
// In menus and overlays the normal cursor shows, and a hand over anything clickable.
function updateCursor(game) {
  let cursor = 'none';
  if (game.state !== 'playing') {
    cursor = 'default';
    if (game.state === 'upgrades') {
      const { mx, my } = game.input;
      if (game.menuRects.some(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h)) cursor = 'pointer';
    } else if (game.state === 'paused') {
      const { mx, my } = game.input;
      if (game.soundDrag || game.soundRects.some(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h)) cursor = 'pointer';
    } else if (game.state === 'title' || game.state === 'dead') cursor = 'pointer'; // click anywhere to start
  }
  if (game.canvas.style.cursor !== cursor) game.canvas.style.cursor = cursor;
}

function drawShip(ctx, s) {
  ctx.fillStyle = '#3b2f2f'; tracePoly(ctx, s.poly); ctx.fill();
  const d = s.dir;
  ctx.fillStyle = '#d8d4c8'; ctx.fillRect(s.x - 50 * d - (d < 0 ? 70 : 0), s.y - 48, 70, 34);
  ctx.fillStyle = '#9b2b1f'; ctx.fillRect(s.x - 30 * d - 6, s.y - 70, 12, 22);
  ctx.strokeStyle = '#2a2222'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(s.x + 100 * d, s.y - 16); ctx.lineTo(s.x + 125 * d, s.y - 36); ctx.stroke();
}

// Cross-sections of a shape: for evenly spaced x along the body, the top and bottom of the outline.
// Used to draw "ribs" (ellipses) that make the hologram read as a 3D body.
const RIB_CACHE = {};
function shapeRibs(name) {
  if (RIB_CACHE[name]) return RIB_CACHE[name];
  const pts = SHAPES[name];
  let x0 = Infinity, x1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  const ribs = [];
  for (let i = 1; i <= 12; i++) {
    const x = lerp(x0, x1, i / 13);
    let top = Infinity, bot = -Infinity;
    for (let j = 0; j < pts.length; j++) {
      const A = pts[j], B = pts[(j + 1) % pts.length];
      if ((A[0] - x) * (B[0] - x) > 0 || A[0] === B[0]) continue;
      const y = lerp(A[1], B[1], (x - A[0]) / (B[0] - A[0]));
      top = Math.min(top, y); bot = Math.max(bot, y);
    }
    if (bot > top) ribs.push([x, top, bot]);
  }
  return (RIB_CACHE[name] = { ribs, x0, x1 });
}

// Hologram models of scanned creatures. Accuracy and detail grow with familiarity f (0..1):
//   low f  -> a vague dashed ellipse, wrong-ish size and angle
//   mid f  -> outline + a few cross-section ribs
//   f = 1  -> exact outline, many ribs, spine and shaded translucent body
function drawModels(ctx, game, px) {
  const t = game.time, S = CONFIG.sonar, drawn = new Set();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Echo-locked creatures: a live model that follows the creature (drawn first, so it wins over snapshots).
  const lockModels = [];
  for (const [o, L] of game.locks) {
    if (t < L.start || t > L.until || o.dead) continue;
    const rem = L.until - t;
    lockModels.push({ owner: o, shape: o.shapeName, kind: game.echoClass(o.solid), f: 1, lock: true,
      x: o.x, y: o.y, angle: o.angle, scale: o.scale, t: 0, life: 1, lockAge: rem < 1 ? 1 - rem : 0,
      path: o.predictPath(Math.min(o.planT || 1, CONFIG.creatures.reactionTime)) });
  }
  const list = lockModels.concat(game.sonar.models.slice().reverse());
  for (const m of list) {
    if (!m.lock && t < m.t) continue;
    if (drawn.has(m.owner)) continue; // only the newest revealed snapshot per creature
    drawn.add(m.owner);
    const age = m.lock ? m.lockAge : (t - m.t) / m.life;
    const a = Math.pow(1 - age, 1.2) * (0.3 + 0.6 * m.f);
    if (a < 0.02) continue;
    const c = S.colorCode ? S.colors[m.kind] : S.colors.terrain;
    const col = (al) => `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, al).toFixed(3)})`;
    if (m.kraken) { drawKrakenModel(ctx, m, col, Math.pow(1 - age, 1.2) * 0.9, px); continue; }
    const flip = Math.cos(m.angle) < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.angle); ctx.scale(m.scale, m.scale * flip);
    const lw = px / m.scale, { ribs, x0, x1 } = shapeRibs(m.shape);
    ctx.lineWidth = lw * 1.2;

    if (m.f < 0.3) {
      ctx.setLineDash([6 * lw, 6 * lw]);
      ctx.strokeStyle = col(a * 0.8);
      ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, 0, (x1 - x0) / 2, (x1 - x0) / 6, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const pts = SHAPES[m.shape];
      if (m.f > 0.65) { // translucent shaded body: lighter on top, darker below
        const g = ctx.createLinearGradient(0, -30, 0, 30);
        g.addColorStop(0, col(a * 0.35 * m.f)); g.addColorStop(1, col(a * 0.05));
        ctx.fillStyle = g; tracePoly(ctx, pts); ctx.fill();
      }
      ctx.strokeStyle = col(a * (0.4 + 0.6 * m.f)); tracePoly(ctx, pts); ctx.stroke();
      // ribs: more of them as familiarity grows
      const n = Math.round(2 + m.f * 10);
      ctx.strokeStyle = col(a * 0.5);
      for (let k = 0; k < n; k++) {
        const r = ribs[Math.floor(k * ribs.length / n)];
        if (!r) continue;
        const half = (r[2] - r[1]) / 2;
        ctx.beginPath(); ctx.ellipse(r[0], r[1] + half, half * 0.35, half, 0, 0, TAU); ctx.stroke();
      }
      if (m.f > 0.5) { // spine (drawn below)
        ctx.strokeStyle = col(a * 0.4);
        ctx.beginPath();
        ribs.forEach((r, k) => { const y = (r[1] + r[2]) / 2; k ? ctx.lineTo(r[0], y) : ctx.moveTo(r[0], y); });
        ctx.stroke();
      }
    }
    ctx.restore();
    if (m.path) drawPath(ctx, m.path, col, a, px);
    if (m.lock) drawLockReticle(ctx, m.x, m.y, 60 * m.scale + 20 * px, col(a), px);
  }
  ctx.restore();
}

// Corner brackets around an echo-locked creature.
function drawLockReticle(ctx, x, y, r, color, px) {
  const k = r * 0.35;
  ctx.strokeStyle = color; ctx.lineWidth = 2 * px;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * r, y + sy * (r - k)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - k), y + sy * r);
    ctx.stroke();
  }
}

// Dotted line along the creature's committed path, with an arrowhead where it will be in ~1 s.
function drawPath(ctx, pts, col, a, px) {
  ctx.setLineDash([5 * px, 4 * px]); ctx.lineWidth = 2.5 * px; ctx.strokeStyle = col(Math.min(1, a * 1.4));
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.stroke(); ctx.setLineDash([]);
  const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 2];
  const ang = Math.atan2(y1 - y0, x1 - x0), s = 12 * px;
  ctx.fillStyle = col(Math.min(1, a * 1.4));
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(ang) * s, y1 + Math.sin(ang) * s);
  ctx.lineTo(x1 + Math.cos(ang + 2.5) * s, y1 + Math.sin(ang + 2.5) * s);
  ctx.lineTo(x1 + Math.cos(ang - 2.5) * s, y1 + Math.sin(ang - 2.5) * s);
  ctx.closePath(); ctx.fill();
}

function drawSonar(ctx, game, px) {
  const S = CONFIG.sonar, t = game.time;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  for (const p of game.sonar.pings) {
    const r = (t - p.t0) * p.speed, f = 1 - r / p.range;
    ctx.strokeStyle = `rgba(160,230,255,${(0.35 * f).toFixed(3)})`; ctx.lineWidth = 2 * px;
    ctx.beginPath();
    if (p.full) ctx.arc(p.x, p.y, r, 0, TAU);
    else ctx.arc(p.x, p.y, r, p.angle - p.cone / 2, p.angle + p.cone / 2);
    ctx.stroke();
  }

  for (const e of game.sonar.echoes) {
    if (t < e.t) continue;
    const age = (t - e.t) / e.life;
    const a = e.i * Math.pow(1 - age, 1.4);
    if (a < 0.02) continue;
    const c = S.colorCode ? S.colors[e.kind] : S.colors.terrain;
    const rgb = `${c[0]},${c[1]},${c[2]}`;
    if (e.line) {
      ctx.strokeStyle = `rgba(${rgb},${(a * 0.25).toFixed(3)})`; ctx.lineWidth = 7 * px;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(e.x1, e.y1, 2.5 * px, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color, label, warn) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = warn ? '#ff3b3b' : color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  ctx.fillStyle = '#e8f4ff'; ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w + 10, y + h / 2);
}

function canAffordAny(w) {
  return w.points > 0 && CONFIG.upgrades.some(u => (w.levels[u.id] || 0) < u.max);
}

function drawHUD(ctx, game) {
  const w = game.whale, s = w.stats, W = game.cw, H = game.ch, t = game.time, G = CONFIG.growth;
  const blinkOn = Math.floor(t * 4) % 2 === 0;
  ctx.textBaseline = 'middle';

  if (game.state !== 'title') {
    const lowAir = w.oxygen / s.maxOxygen < 0.25;
    bar(ctx, 20, 20, 200, 12, w.oxygen / s.maxOxygen, '#4fd1ff', 'AIR', lowAir && blinkOn);
    bar(ctx, 20, 42, 200, 12, w.health / s.maxHealth, '#ff6464', 'HEALTH');
    const canSprint = w.energy > s.maxEnergy * s.sprintMinEnergy;
    bar(ctx, 20, 64, 200, 12, w.energy / s.maxEnergy, canSprint ? '#ffd166' : '#b0894a',
        canSprint ? 'ENERGY' : 'ENERGY · too tired to sprint', w.energy < s.maxEnergy * 0.12 && blinkOn);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(20 + 200 * s.sprintMinEnergy - 1, 62, 2, 16); // sprint threshold mark
    bar(ctx, 20, 86, 200, 12, (w.size - 1) / (G.maxSize - 1), '#c08cff',
        `SIZE ${w.size.toFixed(2)} / ${G.maxSize} · ${(180 * w.size * CONFIG.bodyMetersPerUnit).toFixed(1)} m long`);

    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = canAffordAny(w) && blinkOn ? '#9fe8ff' : '#d8ecf7';
    ctx.fillText(`${w.points} upgrade point${w.points === 1 ? '' : 's'}  ·  press U to evolve`, 20, 116);
    if (game.wanted > 0) { // GTA-style wanted stars
      ctx.font = 'bold 18px system-ui'; ctx.fillStyle = blinkOn ? '#ffd166' : '#ff9b6a';
      ctx.fillText(`WANTED ${'★'.repeat(game.wanted)}${'☆'.repeat(CONFIG.wanted.maxStars - game.wanted)}`, 20, 142);
      // time until the next star drops
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(20, 156, 160, 4);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(20, 156, 160 * clamp(game.wantedT / CONFIG.wanted.decayTime, 0, 1), 4);
    }

    ctx.textAlign = 'right'; ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = w.overDepth && blinkOn ? '#ff8080' : '#e8f4ff';
    ctx.fillText(`${Math.max(0, Math.round(w.y * CONFIG.metersPerUnit))} m`, W - 20, 30);
    ctx.font = '12px system-ui'; ctx.fillStyle = w.overDepth ? '#ff9b9b' : '#8fa6b8';
    ctx.fillText(`max dive ${Math.round(s.maxDepth)} m`, W - 20, 76);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Score ${w.score}   ·   Eaten ${w.eaten}`, W - 20, 56);
    ctx.textAlign = 'left';

    drawFoodChain(ctx, game);
    drawQuests(ctx, game);

    // Warnings the whale could plausibly hear
    const msgs = [];
    if (game.message) msgs.push([game.message.text, game.message.color]);
    if (game.pods.some(p => p.alertT > 0)) msgs.push(['Orca calls nearby — you are being hunted', '#ff7b7b']);
    if (lowAir) msgs.push(['Low air — surface!', '#4fd1ff']);
    if (w.overDepth) msgs.push(['Too deep — the pressure is crushing you!', '#ff9b9b']);
    ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui, sans-serif';
    const my0 = W > 1200 ? 28 : 150; // below the stat bars on narrow screens
    msgs.forEach(([m, c], i) => {
      const tw = ctx.measureText(m).width;
      ctx.fillStyle = 'rgba(0,8,18,0.5)'; ctx.fillRect(W / 2 - tw / 2 - 8, my0 + i * 24 - 11, tw + 16, 22);
      ctx.fillStyle = c; ctx.fillText(m, W / 2, my0 + i * 24);
    });
    ctx.textAlign = 'left';

    // Fight bar: shown while biting something that takes several bites (struggles, giant squid)
    const fp = game.fight && game.fight.prey;
    if (fp && !fp.dead && fp.maxHp) {
      const bw = 360, bx = W / 2 - bw / 2, by = H - 50;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(bx, by, bw * Math.max(0, fp.hp) / fp.maxHp, 12);
      ctx.fillStyle = '#fff3c4'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`${fp.sp.name.toUpperCase()} — ${game.fight.label}`, W / 2, by - 12); ctx.textAlign = 'left';
    }

    drawLearnedIndicators(ctx, game);

    // Propeller noise indicator (direction only)
    for (const sh of game.ships) {
      const d = dist(sh.x, sh.y, w.x, w.y);
      if (d > CONFIG.ship.hearingRange * w.size || w.y < 0) continue;
      const sx = (sh.x - game.cam.x) * game.cam.z, sy = (sh.y - game.cam.y) * game.cam.z;
      if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      const ex = clamp(W / 2 + Math.cos(a) * W, 40, W - 40), ey = clamp(H / 2 + Math.sin(a) * H, 140, H - 40);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = `rgba(255,165,70,${0.4 + 0.5 * (1 - d / (CONFIG.ship.hearingRange * w.size))})`;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,190,120,0.8)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('propellers', ex, ey + 22); ctx.textAlign = 'left';
    }

    // Crosshair with cooldown rings (only while playing; menus use the normal mouse cursor)
    const mx = game.input.mx, my = game.input.my;
    if (game.state === 'playing') {
    ctx.strokeStyle = 'rgba(180,235,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, TAU); ctx.stroke();
    const cb = game.sonar.cool.beam / game.sonar.maxCool.beam;
    const cu = game.sonar.cool.burst / game.sonar.maxCool.burst;
    if (cb > 0) { ctx.strokeStyle = 'rgba(180,235,255,0.6)'; ctx.beginPath(); ctx.arc(mx, my, 11, -Math.PI / 2, -Math.PI / 2 + TAU * cb); ctx.stroke(); }
    if (cu > 0) { ctx.strokeStyle = 'rgba(255,220,150,0.6)'; ctx.beginPath(); ctx.arc(mx, my, 16, -Math.PI / 2, -Math.PI / 2 + TAU * cu); ctx.stroke(); }
    }
  }

  if (game.state === 'title') overlay(ctx, W, H, 'DEEP ECHO', [
    'You are a young sperm whale. The deep is pitch black — click to see.',
    `Eat ${CONFIG.diet.unlockAfter} of your top prey to move up the food chain — and finally hunt the Giant Squid.`,
    '',
    'WASD / Arrows — swim      Shift — sprint (burns air + energy)',
    'Left click / Space — sonar beam toward mouse      Right click / E — 360° burst',
    'U — evolve (spend upgrade points)      M — mute      P — pause + sound settings      Quests (top right) give free upgrades',
    'Surface for air. Orcas hear your clicks. Once you are big, whalers hunt the surface.',
    '',
    'Click or press Enter to dive',
  ]);
  else if (game.state === 'paused') drawSoundMenu(ctx, game);
  else if (game.state === 'upgrades') drawUpgradeMenu(ctx, game);
  else if (game.state === 'dead') overlay(ctx, W, H, w.lastDamage || 'You died.', [
    `Score ${w.score}   ·   Eaten ${w.eaten}   ·   Size ${w.size.toFixed(2)}   ·   Survived ${Math.floor(w.timeAlive)}s`,
    `Best ${game.best}`,
    '',
    'Press R or click to try again',
  ]);
  else if (game.state === 'won') overlay(ctx, W, H, 'You are the Leviathan', [
    'You ate the Giant Squid. Nothing in the deep can challenge you now.',
    `Score ${w.score}   ·   Eaten ${w.eaten}   ·   Time ${Math.floor(w.timeAlive)}s`,
    '',
    'C — keep swimming      R — new game',
  ]);
}

// Bottom-left: the food chain. Grey = too big for now, white = edible, ✓ = eaten at least once.
// Off-screen pings of fully learned (100% scanned) creatures: an arrow at the screen edge with a small
// silhouette of the creature, like the propeller indicator. Fades with the echo.
function drawLearnedIndicators(ctx, game) {
  const W = game.cw, H = game.ch, t = game.time, S = CONFIG.sonar, seen = new Set();
  for (let i = game.sonar.models.length - 1; i >= 0; i--) {
    const m = game.sonar.models[i];
    if (m.f < 1 || t < m.t || seen.has(m.owner)) continue; // (the kraken counts once it is complete)
    seen.add(m.owner);
    const age = (t - m.t) / m.life;
    if (age >= 1) continue;
    const sx = (m.x - game.cam.x) * game.cam.z, sy = (m.y - game.cam.y) * game.cam.z;
    if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
    const a = Math.atan2(sy - H / 2, sx - W / 2);
    // project onto the screen border (with margin)
    const mx = W / 2 - 50, my = H / 2 - 50, k = Math.min(mx / Math.abs(Math.cos(a) || 1e-6), my / Math.abs(Math.sin(a) || 1e-6));
    const ex = W / 2 + Math.cos(a) * k, ey = H / 2 + Math.sin(a) * k;
    const c = S.colors[m.kind] || S.colors.inedible, al = Math.pow(1 - age, 1.2);
    const col = `rgba(${c[0]},${c[1]},${c[2]},${al.toFixed(3)})`;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(22, -8); ctx.lineTo(22, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    // tiny silhouette of the creature, facing the way it was swimming
    const pts = transformShape(SHAPES[m.shape], ex, ey, m.angle, 0.32);
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(al * 0.25).toFixed(3)})`; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    tracePoly(ctx, pts); ctx.fill(); ctx.stroke();
  }
}

function drawFoodChain(ctx, game) {
  const w = game.whale, list = CONFIG.species, rowH = 17;
  const x = 16, y = game.ch - 22 - (list.length + 1) * rowH;
  ctx.fillStyle = 'rgba(0,8,18,0.55)';
  ctx.fillRect(x - 6, y - 26, 236, (list.length + 1) * rowH + 34);
  { // the kraken: not food, but a discovery
    const yy = y + list.length * rowH + 4, pct = Math.round(100 * game.krakenFraction() / CONFIG.kraken.completeAt);
    ctx.font = '12px system-ui'; ctx.fillStyle = game.krakenFound ? '#ffd166' : '#5f7080';
    ctx.fillText(game.krakenFound ? 'Kraken' : '??? (something in the abyss)', x + 16, yy);
    ctx.textAlign = 'right';
    if (game.krakenFound) ctx.fillText(game.krakenDone ? '◉ scanned' : `scanned ${Math.min(99, pct)}%`, x + 222, yy);
    ctx.textAlign = 'left';
  }
  ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#9fb8cc'; ctx.fillText('FOOD CHAIN', x, y - 12);
  ctx.font = '12px system-ui';
  list.forEach((sp, i) => {
    const yy = y + i * rowH + 4, edible = w.canEat(sp), n = w.eatenBy[sp.id] || 0, isTop = sp === w.topSpecies();
    ctx.fillStyle = sp.color; ctx.fillRect(x, yy - 4, 8, 8);
    ctx.fillStyle = edible ? (sp.final ? '#ff9b8a' : '#e8f4ff') : '#5f7080';
    ctx.fillText(`${i + 1}·${sp.name}`, x + 16, yy);
    const pct = Math.min(100, Math.round(100 * (w.scans[sp.id] || 0) / CONFIG.sonar.model.scansForFull));
    if (pct > 0) { ctx.fillStyle = pct >= 100 ? '#9fe8ff' : '#4f8aa8'; ctx.fillText(pct >= 100 ? '◉' : `${pct}%`, x + 128, yy); }
    ctx.fillStyle = edible ? (sp.final ? '#ff9b8a' : '#e8f4ff') : '#5f7080';
    ctx.textAlign = 'right';
    const r = w.nutrition(sp);
    if (edible && r < 0.999) ctx.fillStyle = r < 0.3 ? '#5f7080' : '#c9b37a';
    const gap = w.tierGap(sp);
    let lockText = 'locked';
    if (!edible && gap >= 1) {
      lockText = 'fight · ' + w.struggleFor(sp).label.replace(' fight', '');
      ctx.fillStyle = gap <= 2 ? '#c9b37a' : '#8a7a5a';
    }
    let text = edible ? (r < 0.999 ? `worth ${Math.round(r * 100)}%` : n ? `✓ ${n}` : 'new') : lockText;
    if (isTop && w.nextSpecies()) { // progress towards unlocking the next species
      text = `${Math.min(n, CONFIG.diet.unlockAfter)}/${CONFIG.diet.unlockAfter} → next`; ctx.fillStyle = '#ffd166';
    }
    ctx.fillText(text, x + 222, yy);
    ctx.textAlign = 'left';
  });
}

// Evolve menu: spend scarce upgrade points (1 point = 1 level). Quest rewards show as bonus levels.
function drawUpgradeMenu(ctx, game) {
  const w = game.whale, W = game.cw, H = game.ch, items = CONFIG.upgrades;
  ctx.fillStyle = 'rgba(0,6,16,0.75)'; ctx.fillRect(0, 0, W, H);
  const cols = 2, rows = Math.ceil(items.length / cols), colW = Math.min(380, (W - 60) / 2), rowH = 42;
  const pw = cols * colW + 40, ph = rows * rowH + 100;
  const px = (W - pw) / 2, py = Math.max(10, (H - ph) / 2);
  ctx.fillStyle = 'rgba(8,24,40,0.95)'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(120,200,240,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#bfefff'; ctx.font = 'bold 24px system-ui'; ctx.fillText('EVOLVE', px + 20, py + 28);
  ctx.font = '14px system-ui'; ctx.fillStyle = w.points > 0 ? '#ffd166' : '#9fe8ff';
  ctx.fillText(`${w.points} upgrade point${w.points === 1 ? '' : 's'}  ·  1 point = 1 level  ·  U / Esc to close`, px + 130, py + 30);
  ctx.font = '12px system-ui'; ctx.fillStyle = '#8fa6b8';
  ctx.fillText('Points come from growing your diet (squid steps give an extra point) and some quests. Cyan pips = quest rewards.', px + 20, py + 56);

  game.menuRects = [];
  const mx = game.input.mx, my = game.input.my;
  items.forEach((it, i) => {
    const c = Math.floor(i / rows), r = i % rows;
    const x = px + 20 + c * colW, y = py + 76 + r * rowH, rw = colW - 10, rh = rowH - 6;
    const lv = w.levels[it.id] || 0, bonus = w.bonusLevels[it.id] || 0;
    const owned = lv >= it.max, afford = !owned && w.points >= 1;
    const hover = mx > x && mx < x + rw && my > y && my < y + rh;
    ctx.fillStyle = hover && afford ? 'rgba(80,160,210,0.35)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, rw, rh);
    for (let k = 0; k < it.max; k++) {
      ctx.fillStyle = k < lv ? '#ffd166' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + rw - 150 + k * 14, y + 7, 10, 10);
    }
    for (let k = 0; k < bonus; k++) { ctx.fillStyle = '#9fe8ff'; ctx.fillRect(x + rw - 150 + (it.max + k) * 14 + 4, y + 7, 10, 10); }
    ctx.fillStyle = afford ? '#e8f4ff' : owned ? '#8fd18f' : '#6f8294';
    ctx.font = 'bold 14px system-ui'; ctx.fillText(it.name, x + 10, y + 12);
    ctx.font = '12px system-ui'; ctx.fillStyle = afford ? '#a9c8dc' : '#5f7080';
    ctx.fillText(it.desc, x + 10, y + 27);
    ctx.textAlign = 'right'; ctx.font = 'bold 13px system-ui';
    ctx.fillStyle = owned ? '#8fd18f' : afford ? '#ffd166' : '#6f8294';
    ctx.fillText(owned ? 'MAX' : '1 pt', x + rw - 10, y + 12);
    ctx.textAlign = 'left';
    game.menuRects.push({ x, y, w: rw, h: rh, upgrade: it });
  });
}

// Pause screen with the sound menu: a slider per channel (drag or click), a mute toggle and Continue.
function drawSoundMenu(ctx, game) {
  const W = game.cw, H = game.ch, sfx = game.sfx;
  const rows = [{ id: 'master', name: 'Master volume' }, ...CONFIG.audio.channels];
  ctx.fillStyle = 'rgba(0,6,16,0.6)'; ctx.fillRect(0, 0, W, H);
  const tools = CONFIG.debug.tools, toolsH = tools ? 118 : 0;
  const pw = Math.min(460, W - 32), rowH = 46, ph = 120 + rows.length * rowH + toolsH + 60;
  const px = (W - pw) / 2, py = Math.max(10, (H - ph) / 2);
  ctx.fillStyle = 'rgba(8,24,40,0.95)'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(120,200,240,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillStyle = '#bfefff'; ctx.font = 'bold 32px system-ui'; ctx.fillText('PAUSED', W / 2, py + 34);
  ctx.font = '13px system-ui'; ctx.fillStyle = '#8fa6b8'; ctx.fillText('P / Esc to continue  ·  M to mute', W / 2, py + 64);
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#9fb8cc'; ctx.fillText('SOUND', px + 20, py + 94);

  game.soundRects = [];
  const mx = game.input.mx, my = game.input.my;
  rows.forEach((r, i) => {
    const y = py + 116 + i * rowH, v = sfx.volume[r.id];
    const sx = px + 20, sw = pw - 110, barY = y + 22;
    ctx.font = '13px system-ui'; ctx.fillStyle = sfx.muted ? '#6f8294' : '#e8f4ff'; ctx.fillText(r.name, sx, y + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(sx, barY - 3, sw, 6);
    ctx.fillStyle = sfx.muted ? '#4f6070' : '#4fb8e0'; ctx.fillRect(sx, barY - 3, sw * v, 6);
    const hover = game.soundDrag === r.id || (mx >= sx - 8 && mx <= sx + sw + 8 && my >= barY - 12 && my <= barY + 12);
    ctx.fillStyle = hover ? '#ffffff' : '#bfefff';
    ctx.beginPath(); ctx.arc(sx + sw * v, barY, hover ? 8 : 7, 0, TAU); ctx.fill();
    ctx.textAlign = 'right'; ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#ffd166';
    ctx.fillText(`${Math.round(v * 100)}%`, px + pw - 20, barY);
    ctx.textAlign = 'left';
    game.soundRects.push({ x: sx - 8, y: barY - 12, w: sw + 16, h: 24, slider: r.id, sx, sw });
  });

  // TESTING block (prototype only): Unstuck + start from one of five stage presets ("saves")
  const button = (x, y, w, h, label, rect, sub) => {
    const hover = mx >= x && mx <= x + w && my >= y && my <= y + h;
    ctx.fillStyle = hover ? 'rgba(255,209,102,0.25)' : 'rgba(255,255,255,0.07)'; ctx.fillRect(x, y, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 13px system-ui'; ctx.fillText(label, x + w / 2, sub ? y + h / 2 - 7 : y + h / 2);
    if (sub) { ctx.font = '11px system-ui'; ctx.fillStyle = '#c9b37a'; ctx.fillText(sub, x + w / 2, y + h / 2 + 9); }
    ctx.textAlign = 'left';
    game.soundRects.push({ x, y, w, h, ...rect });
  };
  if (tools) {
    const ty = py + 116 + rows.length * rowH;
    ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#c9b37a'; ctx.fillText('TESTING', px + 20, ty + 4);
    button(px + 20, ty + 16, pw - 40, 30, 'Unstuck: move to open water', { action: 'unstuck' });
    ctx.font = '12px system-ui'; ctx.fillStyle = '#8fa6b8'; ctx.fillText('Start from save:', px + 20, ty + 60);
    const n = CONFIG.debug.stages.length, gap = 8, sw = (pw - 40 - gap * (n - 1)) / n;
    CONFIG.debug.stages.forEach((f, i) => button(px + 20 + i * (sw + gap), ty + 70, sw, 36, `${i + 1}`,
      { stage: i + 1 }, i === 0 ? 'new game' : `${Math.round(f * 100)}%`));
  }

  const by = py + ph - 52, bw = (pw - 50) / 2;
  [{ label: sfx.muted ? 'Unmute' : 'Mute', action: 'mute', x: px + 20 }, { label: 'Continue', action: 'continue', x: px + 30 + bw }]
    .forEach(b => {
      const hover = mx >= b.x && mx <= b.x + bw && my >= by && my <= by + 34;
      ctx.fillStyle = hover ? 'rgba(80,160,210,0.35)' : 'rgba(255,255,255,0.07)'; ctx.fillRect(b.x, by, bw, 34);
      ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui'; ctx.fillStyle = '#e8f4ff';
      ctx.fillText(b.label, b.x + bw / 2, by + 17); ctx.textAlign = 'left';
      game.soundRects.push({ x: b.x, y: by, w: bw, h: 34, action: b.action });
    });
}

function overlay(ctx, W, H, title, lines) {
  ctx.fillStyle = 'rgba(0,6,16,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#bfefff'; ctx.font = 'bold 44px system-ui, sans-serif';
  const top = H / 2 - (lines.length * 24) / 2 - 40;
  ctx.fillText(title, W / 2, top);
  ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = '#d8ecf7';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + 56 + i * 24));
  ctx.textAlign = 'left';
}
