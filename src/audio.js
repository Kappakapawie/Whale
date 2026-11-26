// Tiny procedural sound effects (no audio files).
class Sfx {
  constructor() { this.ctx = null; this.muted = false; }

  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  noise(len, decay, freq, q, gain, delay = 0, type = 'bandpass') {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * len));
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * decay));
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime + delay);
  }

  tone(f0, f1, len, gain, type = 'sine', delay = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + len + 0.02);
  }

  click(beam) { this.noise(0.03, 0.003, beam ? 3200 : 1700, 1.4, beam ? 0.9 : 0.7); }
  echo(delay, strength, kind) {
    const f = kind === 'prey' ? 4200 : kind === 'predator' ? 1200 : 2400;
    this.noise(0.02, 0.002, f, 3, 0.15 + 0.5 * strength, delay);
  }
  chomp() { this.tone(220, 80, 0.15, 0.35, 'triangle'); }
  hurt() { this.tone(160, 50, 0.35, 0.5, 'sawtooth'); }
  thud() { this.tone(90, 40, 0.25, 0.25, 'square'); }
  breath() { this.noise(0.6, 0.18, 900, 0.5, 0.5, 0, 'lowpass'); }
}
