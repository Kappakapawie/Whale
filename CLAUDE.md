# Deep Echo — sperm whale echolocation game

## Vision (read this first)

You play a **sperm whale** that starts small and **eats its way up a 12-step food chain** (sardine → … → oarfish),
growing a little with every meal, until it is big enough to fight the final boss: the **Giant Squid**. Each meal
moves you up the food chain (eat 10 of your top prey to unlock the next). Upgrades come from scarce upgrade points
and from quests. Orca pods threaten you while you're small; once you
are about half of max size, **whaling ships** start hunting you at the surface. You must keep returning to the surface
to breathe.

As the whale grows, the **camera zooms out** and sonar reaches further, so late game feels like being a huge
creature that "sees" hundreds of meters around itself with sound.

The core mechanic is **echolocation**. In the deep ocean you can't see anything. You emit clicks; the sound travels
outward, and wherever it hits an object you see **only the faces (edges) the sound actually struck** — a flat 2D
silhouette fragment, never the full object and never its back side. The picture fades after a few seconds, so the
player has to keep clicking to build a mental image of the world.

Lighting is depth-based: bright and readable near the surface, fading to near-black in the deep. Down there, sonar
echoes are the only way to see.

## Hard design rules

- **Never leak information the whale shouldn't have.** No minimap, no always-visible enemy markers in the dark, no
  full outlines from sonar. If you add a new "sense", it must have a cost or a limitation (cooldown, noise, range).
- **Sonar shows only the hit faces.** Rays stop at the first edge they hit; only that edge fragment is drawn.
  Faces hit head-on echo brighter than faces hit at a grazing angle.
- **Sonar knowledge → 3D hologram.** Every click that hits a creature is one scan of its species (`whale.scans`).
  From `model.minScans` on, a hologram model is drawn over the echo (`drawModels` in render.js): a vague dashed
  blob at first, then an outline + cross-section ribs, and at `model.scansForFull` (100) an exact shaded 3D body.
  Low familiarity means wrong size, angle and position (`maxSizeError` etc.). The model is a **snapshot** from when
  the sound hit (it fades like an echo) and never tracks the creature live — that would leak information.
  Scan % per species is shown in the food chain panel. Once a species is fully learned its hit lines are no longer
  drawn — only the model (`skipEcho` in `Game.fireSonar`).
- **The Kraken is revealed piece by piece (different from fish).** `src/kraken.js`. One gigantic monster roams
  the abyss (~2300 m); it's not food, its arms grab and drag you. Its body is split into scan cells (every mantle
  edge + every arm segment). Each sonar ray that hits a cell reveals it permanently (`whale.krakenKnown`, via the
  sonar `onRayHit` hook). Its hologram draws ONLY the revealed cells, in the pose it had at the click
  (`drawKrakenModel`). Complete at `kraken.completeAt` (80%: arm roots always hide behind other arms) for a
  one-time reward of upgrade points. Fish, by contrast, are learned per species by click count.
- **Echo Lock (upgrade `echolock`, stat `lockTime`).** Only for fully learned creatures: hit the same one with
  the BEAM twice within `sonar.lockWindow` and its model stops being a snapshot and follows the creature live
  (with path arrow and lock brackets) for `lockTime` seconds (`Game.locks`, `lockModels` in `drawModels`).
  Without the upgrade or for unlearned species, models stay snapshots.
- **Creatures commit to their moves.** Steering decisions are held for `creatures.reactionTime` (~1 s), so nothing
  reacts instantly, and a sonar hit locks the current plan for that long (`Creature.lockPlan`). For fully scanned
  species (100%), the sonar also reveals that committed path as a dotted arrow from the nose
  (`Creature.predictPath`, `drawPath`). It is still a snapshot from the moment of the click.
- **Clicking is loud.** Every click can be heard by orcas within the click's `loudness` radius. Sonar must stay a
  trade-off between information and exposure.
