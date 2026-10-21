// Pixel sprites as palette-character grids (see palette.ts) for the shots, flames and particles.
// Most are drawn as left halves whose last column is the center column, then mirrored.
import { quad, sym, type Grid } from './painter';

const FLAME_A = sym(['..yc', '..yw', '...y', '...o']);
const FLAME_B = sym(['..yc', '..ow', '..oy', '....']);

const SHOT = ['.w.', 'wcw', 'wcw', 'wcw', '.c.', '.C.'];
const CRIT_SHOT = ['.w.', 'wyw', 'wyw', 'wyw', '.o.', '.o.'];
const MISSILE = sym(['.kw', '.kc', 'kWc', 'kWc', 'kSs', 'Sks', 'k.y', '..o']);
const PELLET = quad(['.k', 'kp', 'pw']);
const NEEDLE = ['.r.', 'rhr', 'rhr', 'rhr', '.r.'];
const ORB = quad(['..k', '.kP', 'kPp', 'Ppw']);
const VOID_ORB = quad(['..k', '.kV', 'kVv', 'Vvw']);

const SPARK = ['w'];
const PIXEL = ['ww', 'ww'];

export const SPRITES = {
  flame0: FLAME_A,
  flame1: FLAME_B,
  shot: SHOT,
  critShot: CRIT_SHOT,
  missile: MISSILE,
  pellet: PELLET,
  needle: NEEDLE,
  orb: ORB,
  voidOrb: VOID_ORB,
  spark: SPARK,
  pixel: PIXEL,
} satisfies Record<string, Grid>;

export type SpriteKey = keyof typeof SPRITES;

// Every sprite is baked at this many screen pixels per art pixel.
export const ART_SCALE = 2;
