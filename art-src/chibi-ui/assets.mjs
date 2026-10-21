// What the pipeline makes from each raw. pitch is the generator's pixel size in raw pixels; scale is world units per art pixel.
const branchVariants = (base, from) => [
  { suffix: 'Rapid', recolor: { from, to: 28, sat: 1 }, use: `${base}, rapid branch (orange).` },
  { suffix: 'Laser', recolor: { from, to: 186, sat: 1 }, use: `${base}, laser branch (cyan).` },
];
export const ASSETS = [
  { key: 'perkCard', kind: 'nineSlice', raw: 'perkCard-v2', pitch: 16, colors: 14, scale: 1, centerAlpha: 0.94, use: 'ShopScene.drawPerk, ram branch (pink). 440x116 cards.', variants: branchVariants('ShopScene.drawPerk', 325) },
];
ASSETS.push(
  { key: 'itemCard', kind: 'nineSlice', raw: 'itemCard-v2', pitch: 16, colors: 14, scale: 1, centerAlpha: 0.94, use: 'ShopScene.drawItem. 440x116 cards.' },
  { key: 'panel', kind: 'nineSlice', raw: 'panel-v2', pitch: 17.5, colors: 14, merge: 6, scale: 1, centerAlpha: 0.86, use: 'Title controls panel 400x164, Shop status panel 440x124, End stats panel, stage banner strip 480x84.' },
);
ASSETS.push(
  { key: 'hudBar', kind: 'nineSlice', raw: 'hudBar-v1', pitch: 13.5, colors: 12, scale: 1, centerAlpha: 0.72, use: 'Hud top bar: nineslice at (-2, -2) sized 484x38 so only the bottom trim and lower corners show; replaces the 480x34 rectangle and the 2px violet underline.' },
  {
    key: 'button', kind: 'nineSlice', raw: 'button-v1', pitch: 17.5, colors: 12, scale: 1, use: 'ShopScene.button refresh (neutral), 200x40.',
    variants: [
      { suffix: 'Hover', lighten: 0.2, use: 'Refresh button on pointerover (swap texture; keep the 1.05 scale tween optional).' },
      { suffix: 'Disabled', gray: 0.85, use: 'Refresh button when money < refreshCost (replaces the 0x2a2650 color).' },
      // The generated green button sat too close to the #00FF00 key and lost its face to despill; a hue turn of the neutral button keeps geometry identical.
      { suffix: 'Accent', recolor: { from: 262, to: 152, width: 60, sat: 0.7, light: 0.72 }, use: 'ShopScene.button continue (accent mint), 200x40.' },
      { suffix: 'AccentHover', recolor: { from: 262, to: 152, width: 60, sat: 0.7, light: 0.72 }, lighten: 0.2, use: 'Continue button on pointerover.' },
    ],
  },
);
ASSETS.push({
  key: 'chip', kind: 'nineSlice', raw: 'chip-v1', pitch: 18, colors: 8, scale: 1, centerAlpha: 0.9, use: 'Owned-perk chips, 16 tall; neutral fallback.',
  variants: [
    { suffix: 'Rapid', recolor: { from: 268, to: 28, width: 50, sat: 1, minL: 0.3 }, use: 'Owned chip, rapid branch.' },
    { suffix: 'Laser', recolor: { from: 268, to: 186, width: 50, sat: 1, minL: 0.3 }, use: 'Owned chip, laser branch.' },
    { suffix: 'Ram', recolor: { from: 268, to: 325, width: 50, sat: 1, minL: 0.3 }, use: 'Owned chip, ram branch.' },
    { suffix: 'Gold', recolor: { from: 268, to: 40, width: 50, sat: 1, minL: 0.3 }, use: 'Owned chip, items.' },
  ],
});

