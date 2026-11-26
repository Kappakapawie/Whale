// Every tunable gameplay number lives here.
// The whale builds whale.stats from CONFIG.whale + bought upgrades + its current size (Whale.recomputeStats).
const CONFIG = {
  // The world is endless horizontally. Terrain is built in chunks; creatures and ships are kept
  // populated within activeRadius of the whale and removed beyond despawnRadius.
  // Both radii are multiplied by size^growth.viewExp as the whale grows (the camera zooms out).
  world: {
    depth: 7500, skyHeight: 500,
    chunkWidth: 1600,
    activeRadius: 4500, despawnRadius: 5500,
    shelfDepth: 520, abyssDepth: 6500,   // used to scale roughness/ridges between shallow and deep segments
    // Open water: rocks are few and pillars are uncommon (deep sea segments only).
    rocksPerChunk: [1, 4], pillarChance: 0.2, ridgeHeight: 2600,
  },

  // The map is stitched from segments (world.js). Each new segment is rolled with weights that slide from
  // weight[0] (new whale) to weight[1] (fully grown + upgraded: the average of size and upgrade-level progress).
  // width / depth in world units (1 unit = 0.4 m; the whale swims ~75-130 units/s). Between neighbours the seabed
  // slopes inside the deeper segment, over max(ramp, depth difference x rampPerDepth), at most maxRampShare of
  // that segment's width. The start is always a small shelf with open sea right next to it on both sides.
  // `lookahead`: segments are decided this far beyond the loaded area. Beaches are rare (fewer than the old
  // one-per-28000 coasts even for a new whale).
  segments: {
    types: {
      beach: { weight: [0.07, 0.015], width: [1600, 2400], depth: [200, 250] }, // ~80-100 m, beach on the horizon
      shelf: { weight: [0.40, 0.07], width: [2000, 5000], depth: [375, 625] },   // ~150-250 m
      open:  { weight: [0.35, 0.40], width: [2500, 6000], depth: [1500, 3750] }, // ~600-1500 m
      deep:  { weight: [0.10, 0.50], width: [3500, 8000], depth: [5500, 6500] }, // ~2200-2600 m
    },
    start: { type: 'shelf', halfWidth: 900, neighbour: 'open' },
    ramp: 700, rampPerDepth: 0.6, maxRampShare: 0.45, lookahead: 8000,
  },
  population: { pods: 2, ships: 1, checkInterval: 1, groupSpread: 130 }, // groupSpread: how loose schools are
  // Free swimmers keep this much water between themselves and terrain (nearFloor species are exempt).
  terrainAvoid: { minMargin: 140, perLength: 0.5, maxMargin: 320, push: 180, waypointClearance: 250 },
  // Meal director: there is always something to hunt. If no edible prey worth >= minWorth has been within
  // huntRange (x size) for graceTime seconds, a random unlocked species (not necessarily the best one) is
  // spawned just out of sight, within spawnMaxDist (x size) - inside sonar range.
  // spawnMaxDist stays below the sonar beam range (1400 x size) so a spawned meal can always be found with one click.
  // graceTime shrinks to hungryGraceTime when energy is below hungryAt. Spawns favour the top tiers of your diet.
  mealDirector: { graceTime: 10, hungryGraceTime: 4, hungryAt: 0.35, retryTime: 2, huntRange: 1800, minWorth: 0.3, spawnMaxDist: 1300 },
  // Depth: 1 world unit = 0.4 m, so the deepest seabed (7500) is 3000 m - about the deepest a sperm whale dives.
  // Bodies use their own scale (lengths would otherwise make the ocean absurdly shallow): 1 unit = 0.026 m,
  // so a size-1 whale (180 units) is a 4.7 m calf and a size-3 whale a 14 m adult.
  metersPerUnit: 0.4, bodyMetersPerUnit: 0.026,

  // light = exp(-y / falloff). Darkness overlay alpha = min(maxDarkness, 1 - light).
  light: { falloff: 430, maxDarkness: 0.985 },

  // Growth: size = 1 + (maxSize - 1) * sqrt(massEaten / massForMax).
  // Size scales the whale's body, speed, lungs, sonar range and the camera zoom.
  growth: {
    depthPerSize: 1.0,       // max dive depth x (1 + depthPerSize x (size - 1))
    maxSize: 3, massForMax: 6000,   // slow growth: ~size 1.6 by tier 6, ~2.9 by the giant squid
    humansAtSize: 1.45,      // whaling ships start hunting once you're about half of max size
    // Bigger = slower and heavier: top speed, acceleration and turning all DROP with size,
    // while the camera zooms out, so the whale feels huge and the ocean feels vast.
    speedExp: -0.5, accelExp: -0.6, turnExp: -0.6,  // size 3: swim 75 / sprint 120 (size 1: 130 / 208)
    oxygenExp: 1, healthExp: 0.5,
    // A bigger body needs more meat: energy use AND stomach size grow with size^1.5, so small prey
    // (fixed energy values) becomes a snack that barely registers.
    energyDrainExp: 1.3, energyMaxExp: 1.5,
    // Prey well below your size also gives less growth and EP: value = 1 - (size - minSize) / nutritionFalloff,
    // never below minNutrition. Forces you to hunt bigger animals.
    nutritionFalloff: 1.0, minNutrition: 0.05,
    firstCatchBonus: 5,      // the first time you eat a species you get this many times its score
    zoomExp: 1.0,            // camera zoom = 1 / size^zoomExp
    preyNoticePerSize: 260,  // prey notices the whale this much further per size unit
    viewExp: 0.9,            // spawn/despawn radius grows with size^viewExp
  },

  whale: {
    accel: 260, maxSpeed: 130, sprintMultiplier: 1.6, drag: 1.1, turnRate: 2,
    maxOxygen: 120, oxygenDrain: 1, sprintOxygenDrain: 4, oxygenRefill: 18, breathDepth: 22,
    maxHealth: 100, suffocateDamage: 12, starveDamage: 4, regenRate: 1.2,
    maxEnergy: 100, energyDrain: 0.3,
    sprintEnergyDrain: 8,   // ~27x normal use: a full bar lasts ~13 s of sprinting. Sprint is a short burst, not a way to travel.
    maxDepth: 1000,         // metres you can dive before the pressure hurts; x size (size 3 = 3000 m)
    pressureDamage: 6,      // health/s when deeper than maxDepth, growing the deeper you go
    sprintMinEnergy: 1 / 3,
    lockTime: 0,            // Echo Lock seconds (upgrade): learned creatures hit twice by the beam stay tracked
    surfaceSpeedMult: 0.3,  // near the surface (breathing) you are slow: getting air is a risk // can only sprint while energy is above this fraction of max (so ~9 s of sprint per full bar)
    damageTaken: 1,
    bite: 10,               // damage per bite against prey with hp (giant squid)
    invulnTime: 0.8,
    sonarRangeMult: 1, sonarConeMult: 1, sonarCooldownMult: 1, sonarLoudnessMult: 1, echoLifeMult: 1,
  },

  // Upgrades. Each level costs 1 upgrade point (points are scarce - see `points`). Quests also hand out free
  // levels ('bonus levels', up to quests.bonusOverMax beyond max). `cost` is unused now.
  // `mult` multiplies the stat per level, `add` adds per level. `stat` may be a list.
  upgrades: [
    // Few but strong levels (max 3): points are scarce, so every level should be felt.
    { id: 'lungs',      name: 'Lungs',           desc: '+40% max air',          stat: 'maxOxygen', mult: 1.4, max: 3, cost: 5 },
    { id: 'efflungs',   name: 'Efficient Lungs', desc: '-24% air use',          stat: ['oxygenDrain', 'sprintOxygenDrain'], mult: 0.76, max: 3, cost: 6 },
    { id: 'breath',     name: 'Deep Breath',     desc: '+50% air refill speed', stat: 'oxygenRefill', mult: 1.5, max: 3, cost: 4 },
    { id: 'fluke',      name: 'Fluke Power',     desc: '+20% swim speed',       stat: ['maxSpeed', 'accel'], mult: 1.2, max: 3, cost: 8 },
    { id: 'sprint',     name: 'Sprint Muscles',  desc: '+0.24 sprint boost',    stat: 'sprintMultiplier', add: 0.24, max: 3, cost: 6 },
    { id: 'agility',    name: 'Agility',         desc: '+40% turn speed',       stat: 'turnRate', mult: 1.4, max: 3, cost: 4 },
    { id: 'blubber',    name: 'Blubber',         desc: '+40% max health',       stat: 'maxHealth', mult: 1.4, max: 3, cost: 6 },
    { id: 'healing',    name: 'Healing',         desc: '+80% health regen',     stat: 'regenRate', mult: 1.8, max: 3, cost: 5 },
    { id: 'skin',       name: 'Thick Skin',      desc: '-20% damage taken',     stat: 'damageTaken', mult: 0.8, max: 3, cost: 8 },
    { id: 'stomach',    name: 'Big Stomach',     desc: '+40% max energy',       stat: 'maxEnergy', mult: 1.4, max: 3, cost: 5 },
    { id: 'metabolism', name: 'Slow Metabolism', desc: '-24% energy use',       stat: ['energyDrain', 'sprintEnergyDrain'], mult: 0.76, max: 3, cost: 6 },
    { id: 'jaws',       name: 'Jaws',            desc: '+50% bite damage',      stat: 'bite', mult: 1.5, max: 3, cost: 10 },
    { id: 'reach',      name: 'Sonar Reach',     desc: '+30% sonar range',      stat: 'sonarRangeMult', mult: 1.3, max: 3, cost: 7 },
    { id: 'wide',       name: 'Wide Beam',       desc: '+30% beam width',       stat: 'sonarConeMult', mult: 1.3, max: 3, cost: 5 },
    { id: 'rapid',      name: 'Rapid Clicks',    desc: '-24% sonar cooldown',   stat: 'sonarCooldownMult', mult: 0.76, max: 3, cost: 6 },
    { id: 'quiet',      name: 'Quiet Clicks',    desc: '-30% loudness; prey in the dark may miss you', stat: 'sonarLoudnessMult', mult: 0.7, max: 3, cost: 7 },
    { id: 'echolock',   name: 'Echo Lock',       desc: 'Beam a fully learned creature twice: its model follows it (+3 s)', stat: 'lockTime', add: 3, max: 3, cost: 6 },
    { id: 'surface',    name: 'Surface Agility', desc: '+30% speed while at the surface', stat: 'surfaceSpeedMult', mult: 1.3, max: 3, cost: 5 },
    { id: 'pressure',   name: 'Pressure Tolerance', desc: '+24% max dive depth', stat: 'maxDepth', mult: 1.24, max: 3, cost: 6 },
    { id: 'memory',     name: 'Echo Memory',     desc: '+40% echo duration',    stat: 'echoLifeMult', mult: 1.4, max: 3, cost: 4 },
  ],

  sonar: {
    speed: 800, // world units per second at size 1 (scales with size so it looks the same on screen)
    beam:  { range: 1400, coneDeg: 46,  rays: 150, cooldown: 1.2, loudness: 1700 },
    burst: { range: 650,  coneDeg: 360, rays: 240, cooldown: 3, loudness: 1100 },
    echoLife: 6,        // seconds an echo stays visible
    lockWindow: 4,      // Echo Lock: the second beam hit must come within this many seconds of the first
    // Sonar knowledge: every click that hits a creature counts as one scan of its species. With more scans,
    // a 3D hologram model is drawn over the echo, getting more accurate (size, orientation, position,
    // detail) until scansForFull. Below minScans no model is shown, only the raw echo faces.
    model: { minScans: 5, scansForFull: 100, maxSizeError: 0.45, maxAngleError: 0.8, maxPosError: 0.35 },
    faceJoinDist: 60,   // max gap between neighbouring hits that still counts as the same face
    colorCode: true,    // color echoes by what they hit
    // Creature echoes/holograms are only ever green or yellow: green = in your diet (you can eat it),
    // yellow = everything else (prey you haven't unlocked, predators, ships). Terrain stays cyan.
    colors: {
      terrain:   [120, 230, 255],
      edible:    [110, 255, 140],
      inedible:  [255, 222, 90],
      cable:     [225, 160, 255],
    },
  },

  // Upgrade points: the only currency for Evolve. Scarce on purpose; quests supplement them.
  points: { perDietStep: 1, squidBonus: 1 },   // diet steps to a squid species give squidBonus extra
  diet: { unlockAfter: 10 },                   // eat this many of your top species to unlock the next one

  // Quests: always some active (at least 5 in the midgame). Rewards are free stat levels or a point.
  quests: {
    active: { early: 3, mid: 5, late: 5 }, midSize: 1.3, lateSize: 2.6,
    newQuestDelay: 6, pointChance: 0.2, bonusOverMax: 1, travelKm: [2, 5],
  },

  // Struggle: you may also attack prey 1 or 2 tiers above the top of your diet (tier = position in the
  // food chain). It takes `bites` x base bite to kill (Jaws upgrades shorten it) and every bite costs you
  // `damage` x your max health. 1 tier up = an easy fight, 2 up = fair, 3 up = hard.
  // Any tier above your diet can be fought - the higher it is, the more bites it takes and the more each bite
  // hurts: bites = baseBites + bitesPerTier x gap, damage per bite = damageBase x damageGrowth^(gap-1) (x max
  // health). Steep on purpose: small gaps are cheap, only really big fish hurt a lot.
  // 1 up ~4% of your health, 2 up ~12%, 3 up ~32%, 4 up ~80%, 5+ up is fatal without upgrades.
  struggle: { baseBites: 2, bitesPerTier: 2, damageBase: 0.01, damageGrowth: 2,
              labels: ['', 'easy fight', 'fair fight', 'hard fight', 'deadly fight', 'suicidal fight'] },

  // Dead fish: carcasses of random species drift down and settle on the seabed. You (and scavengers: octopus,
  // toothfish, sleeper sharks, crabs) can eat them regardless of tier - dead animals don't fight back.
  // Eating one gives energyFrac of the species' energy and massFrac of its growth (scaled by remaining meat).
  carcass: { count: 4, spawnChance: 0.35, maxTierAbove: 3, sinkSpeed: 10, life: 240,
             energyFrac: 0.6, massFrac: 0.4, smellRange: 700, scavengeRate: 0.06 },

  // Prey stamina: fleeing at full speed drains stamina over `endurance` seconds; once empty the animal is
  // exhausted and swims at exhaustedSpeed x its normal speed until it has recovered to `recoverTo`.
  // This is what makes the hunt: stalk, make it bolt, wear it out, then close in.
  // Creatures don't react instantly: an AI decision (direction + speed) is committed for reactionTime seconds.
  // A sonar hit also locks the current path for reactionTime. For fully scanned species the sonar
  // reveals that committed path as a dotted arrow (see Game.scanCreature / drawModels).
  creatures: { reactionTime: 1.0, reactionJitter: 0.25 },

  preyStamina: { endurance: 5, recoverPerSec: 0.08, recoverTo: 0.5, exhaustedSpeed: 0.6 },

  // The food chain, smallest to largest. Only sardines are on the menu at first. Eating `diet.unlockAfter`
  // of the top species in your diet adds the next one automatically (no buying). `ep` is the score value.
  // mass -> growth, ep -> evolution points, energy -> refills the energy bar.
  // count = individuals (or groups, if `group` is set) kept around the whale. Groups are loose (groupSpread)
  // so you hunt individuals, not swallow a clump. energy roughly follows mass.
  // nearFloor species live just above the seabed (depthMax = deepest seabed they like).
  // Flee speeds stay below the whale's sprint AT THE SIZE THE SPECIES UNLOCKS, so everything is catchable.
  // Small fast fish outrun a big slow whale - that's intended: you outgrow them.
  // attack: chases and hurts the whale while it can't eat them yet (always, for prey with hp).
  //   chaseSpeed stays below the whale's normal swim speed so you can always get away;
  //   after chaseTime seconds the attacker gives up and rests for `rest` seconds.
  // hp: must be bitten several times. final: eating it wins the game.
  species: [
    // Real-world lengths at bodyMetersPerUnit (1 m ~ 38 units). Depths at metersPerUnit (1 unit = 0.4 m).
    // Gameplay over realism for depth: each tier lives a bit deeper than the last and deeper tiers are more
    // plentiful, so going deeper means more and bigger prey (and more darkness, pressure and air risk).
    { id: 'sardine',   name: 'Sardine',        shape: 'fish',      length: 8,   color: '#c9d6df', minSize: 1.0,      // 0.2 m
      mass: 2,   ep: 1,   energy: 3,   depthMin: 20,   depthMax: 300,  count: 3, group: 6, speed: 40, fleeSpeed: 120 },
    { id: 'mackerel',  name: 'Mackerel',       shape: 'fish',      length: 15,  color: '#7fa6a0', minSize: 1.05,     // 0.4 m
      mass: 4,   ep: 2,   energy: 6,   depthMin: 60,   depthMax: 700,  count: 3, group: 4, speed: 45, fleeSpeed: 130 },
    { id: 'squid',     name: 'Squid',          shape: 'squid',     length: 23,  color: '#c7a27c', minSize: 1.15,     // 0.6 m
      mass: 8,   ep: 3,   energy: 13,  depthMin: 400,  depthMax: 1600, count: 6, speed: 35, fleeSpeed: 120 },
    { id: 'octopus',   name: 'Deep Octopus',   shape: 'octopus',   length: 34,  color: '#c08a5a', minSize: 1.3,      // 0.9 m
      mass: 14,  ep: 5,   energy: 19,  depthMin: 700,  depthMax: 2000, count: 5, speed: 20, fleeSpeed: 90, scavenger: true },
    { id: 'humboldt',  name: 'Humboldt Squid', shape: 'squid',     length: 57,  color: '#d1a35f', minSize: 1.45,     // 1.5 m
      mass: 22,  ep: 7,   energy: 29,  depthMin: 900,  depthMax: 2400, count: 3, group: 3, speed: 40, fleeSpeed: 130 },
    { id: 'toothfish', name: 'Toothfish',      shape: 'fatfish',   length: 68,  color: '#8a7a55', minSize: 1.6,      // 1.8 m
      mass: 32,  ep: 10,  energy: 40,  depthMin: 1300, depthMax: 2900, count: 5, speed: 25, fleeSpeed: 100, scavenger: true },
    { id: 'tuna',      name: 'Bluefin Tuna',   shape: 'tuna',      length: 76,  color: '#3e5d7a', minSize: 1.75,     // 2 m
      mass: 45,  ep: 13,  energy: 56,  depthMin: 1600, depthMax: 3200, count: 3, group: 3, speed: 55, fleeSpeed: 135 },
    { id: 'swordfish', name: 'Swordfish',      shape: 'swordfish', length: 114, color: '#5d6f8c', minSize: 1.9,      // 3 m
      mass: 60,  ep: 17,  energy: 72,  depthMin: 2000, depthMax: 3600, count: 4, speed: 55, fleeSpeed: 125 },
    { id: 'ray',       name: 'Manta Ray',      shape: 'ray',       length: 152, color: '#4b4f5a', minSize: 2.05,     // 4 m
      mass: 80,  ep: 22,  energy: 88,  depthMin: 2300, depthMax: 3900, count: 4, speed: 30, fleeSpeed: 110 },
    { id: 'shark',     name: 'Sleeper Shark',  shape: 'shark',     length: 171, color: '#5a5f5a', minSize: 2.2,      // 4.5 m
      mass: 110, ep: 30,  energy: 120, depthMin: 2600, depthMax: 4400, count: 4, speed: 40, fleeSpeed: 95, scavenger: true,
      attack: { damage: 15, cooldown: 1.4, range: 350, chaseSpeed: 70, chaseTime: 4, rest: 35 } },
    { id: 'oarfish',   name: 'Oarfish',        shape: 'oarfish',   length: 300, color: '#b9c3cf', minSize: 2.4,      // 8 m
      mass: 150, ep: 40,  energy: 160, depthMin: 3000, depthMax: 4800, count: 3, speed: 25, fleeSpeed: 75 },
    { id: 'giant',     name: 'Giant Squid',    shape: 'giantSquid',length: 460, color: '#b88d6a', minSize: 2.6,      // 12 m
      mass: 300, ep: 200, energy: 400, depthMin: 3500, depthMax: 5500, count: 1, speed: 30, fleeSpeed: 80,
      hp: 120, final: true, attack: { damage: 12, cooldown: 0.9, range: 700, chaseSpeed: 55, chaseTime: 10, rest: 15 } },
  ],

  orca: {
    podSize: 3, depthMin: 30, depthMax: 1500,
    patrolSpeed: 45, huntSpeed: 75, // as fast as a full-grown whale: a small whale outswims them, a big one must not get surrounded
    sightRange: 650,  // multiplied by light at the whale's depth
    closeSense: 130,  // always noticed inside this distance
    memory: 2.5,      // seconds a pod keeps hunting after losing sight/sound of you
    maxChase: 12,     // after this many seconds of chasing, the pod gives up
    giveUpCooldown: 40, // seconds the pod then ignores you
    territory: 1800,  // pods never hunt further than this from their home
    // Pods hunt whales of ANY size by surrounding them: each orca takes a slot on a ring around you
    // (ringRadius + ringPerSize x size). Once the ring is closed for encircleTime they rush in for attackTime.
    ringRadius: 150, ringPerSize: 120, ringSpin: 30, // ringSpin = units/s along the ring
    encircleTime: 2.0, attackTime: 2.5,
    maxRingGap: 3.5,
    // An orca far from its ring slot sometimes sprints to get into position.
    sprintMult: 1.9, sprintTime: 1.8, sprintCooldown: 6, sprintIfOffBy: 0.6, // x ring radius  // radians: the ring counts as closed only if no gap between orcas is wider than this (~200 deg)
    damage: 18, biteCooldown: 1.1,
  },

  // Whalers. Once you are big enough (growth.humansAtSize) the human "heat" rises from 0 to 1 over heatRampTime.
  // With heat they get faster, more numerous, harpoon more often and further, and track you better:
  // every time you surface (or are spotted near the surface, or your clicks are heard) they learn your position
  // and heading, then sail to where they predict you will come up next.
  ship: {
    speed: 35, maxSpeed: 115, patrolRange: 1500,
    heatRampTime: 300, maxShips: 3, fanOut: 500,
    harpoonRange: 650, maxHarpoonRange: 1000, harpoonDepth: 260,
    harpoonCooldown: 4, minHarpoonCooldown: 1.8, harpoonSpeed: 450, harpoonDamage: 28,
    trackError: 1200, minTrackError: 120, maxLeadTime: 40,
    spotDepth: 150, spotRange: 1400, hydrophoneRange: 2500,
    // Long-range lobbed harpoons over the water at a whale at the surface.
    lobRange: 1600, maxLobRange: 3000, lobSpeed: 1250, lobLife: 4.5, surfaceShotDepth: 60, // x whale size
    hearingRange: 3000, // whale hears propellers within this distance (HUD indicator)
  },

  // The Kraken: one gigantic monster roaming the abyss (~2300 m). Not food. Its arms grab and drag you.
  // It is revealed part by part: each sonar ray that hits it uncovers that bit of its body for good.
  kraken: {
    length: 2400, arms: 8, armSegments: 10, waveSpeed: 0.6, waveAmp: 0.9,
    depthMin: 5000, hover: 700, minFloor: 6000, speed: 18, huntSpeed: 30, senseRange: 1600,
    damage: 18, grabCooldown: 1.0, pull: 160,
    spawnMinDist: 9000, spawnMaxDist: 16000, minDistFromStart: 12000, despawnDist: 30000,
    completeAt: 0.8, rewardPoints: 2, // arm roots hide behind other arms, so 100% is not reachable
  },

  // Coasts are the 'beach' segments (CONFIG.segments): shallow plateaus with a beach on the horizon.
  // Human swimmers at coasts. Edible - but every one you eat raises your WANTED level.
  swimmers: { count: 5, depthMin: 6, depthMax: 20, speed: 12, fleeSpeed: 30, energy: 12, score: 5, length: 68, hideAtWanted: 2 },
  // GTA-style wanted level: each eaten swimmer adds a star (max 5). Each star brings shipsPerStar extra whaling
  // ships, raises their aggression (heat), and from trackAlwaysAt stars they track you even underwater.
  // A star always drops after decayTime seconds (eating another swimmer resets the timer).
  wanted: { maxStars: 5, shipsPerStar: 2, heatBase: 0.5, heatPerStar: 0.1, decayTime: 45, trackAlwaysAt: 3, trackInterval: 6 },

  // Ambient life (not food): giants, mammals, glowing deep-sea animals and seabed crawlers.
  // glow: points (local shape coords) that emit light in the dark. group: swims with a leader.
  // spawnChance: chance per population check to spawn one when missing (makes giants rare encounters).
  fauna: [
    { id: 'bluewhale', name: 'Blue Whale',     shape: 'baleen',  length: 1100, color: '#4f6a86', depthMin: 30,   depthMax: 900,  count: 1, spawnChance: 0.1, speed: 28 },
    { id: 'humpback',  name: 'Humpback Whale', shape: 'baleen',  length: 600,  color: '#3d4650', depthMin: 20,   depthMax: 800,  count: 1, spawnChance: 0.2, speed: 35 },
    { id: 'dolphin',   name: 'Dolphin',        shape: 'dolphin', length: 95,   color: '#8796a6', depthMin: 10,   depthMax: 500,  count: 2, group: 5, speed: 80, shy: true },
    { id: 'turtle',    name: 'Sea Turtle',     shape: 'turtle',  length: 45,   color: '#6b7a4a', depthMin: 10,   depthMax: 400,  count: 2, speed: 20, shy: true },
    { id: 'seal',      name: 'Seal',           shape: 'seal',    length: 70,   color: '#6e6a66', depthMin: 10,   depthMax: 220,  count: 3, speed: 50, shy: true, coastOnly: true },
    { id: 'jelly',     name: 'Comb Jelly',     shape: 'jelly',   length: 25,   color: '#a8c8e8', depthMin: 150,  depthMax: 4000, count: 8, speed: 6, drift: true,
      glow: { c: [140, 220, 255], pts: [[0, -12], [0, 12], [20, 0]], r: 10, speed: 2.5 } },
    { id: 'lantern',   name: 'Lanternfish',    shape: 'fish',    length: 7,    color: '#7a8899', depthMin: 1000, depthMax: 3500, count: 3, group: 8, speed: 30,
      glow: { c: [120, 200, 255], pts: [[10, 4], [-10, 4]], r: 5, speed: 3 } },
    { id: 'firefly',   name: 'Firefly Squid',  shape: 'squid',   length: 8,    color: '#7d6a8a', depthMin: 500,  depthMax: 1600, count: 2, group: 6, speed: 25,
      glow: { c: [80, 170, 255], pts: [[30, 0], [0, -8], [0, 8], [-30, 0]], r: 6, speed: 4 } },
    { id: 'vampire',   name: 'Vampire Squid',  shape: 'squid',   length: 11,   color: '#5a2d3a', depthMin: 2000, depthMax: 4500, count: 3, speed: 12,
      glow: { c: [120, 190, 255], pts: [[-20, 0], [20, 0]], r: 8, speed: 1.5 } },
    { id: 'angler',    name: 'Anglerfish',     shape: 'angler',  length: 30,   color: '#3a3530', depthMin: 2500, depthMax: 7000, count: 4, speed: 8, lure: true,
      glow: { c: [180, 255, 210], pts: [[62, -42]], r: 16, speed: 1.2 } },
    { id: 'crab',      name: 'Deep-sea Crab',  shape: 'crab',    length: 22,   color: '#9a6a3a', depthMin: 0,    depthMax: 7500, count: 6, speed: 8, bottom: true, scavenger: true },
  ],
  // Seabed decorations per chunk (kelp/reefs in the shallows, sponges/corals mid-depth, sea pens/tube worms/whale falls deep).
  decor: { perChunk: [7, 14] },

  // Seafloor cables: lie on the seabed in some chunks. Touching one shocks you (uses the hurt cooldown).
  cables: { chancePerChunk: 0.3, lift: 6, damage: 12, knockback: 220 },

  // Stealth: prey in range rolls whether it notices you (re-rolled every rerollTime s). In light it always does;
  // in the dark the chance drops with Quiet Clicks (stealth = (1 - loudnessMult) x quietToStealth). Sprinting is loud.
  stealth: { rerollTime: 2, quietToStealth: 1.2 },

  // Fish life: solitary fish switch between cruising, foraging (short stop-and-go pecks around a spot) and
  // resting (hovering, barely moving). Schools switch between cruising, milling (circling a spot) and resting.
  fishLife: {
    modeTime: [6, 14], cruise: 0.35, forage: 0.45, rest: 0.2,
    forageRadius: 90, forageSpeed: 0.55, foragePause: [0.4, 1.4], restSpeed: 0.1,
    millRadius: 160, millSpin: 0.5, wobble: 18,
  },

  // Taking damage: a faint red tint at the screen edges (alpha at full flash; `inner` = clear centre radius share).
  damageFx: { alpha: 0.32, inner: 0.42, decay: 1.6 },

  // A kill bursts into blood clouds and flesh chunks (count and spread scale with the prey's size). The chunks
  // drift, slow down and sink. In the dark they are only seen as sonar echoes (green/yellow like the creature).
  // minRadius (x whale size): even a sardine makes a visible burst.
  gore: { chunks: [7, 18], chunkLife: 7, clouds: 5, cloudLife: 5, burst: 90, drag: 1.6, sink: 9, minRadius: 22,
          trailWidth: 1.2, echoLife: 0.7 },

  // Eating zone: a capsule along the lower jaw, from `front` to `back` (whale-local units, body length ~190,
  // snout tip at x 90), `reach` x size around it. Prey whose body touches it can be bitten.
  mouth: { front: [96, 4], back: [20, 14], reach: 30 },

  // Whale body model (render only): tail beat speed and amplitude grow with swim speed; `bend` is how much
  // the body curves into turns.
  whaleLook: { beatIdle: 1.4, beatPerSpeed: 4.5, ampIdle: 0.25, ampPerSpeed: 1.0, tailSwing: 13, bend: 20 },

  // Testing only. noDeath: dying heals you and puts you back at the surface above where you died
  // (respawnInvuln s of invulnerability). Set noDeath to false for the real game.
  // tools: show the TESTING block in the pause menu (Unstuck + start from one of the stage presets).
  // stages: how far through the game each preset is (0 = new game, 1 = everything): size, diet, eaten counts,
  // upgrade levels, species scans and kraken scan all use this fraction. Stage 5 stops at the oarfish, so the
  // giant squid is still the next fight.
  debug: { noDeath: true, respawnInvuln: 3, tools: true, stages: [0, 0.25, 0.5, 0.75, 1], unstuckInvuln: 2 },

  // Sound menu (pause screen). Volumes 0..1, saved per browser under storageKey.
  audio: {
    storageKey: 'deepEcho.volume',
    defaults: { master: 0.8, sonar: 0.8, effects: 0.8, danger: 0.7 },
    channels: [
      { id: 'sonar', name: 'Sonar clicks & echoes' },
      { id: 'effects', name: 'Eating & breathing' },
      { id: 'danger', name: 'Damage & harpoons' },
    ],
  },
};
