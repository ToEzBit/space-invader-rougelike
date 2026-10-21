import { VIEW } from '../view';

export const PLAYER_Y = 572;
export const PLAYFIELD = { left: 14, right: VIEW.w - 14, top: 44 } as const;
// A ranked enemy reaching this line has overrun the ship.
export const BREACH_Y = PLAYER_Y - 26;
export const DASH_APEX_Y = 70;

export const DEPTH = {
  foe: 10,
  playerShot: 14,
  enemyShot: 20,
  beam: 24,
  player: 30,
  fx: 40,
  banner: 90,
  hud: 100,
} as const;
