// Local polygons, all facing +x (head/bow at positive x).
// Species shapes are normalized to length 100 (x from -50 to 50) and scaled by species.length / 100.
const SHAPES = {
  whale: [[88, -21], [90, 12], [70, 22], [30, 27], [-20, 22], [-55, 11], [-78, 5], [-97, 18], [-89, 0],
          [-97, -18], [-78, -5], [-55, -11], [-25, -22], [10, -28], [50, -29], [78, -27]],
  orca: [[52, 2], [46, -8], [28, -14], [10, -15], [0, -38], [-8, -14], [-30, -10], [-46, -3], [-58, -13],
         [-53, 0], [-58, 13], [-46, 3], [-28, 9], [8, 13], [36, 11]],
  orcaEye: [[34, -7], [24, -10], [16, -8], [26, -5]],
  orcaBelly: [[40, 6], [10, 11], [-20, 7], [5, 5]],
  fish: [[50, 0], [30, -18], [0, -20], [-25, -14], [-36, -6], [-50, -22], [-43, 0], [-50, 22], [-36, 6], [-25, 14], [0, 20], [30, 18]],
  fatfish: [[50, 2], [38, -20], [10, -30], [-20, -24], [-34, -10], [-50, -24], [-44, 0], [-50, 24], [-34, 10], [-20, 24], [10, 30], [38, 22]],
  tuna: [[50, 0], [36, -14], [12, -22], [2, -34], [-6, -21], [-30, -12], [-40, -4], [-50, -26], [-44, 0], [-50, 26], [-40, 4],
         [-30, 12], [-6, 21], [2, 30], [12, 22], [36, 14]],
  swordfish: [[50, 0], [18, -3], [8, -9], [-2, -28], [-10, -10], [-30, -7], [-40, -3], [-50, -18], [-45, 0], [-50, 18], [-40, 3],
              [-30, 7], [-5, 9], [16, 4]],
  shark: [[50, 3], [40, -7], [20, -11], [6, -12], [-4, -30], [-12, -12], [-34, -8], [-42, -4], [-50, -24], [-45, 0], [-50, 10],
          [-40, 5], [-20, 9], [-4, 10], [2, 17], [10, 11], [32, 10]],
  ray: [[50, 2], [36, -6], [12, -10], [-14, -8], [-26, -3], [-50, -1], [-50, 1], [-26, 3], [-10, 6], [20, 7], [40, 5]],
  octopus: [[50, 0], [44, -16], [28, -24], [10, -20], [0, -10], [-50, -18], [-18, -3], [-50, 2], [-18, 5], [-46, 20], [0, 12],
            [12, 22], [30, 24], [44, 16]],
  squid: [[46, 0], [31, -12], [5, -14], [-8, -9], [-46, -14], [-18, -4], [-54, 0], [-18, 4], [-46, 14], [-8, 9], [5, 14], [31, 12]],
  giantSquid: [[50, 0], [38, -8], [18, -9], [8, -6], [-20, -8], [-50, -10], [-22, -3], [-50, -2], [-50, 2], [-22, 3], [-50, 10],
               [-20, 8], [8, 6], [18, 9], [38, 8]],
  oarfish: [[50, 0], [46, -6], [30, -8], [-20, -6], [-50, -1], [-50, 1], [-20, 6], [30, 8], [46, 6]],
  ship: [[-125, -24], [-115, -24], [-110, -14], [110, -14], [135, -26], [112, 22], [-108, 22]],
  harpoon: [[20, 0], [12, -3], [12, -1], [-20, -1], [-20, 1], [12, 1], [12, 3]],
};

function speciesById(id) { return CONFIG.species.find(s => s.id === id); }

// ---------------------------------------------------------------- Whale (player)
class Whale {
  constructor(x, y) {
    this.levels = {};      // upgrade id -> level
    this.size = 1; this.mass = 0; this.points = 0; this.eatenBy = {};
    this.bonusLevels = {}; // free upgrade levels from quests
    this.scans = {};       // species id (or 'orca') -> number of sonar scans
    this.krakenKnown = new Set(); // revealed kraken scan cells (see kraken.js)
    this.diet = new Set([CONFIG.species[0].id]); // species you can eat (grows automatically)
    this.stats = null;
    this.recomputeStats();
    const s = this.stats;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.angle = 0;
    this.oxygen = s.maxOxygen; this.health = s.maxHealth; this.energy = s.maxEnergy * 0.7;
    this.alive = true; this.invuln = 0; this.lastDamage = '';
    this.score = 0; this.eaten = 0; this.timeAlive = 0;
    this.underwater = false; this.sprinting = false;
    this.updatePoly();
  }

  // stats = base config, then upgrades, then size scaling. Bars keep their fill ratio.
  recomputeStats() {
    const old = this.stats, s = { ...CONFIG.whale };
    for (const u of CONFIG.upgrades) {
      const lv = (this.levels[u.id] || 0) + (this.bonusLevels[u.id] || 0);
      if (!lv) continue;
      for (const k of [].concat(u.stat)) s[k] = u.mult ? s[k] * Math.pow(u.mult, lv) : s[k] + u.add * lv;
    }
    const G = CONFIG.growth, z = this.size;
    s.maxSpeed *= z ** G.speedExp; s.accel *= z ** G.accelExp; s.turnRate *= z ** G.turnExp;
    s.maxOxygen *= z ** G.oxygenExp;
    s.maxHealth *= z ** G.healthExp;
    s.energyDrain *= z ** G.energyDrainExp; s.sprintEnergyDrain *= z ** G.energyDrainExp;
    s.maxEnergy *= z ** G.energyMaxExp;
    s.breathDepth *= z;
    s.maxDepth *= 1 + G.depthPerSize * (z - 1);
    if (old) {
      this.health *= s.maxHealth / old.maxHealth;
      this.oxygen *= s.maxOxygen / old.maxOxygen;
      this.energy = Math.min(this.energy, s.maxEnergy);
    }
    this.stats = s;
  }

