import { describe, expect, it } from 'vitest';
import { BOSS_RADIUS, FOE_RADIUS, PLAYER_RADIUS } from './hitbox';

describe('hit radii', () => {
  it('stay at the values the game was balanced with', () => {
    expect(FOE_RADIUS).toEqual({ drone: 10.8, gunner: 11.7, tank: 12.6, diver: 11.7 });
    expect(BOSS_RADIUS).toBe(42);
    expect(PLAYER_RADIUS).toEqual({ core: 5, body: 14 });
  });
});
