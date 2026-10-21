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