// Icons are baked at scale 1 like the chibi characters; sizes are world units, so callers drop today's setScale(2) / setScale(1.5).
const tray = (key, use, replaces) => ({ key, size: [28, 28], use, replaces });
ASSETS.push(
  {
    kind: 'iconSheet', raw: 'icons-hud-v1', colors: 12, darkWeight: 1.5,
    icons: [
      { name: 'heart', sizes: [{ key: 'heart', size: [14, 14], replaces: 'heart (7x7 art at ART_SCALE 2)', use: 'Hud hearts at 16 + i*18, y 17; Shop status hearts.' }] },
      {
        name: 'coin', sizes: [
          { key: 'coin0', size: [12, 12], replaces: 'coin0', use: 'Hud money icon at MONEY_ANCHOR, fx coin drops.' },
          { key: 'coinLarge', size: [18, 18], use: 'Shop card price and status money (replaces coin0 at setScale 1.4 / 1.3).' },
        ],
      },
    ],
  },
  {
    kind: 'iconSheet', raw: 'icons-skill-v1', colors: 14, mergeGap: 60,
    icons: [
      { name: 'rapid', sizes: [tray('iconRapid', 'Perk card stripe, rapid branch (replaces setScale 1.5).', 'iconRapid')] },
      { name: 'laser', sizes: [tray('iconLaser', 'Laser skill slot and perk card stripe, laser branch.', 'iconLaser')] },
      { name: 'ram', sizes: [tray('iconRam', 'Dash skill slot and perk card stripe, ram branch.', 'iconRam')] },
      { name: 'orbital', sizes: [tray('iconOrbital', 'Orbital skill slot.', 'iconOrbital')] },
    ],
  },
  {
    kind: 'iconSheet', raw: 'icons-item-v1', colors: 14, mergeGap: 40,
    icons: ['RepairKit', 'Nitro', 'PowerCell', 'Overclock', 'Barrier'].map((n) => ({
      name: n, sizes: [tray(`item${n}`, `Item tray slot and shop item well (${n}).`, `item${n}`)],
    })),
  },
  { kind: 'derivedIcon', key: 'heartEmpty', from: 'heart', kind2: 'hollow', replaces: 'heartEmpty', use: 'Lost HP slot; same silhouette as heart.' },
  { kind: 'derivedIcon', key: 'coin1', from: 'coin0', kind2: 'squash', ratio: 0.5, replaces: 'coin1', use: 'Coin spin frame used by fx.ts coin drops.' },
);

// The logo is one merged part (letters plus sparkles) snapped near its generator grid (about 13 raw px), then shown at 3 world units per pixel.
ASSETS.push({
  kind: 'iconSheet', raw: 'logo-v1', colors: 16, darkWeight: 1.2, mergeGap: 400, minShare: 0.0005,
  icons: [{ name: 'logo', sizes: [{ key: 'logo', kind: 'image', size: [142, 46], scale: 3, use: 'TitleScene logo container (replaces the two label() lines), centered at (240, 96); keep the bob tween.' }] }],
});

// Title key art in two layers so the layout is exact: an empty space backdrop at 2 units per pixel, and the
// character group cut out and fitted into the free band between the tagline (y 196) and the controls panel (y 410).
ASSETS.push(
  { key: 'titleBg', kind: 'image', raw: 'titleBg-v1', size: [480, 640], scale: 2, colors: 32, use: 'TitleScene backdrop image at (0, 0) origin 0, instead of Backdrop; replaces nebula + star layers on the title only.' },
  { kind: 'iconSheet', raw: 'titleScene-v1', colors: 40, darkWeight: 1.3, mergeGap: 400, minShare: 0.0005, icons: [{ name: 'titleScene', sizes: [{ key: 'titleScene', kind: 'image', size: [470, 190], use: 'TitleScene character group centered at (240, 312), spanning y 217 to 407 between tagline and controls panel; add the 1200 ms +-6 bob tween; replaces the enemy parade, names, ship and flame.' }] }] },
);

// Optional End-screen vignettes, keyed and merged like the logo, at 2 world units per pixel like the title key art.
ASSETS.push(
  { kind: 'iconSheet', raw: 'victory-v2', colors: 32, darkWeight: 1.4, mergeGap: 400, minShare: 0.002, icons: [{ name: 'victory', sizes: [{ key: 'victoryArt', kind: 'image', size: [120, 100], scale: 2, use: 'EndScene victory hero, centered at (240, 272); replaces the dimmed voidEmpress + player pair.' }] }] },
  { kind: 'iconSheet', raw: 'defeat-v2', colors: 32, darkWeight: 1.4, mergeGap: 400, minShare: 0.002, icons: [{ name: 'defeat', sizes: [{ key: 'defeatArt', kind: 'image', size: [120, 100], scale: 2, use: 'EndScene defeat hero, centered at (240, 272); replaces gunner0 at setScale 2.5.' }] }] },
);