  // Diet = which species you may eat. Unlocking the next one is an upgrade bought with EP.
  canEat(sp) { return this.diet.has(sp.id); }
  // Tier = position in the food chain. Gap = how many tiers above the top of your diet a species is.
  tierGap(sp) {
    let top = 0;
    CONFIG.species.forEach((s, i) => { if (this.diet.has(s.id)) top = i; });
    return CONFIG.species.indexOf(sp) - top;
  }
  // Anything can be attacked; tiers above your diet are fights that cost health (see struggleFor).
  canHunt(sp) { return true; }
  // Fight cost for a species `gap` tiers above the top of your diet (null if it is in your diet).
  struggleFor(sp) {
    const gap = this.tierGap(sp), S = CONFIG.struggle;
    if (gap <= 0) return null;
    return { gap, bites: S.baseBites + S.bitesPerTier * gap, damage: S.damageBase * Math.pow(S.damageGrowth, gap - 1),
             label: S.labels[Math.min(gap, S.labels.length - 1)] };
  }
  // Eat a carcass: energy + some growth, no diet progress.
  scavenge(sp, meat) {
    const C = CONFIG.carcass, G = CONFIG.growth, r = this.nutrition(sp);
    this.energy = Math.min(this.stats.maxEnergy, this.energy + sp.energy * C.energyFrac * meat);
    this.mass += sp.mass * C.massFrac * meat * r; this.score += Math.round(sp.ep * 0.5 * meat);
    const ns = 1 + (G.maxSize - 1) * Math.sqrt(Math.min(1, this.mass / G.massForMax));
    if (ns !== this.size) { this.size = ns; this.recomputeStats(); this.updatePoly(); }
  }
  topSpecies() { let top = CONFIG.species[0]; for (const s of CONFIG.species) if (this.diet.has(s.id)) top = s; return top; }
  // The next species in the CURRENT realm (the ocean chain ends at the giant squid; the cosmic chain starts after
  // the ascension, see Game.enterCosmic).
  nextSpecies() {
    const n = CONFIG.species[CONFIG.species.indexOf(this.topSpecies()) + 1];
    return n && !!n.cosmic === !!this.cosmic ? n : null;
  }
  isSquid(sp) { return sp.shape === 'squid' || sp.shape === 'giantSquid'; }

  // Diet grows by itself: eat diet.unlockAfter of your top species and the next one is added.
  // Each step gives upgrade points (an extra one when the new prey is a squid). Returns the unlocked species.
  checkDiet() {
    const unlocked = [];
    for (;;) {
      const top = this.topSpecies(), next = this.nextSpecies();
      if (!next || (this.eatenBy[top.id] || 0) < CONFIG.diet.unlockAfter) break;
      this.diet.add(next.id);
      this.points += CONFIG.points.perDietStep + (this.isSquid(next) ? CONFIG.points.squidBonus : 0);
      unlocked.push(next);
    }
    return unlocked;
  }

  buy(u) {
    const lv = this.levels[u.id] || 0;
    if (lv >= u.max || this.points < 1) return false;
    this.points -= 1; this.levels[u.id] = lv + 1;
    this.recomputeStats();
    return true;
  }

  updatePoly() {
    const z = this.size;
    this.poly = transformShape(SHAPES.whale, this.x, this.y, this.angle, z);
    const M = CONFIG.mouth;
    const [h, b, mf, mb] = transformShape([[90, 0], [78, -26], M.front, M.back], this.x, this.y, this.angle, z);
    this.head = { x: h[0], y: h[1] };
    this.blowhole = { x: b[0], y: b[1] };
    this.mouthSeg = [mf[0], mf[1], mb[0], mb[1]]; // eating zone: a capsule along the lower jaw (CONFIG.mouth)
  }

  // Can the whale bite something at (x, y) with body radius r? (capsule along the jaw, see CONFIG.mouth)
  canReach(x, y, r) {
    const m = this.mouthSeg, c = closestOnSeg(x, y, m[0], m[1], m[2], m[3]);
    return Math.hypot(c[0] - x, c[1] - y) < r + CONFIG.mouth.reach * this.size;
  }

  update(dt, game, input) {
    const s = this.stats;
    this.timeAlive += dt;
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const inWater = this.y > 0 || this.cosmic; // in space there is no surface and no gravity
    const moving = ix !== 0 || iy !== 0;
    this.sprinting = input.sprint && moving && inWater && this.energy > s.maxEnergy * s.sprintMinEnergy;
    // At the surface (breathing) the whale is slow and heavy: coming up for air is a risk.
    const atSurface = !this.cosmic && inWater && this.y < s.breathDepth * 1.6;
    const mult = (this.sprinting ? s.sprintMultiplier : 1) * (atSurface ? s.surfaceSpeedMult : 1);
    this.atSurface = atSurface;

    if (inWater) {
      if (moving) {
        const l = Math.hypot(ix, iy);
        this.vx += ix / l * s.accel * mult * dt;
        this.vy += iy / l * s.accel * mult * dt;
      }
      const k = Math.exp(-s.drag * dt);
      this.vx *= k; this.vy *= k;
      const sp = Math.hypot(this.vx, this.vy), max = s.maxSpeed * mult;
      if (sp > max) { const f = lerp(1, max / sp, Math.min(1, dt * 4)); this.vx *= f; this.vy *= f; }
    } else {
      this.vy += 900 * dt; // breaching: gravity in the air
    }

    this.x += this.vx * dt; this.y += this.vy * dt;

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 10) {
      let ta = Math.atan2(this.vy, this.vx);
      this.angle = wrapAngle(this.angle + angleDiff(this.angle, ta) * Math.min(1, dt * s.turnRate));
    }
    this.collide(game);
    this.updatePoly();

