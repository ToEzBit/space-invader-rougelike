// Center x of the column-wide strip holding the most targets, or null when there are none.
export function densestColumn(xs: readonly number[], width: number): number | null {
  const counts = new Map<number, number>();
  for (const x of xs) {
    const bucket = Math.floor(x / width);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [bucket, count] of counts) {
    if (count > bestCount) [best, bestCount] = [bucket, count];
  }
  return best === null ? null : (best + 0.5) * width;
}