- **Slow and methodical pacing.** The user wants a deliberate game, not an arcade one. Keep speeds low, sonar
  cooldowns meaningful and the sonar wave visibly travelling. Don't raise speeds without asking.
- **Never get stuck on terrain.** Collision pushes bodies out of terrain (`World.resolveCircle`) and removes only
  the velocity going into the surface, so things slide along walls. Never "revert to previous position".
- **The world is endless horizontally.** There are no map edges and nothing may clamp x. Terrain is generated in
  seeded chunks around the whale (`World.ensureAround`). Rocks sit on the deepest floor point under
  them so no thin gaps form. Creatures, pods and ships are kept at a steady number near the whale by
  `Game.managePopulation`, spawn out of sight, and are removed past `despawnRadius`.
- **The map is stitched from segments** (`CONFIG.segments`, `World.extend`/`segProfile`/`floorRaw`): beach
  (~80-100 m plateau, beach on the horizon, swimmers), shelf (~150-250 m), open sea (~600-1500 m, ridges) and deep
  sea (~2200-2600 m, pillars, kraken). The map doesn't have to make geographic sense. Each new segment is rolled
  with weights that slide with `Game.progress()` (average of size and upgrade-level progress): a new whale finds
  mostly shelf/open sea and a developed whale mostly open/deep sea; beaches are rare. Segments are decided once
  (`lookahead` beyond the loaded area) and then remembered, so the floor at x never changes afterwards and chunks
  rebuild identically. Code that probes far away (e.g. the kraken spawn) must use `World.isGenerated` so it
  doesn't lock in segments early. Between segments the seabed slopes inside the deeper one (flat tops stay flat).
  The start (x = 0) is always a small shelf with open sea right next to it on both sides.
- **Open water.** The ocean is mostly deep (`abyssDepth` 6500, ~70% deeper than 2000 m) with few rocks and rare,
  tall pillars. Keep it open; don't add clutter without asking.
- **Growth drives everything — bigger means slower, heavier and more zoomed out.** `whale.size` goes from 1 to
  `growth.maxSize`. Top speed, acceleration and turning go DOWN with size (negative `speedExp`/`accelExp`/`turnExp`),
  while the body, lungs, sonar range and the camera view (zoom = `1 / size`) go up, so the ocean feels vaster and the
  whale feels huge and deliberate. Never make growth increase speed. Prey notices a big whale from further away
  (`growth.preyNoticePerSize`), so small fast fish escape big whales easily — you outgrow them.
- **First catch bonus.** The first time you eat a species you get `growth.firstCatchBonus` (5x) its score.
- **The diet grows by eating, not by buying.** Only sardines at first. Eat `diet.unlockAfter` (10) of the top
  species in your diet and the next one is added automatically (`Whale.checkDiet`). The player can NOT buy diet.
  Use `whale.canEat(sp)`, `topSpecies()`, `nextSpecies()`.
- **Upgrade points are scarce.** Evolve (U) costs 1 point per level. Points only come from diet steps
  (`points.perDietStep`, +`squidBonus` when the new prey is any squid), some quest rewards and the kraken.
  About 16 points per whole game - keep it scarce.
- **Quests supplement upgrades** (`src/quests.js`, `CONFIG.quests`). Always some active: 3 early, at least 5 in the
  midgame. Types: eat N of a species, eat N of tier T or higher, fully scan a species, dive to X m, swim X km,
  win a struggle, breach. Rewards are free stat levels (`whale.bonusLevels`, may exceed max by `bonusOverMax`) or
  an upgrade point. Shown in the top-right panel.
- **Surfacing is risky.** Near the surface the whale moves at `surfaceSpeedMult` (30%) of its speed, and whalers can
  lob harpoons over the water from long range at a surfaced whale (`ship.lobRange`).