    // Animation state for the body model (render only): the tail beats faster and wider with speed,
    // and the body bends into turns.
    const A = CONFIG.whaleLook, sf = clamp(sp / s.maxSpeed, 0, 1.6);
    this.swimPhase = (this.swimPhase || 0) + dt * (A.beatIdle + A.beatPerSpeed * sf);
    this.swimAmp = lerp(this.swimAmp || 0, A.ampIdle + A.ampPerSpeed * sf, Math.min(1, dt * 3));
    const turn = angleDiff(this.lastAngle ?? this.angle, this.angle) / Math.max(dt, 1e-3);
    this.lastAngle = this.angle;
    this.bend = lerp(this.bend || 0, clamp(turn, -2, 2), Math.min(1, dt * 4));

    // Breathing (in the cosmic realm the whale is godly: no air needed, no pressure)
    if (this.cosmic) {
      this.oxygen = s.maxOxygen; this.underwater = true;
      if (this.y < CONFIG.cosmic.ceiling) this.vy += (CONFIG.cosmic.ceiling - this.y) * 2 * dt; // soft ceiling
    } else if (this.y < s.breathDepth) {
      if (this.underwater && this.oxygen < s.maxOxygen * 0.95) game.spout(this);
      this.underwater = false;
      this.oxygen = Math.min(s.maxOxygen, this.oxygen + s.oxygenRefill * this.size * dt);
    } else {
      if (this.y > s.breathDepth + 50 * this.size) this.underwater = true;
      this.oxygen -= (this.sprinting ? s.sprintOxygenDrain : s.oxygenDrain) * dt;
    }
    this.energy -= (this.sprinting ? s.sprintEnergyDrain : s.energyDrain) * dt;

    const depthM = this.y * CONFIG.metersPerUnit;
    this.overDepth = !this.cosmic && depthM > s.maxDepth;
    if (this.overDepth) this.damage(s.pressureDamage * (1 + (depthM - s.maxDepth) / 200) * dt, 'Crushed by the pressure of the deep.', game, true);
    if (this.oxygen <= 0) { this.oxygen = 0; this.damage(s.suffocateDamage * dt, 'You drowned.', game, true); }
    if (this.energy <= 0) { this.energy = 0; this.damage(s.starveDamage * dt, 'You starved.', game, true); }
    else if (this.energy > 40 && this.oxygen > 0) this.health = Math.min(s.maxHealth, this.health + s.regenRate * dt);
    this.invuln -= dt;
  }

  // Body is approximated by circles along its length. Each one is pushed out of terrain, and the
  // velocity component going into the surface is removed, so the whale slides along walls instead of sticking.
  collide(game) {
    const z = this.size;
    const circles = [[62, 0, 24], [10, 0, 26], [-50, 0, 15]];
    for (let iter = 0; iter < 2; iter++) {
      for (const [lx, ly, r] of circles) {
        const p = transformShape([[lx, ly]], this.x, this.y, this.angle, z)[0];
        const res = game.world.resolveCircle(p[0], p[1], r * z);
        if (!res.hit) continue;
        this.x += res.x - p[0]; this.y += res.y - p[1];
        const vn = this.vx * res.nx + this.vy * res.ny;
        if (vn < 0) { this.vx -= res.nx * vn; this.vy -= res.ny * vn; }
      }
    }
    // Seafloor cables: pushed out like terrain, and touching one shocks you.
    let shocked = null, shockN = null;
    for (const cb of game.world.cables) {
      for (const [lx, ly, r0] of circles) {
        const r = r0 * z + 3, p = transformShape([[lx, ly]], this.x, this.y, this.angle, z)[0];
        if (p[0] < cb.x0 - r || p[0] > cb.x1 + r || p[1] < cb.y0 - r || p[1] > cb.y1 + r) continue;
        for (let i = 0; i < cb.line.length - 1; i++) {
          const A = cb.line[i], B = cb.line[i + 1];
          const c = closestOnSeg(p[0], p[1], A[0], A[1], B[0], B[1]);
          const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
          if (d >= r) continue;
          const nx = d > 0.01 ? (p[0] - c[0]) / d : 0, ny = d > 0.01 ? (p[1] - c[1]) / d : -1;
          this.x += nx * (r - d); this.y += ny * (r - d);
          const vn = this.vx * nx + this.vy * ny;
          if (vn < 0) { this.vx -= nx * vn; this.vy -= ny * vn; }
          shocked = c; shockN = [nx, ny];
        }
      }
    }
    if (shocked && this.invuln <= 0) {
      this.damage(CONFIG.cables.damage, 'Electrocuted by a seafloor cable.', game);
      this.vx += shockN[0] * CONFIG.cables.knockback; this.vy += shockN[1] * CONFIG.cables.knockback; // the jolt throws you off
      for (let i = 0; i < 18; i++) game.particles.push({ x: shocked[0], y: shocked[1], vx: rand(-120, 120), vy: rand(-160, 40),
        life: rand(0.2, 0.5), max: 0.5, size: rand(1, 2.5) * z, spark: true });
    }
  }

  // Chance that prey within notice range actually notices you. Always in light; in the dark Quiet Clicks
  // can make you go unnoticed. Sprinting is loud.
  detectChance() {
    if (this.sprinting) return 1;
    const stealth = clamp((1 - this.stats.sonarLoudnessMult) * CONFIG.stealth.quietToStealth, 0, 0.95);
    return 1 - stealth * (1 - lightAt(this.y));
  }

  // How much growth/EP a species is still worth (1 = full, falls as you outgrow it).
  nutrition(sp) {
    const G = CONFIG.growth;
    return clamp(1 - (this.size - Math.max(1, sp.minSize)) / G.nutritionFalloff, G.minNutrition, 1);
  }

  eat(sp) {
    const s = this.stats, G = CONFIG.growth;
    const r = this.nutrition(sp);
    const first = !this.eatenBy[sp.id];
    const epGain = sp.ep * r * (first ? G.firstCatchBonus : 1); // score
    this.energy = Math.min(s.maxEnergy, this.energy + sp.energy);
    this.score += Math.round(epGain); this.eaten++;
    this.eatenBy[sp.id] = (this.eatenBy[sp.id] || 0) + 1;
    this.mass += sp.mass * r;
    const ns = 1 + (G.maxSize - 1) * Math.sqrt(Math.min(1, this.mass / G.massForMax));
    if (ns !== this.size) { this.size = ns; this.recomputeStats(); this.updatePoly(); }
    return { r, first, epGain, unlocked: this.checkDiet() };
  }

  damage(amount, reason, game, continuous = false) {
    if (!this.alive) return;
    if (!continuous) {
      if (this.invuln > 0) return;
      this.invuln = this.stats.invulnTime;
      game.flash = 1;
      game.sfx.hurt();
      amount *= this.stats.damageTaken;
    }
    this.health -= amount;
    this.lastDamage = reason;
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }
}

