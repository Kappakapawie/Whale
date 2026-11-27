// Tiny procedural sound effects (no audio files).
// Every sound goes through a channel gain (sonar / effects / danger) and then a master gain, so the
// sound menu (pause screen) can turn each group up or down. Volumes are saved per browser.
class Sfx {
  constructor() {
    this.ctx = null; this.muted = false; this.bus = {};
    const A = CONFIG.audio;
    this.volume = { ...A.defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(A.storageKey) || 'null');
      if (saved) for (const k in this.volume) if (typeof saved[k] === 'number') this.volume[k] = clamp(saved[k], 0, 1);
    } catch (e) { /* storage blocked: keep defaults */ }
  }

  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const c = this.ctx;
      this.bus.master = c.createGain(); this.bus.master.connect(c.destination);
      for (const ch of CONFIG.audio.channels) { this.bus[ch.id] = c.createGain(); this.bus[ch.id].connect(this.bus.master); }
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(id, v) {
    this.volume[id] = clamp(v, 0, 1);
    this.applyVolumes();
    try { localStorage.setItem(CONFIG.audio.storageKey, JSON.stringify(this.volume)); } catch (e) { /* ignore */ }
  }

  toggleMute() { this.muted = !this.muted; this.applyVolumes(); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // squared so the slider feels even to the ear
    this.bus.master.gain.setTargetAtTime(this.muted ? 0 : this.volume.master ** 2, t, 0.02);
    for (const ch of CONFIG.audio.channels) this.bus[ch.id].gain.setTargetAtTime(this.volume[ch.id] ** 2, t, 0.02);
  }

  out(ch) { return this.bus[ch] || this.bus.master; }

  noise(len, decay, freq, q, gain, delay = 0, type = 'bandpass', ch = 'effects', attack = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * len)), a = Math.floor(c.sampleRate * attack);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * decay)) * (a > 0 ? Math.min(1, i / a) : 1);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.out(ch));
    src.start(c.currentTime + delay);
  }

  // attack > 0 fades in instead of starting at full volume (softer, no click)
  tone(f0, f1, len, gain, type = 'sine', delay = 0, ch = 'effects', attack = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = c.createGain();
    if (attack > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); }
    else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(this.out(ch)); o.start(t); o.stop(t + len + 0.02);
  }

  click(beam) { this.noise(0.03, 0.003, beam ? 3200 : 1700, 1.4, beam ? 0.9 : 0.7, 0, 'bandpass', 'sonar'); }
  echo(delay, strength, kind) {
    const f = kind === 'prey' ? 4200 : kind === 'predator' ? 1200 : 2400;
    this.noise(0.02, 0.002, f, 3, 0.15 + 0.5 * strength, delay, 'bandpass', 'sonar');
  }
  chomp() { this.tone(220, 80, 0.15, 0.35, 'triangle'); }
  // Taking damage: a soft, muffled underwater bump (sine + low rumble), not a harsh buzz.
  hurt() {
    this.tone(130, 62, 0.32, 0.22, 'sine', 0, 'danger', 0.015);
    this.noise(0.28, 0.08, 320, 0.7, 0.18, 0, 'lowpass', 'danger', 0.01);
  }
  // A whaler firing: a distant, muffled "thump" heard through the water. near: 0 (far) .. 1 (close).
  harpoon(near = 1) {
    const k = 0.35 + 0.65 * clamp(near, 0, 1);
    this.noise(0.22, 0.05, 520, 0.6, 0.16 * k, 0, 'lowpass', 'danger', 0.006);
    this.tone(150, 95, 0.18, 0.07 * k, 'sine', 0.01, 'danger', 0.01);
  }
  // Breach Strike hitting a ship: a heavy wooden crunch (danger channel, kept soft like the other hits)
  crash() {
    this.noise(0.45, 0.12, 260, 0.8, 0.32, 0, 'lowpass', 'danger', 0.005);
    this.tone(90, 45, 0.4, 0.2, 'triangle', 0, 'danger', 0.01);
    this.noise(0.25, 0.05, 1400, 1.2, 0.08, 0.05, 'bandpass', 'danger');
  }
  breath() { this.noise(0.6, 0.18, 900, 0.5, 0.5, 0, 'lowpass'); }
}
