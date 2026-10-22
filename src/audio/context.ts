let ctx: AudioContext | null = null;
const ready: ((ctx: AudioContext) => void)[] = [];

// Browsers refuse audio before a user gesture, so the one context sfx and music share is created on the first one.
// A touch's pointerdown is not a user activation, so iOS starts that context suspended until the finger lifts.
for (const event of ['keydown', 'pointerdown', 'pointerup', 'touchend'] as const)
  window.addEventListener(event, () => {
    if (!ctx) {
      ctx = new AudioContext();
      for (const fn of ready) fn(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  });

export function audioContext(): AudioContext | null {
  return ctx;
}

export function onAudio(fn: (ctx: AudioContext) => void): void {
  if (ctx) fn(ctx);
  else ready.push(fn);
}