// ---------------------------------------------------------------- Creature base
class Creature {
  constructor(kind, shapeName, x, y, scale = 1) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.angle = rand(-0.3, 0.3) + (Math.random() < 0.5 ? Math.PI : 0);
    this.shapeName = shapeName; this.scale = scale; this.dead = false;
    this.solid = makeSolid(kind, [], this);
    this.updatePoly();
  }
  // Steering is committed: the desired velocity (the "plan") is only re-decided every reactionTime seconds,
  // so creatures can't react instantly. Between decisions they keep following the plan.
  steer(tx, ty, speed, dt, turn) {
    this.planT = (this.planT || 0) - dt;
    if (this.planT <= 0 || this.planVx === undefined) {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
      this.planVx = dx / d * speed; this.planVy = dy / d * speed; this.planTurn = turn;
      const C = CONFIG.creatures;
      this.planT = C.reactionTime * (1 + rand(-C.reactionJitter, C.reactionJitter));
    }
    const k = Math.min(1, this.planTurn * dt);
    this.vx += (this.planVx - this.vx) * k;
    this.vy += (this.planVy - this.vy) * k;
  }

  // Look ahead along the current velocity; if that would come within `margin` of terrain, push away
  // and bend the committed plan along the surface. Keeps free swimmers out in open water.
  avoidTerrain(dt, game, margin) {
    const A = CONFIG.terrainAvoid;
    const probe = game.world.resolveCircle(this.x + this.vx * 0.8, this.y + this.vy * 0.8, margin);
    if (!probe.hit) return;
    this.vx += probe.nx * A.push * dt; this.vy += probe.ny * A.push * dt;
    if (this.planVx !== undefined) {
      const pn = this.planVx * probe.nx + this.planVy * probe.ny;
      if (pn < 0) { this.planVx -= probe.nx * pn * 1.2; this.planVy -= probe.ny * pn * 1.2; }
    }
  }

  // A sonar hit startles nothing instantly: the creature keeps its current plan for at least `secs`.
  lockPlan(secs) {
    if (this.planVx === undefined) { this.planVx = this.vx; this.planVy = this.vy; this.planTurn = 1.5; }
    this.planT = Math.max(this.planT || 0, secs);
  }

  // Where the creature will swim while it follows its committed plan (ignores terrain).
  // The path starts at the creature's nose so it reads as "it is heading there".
  predictPath(secs, steps = 12) {
    const nose = transformShape([[50, 0]], this.x, this.y, this.angle, this.scale)[0];
    let x = nose[0], y = nose[1], vx = this.vx, vy = this.vy;
    const dt = secs / steps, k = Math.min(1, (this.planTurn || 1.5) * dt), pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      vx += ((this.planVx ?? vx) - vx) * k; vy += ((this.planVy ?? vy) - vy) * k;
      x += vx * dt; y += vy * dt;
      pts.push([x, y]);
    }
    return pts;
  }
  integrate(dt, game, bodyRadius = 20 * this.scale) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y < 15) { this.y = 15; this.vy = Math.abs(this.vy) * 0.5; }
    const res = game.world.resolveCircle(this.x, this.y, bodyRadius);
    if (res.hit) {
      this.x = res.x; this.y = res.y;
      const vn = this.vx * res.nx + this.vy * res.ny;
      if (vn < 0) { this.vx -= res.nx * vn; this.vy -= res.ny * vn; }
    }
    if (Math.hypot(this.vx, this.vy) > 4) {
      const ta = Math.atan2(this.vy, this.vx);
      this.angle = wrapAngle(this.angle + angleDiff(this.angle, ta) * Math.min(1, dt * 5));
    }
    this.updatePoly();
  }
  updatePoly() {
    this.poly = transformShape(SHAPES[this.shapeName], this.x, this.y, this.angle, this.scale);
    this.solid.poly = this.poly;
    refreshSolid(this.solid);
  }
}

