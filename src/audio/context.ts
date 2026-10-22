let ctx: AudioContext | null = null;
const ready: ((ctx: AudioContext) => void)[] = [];

// Browsers refuse audio before a user gesture, so the one context sfx and music share is created on the first one.
for (const event of ['keydown', 'pointerdown'] as const)
  window.addEventListener(event, () => {
    if (ctx) return;
    ctx = new AudioContext();
    for (const fn of ready) fn(ctx);
  });

export function audioContext(): AudioContext | null {
  return ctx;
}

export function onAudio(fn: (ctx: AudioContext) => void): void {
  if (ctx) fn(ctx);
  else ready.push(fn);
}
