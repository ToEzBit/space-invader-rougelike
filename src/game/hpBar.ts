import { COLORS } from '../art/palette';

export const HP_BAR_MS = 1200;
const FADE_MS = 300;
// The lost slice holds for a beat so each hit reads, then snaps down to the new HP.
const CHIP_HOLD_MS = 120;
const CHIP_TAU_MS = 40;

// `chip` is the HP ratio the white lost slice still reaches. A boss keeps 'hud': its HP lives on the HUD bar.
export type HpBar = { kind: 'hidden' } | { kind: 'hud' } | { kind: 'shown'; chip: number; holdMs: number; msLeft: number };

export const HIDDEN: HpBar = { kind: 'hidden' };

export function hpRatio({ hp, maxHp }: { hp: number; maxHp: number }): number {
  return Math.max(0, hp / maxHp);
}

// Continuous damage lands every frame, so it keeps the bar up without holding the chip again.
export function hitBar(bar: HpBar, ratioBefore: number, discrete: boolean): HpBar {
  switch (bar.kind) {
    case 'hud':
      return bar;
    case 'hidden':
      return { kind: 'shown', chip: ratioBefore, holdMs: CHIP_HOLD_MS, msLeft: HP_BAR_MS };
    case 'shown':
      return { ...bar, holdMs: discrete ? CHIP_HOLD_MS : bar.holdMs, msLeft: HP_BAR_MS };
  }
}

export function tickBar(bar: HpBar, ratio: number, dtMs: number): HpBar {
  if (bar.kind !== 'shown') return bar;
  const msLeft = bar.msLeft - dtMs;
  if (msLeft <= 0) return HIDDEN;
  if (bar.holdMs > 0) return { ...bar, holdMs: bar.holdMs - dtMs, msLeft };
  return { ...bar, chip: ratio + (bar.chip - ratio) * Math.exp(-dtMs / CHIP_TAU_MS), msLeft };
}

export type ShownBar = Extract<HpBar, { kind: 'shown' }>;

export function visibleBar(foe: { dead: boolean; hpBar: HpBar }): ShownBar | null {
  return !foe.dead && foe.hpBar.kind === 'shown' ? foe.hpBar : null;
}

export function barAlpha(bar: ShownBar): number {
  return Math.min(1, bar.msLeft / FADE_MS);
}

export function hpBarColor(ratio: number): number {
  return ratio > 0.6 ? COLORS.green : ratio > 0.3 ? COLORS.yellow : COLORS.red;
}
