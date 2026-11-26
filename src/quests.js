// Quests: the main way to improve your whale. Upgrade points are scarce (diet steps, squid bonuses, the kraken),
// so quests supplement them. Each quest has a goal and a reward - usually a free level in one stat
// ("+10% swim speed"), sometimes an upgrade point. A steady number of quests is always active
// (CONFIG.quests.active: fewer early, at least 5 in the midgame).
//
// Quest types:
//   eatSpecies  eat N of a specific species (from your diet or up to 2 tiers above it)
//   eatTier     eat N animals of tier T or higher (e.g. "Eat 2 tier-3 animals")
//   learn       fully scan a species (100%)
//   dive        reach a depth
//   travel      swim a distance
//   struggle    win a struggle fight against a bigger animal
//   breach      leap fully out of the water
class Quests {
  constructor(game) {
    this.game = game; this.list = []; this.spawnT = 0; this.completed = 0; this.nextId = 1;
    this.lastX = null; this.maxDepthM = 0;
  }

  wanted() {
    const Q = CONFIG.quests, s = this.game.whale.size;
    return s < Q.midSize ? Q.active.early : s < Q.lateSize ? Q.active.mid : Q.active.late;
  }

  tierOf(sp) { return CONFIG.species.indexOf(sp) + 1; } // 1-based, as shown in the food chain panel

  pickReward() {
    const Q = CONFIG.quests, w = this.game.whale;
    if (Math.random() < Q.pointChance) return { points: 1, text: '+1 upgrade point' };
    const ok = CONFIG.upgrades.filter(u => (w.levels[u.id] || 0) + (w.bonusLevels[u.id] || 0) < u.max + Q.bonusOverMax &&
                                          !this.list.some(q => q.reward.upgrade === u.id));
    if (!ok.length) return { points: 1, text: '+1 upgrade point' };
    const u = ok[randInt(0, ok.length - 1)];
    return { upgrade: u.id, text: u.desc };
  }

