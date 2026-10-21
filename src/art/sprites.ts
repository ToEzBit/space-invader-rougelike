// Pixel sprites as palette-character grids (see palette.ts) for everything but the characters.
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

const COIN_A = sym(['..k', '.ky', 'kyw', 'kyY', 'kyY', '.kY', '..k']);
const COIN_B = sym(['.k', 'ky', 'ky', 'kw', 'ky', 'kY', '.k']);

const HEART = sym(['.kk.', 'krrk', 'krwr', 'krrr', '.krr', '..kr', '...k']);
const HEART_EMPTY = sym(['.kk.', 'kKKk', 'kKKK', 'kKKK', '.kKK', '..kK', '...k']);

const ICON_RAPID = sym(['...k', '..kw', '..kc', 'k.kc', 'w.kc', 'c.kC', 'c..k', 'C...']);
const ICON_LASER = sym(['..kw', '..kc', '..kc', '.kcw', '.kcw', 'kcww', 'kcww', '.kcw']);
const ICON_RAM = sym(['...k', '..ko', '.koy', '.koy', 'koyw', 'koyw', '.kOo', '..kO']);
const ICON_ORBITAL = sym(['CCsw', '.Csy', '...y', '..yw', 'r.yw', 'r.yw', 'r.yw', 'rryw']);

const ITEM_REPAIR_KIT = sym(['..ss', '.s..', 'kkkk', 'kGgw', 'kwww', 'kGgw', 'kGGg', 'kkkk']);
const ITEM_NITRO = sym(['...y', '..yo', '..ss', '.kVl', '.kvv', '.kVv', '.kVV', '..kk']);
const ITEM_POWER_CELL = ['..sss..', 'kkkkkkk', 'kRrrywk', 'kRryyrk', 'kRyyyyk', 'kRryyrk', 'kRyyrrk', 'kkkkkkk'];
const ITEM_OVERCLOCK = ['..kyk..', '.kkkkk.', 'kYyyyYk', 'kyywyyk', 'kyywyyk', 'kyyywwk', 'kYyyyYk', '.kkkkk.'];
const ITEM_BARRIER = sym(['kkkk', 'kwcc', 'kwcc', 'kcCc', '.kCc', '.kCC', '..kC', '...k']);

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
  coin0: COIN_A,
  coin1: COIN_B,
  heart: HEART,
  heartEmpty: HEART_EMPTY,
  iconRapid: ICON_RAPID,
  iconLaser: ICON_LASER,
  iconRam: ICON_RAM,
  iconOrbital: ICON_ORBITAL,
  itemRepairKit: ITEM_REPAIR_KIT,
  itemNitro: ITEM_NITRO,
  itemPowerCell: ITEM_POWER_CELL,
  itemOverclock: ITEM_OVERCLOCK,
  itemBarrier: ITEM_BARRIER,
  spark: SPARK,
  pixel: PIXEL,
} satisfies Record<string, Grid>;

export type SpriteKey = keyof typeof SPRITES;

// Every sprite is baked at this many screen pixels per art pixel.
export const ART_SCALE = 2;
