export type Point = { x: number; y: number };

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function circlesOverlap(a: Point, ra: number, b: Point, rb: number): boolean {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= (ra + rb) ** 2;
}

// Angle 0 points straight up the screen; positive angles lean right.
export function rayEnd(origin: Point, angleDeg: number, length: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: origin.x + Math.sin(rad) * length, y: origin.y - Math.cos(rad) * length };
}

export type Box = { left: number; right: number; top: number; bottom: number };

// Moves `distance` along `dir`, normalized so a diagonal is no faster than a straight line, then clamps into `box`.
export function stepWithin(from: Point, dir: Point, distance: number, box: Box): Point {
  const len = Math.hypot(dir.x, dir.y);
  const k = len === 0 ? 0 : distance / len;
  return {
    x: Math.min(box.right, Math.max(box.left, from.x + dir.x * k)),
    y: Math.min(box.bottom, Math.max(box.top, from.y + dir.y * k)),
  };
}

// Moves at most `distance` straight toward `target` and lands exactly on it once it is in reach, so it never overshoots.
export function stepToward(from: Point, target: Point, distance: number, box: Box): Point {
  const dir = { x: target.x - from.x, y: target.y - from.y };
  if (Math.hypot(dir.x, dir.y) > distance) return stepWithin(from, dir, distance, box);
  return { x: Math.min(box.right, Math.max(box.left, target.x)), y: Math.min(box.bottom, Math.max(box.top, target.y)) };
}
