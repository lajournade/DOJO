/**
 * Sons courts synthetises a la volee (Web Audio) : aucun fichier a telecharger,
 * donc rien a attendre derriere le VPN. Muet au premier lancement.
 */
const KEY = 'dojo.muted.v1';

let ctx: AudioContext | null = null;
let muted = localStorage.getItem(KEY) !== 'off';

export const isMuted = () => muted;

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem(KEY, muted ? 'on' : 'off');
  if (!muted) void unlock();
  return muted;
}

/** iOS n'autorise l'audio qu'a partir d'un geste utilisateur. */
export async function unlock() {
  if (muted) return;
  ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();
}

function tone(opts: {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  delay?: number;
}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 1), t0 + opts.duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
}

/** Bruit blanc filtre : la composante « percussion » des impacts. */
function noise(duration: number, gain: number, freq: number) {
  if (!ctx || muted) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start();
}

export const sfx = {
  /** Serie validee : la force du son suit la puissance du coup (0 a 1). */
  hit(power = 0.5) {
    void unlock();
    noise(0.12, 0.12 + power * 0.16, 900 + power * 1400);
    tone({ type: 'square', from: 190 + power * 90, to: 55, duration: 0.14, gain: 0.1 + power * 0.1 });
  },
  select() {
    void unlock();
    tone({ type: 'square', from: 620, to: 880, duration: 0.07, gain: 0.06 });
  },
  /** Ecran VS : deux coups de gong montants. */
  vs() {
    void unlock();
    tone({ type: 'square', from: 300, to: 300, duration: 0.09, gain: 0.09 });
    tone({ type: 'square', from: 450, to: 450, duration: 0.14, gain: 0.09, delay: 0.11 });
  },
  fight() {
    void unlock();
    tone({ type: 'sawtooth', from: 180, to: 520, duration: 0.3, gain: 0.1 });
    tone({ type: 'square', from: 520, to: 300, duration: 0.22, gain: 0.09, delay: 0.28 });
  },
  /** Victoire : l'arpege de fin de combat. */
  win() {
    void unlock();
    [523, 659, 784, 1046].forEach((f, i) => {
      tone({ type: 'square', from: f, to: f, duration: 0.13, gain: 0.08, delay: i * 0.11 });
    });
  },
  ko() {
    void unlock();
    noise(0.5, 0.2, 320);
    tone({ type: 'sawtooth', from: 300, to: 45, duration: 0.7, gain: 0.16 });
  },
  /** Fin du temps de repos. */
  bell() {
    void unlock();
    tone({ type: 'triangle', from: 1180, to: 1180, duration: 0.16, gain: 0.09 });
    tone({ type: 'triangle', from: 1580, to: 1580, duration: 0.22, gain: 0.07, delay: 0.16 });
  },
  /** Montee en charge : l'arpege court d'un bonus ramasse. */
  powerup() {
    void unlock();
    [523, 698, 880, 1175].forEach((f, i) => {
      tone({ type: 'square', from: f, to: f, duration: 0.08, gain: 0.07, delay: i * 0.055 });
    });
  },
  combo(level: number) {
    void unlock();
    tone({ type: 'square', from: 520 + level * 110, to: 780 + level * 130, duration: 0.1, gain: 0.07 });
  },
};
