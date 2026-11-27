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

  g.cosmicRock = ctx.createLinearGradient(0, 4000, 0, D + 800);
  g.cosmicRock.addColorStop(0, '#2a1f4a'); g.cosmicRock.addColorStop(0.4, '#171230'); g.cosmicRock.addColorStop(1, '#08060f');

  g.ray = ctx.createLinearGradient(0, 0, 0, 700);
  g.ray.addColorStop(0, 'rgba(255,255,230,0.14)'); g.ray.addColorStop(1, 'rgba(255,255,230,0)');
  return g;
}

function drawGame(game) {
  const ctx = game.ctx, W = game.cw, H = game.ch, t = game.time, z = game.cam.z;
  const VW = W / z, VH = H / z, px = 1 / z; // view size in world units; px = one screen pixel
  M3D_VIEW.px = px;
  const cx = game.cam.x, cy = game.cam.y;
  const x0 = cx, y0 = cy, x1 = cx + VW, y1 = cy + VH;
  const inView = (s, m = 0) => s.x1 > x0 - m && s.x0 < x1 + m && s.y1 > y0 - m && s.y0 < y1 + m;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);

  // --- Sky and water (or, after the ascension, outer space)
  const wy = game.cosmic ? y0 : Math.max(0, y0);
  if (game.cosmic) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); drawCosmos(ctx, game, W, H, t); ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
  } else {
  if (y0 < 0) { ctx.fillStyle = game.grad.sky; ctx.fillRect(x0, y0, VW, -y0); drawCoastLand(ctx, x0, x1, t, game.world); }
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

  drawWaterShading(ctx, game, x0, x1, y0, y1, px, t);
  }

  // --- Terrain (cosmic rock in space)
  ctx.fillStyle = game.cosmic ? game.grad.cosmicRock : game.grad.terrain;
  for (const s of game.world.solids) {
    if (!inView(s)) continue;
    tracePoly(ctx, s.poly); ctx.fill();
  }

  // --- Creatures, humans
  const hideFish = game.cosmic && !CONFIG.paint.showFish; // in space you only see the holes fish leave in the paint
  for (const p of game.prey) {
    if (hideFish || !inView(p.solid, 20)) continue;
    if (CONFIG.models3d.enabled && drawCreature3D(ctx, p, t, { color: p.sp.color })) continue;
    ctx.fillStyle = p.sp.color; tracePoly(ctx, p.poly); ctx.fill();
  }
  drawDecor(ctx, game.world.decor, x0, x1, t);
  drawFaunaBodies(ctx, game, inView);
  for (const o of game.orcas) {
    if (!inView(o.solid, 20)) continue;
    if (CONFIG.models3d.enabled && drawCreature3D(ctx, o, t, { color: '#16181c' })) continue;
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
  for (const sb of game.subs) { // submarines (3D hull) and their torpedoes
    if (!inView(sb.solid, 60)) continue;
    if (!(CONFIG.models3d.enabled && drawCreature3D(ctx, sb, t, { color: '#3d444c', belly: '#2b3036' }))) { ctx.fillStyle = '#3d444c'; tracePoly(ctx, sb.poly); ctx.fill(); }
  }
  for (const tp of game.torpedoes) {
    ctx.fillStyle = '#5a6068'; tracePoly(ctx, tp.poly); ctx.fill();
    ctx.fillStyle = 'rgba(220,240,255,0.35)'; // bubble trail
    for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(tp.x - Math.cos(tp.angle) * 14 * k, tp.y - Math.sin(tp.angle) * 14 * k + Math.sin(t * 9 + k) * 2, 2 + k * 0.4, 0, TAU); ctx.fill(); }
  }
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
  if (!blink) drawWhaleModel(ctx, w, 'fill', px);

  drawGore(ctx, game, px);

  // Marine snow: slow sinking specks, lit only where there is light (the darkness covers them deeper down)
  const sn = game.cosmic ? 1e9 : 110;
  ctx.fillStyle = 'rgba(225,240,250,0.35)';
  for (let gx = Math.floor(x0 / sn); gx <= Math.ceil(x1 / sn); gx++) {
    for (let gy = Math.max(0, Math.floor(y0 / sn) - 1); gy <= Math.ceil(y1 / sn); gy++) {
      const h = hash(gx * 3 + 1, gy * 7 - 2); if (h > 0.5) continue;
      const fall = (t * (4 + h * 6)) % sn;
      const sx = gx * sn + hash(gy, gx * 5) * sn + Math.sin(t * 0.5 + h * 20) * 6, sy = gy * sn + hash(gx, gy + 9) * sn + fall;
      if (sy < 4) continue;
      ctx.fillRect(sx, sy, 1.6 * px, 1.6 * px);
    }
  }

  // ================= DARKNESS =================
  if (game.cosmic) { ctx.fillStyle = `rgba(2,0,12,${CONFIG.cosmic.darkness})`; ctx.fillRect(x0, y0, VW, VH); }
  else { ctx.fillStyle = game.grad.dark; ctx.fillRect(x0, wy, VW, y1 - wy); }

  // Faint self-outline so the player can find themself in the dark
  const selfA = game.cosmic ? 0.3 : 0.5 * (1 - lightAt(w.y));
  if (selfA > 0.02 && !blink) {
    ctx.strokeStyle = `rgba(150,180,210,${selfA})`;
    drawWhaleModel(ctx, w, 'outline', px);
  }

  // Surface line
  if (y0 < 30 && !game.cosmic) {
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
  if (game.cosmic) drawPaint(ctx, game, px);

  // Floating "+EP" texts
  ctx.textAlign = 'center'; ctx.font = `bold ${14 * px}px system-ui, sans-serif`;
  for (const p of game.popups) {
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  // ================= SCREEN SPACE =================
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // soft vignette: the water closes in at the edges
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,4,10,0)'); vg.addColorStop(1, 'rgba(0,4,10,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  // the ascension: a violet glow builds while the mythical creatures gather, then a white flash into space
  if (game.ascend) {
    const k = clamp(game.ascend.t / CONFIG.ascension.gatherTime, 0, 1), a = 0.35 * k * k; // slow at first
    const ag = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    ag.addColorStop(0, `rgba(190,160,255,${(a * 0.5).toFixed(3)})`); ag.addColorStop(1, `rgba(90,50,180,${a.toFixed(3)})`);
    ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);
  }
  if (game.ascendFx > 0) { ctx.fillStyle = `rgba(245,240,255,${game.ascendFx.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (game.flash > 0) { // taking damage: a faint red tint at the screen edges only, the centre stays clear
    const D = CONFIG.damageFx, hg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * D.inner, W / 2, H / 2, Math.max(W, H) * 0.72);
    hg.addColorStop(0, 'rgba(150,20,25,0)'); hg.addColorStop(1, `rgba(150,20,25,${(game.flash * D.alpha).toFixed(3)})`);
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
  }
  drawHUD(ctx, game);
  updateCursor(game);
}

// ---------------------------------------------------------------- paint sense (the cosmic realm's sonar)
// Each line is a run of thrown paint: two paints in stripes that blend where they cross ('lighter'), turning green
// or yellow where they brush a creature. The creature itself is never drawn - only the bubble it leaves.
function drawPaint(ctx, game, px) {
  const P = CONFIG.paint, SC = CONFIG.sonar.colors;
  const cols = [P.colors[0], P.colors[1], SC.edible, SC.inedible];
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = P.width * px * Math.max(1, Math.sqrt(game.whale.size));
  for (const l of game.paint) {
    const age = game.time - l.t0, a = age < P.flowTime ? 0.8 : 0.8 * (1 - (age - P.flowTime) / P.fadeTime);
    if (a <= 0 || l.pts.length < 2) continue;
    let k = 1;
    while (k < l.pts.length) {
      const c = l.pts[k][2], col = cols[c] || cols[0];
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(l.pts[k - 1][0], l.pts[k - 1][1]);
      while (k < l.pts.length && l.pts[k][2] === c) { ctx.lineTo(l.pts[k][0], l.pts[k][1]); k++; }
      if (k === l.pts.length && l.flowing) ctx.lineTo(l.x, l.y); // the wet tip
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- outer space (the cosmic realm)
// Screen-space backdrop in parallax layers: nebulae, far stars, spiral galaxies, planets and near stars, each
// layer drifting at its own fraction of the camera's movement, so swimming feels like moving through space.
const COSMOS_COLORS = [[120, 60, 200], [40, 140, 210], [200, 60, 150], [60, 200, 170], [230, 140, 70]];
function cosmosLayer(game, W, H, par, cell, fn) {
  const z = game.cam.z, ox = game.cam.x * z * par, oy = game.cam.y * z * par;
  for (let gx = Math.floor(ox / cell) - 1; gx <= Math.floor((ox + W) / cell) + 1; gx++) {
    for (let gy = Math.floor(oy / cell) - 1; gy <= Math.floor((oy + H) / cell) + 1; gy++) {
      const h = hash(gx * 7 + Math.round(par * 100), gy * 13 - 5);
      fn(gx * cell - ox + hash(gy, gx) * cell, gy * cell - oy + hash(gx + 2, gy - 9) * cell, h, gx, gy);
    }
  }
}
function drawCosmos(ctx, game, W, H, t) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0620'); bg.addColorStop(1, '#03020c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  cosmosLayer(game, W, H, 0.04, 650, (x, y, h) => { // nebulae
    if (h > 0.6) return;
    const c = COSMOS_COLORS[Math.floor(h * 97) % COSMOS_COLORS.length], r = 350 + h * 700;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.2)`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  });
  cosmosLayer(game, W, H, 0.07, 46, (x, y, h) => { // far stars
    if (h > 0.6) return;
    const a = 0.35 + 0.35 * Math.sin(t * (0.5 + h * 3) + h * 90);
    ctx.fillStyle = `rgba(220,230,255,${a.toFixed(3)})`; ctx.fillRect(x, y, 1 + (h > 0.5 ? 1 : 0), 1 + (h > 0.5 ? 1 : 0));
  });
  cosmosLayer(game, W, H, 0.11, 620, (x, y, h) => { // spiral galaxies
    if (h > 0.4) return;
    const c = COSMOS_COLORS[Math.floor(h * 311) % COSMOS_COLORS.length], sc = 0.7 + h * 3.5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(h * 20); ctx.scale(sc, sc * 0.45);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
    core.addColorStop(0, 'rgba(255,245,230,0.5)'); core.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.fill();
    for (let arm = 0; arm < 2; arm++) for (let k = 0; k < 110; k++) {
      const a = k * 0.075 + arm * Math.PI + t * 0.01, r = 6 + k * 1.15;
      ctx.fillStyle = `rgba(${c[0] + 60},${c[1] + 60},${c[2] + 60},${(0.28 * (1 - k / 110)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 4.5 - k * 0.03, 0, TAU); ctx.fill();
    }
    ctx.restore();
  });
  ctx.restore();
  cosmosLayer(game, W, H, 0.18, 700, (x, y, h, gx, gy) => { // planets
    if (h > 0.28) return;
    const r = 25 + h * 600, c = COSMOS_COLORS[(gx * 3 + gy * 5 + 99) % COSMOS_COLORS.length];
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, `rgb(${Math.min(255, c[0] + 90)},${Math.min(255, c[1] + 90)},${Math.min(255, c[2] + 90)})`);
    g.addColorStop(0.7, `rgb(${c[0] * 0.55 | 0},${c[1] * 0.55 | 0},${c[2] * 0.55 | 0})`); g.addColorStop(1, 'rgb(8,6,18)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (hash(gx, gy + 77) > 0.5) { // rings
      ctx.strokeStyle = `rgba(${c[0] + 80},${c[1] + 80},${c[2] + 80},0.45)`; ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r * 0.45, -0.3, 0, TAU); ctx.stroke();
    }
  });
  cosmosLayer(game, W, H, 0.3, 150, (x, y, h) => { // near stars, a few with a flare
    if (h > 0.35) return;
    const a = 0.6 + 0.4 * Math.sin(t * (1 + h * 4) + h * 40);
    ctx.fillStyle = `rgba(255,250,240,${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, 1 + h * 3, 0, TAU); ctx.fill();
    if (h < 0.05) { ctx.fillRect(x - 8, y - 0.5, 16, 1); ctx.fillRect(x - 0.5, y - 8, 1, 16); }
  });
}

// ---------------------------------------------------------------- gore (a kill: blood clouds + flesh chunks)
// Lit world drawing, so it is hidden by the darkness in the deep; there it is seen only through sonar echoes
// (Game.echoGore).
function drawGore(ctx, game, px) {
  // blood: soft dark-red blobs made of a few wobbling lobes, swelling and fading as they spread
  for (const b of game.gore.blobs) {
    if (b.age < 0) continue;
    const f = b.age / b.life, R = b.r * (0.5 + 0.8 * Math.sqrt(f)), a = 0.55 * (1 - f) * (1 - f * 0.5);
    for (const L of b.lobes) {
      const wob = 1 + 0.12 * Math.sin(game.time * 1.3 + L.ph);
      const x = b.x + L.ox * R, y = b.y + L.oy * R, r = R * L.s * wob;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(105,6,14,${a.toFixed(3)})`); g.addColorStop(0.55, `rgba(90,4,12,${(a * 0.8).toFixed(3)})`);
      g.addColorStop(1, 'rgba(70,2,8,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }
  // ship wreckage
  for (const k of game.gore.chunks) {
    const a = Math.min(1, (k.life - k.age) / 1.5);
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.rot); ctx.globalAlpha = a;
    ctx.fillStyle = k.color; ctx.beginPath();
    k.shape.forEach(([sx, sy], i) => i ? ctx.lineTo(sx * k.r, sy * k.r) : ctx.moveTo(sx * k.r, sy * k.r));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- water shading
// Drawn before the darkness overlay, so it only shows where there is light.
// Caustics: shimmering light bands just under the surface. Haze: big soft light/dark patches drifting slowly
// at half camera speed (parallax), so open water has depth and texture instead of a flat gradient.
function drawWaterShading(ctx, game, x0, x1, y0, y1, px, t) {
  // haze (parallax: drawn in a frame that moves at half the camera speed)
  const HZ = 1100, par = 0.5, ox = game.cam.x * par, oy = game.cam.y * par;
  for (let gx = Math.floor((x0 - ox) / HZ) - 1; gx <= Math.ceil((x1 - ox) / HZ); gx++) {
    for (let gy = Math.floor((y0 - oy) / HZ) - 1; gy <= Math.ceil((y1 - oy) / HZ); gy++) {
      const h = hash(gx + 41, gy - 17);
      const bx = gx * HZ + hash(gy, gx + 3) * HZ + ox + Math.sin(t * 0.05 + h * 9) * 120;
      const by = gy * HZ + hash(gx - 8, gy) * HZ + oy;
      if (by < 0) continue;
      const r = 450 + h * 500, light = h > 0.5;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, light ? 'rgba(140,210,240,0.07)' : 'rgba(0,12,28,0.12)');
      g.addColorStop(1, light ? 'rgba(140,210,240,0)' : 'rgba(0,12,28,0)');
      ctx.fillStyle = g; ctx.fillRect(bx - r, Math.max(0, by - r), 2 * r, 2 * r);
    }
  }
  // caustics: dappled patches of light that drift and shimmer, strongest right under the surface
  const CD = 300; // how deep they reach (world units)
  if (y0 < CD) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cs = 46;
    for (let gx = Math.floor(x0 / cs) - 1; gx <= Math.ceil(x1 / cs); gx++) {
      for (let gy = 0; gy * cs < CD; gy++) {
        const h = hash(gx * 13 + 5, gy * 3 + 1);
        const cx = gx * cs + h * cs + Math.sin(t * 0.7 + h * 12) * 10;
        const cy = gy * cs + hash(gx, gy + 31) * cs + Math.cos(t * 0.5 + h * 7) * 6;
        const fl = 0.5 + 0.5 * Math.sin(t * (1.2 + h) + h * 40);
        const a = fl * 0.09 * (1 - cy / CD);
        if (a < 0.01) continue;
        ctx.fillStyle = `rgba(200,240,255,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(cx, cy, 9 + h * 12, 3 + h * 4, h * 3, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- whale body model
// A sperm whale drawn along a bending spine, in whale-local units (snout at +90, tail stock at -80), scaled by
// size and mirrored when facing left so the back stays up. The tail beats with swim speed (swimPhase/swimAmp)
// and the body curves into turns (bend). Shading: dark back to pale belly, a lit ridge along the back,
// wrinkled skin behind the head, jaw line, eye, a flipper and tail flukes that tilt with each beat.
// Collision and sonar still use the simple w.poly; this is only the picture.
const WHALE_PROFILE = [ // u (0 = snout, 1 = tail stock), top, bottom
  [0, -21, 9], [0.02, -27, 17], [0.1, -29, 21], [0.36, -29, 22], [0.48, -26, 26], [0.6, -20, 23],
  [0.75, -12, 14], [0.9, -6, 7], [1, -4, 4]];
function whaleProfile(u) {
  const P = WHALE_PROFILE;
  for (let i = 1; i < P.length; i++) {
    if (u <= P[i][0]) {
      let f = (u - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); f = f * f * (3 - 2 * f);
      return [lerp(P[i - 1][1], P[i][1], f), lerp(P[i - 1][2], P[i][2], f)];
    }
  }
  return [P[P.length - 1][1], P[P.length - 1][2]];
}

function drawWhaleModel(ctx, w, mode, px) {
  const A = CONFIG.whaleLook, flip = Math.cos(w.angle) < 0 ? -1 : 1, z = w.bodyScale();
  const ph = w.swimPhase || 0, amp = w.swimAmp || 0, bend = (w.bend || 0) * flip;
  const N = 26, X0 = 94, X1 = -80;
  // spine offset: travelling wave that grows toward the tail + a curve into the turn
  const off = u => amp * A.tailSwing * Math.pow(u, 2.2) * Math.sin(ph - u * 3.2) - bend * A.bend * u * u;
  const top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = lerp(X0, X1, u), o = off(u), [tp, bt] = whaleProfile(u);
    top.push([x, o + tp]); bot.push([x, o + bt]);
  }
  const tailY = off(1), slope = (off(1) - off(0.94)) / (0.06 * (X0 - X1)); // tail direction (local dy/dx, x backwards)
  const fl = Math.atan(slope * 2.2) + 0.25 * Math.sin(ph - 3.6) * amp; // flukes lead the stroke

  ctx.save();
  ctx.translate(w.x, w.y); ctx.rotate(w.angle); ctx.scale(z, z * flip);
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(top[i][0], top[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.quadraticCurveTo(X0 + 4, (top[0][1] + bot[0][1]) / 2, top[0][0], top[0][1]); // blunt rounded snout
    ctx.closePath();
  };
  const flukes = () => { // a tapered blade + a second lobe seen in perspective
    ctx.save(); ctx.translate(X1 + 2, tailY); ctx.rotate(-fl);
    const spread = 4 + 5 * Math.abs(Math.cos(ph - 3.6));
    ctx.beginPath();
    ctx.moveTo(4, -4); ctx.quadraticCurveTo(-12, -6 - spread, -26, -10 - spread);
    ctx.quadraticCurveTo(-20, 0, -26, 10 + spread * 0.6);
    ctx.quadraticCurveTo(-12, 5 + spread * 0.5, 4, 4);
    ctx.closePath(); ctx.restore();
  };
  const fin = () => {
    const a = 0.55 + 0.25 * Math.sin(ph * 0.5) + 0.15 * amp;
    ctx.save(); ctx.translate(36, bot[9][1] - 4); ctx.rotate(a); // on the lower flank, below the eye
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(-10, -2, -20, 3); ctx.quadraticCurveTo(-8, 6, 0, 4); ctx.closePath();
    ctx.restore();
  };

  if (mode === 'outline') {
    ctx.lineWidth = 1.5 * px / z; ctx.lineJoin = 'round';
    body(); ctx.stroke(); flukes(); ctx.stroke();
    ctx.restore(); return;
  }

  const alive = w.alive;
  const g = ctx.createLinearGradient(0, -30, 0, 27);
  g.addColorStop(0, alive ? '#3f4852' : '#2a2d31'); g.addColorStop(0.45, alive ? '#68727e' : '#3a3e44');
  g.addColorStop(0.8, alive ? '#8d97a2' : '#4a4e54'); g.addColorStop(1, alive ? '#a9b2bb' : '#55595e');
  ctx.fillStyle = g;
  flukes(); ctx.fill();
  body(); ctx.fill();
  fin(); ctx.fillStyle = alive ? '#56606b' : '#34383d'; ctx.fill();

  // lit ridge along the back (light comes from above)
  ctx.strokeStyle = 'rgba(220,235,250,0.22)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 1; i <= N - 4; i++) { const p = top[i]; i === 1 ? ctx.moveTo(p[0] - 1, p[1] + 2.2) : ctx.lineTo(p[0], p[1] + 2.2); }
  ctx.stroke();
  // soft rim shadow along the belly
  ctx.strokeStyle = 'rgba(10,20,30,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 2; i <= N - 2; i++) { const p = bot[i]; i === 2 ? ctx.moveTo(p[0], p[1] - 1.5) : ctx.lineTo(p[0], p[1] - 1.5); }
  ctx.stroke();
  // wrinkled skin behind the head
  ctx.strokeStyle = 'rgba(25,32,40,0.22)'; ctx.lineWidth = 1;
  for (let k = 0; k < 6; k++) {
    const i = 12 + k * 1.4 | 0, p = top[i], q = bot[i];
    ctx.beginPath(); ctx.moveTo(p[0], p[1] + 6); ctx.quadraticCurveTo(p[0] - 3, (p[1] + q[1]) / 2, p[0] + 1, q[1] - 6); ctx.stroke();
  }
  // lower jaw and mouth line
  ctx.strokeStyle = 'rgba(20,26,32,0.6)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(86, bot[1][1] - 4); ctx.quadraticCurveTo(60, bot[4][1] - 3, 28, bot[8][1] - 5); ctx.stroke();
  // eye with a glint
  const ey = top[8][1] + 0.62 * (bot[8][1] - top[8][1]);
  ctx.fillStyle = '#101418'; ctx.beginPath(); ctx.arc(30, ey, 2.4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(230,240,250,0.7)'; ctx.beginPath(); ctx.arc(30.8, ey - 0.8, 0.8, 0, TAU); ctx.fill();
  // blowhole
  ctx.fillStyle = 'rgba(20,26,32,0.55)'; ctx.beginPath(); ctx.ellipse(80, top[1][1] + 1.5, 3, 1, 0, 0, TAU); ctx.fill();
  ctx.restore();
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
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.tilt || 0); ctx.translate(-s.x, -s.y); // a sinking ship lists over
  ctx.fillStyle = '#d8d4c8'; ctx.fillRect(s.x - 50 * d - (d < 0 ? 70 : 0), s.y - 48, 70, 34);
  ctx.fillStyle = '#9b2b1f'; ctx.fillRect(s.x - 30 * d - 6, s.y - 70, 12, 22);
  ctx.strokeStyle = '#2a2222'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(s.x + 100 * d, s.y - 16); ctx.lineTo(s.x + 125 * d, s.y - 36); ctx.stroke();
  ctx.restore();
  if (!s.sinking && s.hp < CONFIG.ship.hp) { // damaged: a thin hull bar over the ship
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(s.x - 60, s.y - 96, 120, 6);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(s.x - 60, s.y - 96, 120 * Math.max(0, s.hp) / CONFIG.ship.hp, 6);
  }
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
    // the snapshot glides along the heading it had at the hit (dead reckoning) until a newer one replaces it
    const dr = m.lock ? 0 : Math.min(t - m.t, S.driftMax), mx = m.x + (m.vx || 0) * dr, my = m.y + (m.vy || 0) * dr;
    const mpath = m.path && dr ? m.path.map(q => [q[0] + (m.vx || 0) * dr, q[1] + (m.vy || 0) * dr]) : m.path;
    // well-known creatures: the hologram is their 3D model, in the pose they had when the sound hit (live when locked)
    const pose = m.lock ? m.owner.v3 : m.pose;
    if (CONFIG.models3d.enabled && pose && m.f >= S.model.full3d && MODELS3D[m.shape]) {
      // position and pose stay frozen (no live tracking) but the body keeps its swim cycle, so the hologram swims in place
      const ghost = { x: mx, y: my, angle: m.angle, scale: m.scale, shapeName: m.shape, vx: 0, vy: 0,
                      v3: { ...pose, t, phase: pose.phase + (m.lock ? 0 : (t - m.t) * 3), amp: Math.max(pose.amp || 0.5, 0.6) } };
      const ha = a * (0.45 + 0.55 * (m.f - S.model.full3d) / (1 - S.model.full3d));
      if (drawCreature3D(ctx, ghost, t, { frozen: true, holo: c, holoAlpha: ha })) {
        if (mpath) drawPath(ctx, mpath, col, a, px);
        if (m.lock) drawLockReticle(ctx, m.x, m.y, 60 * m.scale + 20 * px, col(a), px);
        continue;
      }
    }
    const flip = Math.cos(m.angle) < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(m.angle); ctx.scale(m.scale, m.scale * flip);
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
    if (mpath) drawPath(ctx, mpath, col, a, px);
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

  // A creature's echoes keep gliding along the heading it had when the sound hit (dead reckoning from that click,
  // capped at driftMax s) until a newer echo of it arrives - then the older lines give way to the new ones.
  const newest = new Map();
  for (const e of game.sonar.echoes) if (e.owner && t >= e.t && e.t > (newest.get(e.owner) || -1)) newest.set(e.owner, e.t);
  for (const e of game.sonar.echoes) {
    if (t < e.t) continue;
    if (e.owner && newest.get(e.owner) - e.t > 0.15) continue; // refreshed by a newer echo
    const age = (t - e.t) / e.life;
    const a = e.i * Math.pow(1 - age, 1.4);
    if (a < 0.02) continue;
    const c = S.colorCode ? S.colors[e.kind] : S.colors.terrain;
    const rgb = `${c[0]},${c[1]},${c[2]}`;
    const dr = Math.min(t - e.t, S.driftMax), ox = (e.vx || 0) * dr, oy = (e.vy || 0) * dr;
    if (ox || oy) { ctx.save(); ctx.translate(ox, oy); }
    if (e.line) {
      ctx.strokeStyle = `rgba(${rgb},${(a * 0.25).toFixed(3)})`; ctx.lineWidth = 7 * px;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(e.x1, e.y1, 2.5 * px, 0, TAU); ctx.fill();
    }
    if (ox || oy) ctx.restore();
  }
  ctx.restore();
}

// HUD style ("Sonar Instrument"): thin cyan lines, Space Mono labels, Space Grotesk text, numbers only where
// they matter (depth). Fonts load from Google Fonts in index.html; the fallbacks keep it readable offline.
const HUD = {
  mono: "'Space Mono', ui-monospace, Menlo, monospace", sans: "'Space Grotesk', system-ui, sans-serif",
  cyan: '#7FE3F0', ink: '#E6F7FA', text: '#CFEFF5', label: '#9ED9E3', food: '#F2D36B', warn: '#FF8A7A',
  green: '#7CF29A', track: 'rgba(127,227,240,0.16)', line: 'rgba(127,227,240,0.35)', panel: 'rgba(2,14,26,0.55)',
};
function hudFont(ctx, size, mono = false, bold = false) {
  ctx.font = `${bold ? '700 ' : ''}${size}px ${mono ? HUD.mono : HUD.sans}`;
}
function hudLabel(ctx, text, x, y, color = HUD.label) {
  hudFont(ctx, 11, true); ctx.fillStyle = color;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
  ctx.fillText(text, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
// thin stat line: LABEL ─────────
function bar(ctx, x, y, w, frac, color, label, warn) {
  hudLabel(ctx, label, x, y, warn ? HUD.warn : HUD.label);
  const bx = x + 48;
  ctx.fillStyle = HUD.track; ctx.fillRect(bx, y - 2, w, 4);
  ctx.fillStyle = warn ? HUD.warn : color; ctx.fillRect(bx, y - 2, w * clamp(frac, 0, 1), 4);
  return bx;
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
    // --- top left: four thin stat lines, no numbers
    const BW = 200, L = 28;
    bar(ctx, L, 30, BW, w.oxygen / s.maxOxygen, HUD.cyan, 'AIR', lowAir && blinkOn);
    bar(ctx, L, 48, BW, w.health / s.maxHealth, HUD.ink, 'HP', w.health / s.maxHealth < 0.25 && blinkOn);
    const canSprint = w.energy > s.maxEnergy * s.sprintMinEnergy;
    const fx = bar(ctx, L, 66, BW, w.energy / s.maxEnergy, canSprint ? HUD.food : '#A88B4A', 'FOOD', w.energy < s.maxEnergy * 0.12 && blinkOn);
    ctx.fillStyle = HUD.ink; ctx.fillRect(fx + BW * s.sprintMinEnergy - 0.5, 61, 1, 10); // sprint threshold mark
    bar(ctx, L, 84, BW, (w.size - 1) / (G.maxSize - 1), 'rgba(127,227,240,0.55)', 'SIZE');
    if (game.wanted > 0) { // GTA-style wanted stars
      hudLabel(ctx, 'WANTED', L, 108, HUD.food);
      hudFont(ctx, 15, true, true); ctx.fillStyle = blinkOn ? HUD.food : HUD.warn;
      ctx.fillText(`${'★'.repeat(game.wanted)}${'☆'.repeat(CONFIG.wanted.maxStars - game.wanted)}`, L + 66, 108);
      ctx.fillStyle = HUD.track; ctx.fillRect(L + 66, 120, 110, 2); // time until the next star drops
      ctx.fillStyle = HUD.food; ctx.fillRect(L + 66, 120, 110 * clamp(game.wantedT / CONFIG.wanted.decayTime, 0, 1), 2);
    }

    // --- right edge: depth thread (0 m at the top) with your dive limit, big depth readout above the quests
    const depthM = Math.max(0, w.y * CONFIG.metersPerUnit), TX = W - 30, T0 = 28, T1 = H - 40;
    const scaleM = Math.max(3000, s.maxDepth * 1.1), ty = m => T0 + (T1 - T0) * clamp(m / scaleM, 0, 1);
    if (!game.cosmic) { // no depth in space
    const tg = ctx.createLinearGradient(0, T0, 0, T1);
    tg.addColorStop(0, 'rgba(127,227,240,0.55)'); tg.addColorStop(1, 'rgba(127,227,240,0.12)');
    ctx.fillStyle = tg; ctx.fillRect(TX - 1, T0, 2, T1 - T0);
    for (let m = 500; m < scaleM; m += 500) { ctx.fillStyle = 'rgba(127,227,240,0.3)'; ctx.fillRect(TX - 4, ty(m), 8, 1); }
    ctx.fillStyle = HUD.warn; ctx.fillRect(TX - 8, ty(s.maxDepth) - 1, 16, 2); // your dive limit
    const markY = ty(depthM);
    ctx.save(); ctx.shadowColor = w.overDepth ? HUD.warn : HUD.cyan; ctx.shadowBlur = 14;
    ctx.fillStyle = w.overDepth ? HUD.warn : HUD.cyan; ctx.beginPath(); ctx.arc(TX, markY, 6, 0, TAU); ctx.fill(); ctx.restore();
    }

    ctx.textAlign = 'right';
    hudFont(ctx, 36, true, true); ctx.fillStyle = w.overDepth && blinkOn ? HUD.warn : HUD.ink;
    const dTxt = game.cosmic ? '∞' : `${Math.round(depthM)}`; ctx.fillText(dTxt, W - 72, 40);
    ctx.textAlign = 'left'; hudFont(ctx, 15, true); ctx.fillStyle = HUD.label; if (!game.cosmic) ctx.fillText('m', W - 68, 46);
    ctx.textAlign = 'right';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    hudFont(ctx, 11, true); ctx.fillStyle = w.overDepth ? HUD.warn : HUD.label;
    ctx.fillText(game.cosmic ? 'BEYOND THE DEEP' : `LIMIT ${Math.round(s.maxDepth)} M`, W - 54, 68);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';

    drawQuests(ctx, game);
    if (game.showChain) drawFoodChain(ctx, game);
    else drawHunting(ctx, game);

    // --- bottom right: upgrade points (only when you have some)
    if (w.points > 0) {
      ctx.textAlign = 'right';
      const txt = `${w.points} UPGRADE POINT${w.points === 1 ? '' : 'S'} · U`;
      hudLabel(ctx, txt, W - 54, H - 30, canAffordAny(w) && blinkOn ? HUD.cyan : HUD.text);
      ctx.textAlign = 'left';
    }

    // --- top centre: messages and warnings the whale could plausibly hear
    const msgs = [];
    if (game.message) msgs.push([game.message.text, game.message.color]);
    if (game.pods.some(p => p.alertT > 0)) msgs.push(['Orca calls nearby — you are being hunted', HUD.warn]);
    if (lowAir) msgs.push(['Low air — surface!', HUD.cyan]);
    if (w.overDepth) msgs.push(['Too deep — the pressure is crushing you!', HUD.warn]);
    ctx.textAlign = 'center'; hudFont(ctx, 13, true);
    const my0 = W > 1250 ? 34 : 140; // below the stat lines on narrow screens
    msgs.forEach(([m, c], i) => {
      const tw = ctx.measureText(m).width, yy = my0 + i * 34;
      ctx.fillStyle = HUD.panel; ctx.fillRect(W / 2 - tw / 2 - 14, yy - 14, tw + 28, 28);
      ctx.strokeStyle = HUD.line; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - tw / 2 - 14 + 0.5, yy - 14 + 0.5, tw + 27, 27);
      ctx.fillStyle = c; ctx.fillText(m, W / 2, yy + 1);
    });
    ctx.textAlign = 'left';

    // Fight bar: shown while biting something that takes several bites (struggles, giant squid)
    const fp = game.fight && game.fight.prey;
    if (fp && !fp.dead && fp.maxHp) {
      const bw = 360, bx = W / 2 - bw / 2, by = H - 46;
      ctx.fillStyle = HUD.track; ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = HUD.food; ctx.fillRect(bx, by, bw * Math.max(0, fp.hp) / fp.maxHp, 4);
      ctx.textAlign = 'center';
      hudLabel(ctx, `${fp.sp.name.toUpperCase()} · ${game.fight.label.toUpperCase()}`, W / 2, by - 14, HUD.food);
      ctx.textAlign = 'left';
    }

    drawLearnedIndicators(ctx, game);

    // Propeller noise indicator (direction only)
    for (const sh of game.ships) {
      const d = dist(sh.x, sh.y, w.x, w.y);
      if (d > CONFIG.ship.hearingRange * w.size || w.y < 0) continue;
      const sx = (sh.x - game.cam.x) * game.cam.z, sy = (sh.y - game.cam.y) * game.cam.z;
      if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      const ex = clamp(W / 2 + Math.cos(a) * W, 40, W - 80), ey = clamp(H / 2 + Math.sin(a) * H, 140, H - 40);
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
    'U — evolve (spend upgrade points)      F — food chain      M — mute      P — pause + sound settings',
    'Quests (top right) give free upgrades. The thread on the right edge shows your depth and dive limit.',
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
  else if (game.state === 'won' && game.wonSpecies && game.wonSpecies.cosmic) overlay(ctx, W, H, 'You devoured the stars', [
    'You ate the Star Serpent. There is nothing left above you, below you or beyond you.',
    `Score ${w.score}   ·   Eaten ${w.eaten}   ·   Time ${Math.floor(w.timeAlive)}s`,
    '',
    'C — keep swimming      R — new game',
  ]);
  else if (game.state === 'won') overlay(ctx, W, H, 'You are the Leviathan', [
    'You ate the Giant Squid. Nothing in the deep can challenge you now. Somewhere, a trench goes deeper still...',
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

// Bottom left, compact: what you hunt now and how far to the next species. F opens the full food chain.
function drawHunting(ctx, game) {
  const w = game.whale, top = w.topSpecies(), next = w.nextSpecies(), H = game.ch, x = 28;
  const n = Math.min(w.eatenBy[top.id] || 0, CONFIG.diet.unlockAfter);
  hudLabel(ctx, 'HUNTING', x, H - 58);
  hudFont(ctx, 18, false, true); ctx.fillStyle = HUD.green; ctx.fillText(top.name, x, H - 36);
  const tw = ctx.measureText(top.name).width;
  hudFont(ctx, 14); ctx.fillStyle = HUD.text;
  ctx.fillText(next ? `  ·  ${n} / ${CONFIG.diet.unlockAfter} to ${next.name}` : '  ·  top of the food chain', x + tw, H - 36);
  hudLabel(ctx, 'F · FOOD CHAIN', x, H - 16, 'rgba(158,217,227,0.6)');
}

function drawFoodChain(ctx, game) {
  const w = game.whale, list = CONFIG.species, rowH = 17;
  const x = 28, y = game.ch - 30 - (list.length + 1) * rowH;
  ctx.fillStyle = HUD.panel;
  ctx.fillRect(x - 10, y - 30, 312, (list.length + 1) * rowH + 40);
  ctx.strokeStyle = HUD.line; ctx.lineWidth = 1; ctx.strokeRect(x - 9.5, y - 29.5, 311, (list.length + 1) * rowH + 39);
  { // the kraken: not food, but a discovery
    const yy = y + list.length * rowH + 4, pct = Math.round(100 * game.krakenFraction() / CONFIG.kraken.completeAt);
    hudFont(ctx, 12); ctx.fillStyle = game.krakenFound ? HUD.food : '#6F8A96';
    ctx.fillText(game.krakenFound ? 'Kraken' : '??? (something in the abyss)', x + 16, yy);
    ctx.textAlign = 'right';
    if (game.krakenFound) ctx.fillText(game.krakenDone ? '◉ scanned' : `scanned ${Math.min(99, pct)}%`, x + 290, yy);
    ctx.textAlign = 'left';
  }
  hudLabel(ctx, 'FOOD CHAIN · F TO CLOSE', x, y - 14);
  hudFont(ctx, 12);
  list.forEach((sp, i) => {
    const yy = y + i * rowH + 4, edible = w.canEat(sp), n = w.eatenBy[sp.id] || 0, isTop = sp === w.topSpecies();
    ctx.fillStyle = sp.color; ctx.fillRect(x, yy - 4, 8, 8);
    ctx.fillStyle = edible ? (sp.final ? '#ff9b8a' : '#e8f4ff') : '#5f7080';
    ctx.fillText(`${i + 1}·${sp.name}`, x + 16, yy);
    const pct = Math.min(100, Math.round(100 * (w.scans[sp.id] || 0) / CONFIG.sonar.model.scansForFull));
    if (pct > 0) { ctx.fillStyle = pct >= 100 ? '#9fe8ff' : '#4f8aa8'; ctx.fillText(pct >= 100 ? '◉' : `${pct}%`, x + 162, yy); }
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
    ctx.fillText(text, x + 290, yy);
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