// ---------------------------------------------------------------- Prey (every species in the food chain)
class Prey extends Creature {
  constructor(sp, x, y, group = null) {
    const len = sp.length * rand(0.9, 1.1);
    super('prey', sp.shape, x, y, len / 100);
    this.sp = sp; this.length = len;
    this.radius = len * 0.3;
    this.group = group;
    const spread = Math.max(1, len / 30);
    const gs = CONFIG.population.groupSpread;
    this.ox = rand(-gs, gs) * spread; this.oy = rand(-gs, gs) * 0.6 * spread;
    this.fleeT = 0; this.wx = x; this.wy = y; this.wt = 0;
    this.hp = sp.hp || 0; this.biteT = 0; this.attackT = 0;
    this.chaseT = 0; this.restT = 0; // attackers give up after a while
    this.stamina = 1; this.exhausted = false;
    this.noticed = false; this.noticeT = 0;
    this.mode = 'cruise'; this.modeT = rand(1, 6); this.pauseT = 0; this.anchor = { x, y };
    this.phase = rand(0, TAU);
  }

  bodyRadius() { return Math.min(this.length * 0.12, 60); }

  // Pick a target depth for (x): free swimmers stay in their band, nearFloor species hug the seabed.
  depthFor(game, x) {
    const sp = this.sp, floor = game.world.floorAt(x);
    if (sp.nearFloor) return floor - rand(30, 120) - this.bodyRadius();
    const hi = Math.min(sp.depthMax, floor - CONFIG.terrainAvoid.waypointClearance - this.bodyRadius());
    return hi > sp.depthMin ? rand(sp.depthMin, hi) : Math.min(sp.depthMin, floor - 150);
  }

  // Lively behaviour for solitary fish: cruise / forage (stop-and-go pecking around a spot) / rest (hover).
  pickMode(game) {
    const L = CONFIG.fishLife, sp = this.sp;
    const f = sp.nearFloor ? 0.6 : L.forage, rest = L.rest, roll = Math.random() * (L.cruise + f + rest);
    this.mode = roll < L.cruise ? 'cruise' : roll < L.cruise + f ? 'forage' : 'rest';
    this.modeT = rand(L.modeTime[0], L.modeTime[1]);
    this.anchor = { x: this.x, y: this.y }; this.pauseT = 0;
    if (this.mode === 'forage') this.pickForageSpot(game);
    else if (this.mode === 'cruise') this.pickWaypoint(game);
  }
  pickForageSpot(game) {
    const L = CONFIG.fishLife, sp = this.sp, R = L.forageRadius * Math.max(1, this.length / 40);
    this.wx = this.anchor.x + rand(-R, R);
    const floor = game.world.floorAt(this.wx);
    this.wy = sp.nearFloor ? floor - rand(20, 60) - this.bodyRadius()
      : clamp(this.anchor.y + rand(-R, R) * 0.5, sp.depthMin, Math.min(sp.depthMax, floor - CONFIG.terrainAvoid.waypointClearance));
  }

  // Scavengers (octopus, toothfish, sleeper shark) smell carcasses and go eat them.
  scavenge(dt, game) {
    if (!this.sp.scavenger) return false;
    const C = CONFIG.carcass, c = game.nearestCarcass(this.x, this.y, C.smellRange);
    if (!c) return false;
    this.steer(c.x, c.y, this.sp.speed * 1.3, dt, 2);
    if (dist(this.x, this.y, c.x, c.y) < this.radius + c.radius + 10) c.meat -= C.scavengeRate * dt;
    return true;
  }

  // Rolls (every stealth.rerollTime s) whether the whale, now within notice range, is actually noticed.
  notices(w, dt) {
    this.noticeT -= dt;
    if (this.noticeT <= 0) { this.noticed = Math.random() < w.detectChance(); this.noticeT = CONFIG.stealth.rerollTime; }
    return this.noticed;
  }

  pickWaypoint(game) {
    const sp = this.sp;
    let wx = this.x + rand(-600, 600) * Math.max(1, this.length / 100);
    if (sp.nearFloor && game.world.floorAt(wx) > sp.depthMax) wx = this.x + (this.x - wx) * 0.5;
    this.wx = wx; this.wy = this.depthFor(game, wx);
    this.wt = rand(4, 9);
  }