- **Orcas sprint** briefly (`orca.sprintMult`) when far from their ring slot, to get into a better position.
- **Whalers escalate and track you.** From `humansAtSize` a heat value rises 0 -> 1 over `ship.heatRampTime`:
  more ships, faster, longer and more frequent harpoons. Ships sail to where they *predict* you will surface,
  from intel gathered when you spout, are spotted near the surface, or are heard clicking (`Game.reportWhale`,
  `Ship.update`). The hint is: don't surface where they expect you.
- **Orcas surround.** Pods hunt whales of any size by taking slots on a ring around you; once the ring is closed
  (everyone near and spread around you) they rush in (`Pod.updateTactics`). Keep moving and they can't close it.
- **Seafloor cables** (`CONFIG.cables`, built per chunk in `World.buildChunk`) shock you on contact, throw you off,
  and can kill. They echo purple on sonar.
- **Stealth.** Prey that could notice you rolls `Whale.detectChance()`: always in light; in the dark Quiet Clicks
  can make you go unnoticed. Sprinting always gets you noticed.
- **Lively fish.** Solitary fish cruise, forage (stop-and-go pecking) and rest; schools cruise, mill and rest
  (`CONFIG.fishLife`).
- **Deeper = more and bigger prey.** Species depth bands step down with tier (gameplay over realism) and deep tiers
  have higher counts. Keep this progression when adding species.
- **Don't let the player starve.** Energy per meal grows with tier; the meal director spawns something within
  `graceTime` (10 s, 4 s when hungry), favouring the top tiers of the diet. A swimming bot survived 8 minutes with
  meals ~2 s apart (longest gap 41 s) - re-run that kind of check after touching energy/spawn numbers.
- **Growth is slow** (`growth.massForMax` 6000): roughly size 1.4 after 8 minutes, ~2.9 by the giant squid.
- **Coasts, swimmers and the WANTED level** (`src/fauna.js`, `CONFIG.swimmers/wanted`). Coasts are the beach
  segments (`World.coastNear`/`beachesIn`): shallow plateaus (~80-100 m) with a beach on the horizon. Human swimmers there
  are edible, but each one adds a GTA-style wanted star (max 5): +2 ships per star, higher whaler heat, and from
  3 stars they track you even underwater. A star always drops every `decayTime` s (eating another swimmer resets
  the timer; a bar under the stars shows it); swimmers stay out of the water while you are wanted. Beaches are
  short (`segments.types.beach.width`).
- **Ambient life (not food)** (`CONFIG.fauna`, `Fauna` class): blue whales and humpbacks (rare giants), dolphin
  pods, turtles, coastal seals, and glowing deep-sea life (anglerfish lures, firefly/vampire squid, comb jellies,
  lanternfish schools), plus seabed crabs. Glow is drawn AFTER the darkness (`drawGlows`), so glowing animals are
  visible in the deep without sonar - they emit their own light. Keep glow sizes readable at every zoom.
- **Seabed life** (`buildDecor`/`drawDecor`): per chunk, kelp/reefs/anemones in the shallows, sponges/sea fans/
  cold-water coral mid-depth, glowing sea pens/tube worms/glass sponges/rare whale falls in the deep. Nothing
  (rocks, pillars, plants) may reach the surface - shallow coasts clamp heights.
- **There is always something to hunt.** `Game.updateMealDirector`: if no edible prey worth >= `minWorth` has
  been within `huntRange` x size for `graceTime` (20 s), a random unlocked species (not necessarily the best) is
  spawned out of sight but inside sonar beam reach. Sparse is fine; empty is not.
- **Struggle-eating - any tier.** Anything above your diet can be attacked (`whale.struggleFor(sp)`):
  bites = baseBites + bitesPerTier x gap, each bite costs damageBase x damageGrowth^(gap-1) of max health (steep:
  small gaps are cheap, only really big fish hurt). 1 up ~4%, 2 up ~12%, 3 up ~32%, 4 up ~80%, 5+ up is fatal
  without health/skin/jaws upgrades. Quests only ask for fights up to 2 tiers up.
