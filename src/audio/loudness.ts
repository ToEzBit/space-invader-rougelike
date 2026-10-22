const WINDOW_SEC = 0.05;
const PERCENTILE = 0.95;

export const BOSS1_PRE_BUS_LOUD95 = 0.2813;

export function loud95(channels: readonly Float32Array[], sampleRate: number): number {
  const win = Math.round(sampleRate * WINDOW_SEC);
  const length = Math.min(...channels.map((c) => c.length));
  const windows: number[] = [];
  for (let i = 0; i + win <= length; i += win) {
    let sum = 0;
    for (const c of channels) for (let j = i; j < i + win; j++) sum += c[j]! * c[j]!;
    windows.push(Math.sqrt(sum / (win * channels.length)));
  }
  windows.sort((a, b) => a - b);
  return windows[Math.min(windows.length - 1, Math.floor(PERCENTILE * windows.length))] ?? 0;
}

export function gainToMatch(channels: readonly Float32Array[], sampleRate: number, target = BOSS1_PRE_BUS_LOUD95): number | null {
  const loud = loud95(channels, sampleRate);
  return loud > 0 ? target / loud : null;
}
