// The chibi character art, one PNG per character at one art pixel per world unit.
// Generated and pixel-snapped by art-src/chibi/; enemy kinds and boss ids double as texture keys, and each boss
// has a second-form texture of its own, plus a casting pose for that form's ultimates.
import crimsonSeraph from '../assets/characters/crimsonSeraph.png';
import crimsonSeraphAscended from '../assets/characters/crimsonSeraphAscended.png';
import crimsonSeraphAscendedCast from '../assets/characters/crimsonSeraphAscendedCast.png';
import diver from '../assets/characters/diver.png';
import drone from '../assets/characters/drone.png';
import familiar from '../assets/characters/familiar.png';
import gunner from '../assets/characters/gunner.png';
import optionDrone from '../assets/characters/optionDrone.png';
import player from '../assets/characters/player.png';
import tank from '../assets/characters/tank.png';
import voidEmpress from '../assets/characters/voidEmpress.png';
import voidEmpressEclipse from '../assets/characters/voidEmpressEclipse.png';
import voidEmpressEclipseCast from '../assets/characters/voidEmpressEclipseCast.png';
import type { BossId, EnemyKind } from '../core/stages';

export const CHARACTER_ART = {
  player,
  optionDrone,
  familiar,
  drone,
  gunner,
  tank,
  diver,
  crimsonSeraph,
  crimsonSeraphAscended,
  crimsonSeraphAscendedCast,
  voidEmpress,
  voidEmpressEclipse,
  voidEmpressEclipseCast,
} satisfies Record<EnemyKind | BossId | 'crimsonSeraphAscended' | 'crimsonSeraphAscendedCast' | 'voidEmpressEclipse' | 'voidEmpressEclipseCast' | 'player' | 'optionDrone' | 'familiar', string>;

export type CharacterKey = keyof typeof CHARACTER_ART;