- **Upgrades are few but strong.** Every upgrade has `max` 3 levels with a big effect per level (e.g. +40% health),
  so each scarce point is felt. Quest bonus levels may go `bonusOverMax` (1) beyond max.
- **Dead fish** (`Carcass` in fauna.js, `CONFIG.carcass`). Carcasses of random species (up to 3 tiers above your
  diet) sink belly-up and rest on the seabed. You can eat any of them (energy + some growth, no diet progress);
  scavengers (octopus, toothfish, sleeper shark, crabs) smell them and eat them too. They rot after `life` s.
- **Creature colors: only green and yellow.** Echoes, holograms and indicators for creatures are green if the
  species is in your diet and yellow otherwise (`Game.echoClass`). Terrain is cyan. Never make creatures red.
- **Learned creatures off-screen.** When a 100%-scanned creature is pinged outside the screen, an edge arrow with a
  small silhouette points to it (`drawLearnedIndicators`), like the propeller indicator.
- **Fish keep to open water and schools stay together.** Free swimmers look ahead and steer away from terrain
  (`Creature.avoidTerrain`, `CONFIG.terrainAvoid`), and their waypoints/spawns keep `waypointClearance` above the
  seabed. Schooling fish hold formation (`groupSpread`), flee together, and only break formation when the whale
  is very close.
- **It's a hunt, not a buffet.** Prey is spread out (few, loose schools: `population.groupSpread`). Prey has
  stamina (`preyStamina`): it bolts at full speed for a few seconds, then tires and slows down, so the loop is
  stalk → make it bolt → wear it out → close in. Sprinting is a short, very expensive burst
  (`sprintEnergyDrain` ~27x normal) and only possible above `sprintMinEnergy` (1/3 of max, marked on the energy
  bar), so a full bar gives ~9 s of sprint. Never a way to travel.
- **Bigger needs more meat.** Energy use and stomach size grow with size^1.5 while each species' energy is fixed,
  so small prey becomes a snack that barely registers. Prey you've outgrown also gives less growth and score
  (`Whale.nutrition`: falls over `nutritionFalloff` size units to `minNutrition`). The food chain panel shows
  "worth N%". This pushes the player to always hunt the biggest thing they can eat.
- **Open water is close to the start.** The shallow start shelf is small (`segments.start.halfWidth`) and its
  neighbours are always open sea, so deeper water is ~5–15 s away.
- **Everything must be escapable or catchable.** Attackers chase at `attack.chaseSpeed`, which stays below the
  whale's normal swim speed at every size, and give up after `chaseTime`. Prey flee speeds stay below the whale's
  sprint at the size where they unlock. Check both when tuning speeds.
- Size also scales sonar wave speed and the spawn/despawn radius. When you add
  something size-dependent, scale it from `whale.size`, not a fixed number.
- **Darkness is real.** All world drawing happens *before* the darkness overlay. Only sonar echoes, bioluminescent
  specks, the player's faint self-outline and the HUD are drawn after it.
- Side view: x is horizontal, y increases **downward**, the water surface is y = 0, the sky is y < 0.
- **Real-world scales.** Depth: 1 unit = `metersPerUnit` (0.4 m); the deepest seabed is ~3000 m, the deepest a
  sperm whale dives. Bodies use `bodyMetersPerUnit` (0.026 m), so the whale is a 4.7 m calf at size 1 and a 14 m
  adult at size 3, and every species has its real length and real depth range (see comments in `CONFIG.species`;
  the food chain is ordered by real size). Max dive depth grows with size (1000 m -> 3000 m, Pressure Tolerance
  upgrade); deeper than that the pressure hurts.

## How to run

