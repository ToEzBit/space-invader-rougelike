import type { Charges } from './charges';

// `progress` runs 0 to 1 as the cooldown elapses. `refill` is the next charge's progress while spare charges remain.
export type SkillMeter =
  | { kind: 'ready'; charges: number; maxCharges: number; refill: number | null }
  | { kind: 'active'; ratioLeft: number }
  | { kind: 'cooling'; msLeft: number; progress: number; charges: number; maxCharges: number };

export const READY: SkillMeter = { kind: 'ready', charges: 1, maxCharges: 1, refill: null };

export function cooldownMeter(msLeft: number, cooldownMs: number): SkillMeter {
  return { kind: 'cooling', msLeft, progress: elapsed(msLeft, cooldownMs), charges: 0, maxCharges: 1 };
}

export function chargesMeter({ count, msToNext }: Charges, max: number, cooldownMs: number): SkillMeter {
  if (count === 0) return { kind: 'cooling', msLeft: msToNext, progress: elapsed(msToNext, cooldownMs), charges: 0, maxCharges: max };
  return { kind: 'ready', charges: count, maxCharges: max, refill: count < max ? elapsed(msToNext, cooldownMs) : null };
}

function elapsed(msLeft: number, cooldownMs: number): number {
  return Math.min(1, Math.max(0, 1 - msLeft / cooldownMs));
}

// Phaser angles grow clockwise from 3 o'clock, and a cooldown sweep starts at 12 o'clock.
export function sweepAngle(progress: number): number {
  return -Math.PI / 2 + progress * Math.PI * 2;
}
