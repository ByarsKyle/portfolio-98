// ─────────────────────────────────────────────────────────────
// core/audio — every sound in this project is synthesised at
// runtime. No audio files.
//
// The dial-up handshake is the centrepiece: DTMF dialling, ring
// tone, the V.8 answer tone, the scrambled probe bursts and the
// final carrier hiss, in roughly the right order and roughly the
// right timings. It is annoying on purpose.
// ─────────────────────────────────────────────────────────────

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.started = false;
    this.musicNodes = [];
    this.crtGain = null;
    this._stepFlip = 0;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // gentle master limiting so the modem doesn't clip
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master.disconnect();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.started = true;
    this._roomTone();
    this._crtWhine();
  }

  resume() { this.ctx?.resume?.(); }

  get t() { return this.ctx.currentTime; }

  // ── helpers ────────────────────────────────────────────────
  _osc(type, freq, t0, dur, gain = 0.2, dest = null, detune = 0) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.detune.value = detune;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.setValueAtTime(gain, t0 + Math.max(0.01, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest ?? this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return { o, g };
  }

  _noiseBuffer(seconds = 1) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noise(t0, dur, { gain = 0.15, type = 'bandpass', freq = 900, q = 1, dest = null } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(Math.max(0.2, dur));
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest ?? this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
    return { src, f, g };
  }

  // ── ambience ───────────────────────────────────────────────
  _roomTone() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4);
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.5;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 45;
    const g = this.ctx.createGain();
    g.gain.value = 0.030;
    src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(this.master);
    src.start();

    // a distant 50 Hz mains hum, because the wiring is old
    const hum = this.ctx.createOscillator();
    const hg = this.ctx.createGain();
    hum.type = 'sine'; hum.frequency.value = 50;
    hg.gain.value = 0.006;
    hum.connect(hg); hg.connect(this.master);
    hum.start();
  }

  /** The 15.7 kHz flyback whine, pitched down to somewhere audible. */
  _crtWhine() {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 7860;
    g.gain.value = 0.0;
    o.connect(g); g.connect(this.master);
    o.start();
    this.crtGain = g;

    const o2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    o2.type = 'sine'; o2.frequency.value = 120;
    g2.gain.value = 0;
    o2.connect(g2); g2.connect(this.master);
    o2.start();
    this.crtHum = g2;
  }

  /** proximity 0..1 — how close the player is to the monitor */
  setCRTProximity(p) {
    if (!this.started || !this.crtGain) return;
    const t = this.t;
    this.crtGain.gain.setTargetAtTime(0.0055 * p, t, 0.25);
    this.crtHum.gain.setTargetAtTime(0.010 * p, t, 0.25);
  }

  // ── one-shots ──────────────────────────────────────────────
  footstep(running = false) {
    if (!this.started) return;
    const t = this.t;
    this._stepFlip = 1 - this._stepFlip;
    const f = 180 + this._stepFlip * 60 + Math.random() * 40;
    this._noise(t, running ? 0.12 : 0.16, {
      gain: running ? 0.045 : 0.028, type: 'lowpass', freq: f * 3.4, q: 0.8,
    });
    this._noise(t + 0.004, 0.05, { gain: 0.014, type: 'bandpass', freq: 2400 + Math.random() * 900, q: 1.4 });
  }

  click() {
    if (!this.started) return;
    const t = this.t;
    this._noise(t, 0.018, { gain: 0.05, type: 'bandpass', freq: 2600, q: 2.2 });
  }

  play(name, opts = {}) {
    if (!this.started) return;
    const t = this.t;
    switch (name) {
      case 'click': this.click(); break;

      case 'open':
        this._osc('sine', 760, t, 0.07, 0.05);
        this._osc('sine', 1140, t + 0.03, 0.08, 0.035);
        break;

      case 'close':
        this._osc('sine', 900, t, 0.06, 0.04);
        this._osc('sine', 620, t + 0.03, 0.09, 0.03);
        break;

      case 'ding': {
        const g = opts.soft ? 0.045 : 0.09;
        this._osc('sine', 1318.5, t, 0.42, g);
        this._osc('sine', 1975.5, t, 0.30, g * 0.45);
        this._osc('sine', 2637, t + 0.01, 0.22, g * 0.2);
        break;
      }

      case 'error':
        this._osc('square', 220, t, 0.13, 0.045);
        this._osc('square', 175, t + 0.14, 0.20, 0.045);
        break;

      case 'startup': {
        // an original warm four-note swell — not the Brian Eno one
        const chord = [261.63, 392.0, 523.25, 659.25, 783.99];
        const rev = this.ctx.createConvolver();
        rev.buffer = this._reverbIR(2.4, 2.6);
        const wet = this.ctx.createGain(); wet.gain.value = 0.55;
        rev.connect(wet); wet.connect(this.master);
        chord.forEach((f, i) => {
          const t0 = t + 0.18 + i * 0.30;
          this._osc('sine', f, t0, 1.9, 0.075, rev);
          this._osc('triangle', f * 2, t0, 1.2, 0.022, rev);
          this._osc('sine', f, t0, 1.6, 0.05);
        });
        // the low pad underneath
        this._osc('sine', 130.81, t + 0.1, 3.2, 0.055, rev);
        break;
      }

      case 'shutdown': {
        const rev = this.ctx.createConvolver();
        rev.buffer = this._reverbIR(2.0, 2.2);
        const wet = this.ctx.createGain(); wet.gain.value = 0.5;
        rev.connect(wet); wet.connect(this.master);
        [659.25, 523.25, 392.0, 261.63].forEach((f, i) => {
          this._osc('sine', f, t + i * 0.22, 1.4, 0.07, rev);
        });
        break;
      }

      case 'connected':
        this._osc('sine', 880, t, 0.10, 0.06);
        this._osc('sine', 1174.7, t + 0.10, 0.10, 0.06);
        this._osc('sine', 1567.98, t + 0.20, 0.30, 0.06);
        break;

      case 'dialup': this._dialup(); break;

      case 'music': this._music(opts); break;

      case 'bark': this._bark(); break;

      case 'lampClick':
        this._noise(t, 0.02, { gain: 0.09, type: 'bandpass', freq: 1800, q: 3 });
        this._osc('square', 90, t, 0.02, 0.03);
        break;

      case 'crtDegauss': {
        // the thunk-and-wobble of a degauss coil
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        // amplitude wobble
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 22; lg.gain.value = 0.07;
        lfo.connect(lg); lg.connect(g.gain);
        lfo.start(t); lfo.stop(t + 1.0);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 1.05);
        this._noise(t, 0.25, { gain: 0.05, type: 'lowpass', freq: 400 });
        break;
      }

      default: break;
    }
  }

  _reverbIR(seconds = 2, decay = 2) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** The full handshake. ~10 seconds, in period-correct stages. */
  _dialup() {
    const t0 = this.t;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.62;
    // telephone-line band-pass: everything sounds like it came down a wire
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 0.55;
    bus.connect(band); band.connect(this.master);

    const tone = (f1, f2, at, dur, g = 0.10) => {
      this._osc('sine', f1, at, dur, g, bus);
      if (f2) this._osc('sine', f2, at, dur, g, bus);
    };

    // 1 · off-hook, dial tone (350 + 440 Hz)
    tone(350, 440, t0 + 0.15, 0.85, 0.055);

    // 2 · DTMF for 555-0143
    const DTMF = {
      1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
      4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
      7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
      0: [941, 1336],
    };
    const number = '5550143';
    let dt = t0 + 1.15;
    for (const ch of number) {
      const [a, b] = DTMF[ch];
      tone(a, b, dt, 0.085, 0.085);
      dt += 0.145;
    }

    // 3 · ringing: two bursts of 440+480 Hz
    let rt = dt + 0.45;
    for (let i = 0; i < 2; i++) {
      tone(440, 480, rt, 1.05, 0.055);
      rt += 2.4;
    }

    // 4 · pick-up, then the V.8 answer tone (2100 Hz)
    const pt = rt - 0.55;
    this._noise(pt, 0.05, { gain: 0.06, type: 'bandpass', freq: 700, q: 1, dest: bus });
    tone(2100, 0, pt + 0.12, 1.5, 0.075);

    // 5 · the calling tone / probing chirps — the "aaaah-eeee" section
    let ct = pt + 1.75;
    const chirp = (at, f0, f1, dur, g = 0.07) => {
      const o = this.ctx.createOscillator();
      const gg = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      gg.gain.setValueAtTime(0, at);
      gg.gain.linearRampToValueAtTime(g, at + 0.02);
      gg.gain.setValueAtTime(g, at + dur - 0.03);
      gg.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(gg); gg.connect(bus);
      o.start(at); o.stop(at + dur + 0.02);
    };
    chirp(ct, 1200, 2250, 0.32);
    chirp(ct + 0.34, 2250, 1100, 0.30);
    chirp(ct + 0.68, 980, 1800, 0.22);
    tone(1800, 2400, ct + 0.95, 0.42, 0.05);

    // 6 · scrambled data bursts — noise gated into packets
    let bt = ct + 1.45;
    for (let i = 0; i < 9; i++) {
      const dur = 0.06 + Math.random() * 0.13;
      this._noise(bt, dur, {
        gain: 0.10, type: 'bandpass',
        freq: 900 + Math.random() * 1700, q: 0.8 + Math.random() * 1.6, dest: bus,
      });
      // a tonal component riding on top of each burst
      tone(700 + Math.random() * 1500, 0, bt, dur * 0.8, 0.035);
      bt += dur + 0.02 + Math.random() * 0.06;
    }

    // 7 · the final carrier: wide hiss that settles and then drops away
    const carrier = this.ctx.createBufferSource();
    carrier.buffer = this._noiseBuffer(4);
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'bandpass'; cf.frequency.value = 1800; cf.Q.value = 0.4;
    const cg = this.ctx.createGain();
    const cstart = bt + 0.05;
    cg.gain.setValueAtTime(0, cstart);
    cg.gain.linearRampToValueAtTime(0.15, cstart + 0.12);
    cg.gain.setValueAtTime(0.15, cstart + 1.5);
    cg.gain.exponentialRampToValueAtTime(0.0001, cstart + 2.4);
    cf.frequency.setValueAtTime(1200, cstart);
    cf.frequency.linearRampToValueAtTime(2400, cstart + 1.2);
    carrier.connect(cf); cf.connect(cg); cg.connect(bus);
    carrier.start(cstart); carrier.stop(cstart + 2.5);
    // the two-tone equaliser that sits under the carrier
    tone(1650, 1850, cstart, 1.9, 0.03);
  }

  /** A short looping MIDI-flavoured piece for the Media Player. */
  _music({ play = false, track = 0 } = {}) {
    for (const n of this.musicNodes) { try { n.stop?.(); } catch (e) { /* already stopped */ } }
    this.musicNodes = [];
    if (!play) return;

    const t0 = this.t + 0.05;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.28;
    const rev = this.ctx.createConvolver();
    rev.buffer = this._reverbIR(1.8, 2.4);
    const wet = this.ctx.createGain(); wet.gain.value = 0.30;
    bus.connect(this.master);
    bus.connect(rev); rev.connect(wet); wet.connect(this.master);

    const SONGS = [
      { // CANYON.MID — wandering pentatonic
        bpm: 96, wave: 'triangle',
        melody: [0, 3, 5, 7, 10, 7, 5, 3, 0, 3, 5, 10, 12, 10, 7, 5],
        bass: [-12, -12, -5, -5, -7, -7, -12, -12],
        root: 261.63,
      },
      { // PASSPORT.MID — jauntier
        bpm: 118, wave: 'square',
        melody: [0, 2, 4, 7, 4, 2, 0, -3, 0, 4, 7, 9, 7, 4, 2, 0],
        bass: [-12, -8, -5, -8],
        root: 293.66,
      },
      { // CLOUDS.MID — slow pad
        bpm: 72, wave: 'sine',
        melody: [0, 4, 7, 11, 7, 4, 0, 4],
        bass: [-12, -12, -10, -10],
        root: 220.0,
      },
    ];
    const song = SONGS[track % SONGS.length];
    const beat = 60 / song.bpm / 2;
    const note = (semi) => song.root * Math.pow(2, semi / 12);

    // schedule two bars; the Media Player re-triggers as it loops
    for (let rep = 0; rep < 8; rep++) {
      const base = t0 + rep * song.melody.length * beat;
      song.melody.forEach((s, i) => {
        const at = base + i * beat;
        const { o, g } = this._osc(song.wave, note(s), at, beat * 0.9, 0.055, bus);
        this.musicNodes.push(o);
      });
      song.bass.forEach((s, i) => {
        const at = base + i * beat * (song.melody.length / song.bass.length);
        const { o } = this._osc('sine', note(s), at, beat * 1.6, 0.075, bus);
        this.musicNodes.push(o);
      });
    }
  }

  _bark() {
    const t = this.t;
    // a small, unserious bark
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 1.4;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.14);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.2);
    this._noise(t, 0.09, { gain: 0.035, type: 'bandpass', freq: 1400, q: 1.2 });
  }
}