No build step, no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8123
```

then open http://localhost:8123 (the `deep-echo` entry in `.claude/launch.json` does the same).

## Tech + conventions

- Plain JavaScript, HTML5 Canvas 2D, classic `<script>` tags (no ES modules, so it also works from `file://`).
  Files share globals; load order is set in `index.html` and matters.
- **All tunable numbers live in `src/config.js`.** Don't hard-code gameplay values in other files.
- `whale.stats` is built by `Whale.recomputeStats()` = `CONFIG.whale` → bought upgrades (`CONFIG.upgrades`) →
  size scaling. Gameplay code must read `whale.stats`, never `CONFIG.whale`. Every whale stat should have an upgrade;
  when adding a stat, add an upgrade for it too.
- Species are pure data in `CONFIG.species` (shape, length, minSize, mass, ep, depth band, group size, attack, hp).
  Add a new animal by adding an entry (and a shape in `SHAPES` if needed); `Prey` handles behaviour generically.
- Shapes are local polygons facing +x (`SHAPES` in `entities.js`). `transformShape` rotates them and mirrors them
  when facing left so the dorsal side stays up.
- Anything sonar can hit is a **solid**: `{ kind, poly, bx, by, br, owner }` (see `makeSolid` in `util.js`).
  `kind` is one of `terrain | prey | predator | human` and controls echo color when `CONFIG.sonar.colorCode` is on.
- Keep it dependency-free unless the user agrees otherwise.

## File map

| File | What it does |
|---|---|
| `index.html` | Canvas + script load order |
| `src/config.js` | Every tunable value (world, growth, whale stats, upgrades, sonar, species, orcas, ships) |
| `src/util.js` | Math helpers, `lightAt(y)`, ray/segment intersection, polygons, solids |
| `src/world.js` | Endless seabed from progress-weighted segments (beach/shelf/open/deep), chunks, rocks, pillars, collision |
| `src/sonar.js` | Click emission, ray casting, face extraction, echo lifetime |
| `src/fauna.js` | Ambient fauna, coast swimmers, coasts + beach scenery, seabed decorations, glow pass |
| `src/quests.js` | Quest generation, tracking, rewards, quest panel |
| `src/kraken.js` | The Kraken: behaviour, scan cells, partial-reveal hologram |
| `src/entities.js` | `SHAPES`, `Whale` (growth, upgrades), `Prey` (all species), `Pod` + `Orca`, `Ship` + `Harpoon` |
| `src/audio.js` | Procedural WebAudio sounds (clicks, echoes, hurt, harpoon, breath), volume channels + saved volumes |
| `src/render.js` | Zoomed world drawing, water shading, whale body model, darkness overlay, echoes, HUD, food chain panel, menus |
| `src/main.js` | `Game` class: input, spawning/despawning around the whale, update loop, state machine |

## Current gameplay (v0.2)

- WASD/arrows swim, Shift sprint (burns more air + energy).
- Left click / Space: narrow long-range sonar beam toward the mouse. Right click / E: short 360° burst.
- U / Tab: evolve menu (spend upgrade points on stats). Quests are shown top right. F: full food chain panel.
- **HUD style "Sonar Instrument"** (`HUD` palette + helpers in render.js, Space Mono / Space Grotesk from Google Fonts in
  `index.html`): thin cyan stat lines without numbers (AIR, HP, FOOD, SIZE) top left; big depth readout + dive limit
  top right with all active quests under it; a depth thread down the right edge (glowing marker = you, warm tick =
  dive limit); bottom left only "HUNTING <species> · n/10 to <next>" (F opens the full food chain); upgrade points
  bottom right only when you have some. Keep the screen this quiet: show numbers only where they matter.
- **Whale model** (`drawWhaleModel`, `CONFIG.whaleLook`): shaded sperm whale drawn along a bending spine; the tail
  beats faster/wider with speed and the body curves into turns (`swimPhase`/`swimAmp`/`bend` set in `Whale.update`).
  It's only the picture - collision and sonar still use `w.poly`.
