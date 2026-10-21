import { describe, expect, it } from 'vitest';
import { wrapWords } from './wrap';

describe('wrapWords', () => {
  const measure = (s: string) => [...s].length;

  it('breaks Thai text between words, never inside one', () => {
    const text = 'ยิงเร็วขึ้น ช่วงห่างกระสุนเหลือ 85%';
    const lines = wrapWords(text, 12, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
    for (const line of lines.slice(0, -1)) expect(measure(line)).toBeLessThanOrEqual(12);
  });

  it('keeps short text on one line', () => {
    expect(wrapWords('ดาเมจกระสุน +1', 40, measure)).toEqual(['ดาเมจกระสุน +1']);
  });
});
