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
