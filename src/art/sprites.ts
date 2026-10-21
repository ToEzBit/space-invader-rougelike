// Pixel sprites as palette-character grids (see palette.ts). Most are drawn as left halves
// whose last column is the center column, then mirrored.
import { COMPOSED_ART } from './composed';
import { quad, sym, type Grid } from './painter';
import type { BossId, EnemyKind } from '../core/stages';

const FLAME_A = sym(['..yc', '..yw', '...y', '...o']);
const FLAME_B = sym(['..yc', '..ow', '..oy', '....']);

const DRONE_TOP = ['......y', '......k', '...kkkk', '..kcccc', '.kcWccc'];
const DRONE_A = sym([
  ...DRONE_TOP,
  'kkckkcc',
  'tkcwCcc',
  'tkcCCcc',
  'kkpcccc',
  '.kcccck',
  '..kkkkk',
  '....o..',
]);
const DRONE_B = sym([
  ...DRONE_TOP,
  '.kckkcc',
  'kkcwCcc',
  'tkcCCcc',
  'tkpcccc',
  'kkcccck',
  '..kkkkk',
  '...y...',
]);

const GUNNER_FACE = ['.kpPkpPp', '.kpkmkpm', '.kpmkkmm', 'kpkmwgmm', 'kpkmggmm'];
const GUNNER_A = sym([
  '.....kkk',
  'k...kppp',
  'pk.kphhp',
  'Ppkppppp',
  ...GUNNER_FACE,
  'Ppknmmmm',
  'Pp.kmmmr',
  'pk.kSSSS',
  'k..kScyy',
]);
const GUNNER_B = sym([
  '.....kkk',
  '....kppp',
  'k..kphhp',
  'pkkppppp',
  ...GUNNER_FACE,
  'k.knmmmm',
  '...kmmmr',
  '...kSSSS',
  '...kScyy',
]);

const TANK_A = sym([
  '....kkkk',
  '...ksSSs',
  '..ksSvvv',
  '.ksSvlvv',
  'kSsSvvvv',
  'kssSkkkk',
  'kSsSkyrr',
  'kSskkmmm',
  'kssSwrmm',
  'kSsSrRmm',
  '.kSSnmmk',
  '.kVVVVVV',
  '.kVvkvVy',
  '..kkkkkk',
]);
const TANK_B = sym([
  '....kkkk',
  '...ksSSs',
  '..ksSvvv',
  '.ksSvlvv',
  'kSsSvvvv',
  'kssSkkkk',
  'kSsSkrry',
  'kSskkmmm',
  'kssSwrmm',
  'kSsSrRmm',
  '.kSSnmmk',
  '.kVVVVVV',
  '.kVvkvVo',
  '..kkkkkk',
]);

const DIVER_A = sym([
  'kk......',
  'kok...kk',
  'kOok.kko',
  'kOoookoo',
  '.kooooyo',
  '.kokkooo',
  'koomkmkm',
  'koowrmmm',
  'koorrmmm',
  '.konmmmm',
  '..kkmmmk',
  '...kRRRr',
  '....kkkk',
]);
const DIVER_B = sym([
  '........',
  'kk....kk',
  'kOk..kko',
  'kOookkoo',
  '.kooooyo',
  '.kokkooo',
  'koomkmkm',
  'koowrmmm',
  'koorrmmm',
  '.konmmmm',
  '..kkmmmk',
  '...kRRRr',
  '....kkkk',
]);

const SHOT = ['.w.', 'wcw', 'wcw', 'wcw', '.c.', '.C.'];
const CRIT_SHOT = ['.w.', 'wyw', 'wyw', 'wyw', '.o.', '.o.'];
const MISSILE = sym(['.kw', '.kc', 'kWc', 'kWc', 'kSs', 'Sks', 'k.y', '..o']);
const PELLET = quad(['.k', 'kp', 'pw']);
const NEEDLE = ['.r.', 'rhr', 'rhr', 'rhr', '.r.'];
const ORB = quad(['..k', '.kP', 'kPp', 'Ppw']);
const VOID_ORB = quad(['..k', '.kV', 'kVv', 'Vvw']);

const OPTION_DRONE = sym(['..kk', '.kcc', 'kcwc', 'kCck', '.kCC', '..ky']);

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
const ITEM_POWER_CELL = [
  '..sss..',
  'kkkkkkk',
  'kRrrwyk',
  'kRrwyrk',
  'kRwyyyk',
  'kRryyrk',
  'kRyyrrk',
  'kyyrrrk',
  'kRrrrrk',
  'kkkkkkk',
];
const ITEM_OVERCLOCK = ['...k...', '..kyk..', '.kkkkk.', 'kYyyyYk', 'kyywyyk', 'kyywyyk', 'kyyywwk', 'kYyyyYk', '.kkkkk.'];
const ITEM_BARRIER = sym(['kkkk', 'kwcc', 'kwcc', 'kcCc', '.kCc', '.kCC', '..kC', '...k']);

const SPARK = ['w'];
const PIXEL = ['ww', 'ww'];

export const SPRITES = {
  flame0: FLAME_A,
  flame1: FLAME_B,
  drone0: DRONE_A,
  drone1: DRONE_B,
  gunner0: GUNNER_A,
  gunner1: GUNNER_B,
  tank0: TANK_A,
  tank1: TANK_B,
  diver0: DIVER_A,
  diver1: DIVER_B,
  ...COMPOSED_ART,
  shot: SHOT,
  critShot: CRIT_SHOT,
  missile: MISSILE,
  pellet: PELLET,
  needle: NEEDLE,
  orb: ORB,
  voidOrb: VOID_ORB,
  optionDrone: OPTION_DRONE,
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

export const ENEMY_FRAMES: Record<EnemyKind, readonly [SpriteKey, SpriteKey]> = {
  drone: ['drone0', 'drone1'],
  gunner: ['gunner0', 'gunner1'],
  tank: ['tank0', 'tank1'],
  diver: ['diver0', 'diver1'],
};

export const BOSS_SPRITE: Record<BossId, SpriteKey> = {
  crimsonSeraph: 'crimsonSeraph',
  voidEmpress: 'voidEmpress',
};
