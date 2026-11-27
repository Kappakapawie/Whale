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

  reset(stage = 1) {
    this.world = new World(undefined, () => this.progress());
    this.whale = new Whale(0, 120);
    this.sonar = new Sonar();
    this.kraken = null; this.krakenFound = false; this.krakenDone = false;
    if (stage > 1) this.applyStage(stage);
    this.prey = []; this.groups = []; this.pods = []; this.orcas = [];
    this.ships = []; this.harpoons = []; this.particles = []; this.popups = [];
    this.gore = { blobs: [], chunks: [] };
    this.subs = []; this.torpedoes = []; // submarines (subs.js)
    this.paint = []; // paint-sense lines (cosmic realm)
    this.fauna = []; this.swimmers = []; this.wanted = 0; this.wantedT = 0; this.intelT = 0; this.carcasses = [];
    this.quests = new Quests(this);
    this.locks = new Map(); this.acquired = new Map(); // Echo Lock state
    this.time = 0; this.flash = 0; this.popTimer = 0;
    this.message = null; this.giantDefeated = false; this.humansAnnounced = false;
    this.finalsBeaten = new Set(); this.wonSpecies = null;
    this.cosmic = false; this.ascend = null; this.ascendFx = 0; // the ascension to the cosmic realm
    this.dayT = CONFIG.dayNight.start; this.updateDay(0);
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

  // How developed the whale is, 0..1: the average of size progress and upgrade levels (bought + quest bonus,
  // capped at max). Drives which map segments appear (CONFIG.segments).
  progress() {
    const w = this.whale, G = CONFIG.growth, U = CONFIG.upgrades;
    const sizeF = (w.size - 1) / (G.maxSize - 1);
    const lv = U.reduce((a, u) => a + Math.min(u.max, (w.levels[u.id] || 0) + (w.bonusLevels[u.id] || 0)), 0);
    return clamp((sizeF + lv / U.reduce((a, u) => a + u.max, 0)) / 2, 0, 1);
  }

  // Day/night: dayT runs 0..1 (0 = midnight, 0.5 = noon). sunElev -1..1; DAYLIGHT.k eases from night to day.
  updateDay(dt) {
    this.dayT = (this.dayT + dt / CONFIG.dayNight.length) % 1;
    this.sunElev = Math.sin((this.dayT - 0.25) * TAU);
    let k = clamp((this.sunElev + 0.15) / 0.45, 0, 1); k = k * k * (3 - 2 * k);
    DAYLIGHT.k = this.cosmic ? 1 : k;
  }

  // ------------------------------------------------------------ zones: arrive weak, adapt, rule, go deeper
  zoneDef(id) { const Z = CONFIG.zones; return id === Z.cosmic.id ? Z.cosmic : Z.list.find(z => z.id === id); }
  zoneAt(y) {
    const Z = CONFIG.zones;
    if (this.cosmic) return Z.cosmic;
    let cur = Z.list[0];
    for (const z of Z.list) if (y >= z.top) cur = z;
    return cur;
  }
  // called every frame from Whale.update: tracks the zone and keeps the adaptation penalty in the stats
  updateZone(w) {
    const z = this.zoneAt(w.y);
    if (z.id !== w.zone) {
      const first = w.adapt[z.id] === undefined;
      if (first) w.adapt[z.id] = 0;
      if (w.zone && first) this.say(`You enter ${z.name}. Everything here outclasses you - eat to adapt.`, 6, '#ffd166');
      else if (w.zone && w.apex.has(z.id)) this.say(`You return to ${z.name}, which you rule.`, 3, '#bfe3ff');
      w.zone = z.id;
    }
    const pen = w.apex.has(z.id) ? 0 : z.penalty * (1 - (w.adapt[z.id] || 0));
    if (Math.abs(pen - w.zonePenalty) > 0.005) { w.zonePenalty = pen; w.recomputeStats(); }
  }
  // just surviving in a zone adapts you slowly too (full after zone.soak s)
  soakZone(dt) {
    const w = this.whale, z = w.zone && this.zoneDef(w.zone);
    if (z && w.alive && !w.apex.has(z.id)) this.gainAdapt('soak', dt / z.soak * z.meals);
  }
  // a meal in your current zone adapts you to it (kind: 'meal' | 'fight' | 'predator' | 'snack' | 'soak')
  gainAdapt(kind, amount = 1) {
    const w = this.whale, Z = CONFIG.zones, z = this.zoneDef(w.zone);
    if (!z || w.apex.has(z.id)) return;
    const k = (kind === 'fight' ? Z.fightMult : kind === 'predator' ? Z.predatorMult : kind === 'snack' ? 0.5 : 1) * amount;
    w.adapt[z.id] = Math.min(1, (w.adapt[z.id] || 0) + k / z.meals);
    if (w.adapt[z.id] >= 1) {
      w.apex.add(z.id); w.points += Z.apexPoints; w.zonePenalty = 0; w.recomputeStats();
      const prey = { shallows: 'The orcas fear you now - and they are food.', deep: 'The Frilled Hunters are your prey now.',
                     abyss: 'The Abyssal Sharks are your prey now, and the Kraken lets you be.', cosmos: 'The stars are yours.' }[z.id] || '';
      this.say(`You rule ${z.name}! +${Z.apexPoints} upgrade point. ${prey}`, 7, '#ffd166');
      this.sfx.chomp();
    }
  }

  // The food chain of the realm you are in (the ocean, or the cosmic one after the ascension).
  realmSpecies() { return CONFIG.species.filter(sp => !!sp.cosmic === this.cosmic); }

  // ------------------------------------------------------------ the ascension (trench floor -> cosmic realm)
  // Reaching the floor of a trench segment (~2900 m) gathers the mythical creatures in a ring around you; after
  // gatherTime there is a flash and you are in outer space for good (one-way).
  updateAscension(dt) {
    const w = this.whale, A = CONFIG.ascension;
    this.ascendFx = Math.max(0, this.ascendFx - dt / A.flashTime);
    if (this.cosmic || !w.alive) return;
    const aboveFloor = this.world.floorAt(w.x) - w.y, onTrench = this.world.segAt(w.x).type === 'trench';
    if (!this.ascend) {
      if (!onTrench || aboveFloor > A.triggerDist * w.size) return;
      this.ascend = { t: 0, spawned: 0, said: 0 };
      return;
    }
    const g = this.ascend;
    // leaving the floor breaks the ritual: the creatures lose interest and drift off
    if (!onTrench || aboveFloor > A.triggerDist * A.leaveMult * w.size) {
      for (const f of this.fauna) if (f.orbit) f.orbit = null;
      this.ascend = null; this.ascendFx = 0;
      this.say(A.brokenText, 4, '#d8c8ff');
      return;
    }
    g.t += dt;
    // the mythical creatures arrive one by one out of the dark, from far away
    const mythic = CONFIG.fauna.filter(d => d.mythic);
    while (g.spawned < A.ringCount && g.t >= g.spawned * A.arriveEvery) {
      const i = g.spawned++, def = mythic[i % mythic.length], a = i / A.ringCount * TAU + rand(-0.2, 0.2);
      const r0 = A.ringRadius * w.size * rand(1.2, 1.5), far = r0 * A.startFar;
      const f = new Fauna(def, w.x + Math.cos(a) * far, w.y + Math.sin(a) * far * 0.6);
      f.orbit = { a, r: r0, r0, dir: i % 2 ? 1 : -1 };
      this.fauna.push(f);
    }
    // messages mark the phases of the ritual
    while (g.said < A.messages.length && g.t >= A.messages[g.said][0]) this.say(A.messages[g.said++][1], 6, '#d8c8ff');
    const half = A.flashTime * 0.5, fT = g.t - (A.gatherTime - half);
    if (fT > 0) this.ascendFx = Math.min(1, fT / half); // the flash builds up at the very end
    if (g.t >= A.gatherTime) this.enterCosmic();
  }

  enterCosmic() {
    const w = this.whale;
    this.cosmic = true; this.ascend = null; this.ascendFx = 1; w.cosmic = true;
    this.world = new World(undefined, () => this.progress(), { cosmic: true });
    w.y = 3000; w.vx = 0; w.vy = 0; w.updatePoly();
    this.prey = []; this.groups = []; this.pods = []; this.orcas = []; this.ships = []; this.harpoons = [];
    this.fauna = []; this.swimmers = []; this.carcasses = []; this.kraken = null; this.gore = { blobs: [], chunks: [] }; this.subs = []; this.torpedoes = [];
    this.wanted = 0; this.humanHeat = 0; this.whaleIntel = null; this.fight = null;
    this.sonar.echoes = []; this.sonar.models = []; this.sonar.pings = []; this.paint = [];
    const first = CONFIG.species.find(sp => sp.cosmic);
    w.diet.add(first.id); // the cosmic food chain starts here
    w.zone = null; // the Cosmos is a new zone: you arrive weak again
    this.quests = new Quests(this);
    this.world.ensureAround(w.x, this.despawnRadius());
    this.managePopulation(true);
    this.updateCamera(1, true);
    this.say('You have ascended. The deep opens into the stars.', 6, '#d8c8ff');
  }

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

    for (const sp of this.realmSpecies()) {
      if (sp.final && this.finalsBeaten.has(sp.id)) continue;
      const count = sp.count * (sp.cosmic ? CONFIG.cosmic.countMult : 1);
      if (sp.group) {
        const groups = this.groups.filter(g => g.sp === sp);
        for (let i = groups.length; i < count; i++) this.spawnGroup(sp, minD);
        for (const g of groups) { // top up groups that lost members, out of sight only
          if (dist(g.x, g.y, w.x, w.y) < minD) continue;
          const n = this.prey.filter(p => p.group === g).length;
          if (n < sp.group) this.prey.push(new Prey(sp, g.x + rand(-40, 40), g.y + rand(-30, 30), g));
        }
      } else {
        let n = this.prey.filter(p => p.sp === sp).length;
        for (let tries = 0; n < count && tries < 4; tries++) {
          const p = this.spawnPoint(sp, minD);
          if (p) { this.prey.push(new Prey(sp, p.x, p.y)); n++; }
        }
      }
    }

    for (let i = 0; !this.cosmic && this.pods.length < P.pods && i < 3; i++) this.spawnPod(minD);
    // hunters: predators that come after a developed whale, more of them the further you are
    const HU = CONFIG.hunters;
    if (!this.cosmic) {
      for (const sp of HU.list) {
        const want = w.zone === sp.zone ? sp.count : 0; // a zone's hunters live where you are
        let n = this.prey.filter(p => p.sp === sp).length;
        for (let tries = 0; n < want && tries < 3; tries++) {
          const q = this.spawnPoint(sp, minD, null);
          if (q) { this.prey.push(new Prey(sp, q.x, q.y)); n++; }
        }
      }
    }
    this.manageKraken();
    this.manageSubs(minD);
    this.manageFauna(minD);
    // dead fish drifting down (random species up to a few tiers above your diet)
    const CC = CONFIG.carcass;
    if (this.carcasses.length < CC.count && Math.random() < CC.spawnChance) {
      const topI = CONFIG.species.indexOf(w.topSpecies());
      const pool = this.realmSpecies().filter(sp => !sp.final && CONFIG.species.indexOf(sp) <= topI + CC.maxTierAbove);
      const sp = pool[randInt(0, pool.length - 1)], p = this.spawnPoint(sp, minD);
      if (p) this.carcasses.push(new Carcass(sp, p.x, p.y));
    }

    const SC = CONFIG.ship;
    const wantShips = this.cosmic ? 0 : (w.size >= CONFIG.growth.humansAtSize ? Math.round(P.ships + this.humanHeat * (SC.maxShips - P.ships)) : 0)
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
      }
      // free swimmers - and seabed dwellers when there is no seabed shallow enough nearby (deep water everywhere)
      if (!p) p = this.randomWaterPoint(sp.depthMin, sp.depthMax, w.x - R, w.x + R, w, minD, CONFIG.terrainAvoid.waypointClearance + bodyR);
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
    const D = this.cosmic ? { ...CONFIG.mealDirector, ...CONFIG.cosmic.mealDirector } : CONFIG.mealDirector, w = this.whale;
    if (!w.alive) return;
    const range = D.huntRange * w.size;
    this.updateTopSupply(dt, D, range);
    const hasMeal = this.prey.some(p => w.canEat(p.sp) && w.nutrition(p.sp) >= D.minWorth &&
                                        dist(p.x, p.y, w.x, w.y) < range);
    if (hasMeal) { this.noMealT = 0; return; }
    this.noMealT += dt;
    const grace = w.energy < w.stats.maxEnergy * D.hungryAt ? D.hungryGraceTime : D.graceTime;
    if (this.noMealT < grace) return;
    this.noMealT = grace - D.retryTime; // if spawning fails, try again a bit later

    let options = this.realmSpecies().filter(sp => w.canEat(sp) && !sp.final && w.nutrition(sp) >= D.minWorth);
    if (!options.length) options = this.realmSpecies().filter(sp => w.canEat(sp) && !sp.final).slice(-1);
    // favour the top of your diet (that's what feeds you and moves you up the chain), but not exclusively
    const topI = CONFIG.species.indexOf(w.topSpecies());
    options = options.map(sp => ({ sp, k: Math.random() * Math.pow(1 + Math.max(0, 4 - (topI - CONFIG.species.indexOf(sp))), 2) }))
                     .sort((a, b) => b.k - a.k).map(o => o.sp);
    const halfView = this.cw / (2 * this.cam.z);
    const minD = this.cosmic ? D.spawnMinDist * w.size : halfView + 200, maxD = Math.max(minD + 400, D.spawnMaxDist * w.size);
    for (const sp of options) {
      const ok = sp.group ? this.spawnGroup(sp, minD, maxD) : (() => {
        const p = this.spawnPoint(sp, minD, maxD);
        if (p) this.prey.push(new Prey(sp, p.x, p.y));
        return !!p;
      })();
      if (ok) { this.noMealT = 0; this.lastMealSpawn = sp.id; return; }
    }
  }

  // Keep the food chain flowing: if none of your top species (the one that unlocks the next step) has been near
  // for topGrace s, bring some in out of sight but inside sonar reach.
  updateTopSupply(dt, D, range) {
    const w = this.whale, top = w.topSpecies();
    if (!D.topGrace || top.final || this.prey.some(p => p.sp === top && dist(p.x, p.y, w.x, w.y) < range)) { this.noTopT = 0; return; }
    this.noTopT = (this.noTopT || 0) + dt;
    if (this.noTopT < D.topGrace) return;
    this.noTopT = D.topGrace - D.retryTime;
    const halfView = this.cw / (2 * this.cam.z);
    const minD = this.cosmic ? D.spawnMinDist * w.size : halfView + 200, maxD = Math.max(minD + 400, D.spawnMaxDist * w.size);
    const ok = top.group ? this.spawnGroup(top, minD, maxD) : (() => { const q = this.spawnPoint(top, minD, maxD); if (q) this.prey.push(new Prey(top, q.x, q.y)); return !!q; })();
    if (ok) this.noTopT = 0;
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
    if (this.cosmic) return;
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
      if (def.coastOnly && this.world.coastNear(x).c < 0.6) continue;
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
    if (this.cosmic) return; // the ocean's ambient life stays behind
    const w = this.whale, SW = CONFIG.swimmers;
    const mythicNear = this.fauna.filter(f => f.def.mythic && !f.orbit).length;
    for (const def of CONFIG.fauna) {
      if (def.mythic && mythicNear >= CONFIG.mythicMax) continue; // keep them rare: one at a time
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
    const R = this.activeRadius();
    for (const { cx, half } of this.world.beachesIn(w.x - R, w.x + R)) {
      const n = this.swimmers.filter(s => s.coastX === cx).length;
      for (let i = n; i < SW.count; i++) {
        const x = cx + rand(-half, half) * 0.6, y = rand(SW.depthMin, SW.depthMax);
        if (dist(x, y, w.x, w.y) < minD) continue;
        this.swimmers.push(new Swimmer(x, y, cx, half));
      }
    }
  }

  // One kraken roams the abyss. If you get very far from it, it is moved somewhere ahead of you.
  manageKraken() {
    if (this.cosmic) { this.kraken = null; return; }
    const K = CONFIG.kraken, w = this.whale;
    if (this.kraken && Math.abs(this.kraken.x - w.x) < K.despawnDist) return;
    for (let tries = 0; tries < 120; tries++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = w.x + side * rand(K.spawnMinDist, K.spawnMaxDist * (1 + tries / 40)); // widen the search if needed
      // only already-decided segments: probing far ahead must not lock in segments at today's progress
      if (Math.abs(x) < K.minDistFromStart || !this.world.isGenerated(x) || this.world.floorAt(x) < K.minFloor) continue;
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

  speciesKey(o) { return o instanceof Submarine ? 'sub' : o instanceof Prey ? o.sp.id : o instanceof Fauna ? 'f:' + o.def.id : o instanceof Swimmer ? 'human' : 'orca'; }
  isMythic(o) { return o instanceof Fauna && !!o.def.mythic; }
  // never fully learnable on sonar: mythical creatures and submarines
  isVeiled(o) { return this.isMythic(o) || o instanceof Submarine; }
  isCreature(o) { return o instanceof Submarine || o instanceof Prey || o instanceof Orca || o instanceof Fauna || o instanceof Swimmer; }
  creatureName(o) { return o instanceof Submarine ? 'Submarine' : o instanceof Prey ? o.sp.name : o instanceof Fauna ? o.def.name : o instanceof Swimmer ? 'Human' : 'Orca'; }

  allSolids() {
    return [...this.world.solids, ...this.world.cables.map(c => c.solid), ...(this.kraken ? this.kraken.solids : []), ...this.fauna.map(f => f.solid), ...this.swimmers.map(s => s.solid), ...this.carcasses.map(c => c.solid),
            ...this.world.decor.filter(d => d.solid).map(d => d.solid), ...this.prey.map(p => p.solid), ...this.orcas.map(o => o.solid), ...this.ships.map(s => s.solid),
            ...this.subs.map(s => s.solid), ...this.torpedoes.map(t => t.solid)];
  }

  mouseWorld() {
    return { x: this.cam.x + this.input.mx / this.cam.z, y: this.cam.y + this.input.my / this.cam.z };
  }

  fireSonar(type) {
    const w = this.whale, s = w.stats;
    if (!w.alive || w.y < 0 || this.state !== 'playing') return;
    const h = w.head, m = this.mouseWorld();
    const aim = Math.atan2(m.y - h.y, m.x - h.x);
    if (this.cosmic) { this.throwPaint(type, h.x, h.y, aim); return; } // godly sense: paint instead of sonar
    const res = this.sonar.emit(type, h.x, h.y, aim, this.allSolids(), this.time, {
      classify: solid => this.echoClass(solid),
      skipEcho: solid => { const o = solid.owner; if (o instanceof Kraken) return this.krakenDone;
                           return !!o && this.isCreature(o) && !this.isVeiled(o) &&
                                   (w.scans[this.speciesKey(o)] || 0) >= CONFIG.sonar.model.scansForFull; },
      onRayHit: (solid, j) => { if (solid.owner instanceof Kraken) w.krakenKnown.add(Kraken.cellKey(solid, j)); },
      rangeMult: s.sonarRangeMult * w.size, coneMult: s.sonarConeMult, cdMult: s.sonarCooldownMult,
      lifeMult: s.echoLifeMult, speedMult: w.size,
    });
    if (!res) return;
    this.sfx.click(type === 'beam');
    this.echoGore(res, h.x, h.y);
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
        if (this.isVeiled(o) || (w.scans[this.speciesKey(o)] || 0) < CONFIG.sonar.model.scansForFull) continue; // mythical/subs: never locked
        const prev = this.acquired.get(o), reveal = this.time + d / res.speed;
        if (prev !== undefined && this.time - prev < CONFIG.sonar.lockWindow) {
          if (!this.locks.has(o)) this.popup(o.x, o.y - 40 * o.scale, 'ECHO LOCK', '#bfffd0');
          // re-locking a creature that is still locked continues the running lock seamlessly: no gap in which an
          // old snapshot shows while the new sound travels
          const cur = this.locks.get(o), running = cur && cur.start <= this.time && this.time <= cur.until;
          this.locks.set(o, { start: running ? cur.start : reveal, until: Math.max(reveal + s.lockTime, running ? cur.until : 0) });
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
  // count false: a snapshot at your current familiarity without counting as a new scan (local echo of a bite)
  scanCreature(owner, revealT, lifeMult, count = true) {
    if (!owner || !this.isCreature(owner)) return;
    const M = CONFIG.sonar.model, w = this.whale;
    if (count) owner.lockPlan(CONFIG.creatures.reactionTime); // can't react to the click instantly
    const id = this.speciesKey(owner), mythic = this.isMythic(owner), sub = owner instanceof Submarine;
    const n = (w.scans[id] || 0) + (count ? 1 : 0);
    w.scans[id] = n;
    if (count && n === M.scansForFull && !mythic && !sub) {
      const name = this.creatureName(owner);
      this.say(`Sonar image complete: ${name}`, 3, '#9fe8ff');
    }
    if (n < M.minScans && !sub) return; // (a submarine always shows its level-1 blob)
    // mythical creatures can never be fully learned: their image stays vague and a bit wrong, however often you ping them
    const f = sub ? CONFIG.subs.echoLevel : Math.min(mythic ? M.mythicMaxF : 1, n / M.scansForFull);
    const err = Math.max(1 - f, mythic ? M.mythicMinError : 0); // submarines: always a level-1 echo
    const len = owner.length || 110 * owner.scale;
    this.sonar.models.push({
      owner, shape: owner.shapeName, kind: this.echoClass(owner.solid), f,
      x: owner.x + rand(-1, 1) * err * M.maxPosError * len,
      y: owner.y + rand(-1, 1) * err * M.maxPosError * len * 0.5,
      angle: owner.angle + rand(-1, 1) * err * M.maxAngleError,
      scale: owner.scale * (1 + rand(-1, 1) * err * M.maxSizeError),
      t: revealT, life: CONFIG.sonar.echoLife * lifeMult,
      vx: owner.vx || 0, vy: owner.vy || 0, // the heading at the hit: the snapshot keeps gliding along it (dead reckoning)
      pose: owner.v3 ? { yaw: owner.v3.yaw, roll: owner.v3.roll, phase: owner.v3.phase, amp: owner.v3.amp } : null, // 3D pose at the hit
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
      if (e.code === 'KeyF') this.showChain = !this.showChain; // full food chain panel
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
      else if (r.action === 'unstuck') this.unstuck();
      else if (r.stage) this.loadStage(r.stage);
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
    const ty = this.cosmic ? w.y - vh / 2 + w.vy * 0.3 : clamp(w.y - vh / 2 + w.vy * 0.3, -sky, Math.max(-sky, D - vh));
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

  // Eating: the prey must touch the whale's mouth zone (a capsule along the jaw, CONFIG.mouth).
  // Prey with hp (giant squid, fights) needs several bites.
  updateEating() {
    const w = this.whale;
    if (!w.alive) return;
    const h = w.head;
    for (const p of this.prey) {
      if (p.dead) continue;
      const touching = w.canReach(p.x, p.y, p.radius) || pointInPoly(h.x, h.y, p.poly);
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
        if (p.hp > 0) this.localEcho(p); // the bite lights it up like a sonar hit
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
      this.gainAdapt(sp.hunter ? 'predator' : struggle ? 'fight' : 'meal');
      this.spawnGore(p.x, p.y, p.radius, this.echoClass(p.solid), p.vx, p.vy);
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
        this.finalsBeaten.add(sp.id); if (!sp.cosmic) this.giantDefeated = true;
        this.wonSpecies = sp; this.state = 'won';
        this.saveBest();
      }
    }
    this.prey = this.prey.filter(p => !p.dead);
    // human swimmers: edible, but every one raises your wanted level
    for (const s of this.swimmers) {
      if (s.dead || !w.canReach(s.x, s.y, s.radius)) continue;
      s.dead = true; this.sfx.chomp();
      this.spawnGore(s.x, s.y, s.radius, 'edible'); this.gainAdapt('snack');
      const SW = CONFIG.swimmers;
      w.energy = Math.min(w.stats.maxEnergy, w.energy + SW.energy); w.score += SW.score; w.eaten++;
      this.popup(s.x, s.y - 30, 'A HUMAN...', '#ffd166');
      this.raiseWanted();
    }
    this.swimmers = this.swimmers.filter(s => !s.dead);
    // dead fish: anyone can eat them, any tier
    for (const c of this.carcasses) {
      if (c.dead) continue;
      if (!w.canReach(c.x, c.y, c.radius) && !pointInPoly(h.x, h.y, c.poly)) continue;
      c.dead = true; this.sfx.chomp();
      this.spawnGore(c.x, c.y, c.radius * 0.7, 'edible'); this.gainAdapt('snack');
      w.scavenge(c.sp, Math.max(0.1, c.meat));
      this.popup(c.x, c.y - 20, `Scavenged a dead ${c.sp.name}`, '#bfe3c0');
    }
    this.carcasses = this.carcasses.filter(c => !c.dead);
    // ruler of the Shallows: orcas are food
    if (w.apex.has('shallows')) {
      const OM = CONFIG.zones.orcaMeal;
      for (const o of this.orcas) {
        if (o.dead || !w.canReach(o.x, o.y, 30 * o.scale)) continue;
        o.dead = true; this.sfx.chomp(); this.spawnGore(o.x, o.y, 40 * o.scale, 'edible', o.vx, o.vy);
        w.energy = Math.min(w.stats.maxEnergy, w.energy + OM.energy); w.mass += OM.mass; w.score += OM.ep; w.eaten++;
        const G = CONFIG.growth, ns = 1 + (G.maxSize - 1) * Math.sqrt(Math.min(1, w.mass / G.massForMax));
        if (ns !== w.size) { w.size = ns; w.recomputeStats(); w.updatePoly(); }
        this.popup(o.x, o.y - 40, 'An orca!', '#ffd166');
      }
      if (this.orcas.some(o => o.dead)) {
        for (const pod of this.pods) pod.members = pod.members.filter(o => !o.dead);
        this.orcas = this.orcas.filter(o => !o.dead);
        this.pods = this.pods.filter(pod => pod.members.length > 0);
      }
    }
  }

  // Submarines: rare; while you are wanted, perStar per star (up to maxSubs). Spawned out of sight in their depth band.
  manageSubs(minD) {
    const C = CONFIG.subs, w = this.whale, D = this.despawnRadius();
    this.subs = this.subs.filter(s => dist(s.x, s.y, w.x, w.y) < D * 1.2);
    if (this.cosmic) { this.subs = []; return; }
    const want = this.wanted > 0 ? Math.min(C.maxSubs, Math.ceil(this.wanted * C.perStar)) : (this.subs.length || Math.random() < C.spawnChance ? 1 : 0);
    if (this.subs.length > want) { // calm again: the extra ones leave once out of sight
      const far = this.subs.slice().sort((a, b) => dist(b.x, b.y, w.x, w.y) - dist(a.x, a.y, w.x, w.y))[0];
      if (dist(far.x, far.y, w.x, w.y) > this.cw / (2 * this.cam.z) + 400) this.subs = this.subs.filter(s => s !== far);
    }
    for (let tries = 0; this.subs.length < want && tries < 3; tries++) {
      const q = this.randomWaterPoint(C.depthMin, C.depthMax, null, null, w, minD, 400);
      if (q) this.subs.push(new Submarine(q.x, q.y));
    }
  }

  // ------------------------------------------------------------ local echoes
  // Damaging something lights it up like a sonar hit at your current familiarity: its faces toward you echo
  // (unless the species is fully learned) and its hologram snapshot appears. No scan is counted, no noise made.
  localEcho(o) {
    if (!o || !o.poly) return;
    // seen from the whale's body centre (the snout is often already inside what it is biting)
    const w = this.whale, h = { x: w.x, y: w.y }, life = CONFIG.sonar.echoLife * w.stats.echoLifeMult;
    const kind = o.solid ? this.echoClass(o.solid) : 'inedible';
    const learned = this.isCreature(o) && !this.isVeiled(o) && (w.scans[this.speciesKey(o)] || 0) >= CONFIG.sonar.model.scansForFull;
    if (!learned) {
      const P = o.poly, n = P.length; let cx = 0, cy = 0;
      for (const p of P) { cx += p[0] / n; cy += p[1] / n; }
      for (let i = 0; i < n; i++) {
        const A = P[i], B = P[(i + 1) % n], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        let nx = -(B[1] - A[1]), ny = B[0] - A[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; } // outward
        const dx = mx - h.x, dy = my - h.y, dl = Math.hypot(dx, dy) || 1, facing = -(nx * dx + ny * dy) / dl;
        if (facing <= 0.05) continue; // only the faces turned toward you
        this.sonar.echoes.push({ line: true, x1: A[0], y1: A[1], x2: B[0], y2: B[1], t: this.time, life, i: 0.35 + 0.65 * facing, kind, owner: o,
          vx: o.vx || 0, vy: o.vy || 0 });
      }
    }
    this.scanCreature(o, this.time, w.stats.echoLifeMult, false);
  }

  // ------------------------------------------------------------ Breach Strike (stat breachPower)
  // Leaving the water going up launches you (with the upgrade); while breaching you can smash whaling ships.
  updateBreach(dt, prevY) {
    const w = this.whale, s = w.stats, B = CONFIG.breach, lv = s.breachPower;
    this.breachCool = Math.max(0, (this.breachCool || 0) - dt);
    if (this.cosmic || !w.alive) return;
    if (lv > 0 && prevY > 0 && w.y <= 0 && w.vy < -B.minExitSpeed && this.breachCool <= 0) {
      w.vy -= B.boost * (1 + (lv - 1) * B.boostPerLevel) * Math.sqrt(w.size);
      this.breachCool = B.cooldown;
      this.splash(w.x, w.size, 50);
    }
    for (const sh of this.ships) {
      if (sh.sinking || sh.hitT > 0 || Math.abs(sh.x - w.x) > 400 * w.size) continue;
      const touching = w.poly.some(p => pointInPoly(p[0], p[1], sh.poly)) || sh.poly.some(p => pointInPoly(p[0], p[1], w.poly));
      if (!touching) continue;
      const sp = Math.hypot(w.vx, w.vy);
      sh.hitT = B.hitCooldown;
      if (lv <= 0 || sp < B.minImpact) { w.vx *= 0.5; w.vy = Math.abs(w.vy) * 0.3; continue; } // just a bump
      const dmg = B.damage * lv * clamp(sp / B.refSpeed, 0.5, 2);
      sh.hp -= dmg; w.vx *= 0.6; w.vy *= 0.4; this.localEcho(sh);
      this.sfx.crash(); this.splash(sh.x, w.size, 30);
      this.popup(sh.x, sh.y - 90, `-${Math.round(dmg)}`, '#ffd166');
      if (sh.hp <= 0) {
        sh.sinking = true;
        this.popup(sh.x, sh.y - 120, 'SHIP SUNK', '#ffd166');
        for (let i = 0; i < 18; i++) this.gore.chunks.push({ x: sh.x + rand(-100, 100), y: rand(-20, 10), vx: rand(-80, 80), vy: rand(-160, -20),
          r: rand(5, 14), rot: rand(0, TAU), spin: rand(-4, 4), age: 0, life: CONFIG.gore.chunkLife, kind: 'terrain',
          shape: [[1, 0.3], [-1, 0.3], [-1, -0.3], [1, -0.3]], color: ['#5a4632', '#3b2f2f', '#d8d4c8'][randInt(0, 2)] }); // wreckage
        this.raiseWanted();
      }
    }
  }

  // White water thrown up where something breaks the surface.
  splash(x, z, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: x + rand(-60, 60) * z, y: 0, vx: rand(-120, 120) * z, vy: rand(-380, -120) * Math.sqrt(z),
        life: rand(0.5, 1.1), max: 1.1, size: rand(2, 4) * z });
    }
  }

  // ------------------------------------------------------------ paint sense (the cosmic realm's sonar)
  throwPaint(type, x, y, aim) {
    const P = CONFIG.paint, S = CONFIG.sonar, w = this.whale, s = w.stats;
    if (this.sonar.cool[type] > 0) return;
    this.sonar.cool[type] = this.sonar.maxCool[type] = S[type].cooldown * s.sonarCooldownMult;
    this.sfx.click(type === 'beam');
    const n = type === 'beam' ? P.beamSeeds : P.burstSeeds, sp = P.speed * w.size;
    const fan = P.beamFan * s.sonarConeMult, hit = new Set(); // one shared set: each creature counts once per throw
    for (let i = 0; i < n; i++) {
      // beam: a wide band of nearly parallel stripes; burst: a ring around you, flowing outwards
      const f = i / (n - 1) - 0.5, a = type === 'beam' ? aim + f * fan : i / n * TAU;
      const off = type === 'beam' ? f * P.beamWidth * w.size : P.burstRing * w.size;
      const sx = type === 'beam' ? x - Math.sin(aim) * off : x + Math.cos(a) * off;
      const sy = type === 'beam' ? y + Math.cos(aim) * off : y + Math.sin(a) * off;
      this.paint.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pts: [[sx, sy, Math.floor(i / 2) % 2]],
        t0: this.time, flowing: true, seed: i * 1.7, paint: Math.floor(i / 2) % 2, hit });
    }
  }

  updatePaint(dt) {
    const P = CONFIG.paint, w = this.whale, z = w.size, step = P.step * z, sp = P.speed * z;
    if (!this.paint.some(l => l.flowing)) { this.paint = this.paint.filter(l => this.time - l.t0 < P.flowTime + P.fadeTime); return; }
    const reach = sp * P.flowTime + 400 * z; // only creatures the paint can reach
    const near = this.prey.filter(p => Math.abs(p.x - w.x) < reach && Math.abs(p.y - w.y) < reach);
    for (const l of this.paint) {
      if (!l.flowing) continue;
      const age = this.time - l.t0;
      if (age > P.flowTime) { l.flowing = false; continue; }
      // organic wobble + a slow drip downwards, like paint running down a wall
      const wob = Math.sin(this.time * 3 + l.seed) * P.wobble * dt;
      const c = Math.cos(wob), s = Math.sin(wob);
      [l.vx, l.vy] = [l.vx * c - l.vy * s, l.vx * s + l.vy * c + P.drip * z * dt];
      let colour = l.paint;
      for (const p of near) { // flow around every creature: it leaves a bubble in the paint
        const R = p.radius * P.bubble + P.bubbleMin * z, dx = l.x - p.x, dy = l.y - p.y, r = Math.hypot(dx, dy);
        if (r > R * 2 || r < 1e-3) continue;
        const nx = dx / r, ny = dy / r, vn = l.vx * nx + l.vy * ny;
        if (vn < 0) { const k = clamp((2 * R - r) / R, 0, 1); l.vx -= nx * vn * k; l.vy -= ny * vn * k; }
        if (r < R) { l.x = p.x + nx * R; l.y = p.y + ny * R; }
        if (r < R * 1.3) {
          colour = this.echoClass(p.solid) === 'edible' ? 2 : 3;
          if (!l.hit.has(p)) { l.hit.add(p); this.paintScan(p); }
        }
      }
      const v = Math.hypot(l.vx, l.vy) || 1; l.vx *= sp / v; l.vy *= sp / v; // paint keeps its pace
      l.x += l.vx * dt; l.y += l.vy * dt;
      if (this.world.blocked(l.x, l.y)) { l.flowing = false; continue; } // stops on rock
      const last = l.pts[l.pts.length - 1];
      if (Math.hypot(l.x - last[0], l.y - last[1]) >= step) l.pts.push([l.x, l.y, colour]);
    }
    this.paint = this.paint.filter(l => this.time - l.t0 < P.flowTime + P.fadeTime);
  }

  // Paint brushing a creature counts as one scan of its species (quests, scan %), at most once per creature per throw.
  paintScan(p) {
    const key = this.speciesKey(p);
    this.whale.scans[key] = Math.min(CONFIG.sonar.model.scansForFull, (this.whale.scans[key] || 0) + 1);
  }

  // ------------------------------------------------------------ gore
  // A kill at (x, y): `radius` = the prey's body radius, `kind` = its echo colour class (edible / inedible).
  spawnGore(x, y, radius, kind, vx = 0, vy = 0) {
    // A kill leaves a few soft blobs of blood (each a cluster of overlapping lobes) that spread, drift and sink.
    const G = CONFIG.gore, r = Math.max(G.minRadius * this.whale.size, radius);
    const n = randInt(G.blobs[0], G.blobs[1]);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = i === 0 ? 0 : r * rand(0.4, 0.9), lobes = [];
      for (let k = 0, m = randInt(3, 5); k < m; k++) lobes.push({ ox: rand(-0.5, 0.5), oy: rand(-0.4, 0.4), s: rand(0.5, 1), ph: rand(0, TAU) });
      this.gore.blobs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: vx * 0.3 + Math.cos(a) * G.spread * rand(0.3, 1),
        vy: vy * 0.3 + Math.sin(a) * G.spread * rand(0.3, 1), r: r * (i === 0 ? 1 : rand(0.45, 0.8)), age: rand(-0.15, 0) * i,
        life: G.blobLife * rand(0.8, 1.2), lobes, kind });
    }
  }

  updateGore(dt) {
    const G = CONFIG.gore, k = Math.exp(-G.drag * dt);
    for (const b of this.gore.blobs) {
      b.vx *= k; b.vy = G.sink + (b.vy - G.sink) * k; b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt;
    }
    for (const c of this.gore.chunks) { // ship wreckage
      c.vx *= k; c.vy = G.sink + (c.vy - G.sink) * k;
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.spin * dt; c.spin *= k; c.age += dt;
      if (this.world.blocked(c.x, c.y)) { c.vx = 0; c.vy = 0; c.spin = 0; }
    }
    this.gore.blobs = this.gore.blobs.filter(b => b.age < b.life);
    this.gore.chunks = this.gore.chunks.filter(c => c.age < c.life);
  }

  // Sonar sees the blood: each blob inside the click's reach echoes as a small arc where it was when the sound
  // reached it (a snapshot, like every echo), coloured like the animal it came from.
  echoGore(res, x, y) {
    const ping = this.sonar.pings[this.sonar.pings.length - 1], life = CONFIG.sonar.echoLife * this.whale.stats.echoLifeMult * CONFIG.gore.echoLife;
    for (const b of this.gore.blobs.concat(this.gore.chunks)) {
      const d = dist(x, y, b.x, b.y);
      if (d > res.range || b.age < 0) continue;
      if (!ping.full && Math.abs(angleDiff(ping.angle, Math.atan2(b.y - y, b.x - x))) > ping.cone / 2) continue;
      const rr = (b.lobes ? b.r * (0.5 + 0.8 * Math.sqrt(b.age / b.life)) : b.r), a = Math.atan2(y - b.y, x - b.x);
      this.sonar.echoes.push({ line: true, x1: b.x + Math.cos(a - 0.6) * rr, y1: b.y + Math.sin(a - 0.6) * rr,
        x2: b.x + Math.cos(a + 0.6) * rr, y2: b.y + Math.sin(a + 0.6) * rr, t: this.time + d / res.speed, life, i: 0.5, kind: b.kind });
    }
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
    const prevY = w.y;
    w.update(dt, this, this.input);
    this.updateBreach(dt, prevY);
    if (this.input.beamHeld) this.fireSonar('beam');
    if (this.input.burstHeld) this.fireSonar('burst');

    this.updateGroups(dt);
    for (const p of this.prey) p.update(dt, this);
    this.updateEating();
    this.quests.update(dt);
    for (const [o, L] of this.locks) if (o.dead || this.time > L.until) {
      this.locks.delete(o);
      // the lock ran out: everything you saw of it up to now is gone too (no stale snapshot reappearing)
      this.sonar.echoes = this.sonar.echoes.filter(e => e.owner !== o || e.t > L.until);
      this.sonar.models = this.sonar.models.filter(m => m.owner !== o || m.t > L.until);
    }

    for (const pod of this.pods) pod.update(dt, this);
    for (const o of this.orcas) o.update(dt, this);
    if (this.kraken) this.kraken.update(dt, this);
    for (const f of this.fauna) f.update(dt, this);
    for (const s of this.swimmers) s.update(dt, this);
    for (const c of this.carcasses) c.update(dt, this);
    this.carcasses = this.carcasses.filter(c => !c.dead);
    this.updateWanted(dt);
    for (const s of this.ships) s.update(dt, this);
    this.ships = this.ships.filter(s => !s.dead);
    for (const sb of this.subs) sb.update(dt, this);
    for (const tp of this.torpedoes) tp.update(dt, this);
    this.torpedoes = this.torpedoes.filter(tp => !tp.dead);
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

    this.flash = Math.max(0, this.flash - dt * CONFIG.damageFx.decay);
    this.updateGore(dt);
    this.updateDay(dt);
    this.soakZone(dt);
    // whatever died takes its echoes and holograms with it, instantly
    if (this.sonar.echoes.some(e => e.owner && e.owner.dead)) this.sonar.echoes = this.sonar.echoes.filter(e => !e.owner || !e.owner.dead);
    if (this.sonar.models.some(m => m.owner && m.owner.dead)) this.sonar.models = this.sonar.models.filter(m => !m.owner || !m.owner.dead);
    this.updateAscension(dt);
    this.updatePaint(dt);
    this.updateCamera(dt);

    if (!w.alive && CONFIG.debug.noDeath) this.respawnAtSurface();
    else if (!w.alive) { this.state = 'dead'; this.saveBest(); }
  }

  // ------------------------------------------------------------ testing tools (pause menu)
  // Prototype "saves": stage 1 = new game ... stage 5 = everything up to the giant squid. One fraction f
  // (CONFIG.debug.stages) drives size, diet, eaten counts, upgrade levels, species scans and kraken scan.
  applyStage(stage) {
    const w = this.whale, f = CONFIG.debug.stages[stage - 1], G = CONFIG.growth, list = CONFIG.species.filter(s => !s.cosmic);
    w.size = 1 + (G.maxSize - 1) * f;
    w.mass = G.massForMax * f * f; // inverse of size = 1 + (max-1) * sqrt(mass / massForMax)
    const top = Math.round(f * (list.length - 2)); // never past the oarfish: the giant squid stays the boss fight
    w.diet = new Set(list.slice(0, top + 1).map(s => s.id));
    w.eaten = 0;
    list.forEach((sp, i) => {
      if (i < top) { w.eatenBy[sp.id] = CONFIG.diet.unlockAfter; w.eaten += CONFIG.diet.unlockAfter; }
      w.scans[sp.id] = Math.round(f * CONFIG.sonar.model.scansForFull);
    });
    w.scans.orca = Math.round(f * CONFIG.sonar.model.scansForFull);
    // f of ALL upgrade levels, dealt out one level at a time across the upgrades (so 60% and 80% differ)
    const U = CONFIG.upgrades;
    let left = Math.round(f * U.reduce((a, u) => a + u.max, 0));
    for (const u of U) w.levels[u.id] = 0;
    while (left > 0) for (const u of U) if (left > 0 && w.levels[u.id] < u.max) { w.levels[u.id]++; left--; }
    w.score = list.slice(0, top + 1).reduce((a, sp) => a + sp.ep * CONFIG.diet.unlockAfter, 0);
    // kraken: reveal a matching share of its scan cells (complete at stage 5)
    const K = CONFIG.kraken, keys = [];
    for (let j = 0; j < SHAPES.krakenBody.length; j++) keys.push(`body:${j}`);
    for (let a = 0; a < K.arms; a++) for (let s = 0; s < K.armSegments; s++) keys.push(`arm${a}:${s}`);
    keys.sort(() => Math.random() - 0.5);
    const want = f >= 1 ? Math.ceil(K.completeAt * keys.length) : Math.round(f * K.completeAt * keys.length);
    w.krakenKnown = new Set(keys.slice(0, want));
    this.krakenFound = want > 0; this.krakenDone = f >= 1;
    // zones: save 1 starts weak in the Shallows; later saves have ruled the upper zones and adapted partly to the next
    CONFIG.zones.list.forEach((z, k) => { const a = clamp(f * 3 - k, 0, 1); w.adapt[z.id] = a; if (a >= 1) w.apex.add(z.id); });
    w.recomputeStats();
    const s = w.stats; w.health = s.maxHealth; w.oxygen = s.maxOxygen; w.energy = s.maxEnergy;
    w.y = 40 * w.size; w.updatePoly();
  }

  loadStage(stage) {
    this.reset(stage);
    this.state = 'playing';
    this.say(stage === 1 ? 'Save 1: new game' : `Save ${stage}: ${Math.round(CONFIG.debug.stages[stage - 1] * 100)}% through the game`, 4, '#ffd166');
  }

  // Move the whale to the nearest open water where its whole body fits, searching outward in rings.
  unstuck() {
    const w = this.whale, z = w.size, W = this.world;
    W.ensureAround(w.x, this.despawnRadius());
    const fits = (x, y) => {
      if (y < 30 * z || W.floorAt(x) - y < 140 * z) return false;
      for (let a = 0; a < 12; a++) { // body outline + a margin
        if (W.blocked(x + Math.cos(a * TAU / 12) * 130 * z, y + Math.sin(a * TAU / 12) * 60 * z)) return false;
      }
      return !W.blocked(x, y);
    };
    for (let ring = 1; ring <= 40; ring++) {
      const d = ring * 100 * z;
      for (let k = 0; k < 16; k++) {
        const x = w.x + rand(-d, d), y = w.y + rand(-d, d) * 0.6;
        if (!fits(x, y)) continue;
        w.x = x; w.y = y; w.vx = 0; w.vy = 0; w.invuln = CONFIG.debug.unstuckInvuln;
        w.updatePoly(); this.fight = null; this.updateCamera(0, true);
        this.state = 'playing'; this.say('Unstuck: moved to open water.', 3, '#ffd166');
        return true;
      }
    }
    this.say('Unstuck: no open water found nearby.', 3, '#ffd166');
    return false;
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
