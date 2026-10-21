// The chibi UI art, one PNG per asset at one art pixel per world unit, so none of it is ever scaled.
// Generated and pixel-snapped by art-src/chibi-ui/; the keys are the texture keys.
import coin0 from '../assets/ui/coin0.png';
import coin1 from '../assets/ui/coin1.png';
import coinLarge from '../assets/ui/coinLarge.png';
import heart from '../assets/ui/heart.png';
import heartEmpty from '../assets/ui/heartEmpty.png';
import iconLaser from '../assets/ui/iconLaser.png';
import iconOrbital from '../assets/ui/iconOrbital.png';
import iconRam from '../assets/ui/iconRam.png';
import iconRapid from '../assets/ui/iconRapid.png';
import itemBarrier from '../assets/ui/itemBarrier.png';
import itemNitro from '../assets/ui/itemNitro.png';
import itemOverclock from '../assets/ui/itemOverclock.png';
import itemPowerCell from '../assets/ui/itemPowerCell.png';
import itemRepairKit from '../assets/ui/itemRepairKit.png';

export const UI_ICONS = {
  heart,
  heartEmpty,
  coin0,
  coin1,
  coinLarge,
  iconRapid,
  iconLaser,
  iconRam,
  iconOrbital,
  itemRepairKit,
  itemNitro,
  itemPowerCell,
  itemOverclock,
  itemBarrier,
};

export type IconKey = keyof typeof UI_ICONS;