  update(dt, game) {
    const sp = this.sp, w = game.whale;
    this.biteT -= dt; this.attackT -= dt; this.restT -= dt;
    const d = dist(this.x, this.y, w.x, w.y);
    const edible = w.canEat(sp), huntable = w.canHunt(sp);
    // A huge whale is noticed from far away (pressure wave, noise), so small prey escapes big whales easily.
    const sense = 150 + this.length + CONFIG.growth.preyNoticePerSize * w.size;
    const a = sp.attack;
    const attacking = a && w.alive && this.restT <= 0 && (!edible || sp.hp) && d < a.range + this.length;
    if (attacking) {
      this.chaseT += dt;
      if (this.chaseT > a.chaseTime) { this.restT = a.rest; this.chaseT = 0; } // gives up
    } else this.chaseT = Math.max(0, this.chaseT - dt);

    if (attacking) {
      this.steer(w.x, w.y, a.chaseSpeed, dt, 2);
      if (this.attackT <= 0 && this.touches(w)) {
        w.damage(sp.attack.damage, `Killed by a ${sp.name.toLowerCase()}.`, game);
        this.attackT = sp.attack.cooldown;
      }
    } else if (huntable && w.alive && d < (this.group ? sense * 0.35 : sense)) {
      if (this.notices(w, dt)) this.fleeT = 1.2; // schooling fish only break formation when the whale is really close
    } else { this.noticed = false; this.noticeT = 0; }

    if (attacking) { /* already steering */ }
    else if (this.fleeT > 0) {
      this.fleeT -= dt;
      const ST = CONFIG.preyStamina;
      if (!this.exhausted) {
        this.stamina -= dt / ST.endurance;
        if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
      }
      const fleeSpeed = this.exhausted ? sp.fleeSpeed * ST.exhaustedSpeed : sp.fleeSpeed;
      this.steer(this.x + (this.x - w.x), this.y + (this.y - w.y), fleeSpeed, dt, 3);
    } else if (this.group) {
      // Stay with the school: hurry back when out of formation, flee together when the school flees.
      const g = this.group, L = CONFIG.fishLife, sp2 = Math.max(1, this.length / 30);
      const tx = g.x + this.ox + Math.sin(game.time * 0.8 + this.phase) * L.wobble * sp2;
      const ty = g.y + this.oy + Math.cos(game.time * 0.6 + this.phase) * L.wobble * 0.6 * sp2;
      const gd = dist(this.x, this.y, tx, ty);
      const base = g.mode === 'rest' ? sp.speed * 0.3 : sp.speed;
      const speed = g.flee > 0 ? sp.fleeSpeed : gd > 100 ? Math.min(sp.fleeSpeed, sp.speed * 2.2) : base;
      this.steer(tx, ty, speed, dt, 2.5);
    } else if (this.scavenge(dt, game)) {
      // busy eating a carcass
    } else {
      const L = CONFIG.fishLife;
      this.modeT -= dt;
      if (this.modeT <= 0) this.pickMode(game);
      if (this.mode === 'rest') {
        // hover: barely moving, slowly bobbing
        this.steer(this.x + Math.cos(this.angle) * 30, this.y + Math.sin(game.time * 0.7 + this.phase) * 12, sp.speed * L.restSpeed, dt, 0.8);
      } else if (this.mode === 'forage') {
        if (this.pauseT > 0) { this.pauseT -= dt; this.steer(this.x, this.y, 0, dt, 2.5); }
        else {
          if (dist(this.x, this.y, this.wx, this.wy) < 12 + this.length * 0.3) {
            this.pauseT = rand(L.foragePause[0], L.foragePause[1]); this.pickForageSpot(game);
          }
          this.steer(this.wx, this.wy, sp.speed * L.forageSpeed, dt, 2);
        }
      } else {
        this.wt -= dt;
        if (this.wt <= 0 || dist(this.x, this.y, this.wx, this.wy) < 40) this.pickWaypoint(game);
        this.steer(this.wx, this.wy, sp.speed, dt, 1.5);
      }
    }
    if (this.fleeT <= 0 || this.exhausted) {
      const ST = CONFIG.preyStamina;
      this.stamina = Math.min(1, this.stamina + ST.recoverPerSec * dt);
      if (this.exhausted && this.stamina >= ST.recoverTo) this.exhausted = false;
    }
    if (!sp.nearFloor) {
      if (this.y < sp.depthMin) this.vy += 80 * dt;
      if (this.y > sp.depthMax) this.vy -= 80 * dt;
      const A = CONFIG.terrainAvoid;
      this.avoidTerrain(dt, game, clamp(A.minMargin + this.length * A.perLength, A.minMargin, A.maxMargin));
    }
    this.integrate(dt, game, this.bodyRadius());
  }

  // Does this creature's front touch the whale?
  touches(w) {
    const head = transformShape([[50, 0]], this.x, this.y, this.angle, this.scale)[0];
    return pointInPoly(head[0], head[1], w.poly) || pointInPoly(w.head.x, w.head.y, this.poly) ||
           dist(head[0], head[1], w.x, w.y) < 40 * w.size;
  }
}

