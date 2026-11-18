// Sound, synthesized only: WebAudio bleeps for actions and a low engine hum
// that follows the car's speed. No audio files, no network. Everything is
// created lazily on the first user gesture, so browsers allow it.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  /** A short beep at `freq` Hz for `dur` seconds, quiet. */
  function beep(freq, dur, type, volume) {
    if (muted || !ensure()) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume ?? 0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock() {
      ensure();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      return muted;
    },
    click() {
      beep(660, 0.07, 'square', 0.05);
    },
    cash() {
      beep(880, 0.09, 'sine', 0.08);
      setTimeout(() => beep(1320, 0.14, 'sine', 0.08), 90);
    },
    siren() {
      beep(740, 0.16, 'sawtooth', 0.04);
      setTimeout(() => beep(520, 0.16, 'sawtooth', 0.04), 160);
    },
    punch() {
      beep(140, 0.08, 'sawtooth', 0.09);
    },
    shot() {
      beep(180, 0.1, 'sawtooth', 0.1);
    },
    crash() {
      beep(90, 0.18, 'sawtooth', 0.1);
    },
    /** Engine hum: call every frame with the car's speed (0 when on foot). */
    engine(speed, driving) {
      if (!ensure() || muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      try {
        if (ctx.state === 'suspended') void ctx.resume();
        const target = driving ? 0.035 + Math.min(0.05, Math.abs(speed) / 9000) : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.16, ctx.currentTime, 0.1);
      } catch {
        // Ignore audio errors.
      }
    },
  };
}