- **Eating zone** (`CONFIG.mouth`, `Whale.canReach`): a capsule along the lower jaw, not just the snout tip.
- **Water shading** (`drawWaterShading`): dappled caustics under the surface, slow parallax haze, marine snow and a
  screen vignette - all drawn before the darkness, so the deep stays black.
  P / Esc: pause, which also shows the sound menu (sliders for master, sonar, eating/breathing and damage/harpoons;
  saved in `localStorage`, defaults in `CONFIG.audio`). M: mute.
- Sounds route through channel gains in `Sfx` (`sonar`, `effects`, `danger`) into a master gain. Damage and harpoon
  shots are deliberately soft, muffled thumps; harpoon shots get quieter the further away the ship is.
- Air drains underwater, refills at the surface (spout effect). Out of air → health drains.
- Energy drains over time (faster when bigger). Eating refills it. Out of energy → health drains.
- **Food chain** (`CONFIG.species`): sardine, mackerel, squid, octopus, grouper, tuna, manta ray, swordfish,
  humboldt squid, sleeper shark, oarfish, giant squid. You can only eat a species once `size >= minSize`; edible prey
  flees, inedible prey ignores you. Sleeper sharks attack you while you're too small for them. The giant squid has
  hp, needs several bites (`stats.bite`) and fights back; eating it wins the game (you can keep swimming after).
- Size = `1 + (maxSize-1) * sqrt(mass / massForMax)`; early growth is fast, late growth slow.
- Orca pods patrol 0–750 m inside a home territory. They spot you by sight (worse in the dark) or by hearing your
  clicks. A pod gives up after `maxChase` seconds, then ignores you for `giveUpCooldown` seconds, never hunts
  outside its `territory`, and stops hunting whales of `fearSize` or bigger.
- Whaling ships appear once `size >= growth.humansAtSize` (~half of max) and harpoon whales near the surface.
- Returning echoes from creatures also play a faint audio tick.
- Upgrades are per run (lost on death).
- **Test mode is ON** (`CONFIG.debug.noDeath`): instead of dying you're healed and put back at the surface above
  where you died (`Game.respawnAtSurface`), keeping your progress. Set it to `false` before a real release.
- **Testing block in the pause menu** (`CONFIG.debug.tools`): *Unstuck* (`Game.unstuck`) moves the whale to the
  nearest open water its body fits in. *Start from save 1-5* (`Game.loadStage` / `applyStage`) starts a fresh run at
  a stage preset (`CONFIG.debug.stages`: 0, 25, 50, 75, 100 % through the game). One fraction drives size, diet
  (save 5 stops at the oarfish), eaten counts, upgrade levels (that share of all levels), scans and the kraken scan.

## Roadmap / later

1. Decide whether upgrades/progress should persist between runs (`localStorage`).
2. Orcas using their own echolocation (the player could *hear* their clicks as a directional warning).
3. Sound-based "stun click" for hunting.
4. More human threats: nets, submarines with active sonar, ship noise masking your echoes.
5. Pod/calf mechanics, day/night cycle affecting surface light.

## Working agreements for Claude

- Keep changes small and playable; after a change, run the game in the browser and check the console for errors.
- When adding a feature, put its numbers in `config.js` and update this file's file map / gameplay section.
- Respect the hard design rules above; if a request conflicts with them, point it out and ask.
- **Every answer that changes the game must end with a direct launcher**: in cloud sessions, republish the
  "Deep Echo" artifact (https://claude.ai/artifact/QKE6aFZHAj1dFnr6GvJPyf: a page with the canvas + the `src/*.js`
  scripts in `index.html` order, published with `files`) and end with a ▶ link to it. Also give the local play button:
  a ▶ link to http://localhost:8123 (the
  `deep-echo` server in `.claude/launch.json`; start it with the preview tool first) plus a one-line
  `powershell` block `Start-Process "http://localhost:8123"`, which the app shows with a Run button.
