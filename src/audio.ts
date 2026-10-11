import { MUTE_KEY } from "./constants";
import type { CollectKind } from "./collectibles";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  const legacy = window as Window & { webkitAudioContext?: AudioCtor };
  return window.AudioContext ?? legacy.webkitAudioContext ?? null;
}

export type ShoreAudio = {
  unlock: () => void;
  scrape: (force: number, wet: number) => void;
  splash: () => void;
  cry: () => void;
  blip: (kind: CollectKind | "friend" | "build") => void;
  honk: (soft?: boolean) => void;
  wash: (amount: number) => void;
  toggleMuted: () => boolean;
  readonly muted: boolean;
};

export function createAudio(): ShoreAudio {
  let context: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let master: GainNode | null = null;
  let windGain: GainNode | null = null;
  let waveGain: GainNode | null = null;
  let waveFilter: BiquadFilterNode | null = null;
  let muted = readMuted();
  let lastScrape = 0;
  let lastSplash = 0;
  let lastHonk = 0;

  function ensure(): AudioContext | null {
    if (context) return context;
    const Ctor = audioCtor();
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(context.destination);

    const length = context.sampleRate * 2;
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.98 + white * 0.02;
      data[i] = brown * 3.2;
    }

    const windSource = context.createBufferSource();
    windSource.buffer = noise;
    windSource.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 520;
    windGain = context.createGain();
    windGain.gain.value = 0.03;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    const waveSource = context.createBufferSource();
    waveSource.buffer = noise;
    waveSource.loop = true;
    waveFilter = context.createBiquadFilter();
    waveFilter.type = "bandpass";
    waveFilter.frequency.value = 320;
    waveFilter.Q.value = 0.55;
    waveGain = context.createGain();
    waveGain.gain.value = 0.02;
    waveSource.connect(waveFilter);
    waveFilter.connect(waveGain);
    waveGain.connect(master);
    waveSource.start();
    return context;
  }

  function tone(freq: number, dur: number, gain: number, type: OscillatorType, delay: number): void {
    const ctx = ensure();
    if (!ctx || !master || muted) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  return {
    get muted() {
      return muted;
    },
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    scrape(force, wet) {
      const ctx = ensure();
      if (!ctx || !noise || !master || muted) return;
      const now = ctx.currentTime;
      if (now - lastScrape < 0.06) return;
      lastScrape = now;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      const dry = wet < 0.45;
      filter.frequency.value = dry ? 1600 + Math.random() * 1800 : 420 + Math.random() * 380;
      filter.Q.value = dry ? 0.8 : 0.6;
      const amp = ctx.createGain();
      const peak = (dry ? 0.09 : 0.07) * (0.45 + Math.min(1, force));
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(peak, now + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + (dry ? 0.09 : 0.16));
      source.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      source.start(now);
      source.stop(now + 0.18);
    },
    splash() {
      const ctx = ensure();
      if (!ctx || !noise || !master || muted) return;
      const now = ctx.currentTime;
      if (now - lastSplash < 0.12) return;
      lastSplash = now;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(240, now + 0.22);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      source.start(now);
      source.stop(now + 0.3);
    },
    cry() {
      const ctx = ensure();
      if (!ctx || !master || muted) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.22);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(0.035, now + 0.04);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(amp);
      amp.connect(master);
      osc.start(now);
      osc.stop(now + 0.34);
      tone(1680, 0.16, 0.02, "sine", 0.26);
    },
    blip(kind) {
      switch (kind) {
        case "shell":
          tone(880, 0.08, 0.04, "sine", 0);
          tone(1320, 0.1, 0.03, "sine", 0.07);
          break;
        case "coin":
          tone(988, 0.07, 0.035, "triangle", 0);
          tone(1318, 0.1, 0.03, "triangle", 0.06);
          tone(1568, 0.12, 0.025, "sine", 0.12);
          break;
        case "castle":
          tone(392, 0.1, 0.03, "triangle", 0);
          tone(523, 0.12, 0.028, "triangle", 0.08);
          tone(659, 0.16, 0.026, "triangle", 0.16);
          break;
        case "friend":
          tone(523, 0.1, 0.03, "sine", 0);
          tone(659, 0.12, 0.028, "sine", 0.1);
          tone(784, 0.16, 0.025, "sine", 0.2);
          break;
        case "build":
          tone(349, 0.1, 0.028, "triangle", 0);
          tone(440, 0.12, 0.024, "triangle", 0.08);
          break;
        default: {
          const leftover: never = kind;
          void leftover;
        }
      }
    },
    honk(soft = false) {
      const ctx = ensure();
      if (!ctx || !master || muted) return;
      const now = ctx.currentTime;
      if (now - lastHonk < (soft ? 0.45 : 0.7)) return;
      lastHonk = now;
      // Tiny donkey-bray vibe, kept soft for African penguin chatter.
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const start = soft ? 420 : 360;
      const end = soft ? 620 : 520;
      osc.frequency.setValueAtTime(start, now);
      osc.frequency.exponentialRampToValueAtTime(end, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(start * 0.85, now + 0.18);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = soft ? 700 : 560;
      filter.Q.value = 1.2;
      const amp = ctx.createGain();
      const peak = soft ? 0.018 : 0.028;
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(peak, now + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      osc.start(now);
      osc.stop(now + 0.24);
      if (!soft) tone(480, 0.1, 0.012, "square", 0.14);
    },
    wash(amount) {
      const ctx = context;
      if (!ctx || !waveGain || !waveFilter || !windGain || muted) return;
      const now = ctx.currentTime;
      const wash = amount < 0 ? 0 : amount > 1 ? 1 : amount;
      waveGain.gain.setTargetAtTime(0.018 + wash * 0.07, now, 0.12);
      waveFilter.frequency.setTargetAtTime(260 + wash * 740, now, 0.15);
      const breeze = 0.022 + Math.sin(now * 0.17) * 0.006;
      windGain.gain.setTargetAtTime(breeze, now, 0.4);
    },
    toggleMuted() {
      muted = !muted;
      writeMuted(muted);
      if (master && context) {
        const now = context.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(muted ? 0 : 0.9, now, 0.04);
      }
      return muted;
    },
  };
}
