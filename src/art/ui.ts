// The chibi UI art, one PNG per asset at one art pixel per world unit, so none of it is ever scaled.
// Generated and pixel-snapped by art-src/chibi-ui/; the keys are the texture keys.
import button from '../assets/ui/button.png';
import buttonAccent from '../assets/ui/buttonAccent.png';
import buttonAccentHover from '../assets/ui/buttonAccentHover.png';
import buttonDisabled from '../assets/ui/buttonDisabled.png';
import buttonHover from '../assets/ui/buttonHover.png';
import chipGold from '../assets/ui/chipGold.png';
import chipGraze from '../assets/ui/chipGraze.png';
import chipLaser from '../assets/ui/chipLaser.png';
import chipRam from '../assets/ui/chipRam.png';
import chipRapid from '../assets/ui/chipRapid.png';
import chipSummon from '../assets/ui/chipSummon.png';
import coin0 from '../assets/ui/coin0.png';
import coin1 from '../assets/ui/coin1.png';
import coinLarge from '../assets/ui/coinLarge.png';
import defeatArt from '../assets/ui/defeatArt.png';
import heart from '../assets/ui/heart.png';
import heartEmpty from '../assets/ui/heartEmpty.png';
import hudBar from '../assets/ui/hudBar.png';
import iconGraze from '../assets/ui/iconGraze.png';
import iconLaser from '../assets/ui/iconLaser.png';
import iconOrbital from '../assets/ui/iconOrbital.png';
import iconRam from '../assets/ui/iconRam.png';
import iconRapid from '../assets/ui/iconRapid.png';
import iconSummon from '../assets/ui/iconSummon.png';
import itemBarrier from '../assets/ui/itemBarrier.png';
import itemCard from '../assets/ui/itemCard.png';
import itemNitro from '../assets/ui/itemNitro.png';
import itemOverclock from '../assets/ui/itemOverclock.png';
import itemPowerCell from '../assets/ui/itemPowerCell.png';
import itemRepairKit from '../assets/ui/itemRepairKit.png';
import logo from '../assets/ui/logo.png';
import panel from '../assets/ui/panel.png';
import perkCard from '../assets/ui/perkCard.png';
import perkCardGraze from '../assets/ui/perkCardGraze.png';
import perkCardLaser from '../assets/ui/perkCardLaser.png';
import perkCardRapid from '../assets/ui/perkCardRapid.png';
import perkCardSummon from '../assets/ui/perkCardSummon.png';
import titleBg from '../assets/ui/titleBg.png';
import titleScene from '../assets/ui/titleScene.png';
import victoryArt from '../assets/ui/victoryArt.png';

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
  iconGraze,
  iconSummon,
  itemRepairKit,
  itemNitro,
  itemPowerCell,
  itemOverclock,
  itemBarrier,
};

export type IconKey = keyof typeof UI_ICONS;

export type Insets = { left: number; right: number; top: number; bottom: number };

const nineSlice = (url: string, left: number, right: number, top: number, bottom: number) => ({ url, insets: { left, right, top, bottom } });

// Corners keep their art; edges and center stretch. Variants of one frame share its geometry, so swapping them never shifts layout.
export const UI_FRAMES = {
  perkCard: nineSlice(perkCard, 10, 10, 8, 8),
  perkCardRapid: nineSlice(perkCardRapid, 10, 10, 8, 8),
  perkCardLaser: nineSlice(perkCardLaser, 10, 10, 8, 8),
  perkCardGraze: nineSlice(perkCardGraze, 10, 10, 8, 8),
  perkCardSummon: nineSlice(perkCardSummon, 10, 10, 8, 8),
  itemCard: nineSlice(itemCard, 10, 10, 8, 8),
  panel: nineSlice(panel, 9, 9, 7, 7),
  hudBar: nineSlice(hudBar, 7, 7, 7, 7),
  button: nineSlice(button, 7, 6, 6, 6),
  buttonHover: nineSlice(buttonHover, 7, 6, 6, 6),
  buttonDisabled: nineSlice(buttonDisabled, 7, 6, 6, 6),
  buttonAccent: nineSlice(buttonAccent, 7, 6, 6, 6),
  buttonAccentHover: nineSlice(buttonAccentHover, 7, 6, 6, 6),
  chipRapid: nineSlice(chipRapid, 5, 5, 5, 5),
  chipLaser: nineSlice(chipLaser, 5, 5, 5, 5),
  chipRam: nineSlice(chipRam, 5, 5, 5, 5),
  chipGraze: nineSlice(chipGraze, 5, 5, 5, 5),
  chipSummon: nineSlice(chipSummon, 5, 5, 5, 5),
  chipGold: nineSlice(chipGold, 5, 5, 5, 5),
} satisfies Record<string, { url: string; insets: Insets }>;

export type FrameKey = keyof typeof UI_FRAMES;

export const UI_IMAGES = { logo, titleBg, titleScene, victoryArt, defeatArt };

export type ImageKey = keyof typeof UI_IMAGES;
