let ctx: AudioContext | null = null;
let held = false;
const ready: ((ctx: AudioContext) => void)[] = [];

// Browsers refuse audio before a user gesture, so the one context sfx and music share is created on the first one.
// A touch's pointerdown is not a user activation, so iOS starts that context suspended until the finger lifts.
for (const event of ['keydown', 'pointerdown', 'pointerup', 'touchend'] as const)
  window.addEventListener(event, () => {
    if (!ctx) {
      ctx = new AudioContext();
      for (const fn of ready) fn(ctx);
    }
    if (held) void ctx.suspend();
    else if (ctx.state === 'suspended') void ctx.resume();
  });

// A held context stays suspended through taps, so every sound freezes with the game.
export function holdAudio(on: boolean): void {
  held = on;
  if (ctx) void (on ? ctx.suspend() : ctx.resume());
}

export function audioContext(): AudioContext | null {
  return ctx;
}

export function onAudio(fn: (ctx: AudioContext) => void): void {
  if (ctx) fn(ctx);
  else ready.push(fn);
}

export async function fetchAudio(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return `HTTP ${res.status}`;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (e) {
    return e instanceof Error ? e.name : String(e);
  }
}
