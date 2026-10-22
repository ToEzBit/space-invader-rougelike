import { describe, expect, it } from 'vitest';
import { SECTORS, sectorFor } from './sectors';
import { STAGE_COUNT } from './stages';

describe('sectors', () => {
  it('give every stage its own place', () => {
    expect(SECTORS).toHaveLength(STAGE_COUNT);
    for (let stage = 1; stage <= STAGE_COUNT; stage++) expect(sectorFor(stage)).toBe(SECTORS[stage - 1]);
    expect(new Set(SECTORS.map((s) => s.name)).size).toBe(STAGE_COUNT);
  });
});