// ---------------------------------------------------------------- Orcas
// A pod has a home territory. It only hunts inside it, chases for a limited time,
// then gives up and ignores the whale for a while (tiredT). Pods don't hunt very big whales.
class Pod {
  constructor(x, y) {
    this.x = x; this.y = y; this.wx = x; this.wy = y; this.t = 0;
    this.homeX = x; this.homeY = y;
    this.members = []; this.alertT = 0; this.tx = x; this.ty = y;
    this.chaseT = 0; this.tiredT = 0;
  }
  inTerritory(x, y) { return dist(x, y, this.homeX, this.homeY) < CONFIG.orca.territory; }
  canHunt(x, y, size) {
    return this.tiredT <= 0 && this.inTerritory(x, y) && y < CONFIG.orca.depthMax + 150;
  }
  ringRadius(w) { return CONFIG.orca.ringRadius + CONFIG.orca.ringPerSize * w.size; }
  // Surround tactic: spin a ring around the whale; once every orca is close for encircleTime, rush in.
  updateTactics(dt, w) {
    const c = CONFIG.orca, R = this.ringRadius(w);
    this.ringA = (this.ringA || 0) + c.ringSpin / R * dt; // constant speed along the ring, any size
    if (this.phase === 'attack') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'circle'; this.circleT = 0; }
      return;
    }
    this.phase = 'circle';
    // "Closed" = everyone is near AND they are spread around the whale (no angular gap wider than maxGap).
    const near = this.members.length > 1 && this.members.every(m => dist(m.x, m.y, w.x, w.y) < R * 1.5);
    let closed = false;
    if (near) {
      const angs = this.members.map(m => Math.atan2(m.y - w.y, m.x - w.x)).sort((a, b) => a - b);
      let gap = angs[0] + TAU - angs[angs.length - 1];
      for (let i = 1; i < angs.length; i++) gap = Math.max(gap, angs[i] - angs[i - 1]);
      closed = gap < c.maxRingGap;
    }
    this.circleT = closed ? (this.circleT || 0) + dt : Math.max(0, (this.circleT || 0) - dt);
    if (this.circleT > c.encircleTime) { this.phase = 'attack'; this.phaseT = c.attackTime; this.circleT = 0; }
  }
  giveUp(game) {
    const c = this.center();
    this.alertT = 0; this.chaseT = 0; this.tiredT = CONFIG.orca.giveUpCooldown;
    this.x = c.x; this.y = c.y; this.pick(game);
  }
  center() {
    if (!this.members.length) return { x: this.x, y: this.y };
    let x = 0, y = 0;
    for (const m of this.members) { x += m.x; y += m.y; }
    return { x: x / this.members.length, y: y / this.members.length };
  }
  alert(x, y, size) {
    if (!this.canHunt(x, y, size)) return;
    this.alertT = CONFIG.orca.memory; this.tx = x; this.ty = y;
  }
  pick(game) {
    const c = CONFIG.orca, R = c.territory * 0.6;
    const p = game.randomWaterPoint(c.depthMin + 40, c.depthMax - 200, this.homeX - R, this.homeX + R);
    if (p) { this.wx = p.x; this.wy = p.y; }
    this.t = rand(10, 20);
  }
  update(dt, game) {
    this.tiredT -= dt;
    if (this.alertT > 0) {
      this.alertT -= dt;
      this.chaseT += dt;
      const w = game.whale;
      if (this.chaseT > CONFIG.orca.maxChase || !this.inTerritory(this.tx, this.ty) || !w.alive) { this.giveUp(game); return; }
      this.updateTactics(dt, w);
      if (this.alertT <= 0) { const c = this.center(); this.x = c.x; this.y = c.y; this.chaseT = 0; this.pick(game); }
      return;
    }
    this.chaseT = Math.max(0, this.chaseT - dt);
    this.t -= dt;
    const d = dist(this.x, this.y, this.wx, this.wy);
    if (d < 50 || this.t <= 0) { this.pick(game); return; }
    const sp = CONFIG.orca.patrolSpeed * 0.8;
    this.x += (this.wx - this.x) / d * sp * dt;
    this.y += (this.wy - this.y) / d * sp * dt;
  }
}

class Orca extends Creature {
  constructor(x, y, pod) {
    super('predator', 'orca', x, y, rand(0.95, 1.1));
    this.pod = pod; this.biteT = 0;
    this.ox = rand(-140, 140); this.oy = rand(-80, 80);
  }
  update(dt, game) {
    const c = CONFIG.orca, w = game.whale, pod = this.pod;
    this.biteT -= dt; this.sprintT = (this.sprintT || 0) - dt; this.sprintCd = (this.sprintCd || 0) - dt;
    const d = dist(this.x, this.y, w.x, w.y);
    const sight = c.sightRange * lightAt(w.y) + c.closeSense * w.size;
    if (w.alive && d < sight) pod.alert(w.x, w.y, w.size);
    const sees = pod.alertT > 0 && w.alive && d < sight;

    if (pod.alertT > 0) {
      let tx, ty;
      if (sees && pod.phase !== 'attack') {
        // take my slot on the ring around the whale
        const i = pod.members.indexOf(this), n = pod.members.length, R = pod.ringRadius(w);
        const a = (pod.ringA || 0) + i * TAU / n;
        tx = w.x + Math.cos(a) * R; ty = w.y + Math.sin(a) * R * 0.7;
        // far from my slot? sprint for a moment to get into a better position
        if (this.sprintCd <= 0 && dist(this.x, this.y, tx, ty) > R * c.sprintIfOffBy) {
          this.sprintT = c.sprintTime; this.sprintCd = c.sprintCooldown; this.planT = 0;
        }
      } else if (sees) { tx = w.x; ty = w.y; }
      else { tx = pod.tx + this.ox * 0.6; ty = pod.ty + this.oy * 0.6; }
      ty = clamp(ty, c.depthMin, c.depthMax);
      this.steer(tx, ty, c.huntSpeed * (this.sprintT > 0 ? c.sprintMult : 1), dt, this.sprintT > 0 ? 4 : 2.5);
    } else {
      this.steer(pod.x + this.ox, pod.y + this.oy, c.patrolSpeed, dt, 1.2);
    }
    this.avoidTerrain(dt, game, CONFIG.terrainAvoid.minMargin);
    this.integrate(dt, game);

    if (pod.alertT > 0 && this.biteT <= 0 && w.alive && d < 140 * w.size) {
      const head = transformShape([[50, 0]], this.x, this.y, this.angle, this.scale)[0];
      if (pointInPoly(head[0], head[1], w.poly) || dist(head[0], head[1], w.x, w.y) < 55 * w.size) {
        w.damage(c.damage, 'The orcas got you.', game);
        this.biteT = c.biteCooldown;
      }
    }
  }
}

