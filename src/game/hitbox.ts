import type { EnemyKind } from '../core/stages';

// Collision circles in world units. They are fixed here, not read off the sprites, so new art never moves gameplay.
export const FOE_RADIUS: Record<EnemyKind, number> = { drone: 10.8, gunner: 11.7, tank: 12.6, diver: 11.7 };
export const BOSS_RADIUS = 42;
// Enemy bullets only count when they reach the cockpit, as in most shmups.
export const PLAYER_RADIUS = { core: 5, body: 14 } as const;
