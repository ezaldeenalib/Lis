/** Short lab-alert tone via Web Audio (no external file). */
let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/** Unlock audio after a user gesture (browser autoplay policy). */
export function primeNotificationSound(): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== 'suspended') return;
  void ctx.resume();
}

export function playNotificationSound(): void {
  const ctx = getContext();
  if (!ctx) return;

  const run = () => {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.setValueAtTime(1174.66, t0 + 0.08);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.36);
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}