  make() {
    const g = this.game, w = g.whale, Q = CONFIG.quests;
    const species = CONFIG.species.filter(sp => !sp.final && w.tierGap(sp) >= -2 && w.tierGap(sp) <= 2);
    const used = new Set(this.list.map(q => q.type + ':' + (q.sp ? q.sp.id : q.tier || '')));
    const options = [];
    for (const sp of species) {
      const key = 'eatSpecies:' + sp.id;
      if (used.has(key)) continue;
      const gap = w.tierGap(sp);
      const n = gap > 0 ? 1 : Math.max(2, 6 - Math.floor(this.tierOf(sp) / 2));
      options.push({ type: 'eatSpecies', sp, need: n, text: `Eat ${n} ${sp.name}${n > 1 ? '' : ''}${gap > 0 ? ' (a fight!)' : ''}` });
    }
    let top = 0; CONFIG.species.forEach((s, i) => { if (w.diet.has(s.id)) top = i; });
    const tier = Math.max(1, top); // the tier just below the top of your diet: e.g. "eat 2 tier-3 animals"
    if (!used.has('eatTier:' + tier)) options.push({ type: 'eatTier', tier, need: 2 + randInt(0, 2), text: '' });
    for (const sp of species) {
      if ((w.scans[sp.id] || 0) >= CONFIG.sonar.model.scansForFull || used.has('learn:' + sp.id)) continue;
      options.push({ type: 'learn', sp, need: CONFIG.sonar.model.scansForFull, text: `Fully scan a ${sp.name} with sonar` });
    }
    if (!used.has('dive:')) {
      const m = Math.round(Math.min(w.stats.maxDepth * 0.9, Math.max(300, this.maxDepthM + 250)) / 50) * 50;
      options.push({ type: 'dive', need: m, text: `Dive to ${m} m` });
    }
    if (!used.has('travel:')) { const km = randInt(Q.travelKm[0], Q.travelKm[1]); options.push({ type: 'travel', need: km * 1000, text: `Swim ${km} km` }); }
    if (!used.has('struggle:') && species.some(sp => w.tierGap(sp) > 0)) options.push({ type: 'struggle', need: 1, text: 'Win a fight against a bigger animal' });
    if (!used.has('breach:')) options.push({ type: 'breach', need: 1, text: 'Breach: leap fully out of the water' });
    if (!options.length) return null;

    // prefer eating quests (the core loop)
    const weights = options.map(o => o.type.startsWith('eat') ? 3 : 1);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), q = options[0];
    for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) { q = options[i]; break; } }
    if (q.type === 'eatTier') q.text = `Eat ${q.need} animals of tier ${q.tier} or higher`;
    q.have = 0; q.id = this.nextId++; q.reward = this.pickReward();
    return q;
  }

  update(dt) {
    const g = this.game, w = g.whale, Q = CONFIG.quests;
    // tracking for dive / travel / breach
    const depthM = Math.max(0, w.y * CONFIG.metersPerUnit);
    this.maxDepthM = Math.max(this.maxDepthM, depthM);
    const moved = this.lastX === null ? 0 : Math.abs(w.x - this.lastX) * CONFIG.metersPerUnit;
    this.lastX = w.x;
    for (const q of this.list) {
      if (q.type === 'dive') q.have = Math.max(q.have, Math.round(depthM));
      if (q.type === 'travel') q.have += moved;
      if (q.type === 'breach' && w.y + 30 * w.size < 0) q.have = 1;
      if (q.type === 'learn') q.have = Math.min(q.need, w.scans[q.sp.id] || 0);
    }
    for (const q of this.list.filter(q => q.have >= q.need)) this.complete(q);

    // keep the wanted number of quests active (new ones trickle in)
    this.spawnT -= dt;
    if (this.list.length < this.wanted() && this.spawnT <= 0) {
      const q = this.make();
      if (q) { this.list.push(q); if (this.completed + this.list.length > 1) g.say(`New quest: ${q.text}`, 3, '#bfe3ff'); }
      this.spawnT = this.list.length < 2 ? 0 : Q.newQuestDelay;
    }
  }

  onEat(sp, wasStruggle) {
    for (const q of this.list) {
      if (q.type === 'eatSpecies' && q.sp === sp) q.have++;
      if (q.type === 'eatTier' && this.tierOf(sp) >= q.tier) q.have++;
      if (q.type === 'struggle' && wasStruggle) q.have++;
    }
  }

  complete(q) {
    const g = this.game, w = g.whale;
    this.list = this.list.filter(x => x !== q);
    this.completed++;
    if (q.reward.points) w.points += q.reward.points;
    else { w.bonusLevels[q.reward.upgrade] = (w.bonusLevels[q.reward.upgrade] || 0) + 1; w.recomputeStats(); }
    w.score += 25;
    g.say(`Quest complete: ${q.text} → ${q.reward.text}`, 4, '#9fe8ff');
    g.popup(w.x, w.y - 80 * w.size, `QUEST: ${q.reward.text}`, '#9fe8ff');
    g.sfx.chomp();
    this.spawnT = CONFIG.quests.newQuestDelay;
  }
}

// Quest panel (top right, under the depth readout).
function drawQuests(ctx, game) {
  const qs = game.quests.list, W = game.cw;
  if (!qs.length) return;
  const pw = 300, x = W - pw - 16, y0 = 116, rowH = 34;
  ctx.fillStyle = 'rgba(0,8,18,0.55)'; ctx.fillRect(x - 6, y0 - 22, pw + 12, qs.length * rowH + 28);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#9fb8cc'; ctx.fillText(`QUESTS (${qs.length})`, x, y0 - 10);
  qs.forEach((q, i) => {
    const y = y0 + i * rowH + 6;
    ctx.font = '12px system-ui'; ctx.fillStyle = '#e8f4ff';
    ctx.fillText(q.text, x, y);
    ctx.font = '11px system-ui'; ctx.fillStyle = '#9fe8ff';
    ctx.fillText(`→ ${q.reward.text}`, x, y + 14);
    const frac = clamp(q.have / q.need, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + pw - 70, y + 10, 70, 5);
    ctx.fillStyle = '#9fe8ff'; ctx.fillRect(x + pw - 70, y + 10, 70 * frac, 5);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8fa6b8';
    const prog = q.type === 'travel' ? `${(q.have / 1000).toFixed(1)}/${q.need / 1000} km`
               : q.type === 'dive' ? `${q.have}/${q.need} m`
               : q.type === 'learn' ? `${Math.round(100 * frac)}%` : `${q.have}/${q.need}`;
    ctx.fillText(prog, x + pw, y);
    ctx.textAlign = 'left';
  });
}
