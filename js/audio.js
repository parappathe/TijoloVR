// Sons sintetizados na hora (sem arquivos), com áudio 3D (PannerNode HRTF) para tijolos, paredes
// e pedras, e uma musiquinha de fliperama por mundo (pode desligar no menu).
// Só começa depois de um clique, tecla ou da entrada no VR (regra do navegador).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// músicas: [baixo (16 passos, nota MIDI ou 0), arpejo (16 passos), andamento em passos por segundo]
const SONGS = [
  [[45, 0, 45, 0, 48, 0, 50, 0, 45, 0, 45, 0, 43, 0, 40, 0], [69, 72, 76, 72, 69, 72, 76, 79, 67, 71, 74, 71, 64, 67, 71, 67], 7],
  [[41, 0, 0, 41, 0, 0, 44, 0, 46, 0, 0, 46, 0, 0, 39, 0], [77, 0, 80, 0, 84, 0, 80, 0, 75, 0, 79, 0, 82, 0, 79, 0], 6],
  [[38, 38, 0, 38, 41, 0, 38, 0, 36, 36, 0, 36, 43, 0, 41, 0], [74, 77, 81, 86, 74, 77, 81, 86, 72, 76, 79, 84, 79, 77, 74, 72], 9],
];

export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.musicOn = true; this.last = {}; this.song = 0; this.playing = false; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.09 : 0;
      this.musicBus.connect(this.master);
      this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 50);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(v) {
    this.musicOn = v;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v ? 0.09 : 0, this.ctx.currentTime, 0.1);
  }
  setSong(i, playing) { this.song = i; this.playing = playing; }

  // sequenciador simples com antecedência (não depende do quadro da tela)
  schedule() {
    const c = this.ctx;
    if (!c) return;
    const [bass, arp, rate] = SONGS[this.song];
    const dt = 1 / rate;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.02;
    while (this.nextT < c.currentTime + 0.2) {
      const k = this.step % 16, t = this.nextT - c.currentTime;
      const mute = !this.playing;
      if (!mute && bass[k]) this.tone(NOTE(bass[k]), dt * 0.9, { type: 'triangle', vol: 0.9, at: t, bus: this.musicBus, attack: 0.01 });
      if (!mute && arp[k]) this.tone(NOTE(arp[k]), dt * 0.5, { type: 'square', vol: 0.18, at: t, bus: this.musicBus });
      if (!mute && k % 4 === 0) this.noise(0.05, { vol: 0.35, freq: 6000, q: 1, type: 'highpass', at: t, bus: this.musicBus });
      this.step++;
      this.nextT += dt;
    }
  }

  setListener(p, f, u) {
    const L = this.ctx?.listener;
    if (!L) return;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  out(pos, ref = 2, bus = null) {
    const c = this.ctx;
    if (bus) return bus;
    if (!pos) return this.master;
    const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.maxDistance = 50; p.rolloffFactor = 0.8;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(this.master);
    return p;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005, pos = null, ref, bus = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(pos, ref, bus));
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', pos = null, ref, slide = 0, bus = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    if (!this.nbuf) {
      this.nbuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.nbuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(pos, ref, bus));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  gate(key, gap) {
    const t = this.ctx?.currentTime ?? 0;
    if (t - (this.last[key] || -9) < gap) return false;
    this.last[key] = t;
    return true;
  }

  // ---------- jogo ----------
  paddle(speed, pos, curve) {
    if (!this.ctx) return;
    const k = Math.min(1, Math.max(0, (speed - 3) / 3.5));
    this.tone(320 + k * 260, 0.09, { type: 'square', vol: 0.16 + k * 0.08, slide: 0.6, pos, ref: 0.6 });
    this.noise(0.05, { vol: 0.25, freq: 2200, q: 1.2, pos, ref: 0.6 });
    if (curve > 0.5) this.tone(900, 0.25, { type: 'sine', vol: 0.06, slide: 1.8, pos, ref: 0.6 });
  }
  wall(pos) { if (this.gate('wall', 0.05)) this.tone(180, 0.07, { type: 'triangle', vol: 0.18, slide: 0.7, pos, ref: 1.5 }); }
  // tijolo quebrado: nota que sobe com o combo (escala maior)
  brick(kind, combo, pos) {
    if (!this.ctx) return;
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
    const n = 72 + scale[Math.min(scale.length - 1, combo - 1)];
    this.tone(NOTE(n), 0.18, { type: 'square', vol: 0.18, pos, ref: 3 });
    this.tone(NOTE(n + 12), 0.12, { type: 'triangle', vol: 0.12, at: 0.04, pos, ref: 3 });
    this.noise(0.18, { vol: 0.3, freq: 900, q: 0.8, type: 'lowpass', pos, ref: 3 });
  }
  crack(pos) { this.tone(140, 0.12, { type: 'square', vol: 0.2, slide: 0.6, pos, ref: 3 }); this.noise(0.12, { vol: 0.3, freq: 600, q: 1, pos, ref: 3 }); }
  ping(pos) { if (this.gate('ping', 0.06)) { this.tone(1800, 0.25, { type: 'sine', vol: 0.15, pos, ref: 3 }); this.tone(2700, 0.18, { type: 'sine', vol: 0.06, pos, ref: 3 }); } }
  bomb(pos) {
    this.noise(0.8, { vol: 0.7, freq: 700, q: 0.6, type: 'lowpass', slide: 0.2, pos, ref: 4 });
    this.tone(90, 0.6, { type: 'sine', vol: 0.5, slide: 0.4, pos, ref: 4 });
  }
  power(kind) {
    const seq = { fire: [60, 64, 67, 72, 76], net: [67, 71, 74, 79], slow: [79, 74, 71, 67], big: [55, 62, 67, 74, 79] }[kind] || [72, 76, 79];
    seq.forEach((n, i) => this.tone(NOTE(n), 0.14, { type: 'square', vol: 0.12, at: i * 0.07 }));
  }
  powerEnd() { [72, 67].forEach((n, i) => this.tone(NOTE(n), 0.12, { type: 'triangle', vol: 0.08, at: i * 0.1 })); }
  extraBall(pos) { [76, 79, 84].forEach((n, i) => this.tone(NOTE(n), 0.12, { type: 'triangle', vol: 0.14, at: i * 0.06, pos, ref: 3 })); }
  serve() { this.tone(500, 0.3, { type: 'sine', vol: 0.12, slide: 1.6, attack: 0.05 }); }
  netSave(pos) { this.tone(400, 0.4, { type: 'sawtooth', vol: 0.12, slide: 2.2, pos, ref: 1 }); this.noise(0.3, { vol: 0.2, freq: 3000, q: 2, pos, ref: 1 }); }
  lostBall() { [67, 63, 60, 55].forEach((n, i) => this.tone(NOTE(n), 0.22, { type: 'square', vol: 0.12, at: i * 0.14, slide: 0.95 })); }
  ballGone() { this.tone(300, 0.25, { type: 'triangle', vol: 0.1, slide: 0.5 }); }
  wallCrash(pos) { this.noise(1.0, { vol: 0.7, freq: 300, q: 0.5, type: 'lowpass', pos, ref: 3 }); this.tone(60, 0.8, { type: 'sine', vol: 0.6, slide: 0.5, pos, ref: 3 }); }
  respawn(pos) { if (this.gate('respawn', 0.2)) this.tone(300, 0.2, { type: 'sine', vol: 0.08, slide: 2, pos, ref: 3 }); }
  closedHit(pos) { if (this.gate('closed', 0.1)) this.tone(220, 0.2, { type: 'square', vol: 0.12, slide: 0.8, pos, ref: 3 }); }
  bossHit(pos) { this.tone(110, 0.3, { type: 'sawtooth', vol: 0.3, slide: 0.6, pos, ref: 4 }); this.noise(0.3, { vol: 0.4, freq: 500, q: 0.8, pos, ref: 4 }); }
  bossDown(pos) {
    for (let k = 0; k < 4; k++) this.noise(0.6, { vol: 0.5, freq: 600, q: 0.7, type: 'lowpass', at: k * 0.2, pos, ref: 4 });
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'square', vol: 0.12, at: 0.9 + i * 0.09 }));
  }
  rockThrow(pos) { this.tone(160, 0.5, { type: 'sawtooth', vol: 0.2, slide: 0.5, pos, ref: 3 }); }
  rockSmash(pos) { this.noise(0.3, { vol: 0.5, freq: 1200, q: 0.8, pos, ref: 1 }); this.tone(220, 0.15, { type: 'square', vol: 0.15, slide: 0.5, pos, ref: 1 }); }
  rockHit() { this.noise(0.5, { vol: 0.6, freq: 400, q: 0.6, type: 'lowpass' }); [600, 500, 600, 500].forEach((f, i) => this.tone(f, 0.1, { type: 'sine', vol: 0.1, at: 0.2 + i * 0.1 })); }
  coin() { [83, 88].forEach((n, i) => this.tone(NOTE(n), i ? 0.4 : 0.08, { type: 'square', vol: 0.12, at: i * 0.08 })); }
  won() { [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), 0.22, { type: 'square', vol: 0.12, at: i * 0.12 })); }
  lost() { [67, 66, 65, 64, 52].forEach((n, i) => this.tone(NOTE(n), i === 4 ? 0.8 : 0.25, { type: 'square', vol: 0.12, at: i * 0.22 })); }
  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  star(n) { this.tone(NOTE(84 + n * 4), 0.3, { vol: 0.12, type: 'triangle' }); }
}
