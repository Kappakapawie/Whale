// Submarines (CONFIG.subs): rare human submarines patrolling the mid-depths. They ignore you - until you are
// WANTED: then they hunt you, keep a standoff distance and fire slow homing torpedoes (dodgeable: they turn
// slowly and run out). On sonar a submarine never resolves: its hologram always stays a level-1 echo (a vague
// dashed blob), however often you ping it (Game.scanCreature).

Object.assign(SHAPES, {
  sub: [[50, 0], [46, -7], [36, -10], [16, -10], [14, -22], [2, -22], [0, -10], [-36, -9], [-46, -5], [-52, -12],
        [-50, 0], [-52, 10], [-46, 5], [-36, 9], [36, 10], [46, 7]],
  torpedo: [[20, 0], [15, -3], [-18, -3], [-20, 0], [-18, 3], [15, 3]],
});

class Submarine extends Creature {
  constructor(x, y) {
    const C = CONFIG.subs;
    super('human', 'sub', x, y, C.length / 100);
    this.length = C.length; this.radius = C.length * 0.12;
    this.cool = rand(2, 5); this.wx = x; this.wy = y; this.wt = 0;
  }
  bodyRadius() { return this.length * 0.1; }
  update(dt, game) {
    const C = CONFIG.subs, w = game.whale, d = dist(this.x, this.y, w.x, w.y);
    const hunting = game.wanted > 0 && w.alive && !game.cosmic &&
                    (d < C.senseRange * w.size || game.wanted >= CONFIG.wanted.trackAlwaysAt);
    if (hunting) {
      // hold a standoff distance from the whale, inside its own depth band, and fire torpedoes
      const a = Math.atan2(this.y - w.y, this.x - w.x), sd = C.standoff * w.size;
      const tx = w.x + Math.cos(a) * sd, ty = clamp(w.y + Math.sin(a) * sd, C.depthMin, C.depthMax);
      this.steer(tx, ty, C.huntSpeed, dt, 1);
      this.cool -= dt;
      if (this.cool <= 0 && d < C.fireRange * w.size) {
        const aim = Math.atan2(w.y - this.y, w.x - this.x), [nx, ny] = transformShape([[52, 0]], this.x, this.y, this.angle, this.scale)[0];
        game.torpedoes.push(new Torpedo(nx, ny, aim, w.size));
        game.sfx.harpoon(clamp(1 - d / (C.fireRange * w.size), 0.2, 1));
        this.cool = lerp(C.cooldown, C.minCooldown, clamp((game.wanted - 1) / 4, 0, 1));
      }
    } else { // a slow patrol between waypoints in the mid-depths
      this.wt -= dt;
      if (this.wt <= 0 || dist(this.x, this.y, this.wx, this.wy) < 120) {
        this.wx = this.x + rand(800, 1800) * (Math.random() < 0.5 ? -1 : 1);
        this.wy = clamp(rand(C.depthMin, C.depthMax), C.depthMin, game.world.floorAt(this.wx) - 350);
        this.wt = rand(15, 30);
      }
      this.steer(this.wx, this.wy, C.speed, dt, 0.6);
    }
    this.avoidTerrain(dt, game, 320);
    this.integrate(dt, game, this.bodyRadius());
  }
}

class Torpedo {
  constructor(x, y, a, size = 1) {
    const C = CONFIG.subs;
    this.x = x; this.y = y; this.angle = a; this.speed = C.torpedoSpeed * Math.sqrt(size);
    this.life = C.fireRange * size * C.torpedoReach / this.speed; this.dead = false;
    this.solid = makeSolid('human', [], this);
    this.updatePoly();
  }
  updatePoly() { this.poly = transformShape(SHAPES.torpedo, this.x, this.y, this.angle, 1.2); this.solid.poly = this.poly; refreshSolid(this.solid); }
  update(dt, game) {
    const C = CONFIG.subs, w = game.whale;
    if (w.alive) { // turns slowly toward the whale: a sharp turn dodges it
      const want = Math.atan2(w.y - this.y, w.x - this.x);
      this.angle += clamp(angleDiff(this.angle, want), -C.torpedoTurn * dt, C.torpedoTurn * dt);
    }
    this.x += Math.cos(this.angle) * this.speed * dt; this.y += Math.sin(this.angle) * this.speed * dt;
    this.life -= dt;
    this.updatePoly();
    if (this.life <= 0 || this.y < 0 || game.world.blocked(this.x, this.y)) { this.dead = true; return; }
    const tip = this.poly[0];
    if (w.alive && pointInPoly(tip[0], tip[1], w.poly)) {
      w.damage(C.torpedoDamage, 'Hit by a torpedo.', game);
      game.sfx.crash();
      this.dead = true;
    }
  }
}
