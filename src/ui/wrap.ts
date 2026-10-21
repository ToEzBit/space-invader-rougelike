// Thai has no spaces between words, so wrap on dictionary word boundaries instead of spaces.
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });

export function wrapWords(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const { segment } of segmenter.segment(text)) {
    const next = line + segment;
    if (line && measure(next.trimEnd()) > maxWidth) {
      lines.push(line.trimEnd());
      line = segment.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}
