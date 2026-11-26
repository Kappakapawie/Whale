class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.sfx = new Sfx();
    this.input = { left: false, right: false, up: false, down: false, sprint: false,
                   beamHeld: false, burstHeld: false, mx: 0, my: 0 };
    this.state = 'title';   // title | playing | paused | upgrades | dead | won
    this.menuRects = [];    // clickable rows of the upgrade menu (filled by the renderer)
    this.soundRects = [];   // sliders + buttons of the pause/sound menu (filled by the renderer)
    this.soundDrag = null;  // id of the volume slider being dragged
    try { this.best = +localStorage.getItem('deepecho.best') || 0; } catch (e) { this.best = 0; }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.grad = buildGradients(this.ctx);
    this.bindInput();
    this.reset();
  }

  resize() {
    this.cw = this.canvas.width = window.innerWidth;
    this.ch = this.canvas.height = window.innerHeight;
  }

  reset() {
    this.world = new World();
    this.whale = new Whale(0, 120);
    this.sonar = new Sonar();
    this.prey = []; this.groups = []; this.pods = []; this.orcas = [];
    this.ships = []; this.harpoons = []; this.particles = []; this.popups = [];
    this.kraken = null; this.krakenFound = false; this.krakenDone = false;
    this.fauna = []; this.swimmers = []; this.wanted = 0; this.wantedT = 0; this.intelT = 0; this.carcasses = [];
    this.quests = new Quests(this);
    this.locks = new Map(); this.acquired = new Map(); // Echo Lock state
    this.time = 0; this.flash = 0; this.popTimer = 0;
    this.message = null; this.giantDefeated = false; this.humansAnnounced = false;
    this.noMealT = 0; this.lastMealSpawn = null; this.fight = null;
    this.humanHeat = 0; this.whaleIntel = null; this.heatStage = 0;
    this.cam = { x: 0, y: 0, z: 1 };
    this.world.ensureAround(0, this.despawnRadius());
    this.managePopulation(true);
    this.updateCamera(1, true);
  }

  // ------------------------------------------------------------ endless world population
  viewScale() { return this.whale.size ** CONFIG.growth.viewExp; }
  activeRadius() { return CONFIG.world.activeRadius * this.viewScale(); }
  despawnRadius() { return CONFIG.world.despawnRadius * this.viewScale(); }

  say(text, secs = 4, color = '#e8f4ff') { this.message = { text, t: secs, color }; }

  // Keeps a steady number of each species/pods/ships around the whale. Anything that drifts past
  // despawnRadius is removed; replacements spawn out of sight (unless `initial`).
  managePopulation(initial = false) {
    const w = this.whale, P = CONFIG.population, D = this.despawnRadius();
    const far = x => Math.abs(x - w.x) > D;

    this.prey = this.prey.filter(p => !far(p.x) || (p.sp.final && p.hp < p.sp.hp));
    this.groups = this.groups.filter(g => !far(g.x));
    const podsKeep = this.pods.filter(p => p.alertT > 0 || Math.abs(p.homeX - w.x) < D + 1000);
    if (podsKeep.length !== this.pods.length) {
      this.pods = podsKeep;
      this.orcas = this.orcas.filter(o => this.pods.includes(o.pod));
    }
    this.ships = this.ships.filter(s => Math.abs(s.x - w.x) < D + 1500);
    this.fauna = this.fauna.filter(f => Math.abs(f.x - w.x) < D);
    this.swimmers = this.swimmers.filter(s => !s.dead && Math.abs(s.x - w.x) < D);
    this.carcasses = this.carcasses.filter(c => !c.dead && Math.abs(c.x - w.x) < D);

    const halfView = this.cw / (2 * this.cam.z);
    const minD = initial ? 700 : Math.max(1600, halfView + 400);

    for (const sp of CONFIG.species) {
      if (sp.final && this.giantDefeated) continue;
      if (sp.group) {
        const groups = this.groups.filter(g => g.sp === sp);
        for (let i = groups.length; i < sp.count; i++) this.spawnGroup(sp, minD);
        for (const g of groups) { // top up groups that lost members, out of sight only
          if (dist(g.x, g.y, w.x, w.y) < minD) continue;
          const n = this.prey.filter(p => p.group === g).length;
          if (n < sp.group) this.prey.push(new Prey(sp, g.x + rand(-40, 40), g.y + rand(-30, 30), g));
        }
      } else {
        let n = this.prey.filter(p => p.sp === sp).length;
        for (let tries = 0; n < sp.count && tries < 4; tries++) {
          const p = this.spawnPoint(sp, minD);
          if (p) { this.prey.push(new Prey(sp, p.x, p.y)); n++; }
        }
      }
    }

    for (let i = 0; this.pods.length < P.pods && i < 3; i++) this.spawnPod(minD);
    this.manageKraken();
    this.manageFauna(minD);
    // dead fish drifting down (random species up to a few tiers above your diet)
    const CC = CONFIG.carcass;
    if (this.carcasses.length < CC.count && Math.random() < CC.spawnChance) {
      const topI = CONFIG.species.indexOf(w.topSpecies());
      const pool = CONFIG.species.filter((sp, i) => !sp.final && i <= topI + CC.maxTierAbove);
      const sp = pool[randInt(0, pool.length - 1)], p = this.spawnPoint(sp, minD);
      if (p) this.carcasses.push(new Carcass(sp, p.x, p.y));
    }

    const SC = CONFIG.ship;
    const wantShips = (w.size >= CONFIG.growth.humansAtSize ? Math.round(P.ships + this.humanHeat * (SC.maxShips - P.ships)) : 0)
                    + Math.ceil(this.wanted) * CONFIG.wanted.shipsPerStar;
    // too many ships (wanted level dropped): let the farthest one that is out of sight sail away
    if (this.ships.length > wantShips) {
      const far = this.ships.slice().sort((a, b) => Math.abs(b.x - w.x) - Math.abs(a.x - w.x))[0];
      if (Math.abs(far.x - w.x) > this.cw / (2 * this.cam.z) + 300) this.ships = this.ships.filter(s => s !== far);
    }
    while (this.ships.length < wantShips) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const baseX = this.whaleIntel ? this.whaleIntel.x : w.x;
      this.ships.push(new Ship(baseX + side * rand(Math.max(2500, minD), this.activeRadius()), rand(-SC.fanOut, SC.fanOut)));
      if (!this.humansAnnounced) {
        this.humansAnnounced = true;
        this.say('You have grown big enough to attract whalers. Beware the surface.', 6, '#ffb070');
      }
    }
  }

  // ------------------------------------------------------------ spawning
  randomWaterPoint(dMin, dMax, xMin = null, xMax = null, avoid = null, avoidDist = 0, margin = 70) {
    const R = this.activeRadius();
    if (xMin === null) xMin = this.whale.x - R;
    if (xMax === null) xMax = this.whale.x + R;
    for (let tries = 0; tries < 80; tries++) {
      const x = rand(xMin, xMax);
      const hi = Math.min(dMax, this.world.floorAt(x) - margin);
      if (hi <= dMin) continue;
      const y = rand(dMin, hi);
      if (this.world.blocked(x, y)) continue;
      if (avoid && dist(x, y, avoid.x, avoid.y) < avoidDist) continue;
      return { x, y };
    }
    return null;
  }

  // A spawn point for species `sp`, at least minD from the whale and (if maxD is given) at most maxD away.
  spawnPoint(sp, minD, maxD = null) {
    const w = this.whale, R = maxD ?? this.activeRadius();
    const bodyR = Math.min(sp.length * 0.12, 60);
    for (let tries = 0; tries < (maxD ? 6 : 1); tries++) {
      let p = null;
      if (sp.nearFloor) {
        for (let k = 0; k < 60 && !p; k++) {
          const x = rand(w.x - R, w.x + R), floor = this.world.floorAt(x);
          if (floor > sp.depthMax) continue;
          const y = floor - rand(30, 120) - bodyR;
          if (this.world.blocked(x, y) || dist(x, y, w.x, w.y) < minD) continue;
          p = { x, y };
        }
      } else {
        p = this.randomWaterPoint(sp.depthMin, sp.depthMax, w.x - R, w.x + R, w, minD, CONFIG.terrainAvoid.waypointClearance + bodyR);
      }
      if (p && (!maxD || dist(p.x, p.y, w.x, w.y) <= maxD)) return p;
    }
    return null;
  }

  spawnGroup(sp, minD, maxD = null) {
    const p = this.spawnPoint(sp, minD, maxD);
    if (!p) return false;
    const g = { sp, x: p.x, y: p.y, wx: p.x, wy: p.y, t: 0, flee: 0 };
    this.groups.push(g);
    for (let i = 0; i < sp.group; i++) this.prey.push(new Prey(sp, p.x + rand(-150, 150), p.y + rand(-80, 80), g));
    return true;
  }

  // ------------------------------------------------------------ meal director
  // Guarantees there is always something worth hunting: if no edible prey worth at least `minWorth`
  // has been within huntRange for `graceTime` seconds, spawn one (a random unlocked species - not
  // necessarily the best one) just out of sight but within reach of the sonar.
  updateMealDirector(dt) {
    const D = CONFIG.mealDirector, w = this.whale;
    if (!w.alive) return;
    const range = D.huntRange * w.size;
    const hasMeal = this.prey.some(p => w.canEat(p.sp) && w.nutrition(p.sp) >= D.minWorth &&
                                        dist(p.x, p.y, w.x, w.y) < range);
    if (hasMeal) { this.noMealT = 0; return; }
    this.noMealT += dt;
    const grace = w.energy < w.stats.maxEnergy * D.hungryAt ? D.hungryGraceTime : D.graceTime;
    if (this.noMealT < grace) return;
    this.noMealT = grace - D.retryTime; // if spawning fails, try again a bit later

    let options = CONFIG.species.filter(sp => w.canEat(sp) && !sp.final && w.nutrition(sp) >= D.minWorth);
    if (!options.length) options = CONFIG.species.filter(sp => w.canEat(sp) && !sp.final).slice(-1);
    // favour the top of your diet (that's what feeds you and moves you up the chain), but not exclusively
    const topI = CONFIG.species.indexOf(w.topSpecies());
    options = options.map(sp => ({ sp, k: Math.random() * Math.pow(1 + Math.max(0, 4 - (topI - CONFIG.species.indexOf(sp))), 2) }))
                     .sort((a, b) => b.k - a.k).map(o => o.sp);
    const halfView = this.cw / (2 * this.cam.z);
    const minD = halfView + 200, maxD = Math.max(minD + 400, D.spawnMaxDist * w.size);
    for (const sp of options) {
      const ok = sp.group ? this.spawnGroup(sp, minD, maxD) : (() => {
        const p = this.spawnPoint(sp, minD, maxD);
        if (p) this.prey.push(new Prey(sp, p.x, p.y));
        return !!p;
      })();
      if (ok) { this.noMealT = 0; this.lastMealSpawn = sp.id; return; }
    }
  }

  spawnPod(minD) {
    const c = CONFIG.orca;
    const p = this.randomWaterPoint(100, 900, null, null, this.whale, Math.max(2500, minD));
    if (!p) return;
    const pod = new Pod(p.x, p.y); pod.pick(this);
    for (let i = 0; i < c.podSize; i++) {
      const o = new Orca(p.x + rand(-100, 100), p.y + rand(-60, 60), pod);
      pod.members.push(o); this.orcas.push(o);
    }
    this.pods.push(pod);
  }

  spout(w) {
    this.sfx.breath();
    this.reportWhale(CONFIG.ship.minTrackError); // the blow is visible for miles: whalers learn where you surfaced
    const dir = Math.cos(w.angle) >= 0 ? 1 : -1, z = w.size;
    for (let i = 0; i < 40; i++) {
      this.particles.push({ x: w.blowhole.x, y: Math.min(w.blowhole.y, 0), vx: (dir * rand(20, 90) + rand(-20, 20)) * z,
        vy: rand(-280, -140) * Math.sqrt(z), life: rand(0.6, 1.2), max: 1.2, size: rand(1.5, 3.5) * z });
    }
  }

  // Whalers learn where the whale is (and which way it is heading). err = how wrong their estimate is.
  reportWhale(err) {
    if (this.humanHeat <= 0) return;
    const w = this.whale;
    this.whaleIntel = { x: w.x, vx: w.vx, t: this.time, err: rand(-1, 1) * err };
  }

  updateHumans(dt) {
    const w = this.whale, SC = CONFIG.ship;
    if (w.size < CONFIG.growth.humansAtSize && this.wanted <= 0) return;
    if (w.size >= CONFIG.growth.humansAtSize) this.humanHeat = Math.min(1, this.humanHeat + dt / SC.heatRampTime);
    const stage = this.humanHeat >= 1 ? 3 : this.humanHeat >= 0.66 ? 2 : this.humanHeat >= 0.33 ? 1 : 0;
    if (stage > this.heatStage) {
      this.heatStage = stage;
      this.say(['', 'The whalers are learning where you come up for air.',
                'More whaling ships are hunting you now.', 'The whalers know your habits. Every breath is a risk.'][stage], 5, '#ffb070');
    }
    // spotted near the surface by a ship
    if (w.y < SC.spotDepth * w.size && this.ships.some(s => Math.abs(s.x - w.x) < SC.spotRange)) {
      this.reportWhale(lerp(SC.trackError, SC.minTrackError, this.humanHeat) * 0.5);
    }
  }

  // ------------------------------------------------------------ wanted level (GTA-style)
  raiseWanted() {
    const WN = CONFIG.wanted;
    this.wanted = Math.min(WN.maxStars, this.wanted + 1);
    this.wantedT = WN.decayTime;
    this.humanHeat = Math.max(this.humanHeat, Math.min(1, WN.heatBase + WN.heatPerStar * this.wanted));
    this.reportWhale(CONFIG.ship.minTrackError);
    this.say(`WANTED ${'★'.repeat(this.wanted)}${'☆'.repeat(WN.maxStars - this.wanted)} — the humans are coming for you!`, 4, '#ffd166');
    this.managePopulation();
  }
  updateWanted(dt) {
    const WN = CONFIG.wanted, SC = CONFIG.ship;
    if (this.wanted > 0) {
      this.humanHeat = Math.max(this.humanHeat, Math.min(1, WN.heatBase + WN.heatPerStar * this.wanted));
      this.wantedT -= dt;
      if (this.wantedT <= 0) {
        this.wanted -= 1; this.wantedT = WN.decayTime;
        this.say(this.wanted > 0 ? `Wanted level dropped: ${'★'.repeat(this.wanted)}` : 'The hunt is called off. Wanted level cleared.', 3, '#bfe3ff');
      }
      this.intelT -= dt;
      if (this.wanted >= WN.trackAlwaysAt && this.intelT <= 0) { // spotter planes and sonar: they track you even underwater
        this.intelT = WN.trackInterval;
        this.reportWhale(lerp(SC.trackError, SC.minTrackError, 0.7));
      }
    } else if (this.whale.size < CONFIG.growth.humansAtSize) {
      this.humanHeat = Math.max(0, this.humanHeat - dt / 60);
    }
  }

  // ------------------------------------------------------------ ambient fauna + swimmers
  faunaSpawnPoint(def, minD) {
    const w = this.whale, R = this.activeRadius();
    for (let tries = 0; tries < 40; tries++) {
      const x = rand(w.x - R, w.x + R);
      if (def.coastOnly && coastNear(x).c < 0.6) continue;
      const floor = this.world.floorAt(x);
      let y;
      if (def.bottom) y = floor - 6;
      else {
        const hi = Math.min(def.depthMax, floor - 150 - Math.min(def.length * 0.12, 60));
        if (hi <= def.depthMin) continue;
        y = rand(def.depthMin, hi);
      }
      if (dist(x, y, w.x, w.y) < minD || (!def.bottom && this.world.blocked(x, y))) continue;
      return { x, y };
    }
    return null;
  }
  manageFauna(minD) {
    const w = this.whale, C = CONFIG.coast, SW = CONFIG.swimmers;
    for (const def of CONFIG.fauna) {
      const leaders = this.fauna.filter(f => f.def === def && !f.leader).length;
      if (leaders >= def.count) continue;
      if (def.spawnChance && Math.random() > def.spawnChance) continue;
      const p = this.faunaSpawnPoint(def, minD);
      if (!p) continue;
      const lead = new Fauna(def, p.x, p.y); this.fauna.push(lead);
      for (let i = 1; i < (def.group || 1); i++) this.fauna.push(new Fauna(def, p.x + rand(-60, 60), p.y + rand(-30, 30), lead));
    }
    // swimmers at nearby coasts (they stay out of the water while you are wanted)
    if (this.wanted >= SW.hideAtWanted) return;
    const k0 = Math.round((w.x - C.firstAt) / C.spacing);
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const cx = coastCenter(k);
      if (Math.abs(cx - w.x) > this.activeRadius() + C.halfWidth) continue;
      const n = this.swimmers.filter(s => s.coastX === cx).length;
      for (let i = n; i < SW.count; i++) {
        const x = cx + rand(-C.halfWidth, C.halfWidth) * 0.8, y = rand(SW.depthMin, SW.depthMax);
        if (dist(x, y, w.x, w.y) < minD) continue;
        this.swimmers.push(new Swimmer(x, y, cx));
      }
    }
  }

  // One kraken roams the abyss. If you get very far from it, it is moved somewhere ahead of you.
  manageKraken() {
    const K = CONFIG.kraken, w = this.whale;
    if (this.kraken && Math.abs(this.kraken.x - w.x) < K.despawnDist) return;
    for (let tries = 0; tries < 120; tries++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = w.x + side * rand(K.spawnMinDist, K.spawnMaxDist * (1 + tries / 40)); // widen the search if needed
      if (Math.abs(x) < K.minDistFromStart || this.world.floorAt(x) < K.minFloor) continue;
      this.kraken = new Kraken(x, this.world.floorAt(x) - K.hover);
      return;
    }
  }

  krakenFraction() { return this.whale.krakenKnown.size / Kraken.totalCells(); }

  nearestCarcass(x, y, R) {
    let best = null, bd = R;
    for (const c of this.carcasses) { if (c.dead) continue; const d = dist(x, y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  speciesKey(o) { return o instanceof Prey ? o.sp.id : o instanceof Fauna ? 'f:' + o.def.id : o instanceof Swimmer ? 'human' : 'orca'; }
  isCreature(o) { return o instanceof Prey || o instanceof Orca || o instanceof Fauna || o instanceof Swimmer; }
  creatureName(o) { return o instanceof Prey ? o.sp.name : o instanceof Fauna ? o.def.name : o instanceof Swimmer ? 'Human' : 'Orca'; }

  allSolids() {
    return [...this.world.solids, ...this.world.cables.map(c => c.solid), ...(this.kraken ? this.kraken.solids : []), ...this.fauna.map(f => f.solid), ...this.swimmers.map(s => s.solid), ...this.carcasses.map(c => c.solid),
            ...this.world.decor.filter(d => d.solid).map(d => d.solid), ...this.prey.map(p => p.solid), ...this.orcas.map(o => o.solid), ...this.ships.map(s => s.solid)];
  }

  mouseWorld() {
    return { x: this.cam.x + this.input.mx / this.cam.z, y: this.cam.y + this.input.my / this.cam.z };
  }

  fireSonar(type) {
    const w = this.whale, s = w.stats;
    if (!w.alive || w.y < 0 || this.state !== 'playing') return;
    const h = w.head, m = this.mouseWorld();
    const aim = Math.atan2(m.y - h.y, m.x - h.x);
    const res = this.sonar.emit(type, h.x, h.y, aim, this.allSolids(), this.time, {
      classify: solid => this.echoClass(solid),
      skipEcho: solid => { const o = solid.owner; if (o instanceof Kraken) return this.krakenDone;
                           return !!o && this.isCreature(o) &&
                                   (w.scans[this.speciesKey(o)] || 0) >= CONFIG.sonar.model.scansForFull; },
      onRayHit: (solid, j) => { if (solid.owner instanceof Kraken) w.krakenKnown.add(Kraken.cellKey(solid, j)); },
      rangeMult: s.sonarRangeMult * w.size, coneMult: s.sonarConeMult, cdMult: s.sonarCooldownMult,
      lifeMult: s.echoLifeMult, speedMult: w.size,
    });
    if (!res) return;
    this.sfx.click(type === 'beam');
    let krakenD = null;
    for (const [solid, d] of res.hitSolids) {
      if (solid.kind === 'terrain' || solid.kind === 'cable') continue;
      if (solid.owner instanceof Kraken) { krakenD = krakenD === null ? d : Math.min(krakenD, d); continue; }
      this.sfx.echo(2 * d / res.speed, 1 - d / res.range, solid.kind);
      this.scanCreature(solid.owner, this.time + d / res.speed, s.echoLifeMult);
    }
    // Echo Lock (upgrade): a fully learned creature hit by the beam twice within lockWindow gets locked -
    // its model follows it live for stats.lockTime seconds.
    if (type === 'beam' && s.lockTime > 0) {
      for (const [solid, d] of res.hitSolids) {
        const o = solid.owner;
        if (!this.isCreature(o)) continue;
        if ((w.scans[this.speciesKey(o)] || 0) < CONFIG.sonar.model.scansForFull) continue;
        const prev = this.acquired.get(o), reveal = this.time + d / res.speed;
        if (prev !== undefined && this.time - prev < CONFIG.sonar.lockWindow) {
          if (!this.locks.has(o)) this.popup(o.x, o.y - 40 * o.scale, 'ECHO LOCK', '#bfffd0');
          this.locks.set(o, { start: reveal, until: reveal + s.lockTime });
        }
        this.acquired.set(o, this.time);
      }
    }
    if (krakenD !== null) this.scanKraken(this.time + krakenD / res.speed, s.echoLifeMult, krakenD / res.range);
    const loud = res.loudness * s.sonarLoudnessMult * w.size;
    for (const pod of this.pods) {
      const c = pod.center();
      if (dist(c.x, c.y, h.x, h.y) < loud) pod.alert(h.x, h.y, w.size);
    }
    // whalers' hydrophones pick up clicks once they are hunting you
    if (this.humanHeat > 0 && this.ships.some(sh => dist(sh.x, 0, h.x, h.y) < CONFIG.ship.hydrophoneRange * this.humanHeat * w.size)) {
      this.reportWhale(lerp(CONFIG.ship.trackError, CONFIG.ship.minTrackError, this.humanHeat));
    }
  }

  // Echo color class. Creatures are only ever green (in your diet) or yellow (anything else).
  echoClass(solid) {
    if (solid.kind === 'terrain') return 'terrain';
    if (solid.kind === 'cable') return 'cable';
    const o = solid.owner;
    if (o instanceof Swimmer || o instanceof Carcass) return 'edible';
    return o instanceof Prey && this.whale.canEat(o.sp) ? 'edible' : 'inedible';
  }

  // Each sonar hit on a creature is one scan of its species. Familiarity (scans / scansForFull) controls
  // how accurate the hologram model drawn over the echo is. The model is a snapshot of where the creature
  // was when the sound hit it - it does not track the creature afterwards.
  scanCreature(owner, revealT, lifeMult) {
    if (!owner || !this.isCreature(owner)) return;
    const M = CONFIG.sonar.model, w = this.whale;
    owner.lockPlan(CONFIG.creatures.reactionTime); // can't react to the click instantly
    const id = this.speciesKey(owner);
    const n = (w.scans[id] || 0) + 1;
    w.scans[id] = n;
    if (n === M.scansForFull) {
      const name = this.creatureName(owner);
      this.say(`Sonar image complete: ${name}`, 3, '#9fe8ff');
    }
    if (n < M.minScans) return;
    const f = Math.min(1, n / M.scansForFull), err = 1 - f;
    const len = owner.length || 110 * owner.scale;
    this.sonar.models.push({
      owner, shape: owner.shapeName, kind: this.echoClass(owner.solid), f,
      x: owner.x + rand(-1, 1) * err * M.maxPosError * len,
      y: owner.y + rand(-1, 1) * err * M.maxPosError * len * 0.5,
      angle: owner.angle + rand(-1, 1) * err * M.maxAngleError,
      scale: owner.scale * (1 + rand(-1, 1) * err * M.maxSizeError),
      t: revealT, life: CONFIG.sonar.echoLife * lifeMult,
      // Fully scanned: the sonar also reveals the path it is committed to for the next second.
      path: f >= 1 ? owner.predictPath(Math.min(owner.planT, CONFIG.creatures.reactionTime)) : null,
    });
  }

  // Kraken snapshot: everything revealed so far, drawn in the pose it had when this click hit it.
  scanKraken(revealT, lifeMult, nearness) {
    const k = this.kraken, w = this.whale, K = CONFIG.kraken;
    this.sfx.echo(revealT - this.time, 1, 'predator'); this.sfx.echo(revealT - this.time + 0.12, 0.8, 'predator');
    if (!this.krakenFound) { this.krakenFound = true; this.say('Something ENORMOUS echoes back from the abyss...', 5, '#ffd166'); }
    const f = this.krakenFraction();
    if (!this.krakenDone && f >= K.completeAt) {
      this.krakenDone = true; w.points += K.rewardPoints; w.score += 150;
      this.say(`Sonar image complete: the KRAKEN! +${K.rewardPoints} upgrade points`, 5, '#ffd166');
    }
    this.sonar.models.push({
      owner: k, kraken: true, shape: 'krakenBody', kind: 'inedible', f: this.krakenDone ? 1 : f,
      x: k.x, y: k.y, angle: k.angle, scale: k.scale, animT: k.t, known: new Set(w.krakenKnown),
      t: revealT, life: CONFIG.sonar.echoLife * lifeMult,
    });
  }

  // ------------------------------------------------------------ input
  bindInput() {
    const keyMap = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
    window.addEventListener('keydown', e => {
      this.sfx.ensure();
      if (keyMap[e.code]) { this.input[keyMap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'Space') { this.input.beamHeld = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.input.burstHeld = true;
      if (e.code === 'KeyM') this.sfx.toggleMute();
      if (e.code === 'Enter' && this.state === 'title') this.state = 'playing';
      if (e.code === 'KeyR' && (this.state === 'dead' || this.state === 'won')) { this.reset(); this.state = 'playing'; }
      if (e.code === 'KeyC' && this.state === 'won') this.state = 'playing';
      if (e.code === 'KeyU' || e.code === 'Tab') {
        e.preventDefault();
        if (this.state === 'playing') this.state = 'upgrades';
        else if (this.state === 'upgrades') this.state = 'playing';
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'playing') this.state = 'paused';
        else if (this.state === 'paused' || this.state === 'upgrades') this.state = 'playing';
      }
    });
    window.addEventListener('keyup', e => {
      if (keyMap[e.code]) this.input[keyMap[e.code]] = false;
      if (e.code === 'Space') this.input.beamHeld = false;
      if (e.code === 'KeyE') this.input.burstHeld = false;
    });
    window.addEventListener('blur', () => {
      for (const k of ['left', 'right', 'up', 'down', 'sprint', 'beamHeld', 'burstHeld']) this.input[k] = false;
    });
    this.canvas.addEventListener('mousemove', e => {
      this.input.mx = e.clientX; this.input.my = e.clientY;
      if (this.soundDrag) this.dragSlider(e.clientX);
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('mousedown', e => {
      this.sfx.ensure();
      this.input.mx = e.clientX; this.input.my = e.clientY;
      if (this.state === 'title') { this.state = 'playing'; return; }
      if (this.state === 'dead') { this.reset(); this.state = 'playing'; return; }
      if (this.state === 'upgrades') { this.clickMenu(e.clientX, e.clientY); return; }
      if (this.state === 'paused') { if (e.button === 0) this.clickSoundMenu(e.clientX, e.clientY); return; }
      if (this.state !== 'playing') return;
      if (e.button === 0) this.input.beamHeld = true;
      if (e.button === 2) this.input.burstHeld = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0 && this.soundDrag) { // preview the new level with a sound from that channel
        const id = this.soundDrag; this.soundDrag = null;
        if (id === 'effects') this.sfx.chomp(); else if (id === 'danger') this.sfx.hurt(); else this.sfx.click(true);
      }
      if (e.button === 0) this.input.beamHeld = false;
      if (e.button === 2) this.input.burstHeld = false;
    });
  }

  clickSoundMenu(x, y) {
    for (const r of this.soundRects) {
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      if (r.slider) { this.soundDrag = r.slider; this.dragSlider(x); }
      else if (r.action === 'mute') this.sfx.toggleMute();
      else if (r.action === 'continue') this.state = 'playing';
      return;
    }
  }

  dragSlider(x) {
    const r = this.soundRects.find(s => s.slider === this.soundDrag);
    if (r) this.sfx.setVolume(r.slider, (x - r.sx) / r.sw);
  }

  clickMenu(x, y) {
    for (const r of this.menuRects) {
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      if (r.close) { this.state = 'playing'; return; }
      if (this.whale.buy(r.upgrade)) this.sfx.chomp();
      return;
    }
  }

  // ------------------------------------------------------------ update
  updateCamera(dt, snap = false) {
    const w = this.whale, D = CONFIG.world.depth, sky = CONFIG.world.skyHeight;
    const k = snap ? 1 : Math.min(1, dt * 5);
    const tz = 1 / (w.size ** CONFIG.growth.zoomExp);
    this.cam.z += (tz - this.cam.z) * (snap ? 1 : Math.min(1, dt * 1.5));
    const vw = this.cw / this.cam.z, vh = this.ch / this.cam.z;
    const tx = w.x - vw / 2 + w.vx * 0.4;
    const ty = clamp(w.y - vh / 2 + w.vy * 0.3, -sky, Math.max(-sky, D - vh));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  updateGroups(dt) {
    const w = this.whale;
    for (const g of this.groups) {
      const sp = g.sp, reach = Math.max(1, sp.length / 60);
      g.t -= dt; g.flee -= dt;
      const wd = dist(g.x, g.y, w.x, w.y);
      const inRange = w.alive && w.canHunt(sp) && wd < 200 + CONFIG.growth.preyNoticePerSize * w.size;
      if (inRange) {
        g.noticeT = (g.noticeT || 0) - dt;
        if (g.noticeT <= 0) { g.noticed = Math.random() < w.detectChance(); g.noticeT = CONFIG.stealth.rerollTime; }
      } else { g.noticed = false; g.noticeT = 0; }
      if (inRange && g.noticed && g.flee <= 0) {
        g.mode = 'cruise';
        g.wx = g.x + (g.x - w.x) / wd * 700 * reach;
        g.wy = clamp(g.y + (g.y - w.y) / wd * 300, sp.depthMin + 20,
                     Math.max(sp.depthMin + 20, Math.min(sp.depthMax, this.world.floorAt(g.wx) - CONFIG.terrainAvoid.waypointClearance)));
        g.flee = 2; g.t = 4;
      }
      // lively schools: cruise / mill (circle a spot) / rest (hang in the water)
      const L = CONFIG.fishLife;
      g.modeT = (g.modeT || 0) - dt;
      if (g.flee <= 0 && g.modeT <= 0) {
        const roll = Math.random();
        g.mode = roll < 0.4 ? 'cruise' : roll < 0.75 ? 'mill' : 'rest';
        g.modeT = rand(L.modeTime[0], L.modeTime[1]); g.anchor = { x: g.x, y: g.y }; g.millA = 0;
      }
      if (g.flee <= 0 && g.mode === 'mill') {
        g.millA += L.millSpin * dt;
        const R = L.millRadius * reach;
        const tx = g.anchor.x + Math.cos(g.millA) * R, ty = g.anchor.y + Math.sin(g.millA) * R * 0.4;
        const dd = dist(g.x, g.y, tx, ty) || 1, s = sp.speed * 0.6;
        g.x += (tx - g.x) / dd * Math.min(dd, s * dt); g.y += (ty - g.y) / dd * Math.min(dd, s * dt);
        continue;
      }
      if (g.flee <= 0 && g.mode === 'rest') continue; // hang still; members idle around their slots
      const d = dist(g.x, g.y, g.wx, g.wy);
      if (d < 40 || g.t <= 0) {
        const p = this.randomWaterPoint(sp.depthMin + 20, sp.depthMax, g.x - 900 * reach, g.x + 900 * reach,
                                        null, 0, CONFIG.terrainAvoid.waypointClearance);
        if (p) { g.wx = p.x; g.wy = p.y; }
        g.t = rand(6, 12);
      } else {
        const s = g.flee > 0 ? sp.fleeSpeed * 0.8 : sp.speed * 0.7;
        g.x += (g.wx - g.x) / d * s * dt; g.y += (g.wy - g.y) / d * s * dt;
      }
    }
  }

  // Eating: the whale's head must touch the prey. Too-big prey can't be eaten yet;
  // prey with hp (giant squid) needs several bites.
  updateEating() {
    const w = this.whale;
    if (!w.alive) return;
    const h = w.head;
    for (const p of this.prey) {
      if (p.dead) continue;
      const touching = dist(h.x, h.y, p.x, p.y) < p.radius + 30 * w.size || pointInPoly(h.x, h.y, p.poly);
      if (!touching) continue;
      const sp = p.sp;
      // Struggle: anything above your diet can be fought. The higher the tier, the more bites and damage.
      const struggle = w.struggleFor(sp);
      if (sp.hp || struggle) {
        if (p.maxHp === undefined) {
          p.maxHp = (sp.hp || 0) + (struggle ? struggle.bites * CONFIG.whale.bite : 0);
          p.hp = p.maxHp;
          if (struggle) this.say(`You attack a ${sp.name} — a ${struggle.label}!`, 2.5, '#ffd166');
        }
        this.fight = { prey: p, t: 3, label: struggle ? struggle.label : 'fight' };
        if (p.biteT > 0) continue;
        p.hp -= w.stats.bite; p.biteT = 0.5;
        this.sfx.chomp(); this.popup(p.x, p.y - p.radius, `-${Math.round(w.stats.bite)}`, '#ffe9a0');
        if (struggle) {
          const hurt = struggle.damage * w.stats.maxHealth * w.stats.damageTaken;
          w.damage(hurt, `Died fighting a ${sp.name.toLowerCase()}.`, this, true);
          this.flash = Math.max(this.flash, 0.6); this.sfx.hurt();
          this.popup(w.head.x, w.head.y - 40 * w.size, `-${Math.round(hurt)} health`, '#ffb0b0');
        }
        if (p.hp > 0 || !w.alive) continue;
      }
      p.dead = true; const { r, first, epGain, unlocked } = w.eat(sp); this.sfx.chomp();
      this.quests.onEat(sp, !!struggle);
      const scoreText = Math.max(1, Math.round(epGain));
      if (first) {
        this.popup(p.x, p.y, `FIRST ${sp.name.toUpperCase()}! +${scoreText} (x${CONFIG.growth.firstCatchBonus})`, '#ffd166');
      } else {
        this.popup(p.x, p.y, r < 0.3 ? `+${scoreText} · barely a snack` : `+${scoreText}`, r < 0.3 ? '#7f97a8' : '#9fe8ff');
      }
      for (const nx of unlocked) {
        const pts = CONFIG.points.perDietStep + (w.isSquid(nx) ? CONFIG.points.squidBonus : 0);
        this.say(`Your diet grows: you can now hunt ${nx.name}! +${pts} upgrade point${pts > 1 ? 's' : ''}${w.isSquid(nx) ? ' (squid bonus!)' : ''}`, 5, '#ffd166');
      }
      if (sp.final) {
        this.giantDefeated = true; this.state = 'won';
        this.saveBest();
      }
    }
    this.prey = this.prey.filter(p => !p.dead);
    // human swimmers: edible, but every one raises your wanted level
    for (const s of this.swimmers) {
      if (s.dead || dist(h.x, h.y, s.x, s.y) > s.radius + 30 * w.size) continue;
      s.dead = true; this.sfx.chomp();
      const SW = CONFIG.swimmers;
      w.energy = Math.min(w.stats.maxEnergy, w.energy + SW.energy); w.score += SW.score; w.eaten++;
      this.popup(s.x, s.y - 30, 'A HUMAN...', '#ffd166');
      this.raiseWanted();
    }
    this.swimmers = this.swimmers.filter(s => !s.dead);
    // dead fish: anyone can eat them, any tier
    for (const c of this.carcasses) {
      if (c.dead) continue;
      if (dist(h.x, h.y, c.x, c.y) > c.radius + 30 * w.size && !pointInPoly(h.x, h.y, c.poly)) continue;
      c.dead = true; this.sfx.chomp();
      w.scavenge(c.sp, Math.max(0.1, c.meat));
      this.popup(c.x, c.y - 20, `Scavenged a dead ${c.sp.name}`, '#bfe3c0');
    }
    this.carcasses = this.carcasses.filter(c => !c.dead);
  }

  popup(x, y, text, color) { this.popups.push({ x, y, text, color, life: 1.6 }); }

  saveBest() {
    if (this.whale.score > this.best) {
      this.best = this.whale.score;
      try { localStorage.setItem('deepecho.best', this.best); } catch (e) {}
    }
  }

  update(dt) {
    this.time += dt;
    const w = this.whale;
    const sizeBefore = w.size;
    w.update(dt, this, this.input);
    if (this.input.beamHeld) this.fireSonar('beam');
    if (this.input.burstHeld) this.fireSonar('burst');

    this.updateGroups(dt);
    for (const p of this.prey) p.update(dt, this);
    this.updateEating();
    this.quests.update(dt);
    for (const [o, L] of this.locks) if (o.dead || this.time > L.until) this.locks.delete(o);

    for (const pod of this.pods) pod.update(dt, this);
    for (const o of this.orcas) o.update(dt, this);
    if (this.kraken) this.kraken.update(dt, this);
    for (const f of this.fauna) f.update(dt, this);
    for (const s of this.swimmers) s.update(dt, this);
    for (const c of this.carcasses) c.update(dt, this);
    this.carcasses = this.carcasses.filter(c => !c.dead);
    this.updateWanted(dt);
    for (const s of this.ships) s.update(dt, this);
    for (const h of this.harpoons) h.update(dt, this);
    this.harpoons = this.harpoons.filter(h => !h.dead);
    this.sonar.update(dt, this.time);

    this.world.ensureAround(w.x, this.despawnRadius());
    this.popTimer -= dt;
    if (this.popTimer <= 0) { this.popTimer = CONFIG.population.checkInterval; this.managePopulation(); }
    this.updateMealDirector(dt);
    this.updateHumans(dt);

    for (const p of this.particles) { p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.popups) { p.y -= 30 * w.size * dt; p.life -= dt; }
    this.popups = this.popups.filter(p => p.life > 0);
    if (this.message) { this.message.t -= dt; if (this.message.t <= 0) this.message = null; }
    if (this.fight) { this.fight.t -= dt; if (this.fight.t <= 0 || this.fight.prey.dead) this.fight = null; }

    this.flash = Math.max(0, this.flash - dt * 2);
    this.updateCamera(dt);

    if (!w.alive && CONFIG.debug.noDeath) this.respawnAtSurface();
    else if (!w.alive) { this.state = 'dead'; this.saveBest(); }
  }

  // Test mode (CONFIG.debug.noDeath): instead of dying, the whale is healed and put back at the surface
  // straight above where it died. Size, diet, upgrades and quests are kept.
  respawnAtSurface() {
    const w = this.whale, s = w.stats;
    this.say(`TEST MODE: ${w.lastDamage || 'You died.'} Sent back to the surface.`, 4, '#ffd166');
    w.alive = true; w.health = s.maxHealth; w.oxygen = s.maxOxygen; w.energy = Math.max(w.energy, s.maxEnergy * 0.7);
    w.y = s.breathDepth * 0.5; w.vx = 0; w.vy = 0;
    w.invuln = CONFIG.debug.respawnInvuln; w.lastDamage = '';
    this.fight = null;
    this.updateCamera(0, true);
  }

  tick(dt) {
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'title' || this.state === 'dead' || this.state === 'won') { this.time += dt; this.sonar.update(dt, this.time); }
    drawGame(this);
  }
}

const game = new Game(document.getElementById('game'));
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
