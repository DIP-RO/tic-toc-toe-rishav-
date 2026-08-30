// Procedural sound effects + ambient music via Web Audio API — no audio files needed.
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private musicEnabled = true;
  private musicVol = 0.35;
  private masterMusicGain: GainNode | null = null;
  private musicPlaying = false;
  private musicTimer: number | null = null;

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  setMusicEnabled(v: boolean) {
    this.musicEnabled = v;
    if (v) this.startMusic();
    else this.stopMusic();
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.max(0, Math.min(1, v));
    if (this.masterMusicGain && this.ctx) {
      this.masterMusicGain.gain.linearRampToValueAtTime(this.musicVol * 0.5, this.ctx.currentTime + 0.3);
    }
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new Ctor();
      } catch { return null; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  // Resume on first user gesture (mobile autoplay policy).
  unlock() {
    this.ensure();
    if (this.musicEnabled && !this.musicPlaying) this.startMusic();
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.18, delay = 0) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private sweep(f1: number, f2: number, dur: number, type: OscillatorType = "sawtooth", vol = 0.15) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ===== Ambient music =====
  // Calm, slow pad using detuned oscillators with slow LFO volume swells.
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.musicPlaying) return;
    if (!this.musicEnabled) return;
    this.musicPlaying = true;

    this.masterMusicGain = ctx.createGain();
    this.masterMusicGain.gain.setValueAtTime(0, ctx.currentTime);
    this.masterMusicGain.gain.linearRampToValueAtTime(this.musicVol * 0.5, ctx.currentTime + 3);
    this.masterMusicGain.connect(ctx.destination);

    // Soft reverb-like delay for spaciousness
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.45;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.4;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(this.masterMusicGain);

    // A calm chord progression in a pentatonic/lydian feel.
    // Root notes cycle slowly: C3, A2, F2, G2 — relaxed, unresolved.
    const chordRoots = [130.81, 110.0, 87.31, 98.0]; // C3, A2, F2, G2
    const intervals = [1, 1.5, 2, 2.5, 3]; // root, fifth, octave, etc.

    const playChord = (rootFreq: number) => {
      if (!this.ctx || !this.musicPlaying) return;
      const now = this.ctx.currentTime;
      for (const ratio of intervals) {
        const freq = rootFreq * ratio;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        // Slight detune for warmth
        osc.detune.value = (Math.random() - 0.5) * 8;

        // Slow LFO for volume swell
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = "sine";
        lfo.frequency.value = 0.08 + Math.random() * 0.06; // very slow
        lfoGain.gain.value = 0.015;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.018, now + 2.5);
        gain.gain.linearRampToValueAtTime(0, now + 7);

        osc.connect(gain);
        gain.connect(this.masterMusicGain!);
        gain.connect(delay); // send to reverb

        osc.start(now);
        lfo.start(now);
        osc.stop(now + 7.5);
        lfo.stop(now + 7.5);

        // cleanup
        osc.onended = () => { try { osc.disconnect(); gain.disconnect(); lfo.disconnect(); lfoGain.disconnect(); } catch { /* */ } };
      }
    };

    let chordIdx = 0;
    playChord(chordRoots[chordIdx]);
    // Schedule next chord every 6 seconds
    this.musicTimer = window.setInterval(() => {
      if (!this.musicPlaying) return;
      chordIdx = (chordIdx + 1) % chordRoots.length;
      playChord(chordRoots[chordIdx]);
    }, 6000);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.masterMusicGain && this.ctx) {
      this.masterMusicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
    }
    // Let existing oscillators fade out naturally; they auto-stop.
    setTimeout(() => {
      if (this.masterMusicGain) { try { this.masterMusicGain.disconnect(); } catch { /* */ } this.masterMusicGain = null; }
    }, 2000);
  }

  place() { this.tone(440, 0.12, "triangle", 0.16); this.tone(660, 0.1, "sine", 0.1, 0.02); }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.18, i * 0.1));
  }
  lose() { this.sweep(400, 120, 0.5, "sawtooth", 0.16); }
  draw() { this.tone(330, 0.2, "square", 0.12); this.tone(294, 0.25, "square", 0.1, 0.15); }
  click() { this.tone(800, 0.05, "square", 0.08); }
  achievement() {
    [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.18, "sine", 0.16, i * 0.08));
  }
  levelup() {
    [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.2, i * 0.09));
  }
  invalid() { this.tone(180, 0.12, "square", 0.1); }
}
