// The chibi character art, one PNG per character at one art pixel per world unit.
// Generated and pixel-snapped by art-src/chibi/; enemy kinds and boss ids double as texture keys, and each boss
// has a second-form texture of its own.
import crimsonSeraph from '../assets/characters/crimsonSeraph.png';
import crimsonSeraphAscended from '../assets/characters/crimsonSeraphAscended.png';
import diver from '../assets/characters/diver.png';
import drone from '../assets/characters/drone.png';
import gunner from '../assets/characters/gunner.png';
import optionDrone from '../assets/characters/optionDrone.png';
import player from '../assets/characters/player.png';
import tank from '../assets/characters/tank.png';
import voidEmpress from '../assets/characters/voidEmpress.png';
import voidEmpressEclipse from '../assets/characters/voidEmpressEclipse.png';
import type { BossId, EnemyKind } from '../core/stages';

export const CHARACTER_ART = {
  player,
  optionDrone,
  drone,
  gunner,
  tank,
  diver,
  crimsonSeraph,
  crimsonSeraphAscended,
  voidEmpress,
  voidEmpressEclipse,
} satisfies Record<EnemyKind | BossId | 'crimsonSeraphAscended' | 'voidEmpressEclipse' | 'player' | 'optionDrone', string>;

export type CharacterKey = keyof typeof CHARACTER_ART;
