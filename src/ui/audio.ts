export type SoundName = 'start' | 'flap' | 'score' | 'pause' | 'resume' | 'over';

export type AudioState = 'none' | 'running' | 'suspended' | 'closed' | 'interrupted' | 'unavailable';

/** Tiny WebAudio synth: every sound is a couple of oscillator blips, no assets. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private unavailable = false;
  private kicked = false;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Current context state, for diagnostics and tests. */
  get state(): AudioState {
    if (this.unavailable) return 'unavailable';
    if (!this.ctx) return 'none';
    return this.ctx.state as AudioState;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /**
   * Must be called from a user gesture before anything can play. Safe to call
   * on every gesture: it creates the context once, then resumes it whenever
   * the browser has suspended or interrupted it (iOS after a call, tab
   * switches, or a context created from an event Safari does not count as
   * activation). Resuming is asynchronous; sounds scheduled meanwhile still play.
   */
  unlock(): void {
    if (this.unavailable) return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.unavailable = true;
        return;
      }
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        this.unavailable = true;
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (!this.kicked) {
      // Older iOS only unlocks output once a (silent) buffer has been played.
      this.kicked = true;
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        // Not fatal: the oscillators still work on browsers without this quirk.
      }
    }
  }

  /** Test-only helper to simulate the browser suspending audio. */
  suspendForTest(): Promise<void> {
    return this.ctx ? this.ctx.suspend() : Promise.resolve();
  }

  play(name: SoundName): void {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    const t = this.ctx.currentTime;
    switch (name) {
      case 'start':
        this.tone(440, t, 0.08, 'square');
        this.tone(660, t + 0.09, 0.12, 'square');
        break;
      case 'flap':
        // A short upward chirp; quiet, because it plays on every tap.
        this.tone(560, t, 0.04, 'triangle', 0.09);
        this.tone(760, t + 0.03, 0.05, 'triangle', 0.07);
        break;
      case 'score':
        this.tone(880, t, 0.05, 'square', 0.12);
        this.tone(1320, t + 0.05, 0.08, 'square', 0.12);
        break;
      case 'pause':
        this.tone(520, t, 0.06, 'triangle');
        this.tone(390, t + 0.07, 0.08, 'triangle');
        break;
      case 'resume':
        this.tone(390, t, 0.06, 'triangle');
        this.tone(520, t + 0.07, 0.08, 'triangle');
        break;
      case 'over':
        this.tone(330, t, 0.12, 'sawtooth', 0.1);
        this.tone(240, t + 0.13, 0.14, 'sawtooth', 0.1);
        this.tone(150, t + 0.28, 0.3, 'sawtooth', 0.1);
        break;
    }
  }

  private tone(freq: number, at: number, duration: number, type: OscillatorType, gain = 0.15): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}