// ---------------------------------------------------------------- Humans
class Ship {
  constructor(x, offset = 0) {
    this.x = x; this.y = 0; this.dir = Math.random() < 0.5 ? -1 : 1;
    this.homeX = x;       // patrols around its home while it has no idea where you are
    this.offset = offset; // fan out from the predicted surfacing point so several ships cover more water
    this.cool = 0; this.bob = rand(0, 10);
    this.solid = makeSolid('human', [], this);
    this.update(0, null);
  }
  update(dt, game) {
    const c = CONFIG.ship, heat = game ? game.humanHeat : 0;
    const speed = lerp(c.speed, c.maxSpeed, heat);
    const intel = game && game.whaleIntel;
    if (intel && heat > 0) {
      // Sail to where the whale is predicted to surface: last known position + heading, plus some error.
      const age = Math.min(game.time - intel.t, c.maxLeadTime);
      const tx = intel.x + intel.vx * age * lerp(0.4, 0.95, heat) + intel.err + this.offset * lerp(1, 0.35, heat);
      const dx = tx - this.x;
      if (Math.abs(dx) > 5) this.dir = dx > 0 ? 1 : -1;
      this.x += clamp(dx, -speed * dt, speed * dt);
      this.homeX = this.x;
    } else {
      this.x += this.dir * speed * dt;
      if (this.x < this.homeX - c.patrolRange) this.dir = 1;
      if (this.x > this.homeX + c.patrolRange) this.dir = -1;
    }
    this.bob += dt;
    this.y = 4 + Math.sin(this.bob * 1.3) * 3;
    this.poly = transformShape(SHAPES.ship, this.x, this.y, this.dir > 0 ? 0 : Math.PI);
    this.solid.poly = this.poly; refreshSolid(this.solid);
    if (!game) return;

    this.cool -= dt;
    const w = game.whale;
    const range = lerp(c.harpoonRange, c.maxHarpoonRange, heat) * w.size;
    if (w.alive && this.cool <= 0 && Math.abs(w.x - this.x) < range && w.y < c.harpoonDepth * w.size) {
      const sx = this.x + this.dir * 110, sy = -20, v = c.harpoonSpeed * lerp(1, 1.3, heat);
      const t = dist(sx, sy, w.x, w.y) / v;
      const tx = w.x + w.vx * t, ty = w.y + w.vy * t;
      game.harpoons.push(new Harpoon(sx, sy, Math.atan2(ty - sy, tx - sx), v));
      game.sfx.harpoon(1 - Math.abs(w.x - this.x) / range);
      this.cool = lerp(c.harpoonCooldown, c.minHarpoonCooldown, heat);
    } else if (w.alive && this.cool <= 0 && w.y < c.surfaceShotDepth * w.size &&
               Math.abs(w.x - this.x) < lerp(c.lobRange, c.maxLobRange, heat) * Math.max(1, w.size * 0.6)) {
      // Long-range lob over the water at a whale breathing at the surface.
      const sx = this.x + this.dir * 110, sy = -20, v = c.lobSpeed, g = Harpoon.gravity;
      let tx = w.x, ty = Math.max(w.y, 0), ang = null;
      for (let it = 0; it < 2; it++) { // aim, estimate flight time, lead the target, re-aim
        ang = ballisticAngle(tx - sx, ty - sy, v, g);
        if (ang === null) break;
        const t = Math.abs(tx - sx) / Math.max(1, Math.abs(Math.cos(ang)) * v);
        tx = w.x + w.vx * t; ty = Math.max(0, w.y + w.vy * t);
      }
      if (ang !== null) {
        const h = new Harpoon(sx, sy, ang, v); h.life = c.lobLife;
        game.harpoons.push(h);
        game.sfx.harpoon(1 - Math.abs(w.x - this.x) / (lerp(c.lobRange, c.maxLobRange, heat) * Math.max(1, w.size * 0.6)));
        this.cool = lerp(c.harpoonCooldown, c.minHarpoonCooldown, heat);
      }
    }
  }
}

// Launch angle (canvas coords, y down) to hit (dx, dy) with speed v under gravity g; low arc. null if out of range.
function ballisticAngle(dx, dy, v, g) {
  const x = Math.abs(dx), yUp = -dy, v2 = v * v;
  const disc = v2 * v2 - g * (g * x * x + 2 * yUp * v2);
  if (disc < 0 || x < 1) return null;
  const th = Math.atan((v2 - Math.sqrt(disc)) / (g * x)); // angle above horizontal
  return dx >= 0 ? -th : Math.PI + th;
}

class Harpoon {
  constructor(x, y, a, v = CONFIG.ship.harpoonSpeed) {
    this.x = x; this.y = y; this.vx = Math.cos(a) * v; this.vy = Math.sin(a) * v;
    this.angle = a; this.life = 2.4; this.dead = false;
  }
  static get gravity() { return 500; }
  update(dt, game) {
    if (this.y < 0) this.vy += Harpoon.gravity * dt;
    else { const k = Math.exp(-0.9 * dt); this.vx *= k; this.vy *= k; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.angle = Math.atan2(this.vy, this.vx);
    this.life -= dt;
    if (this.life <= 0 || game.world.blocked(this.x, this.y)) { this.dead = true; return; }
    const tip = transformShape([[20, 0]], this.x, this.y, this.angle)[0];
    const w = game.whale;
    if (w.alive && pointInPoly(tip[0], tip[1], w.poly)) {
      w.damage(CONFIG.ship.harpoonDamage, 'Harpooned by whalers.', game);
      this.dead = true;
    }
  }
}
