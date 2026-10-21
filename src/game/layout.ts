import { VIEW } from '../view';

export const PLAYER_Y = 572;
// The ship's center roams this band; it spawns on the bottom edge.
export const PLAYER_ZONE = { top: 384, bottom: PLAYER_Y } as const;
export const PLAYFIELD = { left: 14, right: VIEW.w - 14, top: 44 } as const;
// A ranked enemy reaching this line has overrun the ship.
export const BREACH_Y = PLAYER_Y - 26;
export const DASH_APEX_Y = 70;

export const DEPTH = {
  foe: 10,
  playerShot: 14,
  // Under enemy shots and the ship, so the bottom-left skill tray never hides either.
  skillTray: 18,
  enemyShot: 20,
  beam: 24,
  player: 30,
  fx: 40,
  banner: 90,
  hud: 100,
} as const;
