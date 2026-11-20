// Costa Azul: Wheelman — every sound is synthesized with WebAudio; there are no
// audio files. One AudioContext, a master gain, short one-shot voices for effects,
// a looping engine voice and siren voice whose pitches the game drives each frame,
// and a tiny step-sequencer that plays an original sun-bleached bass groove.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;   // {osc, gain, filter}
    this.siren = null;    // {osc, gain, lfo}
    this.musicTimer = null;
    this.step = 0;
    this.muted = false;
  }

  // Must be called from a user gesture at least once.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineVoice();
    this.startSirenVoice();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // ---- continuous voices ---------------------------------------------------

  startEngineVoice() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = 28;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 2;
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start(); sub.start();
    this.engine = { osc, sub, gain, filter };
  }

  // rpm 0..1 while driving, or null when the engine should fall silent.
  setEngine(rpm, load) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const target = rpm === null ? 0 : 0.05 + load * 0.05;
    this.engine.gain.gain.setTargetAtTime(target, t, 0.09);
    if (rpm !== null) {
      const f = 52 + rpm * 165;
      this.engine.osc.frequency.setTargetAtTime(f, t, 0.06);
      this.engine.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
      this.engine.filter.frequency.setTargetAtTime(280 + rpm * 900, t, 0.08);
    }
  }

  startSirenVoice() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 760;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 130;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain); gain.connect(this.master);
    osc.start(); lfo.start();
    this.siren = { osc, gain };
  }

  // level 0..1 — how present the nearest police siren is.
  setSiren(level) {
    if (!this.siren) return;
    this.siren.gain.gain.setTargetAtTime(level * 0.055, this.ctx.currentTime, 0.15);
  }

  // ---- one shots ------------------------------------------------------------

  blip(freq, dur, type = 'sine', vol = 0.16, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, filterFreq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = filterFreq;
    const gain = ctx.createGain(); gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.14, 2600, 0.5); this.blip(150, 0.1, 'square', 0.2, 40); }
  dryFire() { this.blip(1200, 0.04, 'square', 0.08); }
  reload() { this.blip(500, 0.06, 'square', 0.12); setTimeout(() => this.blip(760, 0.06, 'square', 0.12), 130); }
  hitCar() { this.noiseBurst(0.2, 500, 0.4); this.blip(90, 0.18, 'sawtooth', 0.2, 45); }
  hitPerson() { this.noiseBurst(0.12, 700, 0.3); }
  pickup() { this.blip(880, 0.09, 'sine', 0.18); setTimeout(() => this.blip(1318, 0.14, 'sine', 0.18), 70); }
  cash() { this.blip(1046, 0.08, 'triangle', 0.2); setTimeout(() => this.blip(1568, 0.16, 'triangle', 0.2), 60); }
  phoneRing() { this.blip(1174, 0.12, 'sine', 0.15); setTimeout(() => this.blip(1174, 0.12, 'sine', 0.15), 180); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.18), i * 95)); }
  missionFail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.16), i * 130)); }
  bustedJingle() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'square', 0.12), i * 160)); }
  wastedJingle() { [220, 208, 196, 185].forEach((f, i) => setTimeout(() => this.blip(f, 0.34, 'sawtooth', 0.1), i * 170)); }
  doorSlam() { this.noiseBurst(0.08, 900, 0.25); }
  screech() { this.noiseBurst(0.16, 3200, 0.07, 'bandpass'); }

  // ---- music: an original 8-step groove in A minor --------------------------

  startMusic() {
    const bassLine = [110, 0, 110, 131, 0, 110, 0, 98, 110, 0, 110, 131, 0, 165, 147, 131];
    const chords = [220, 262, 175, 196]; // Am, C, F, G roots, one per bar
    let bar = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this.step++; if (this.step % 16 === 0) bar++; return; }
      const s = this.step % 16;
      const bass = bassLine[s];
      if (bass) this.blip(bass, 0.21, 'triangle', 0.11);
      if (s % 4 === 2) this.noiseBurst(0.03, 6000, 0.03, 'highpass'); // hat tick
      if (s === 0) this.blip(chords[bar % 4] * 2, 0.9, 'sine', 0.035);
      this.step++;
      if (this.step % 16 === 0) bar++;
    }, 132);
  }
}
