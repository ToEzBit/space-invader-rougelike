export type Grid = readonly string[];

// Mirrors right-aligned left halves (last char is the center column) into a symmetric grid.
export function sym(rows: readonly string[]): Grid {
  const half = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const left = r.padStart(half, '.');
    return left + [...left.slice(0, -1)].reverse().join('');
  });
}

// Mirrors a top-left quarter both ways, for round bullets and orbs.
export function quad(rows: readonly string[]): Grid {
  const top = sym(rows);
  return [...top, ...top.slice(0, -1).reverse()];
}

// A palette-character canvas for composing large sprites from shapes, then outlining them.
export class Pixels {
  private readonly px: string[][];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }

  set(x: number, y: number, c: string): this {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && yi >= 0 && xi < this.w && yi < this.h) this.px[yi]![xi] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 <= 1) this.set(x, y, c);
    return this;
  }

  ring(cx: number, cy: number, rx: number, ry: number, c: string, thickness = 1): this {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const outer = ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2;
        const inner = ((x - cx) / (rx + 0.5 - thickness)) ** 2 + ((y - cy) / (ry + 0.5 - thickness)) ** 2;
        if (outer <= 1 && inner > 1) this.set(x, y, c);
      }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string, width = 1): this {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    const r = (width - 1) / 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      if (width <= 1) this.set(x, y, c);
      else this.ellipse(x, y, r, r, c);
    }
    return this;
  }

  poly(points: readonly (readonly [number, number])[], c: string): this {
    const ys = points.map((p) => p[1]);
    const xs = points.map((p) => p[0]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++)
        if (inside(points, x + 0.5, y + 0.5)) this.set(x, y, c);
    return this;
  }

  stamp(grid: Grid, x: number, y: number): this {
    grid.forEach((row, j) => [...row].forEach((c, i) => c !== '.' && this.set(x + i, y + j, c)));
    return this;
  }

  // Copies the left half onto the right so a sprite only needs drawing once.
  mirror(): this {
    for (const row of this.px) for (let x = 0; x < this.w / 2; x++) row[this.w - 1 - x] = row[x]!;
    return this;
  }

  outline(c = 'k'): this {
    const filled = this.px.map((row) => row.map((p) => p !== '.'));
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!filled[y]![x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled[y + dy!]?.[x + dx!]))
          this.px[y]![x] = c;
    return this;
  }

  grid(): Grid {
    return this.px.map((row) => row.join(''));
  }
}

function inside(points: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
