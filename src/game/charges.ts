export type Charges = { count: number; msToNext: number };

// Charges refill one at a time; a full stack keeps the timer parked at a full cooldown.
export function rechargeTick(c: Charges, dtMs: number, max: number, cooldownMs: number): Charges {
  let { count, msToNext } = c;
  if (count < max) msToNext -= dtMs;
  while (count < max && msToNext <= 0) {
    count++;
    msToNext += cooldownMs;
  }
  return { count, msToNext: count >= max ? cooldownMs : msToNext };
}
