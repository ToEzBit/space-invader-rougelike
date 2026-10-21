// The chibi character art, one PNG per character at one art pixel per world unit.
// Generated and pixel-snapped by art-src/chibi/; enemy kinds and boss ids double as texture keys.
import crimsonSeraph from '../assets/characters/crimsonSeraph.png';
import diver from '../assets/characters/diver.png';
import drone from '../assets/characters/drone.png';
import gunner from '../assets/characters/gunner.png';
import optionDrone from '../assets/characters/optionDrone.png';
import player from '../assets/characters/player.png';
import tank from '../assets/characters/tank.png';
import voidEmpress from '../assets/characters/voidEmpress.png';
import type { BossId, EnemyKind } from '../core/stages';

export const CHARACTER_ART = {
  player,
  optionDrone,
  drone,
  gunner,
  tank,
  diver,
  crimsonSeraph,
  voidEmpress,
} satisfies Record<EnemyKind | BossId | 'player' | 'optionDrone', string>;

export type CharacterKey = keyof typeof CHARACTER_ART;
