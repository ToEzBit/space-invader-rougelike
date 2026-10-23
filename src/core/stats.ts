// Every system reads ship behavior from ShipStats. A zero value means the mechanic is off,
// so perks only ever fold numbers into a fresh copy of BASE_STATS.
export type ShipStats = {
  maxHp: number;
  moveSpeed: number;

  fireIntervalMs: number;
  bulletDamage: number;
  bulletSpeed: number;
  parallelShots: number;
  spreadPairs: number;
  pierce: number;
  critChance: number;
  critMultiplier: number;
  homingEveryShots: number;
  homingDamage: number;
  overdriveMultiplier: number;
  drones: number;

  laserCooldownMs: number;
  laserDps: number;
  laserWidth: number;
  laserDurationMs: number;
  laserBurnDps: number;
  laserErasesBullets: boolean;
  laserErasedBulletCoin: number;
  laserSideBeams: number;
  laserKillRefundMs: number;
  orbitalCooldownMs: number;
  orbitalDamage: number;

  dashCooldownMs: number;
  dashDamage: number;
  dashSpeed: number;
  dashCharges: number;
  dashShockRadius: number;
  dashShieldMs: number;
  dashHealEveryKills: number;
  dashSizeMultiplier: number;
  dashDamageMultiplier: number;

  grazeSparkDamage: number;
  grazeSparkPierce: number;
  grazeExtraSparks: number;
  grazeHaloPx: number;
  grazeGainBonus: number;
  adrenalineIntervalScale: number;
  staticSkinEvery: number;
  phaseSkinEvery: number;
  flashpointRadius: number;
  lastStandDamageScale: number;
  bulletTimeMs: number;

  familiars: number;
  wispIntervalMs: number;
  wispDamage: number;
  wispPierce: number;
  guardianRestMs: number;
  sacrificeMs: number;
  soulBurstRadius: number;
  hauntBonus: number;
  greatSpiritEveryMs: number;
};

export const BASE_STATS: Readonly<ShipStats> = {
  maxHp: 3,
  moveSpeed: 220,

  fireIntervalMs: 320,
  bulletDamage: 2,
  bulletSpeed: 420,
  parallelShots: 1,
  spreadPairs: 0,
  pierce: 0,
  critChance: 0,
  critMultiplier: 2.5,
  homingEveryShots: 0,
  homingDamage: 0,
  overdriveMultiplier: 1,
  drones: 0,

  laserCooldownMs: 0,
  laserDps: 0,
  laserWidth: 6,
  laserDurationMs: 500,
  laserBurnDps: 0,
  laserErasesBullets: false,
  laserErasedBulletCoin: 0,
  laserSideBeams: 0,
  laserKillRefundMs: 0,
  orbitalCooldownMs: 0,
  orbitalDamage: 0,

  dashCooldownMs: 0,
  dashDamage: 0,
  dashSpeed: 900,
  dashCharges: 1,
  dashShockRadius: 0,
  dashShieldMs: 0,
  dashHealEveryKills: 0,
  dashSizeMultiplier: 1,
  dashDamageMultiplier: 1,

  grazeSparkDamage: 0,
  grazeSparkPierce: 0,
  grazeExtraSparks: 0,
  grazeHaloPx: 0,
  grazeGainBonus: 0,
  adrenalineIntervalScale: 0,
  staticSkinEvery: 0,
  phaseSkinEvery: 0,
  flashpointRadius: 0,
  lastStandDamageScale: 0,
  bulletTimeMs: 0,

  familiars: 0,
  wispIntervalMs: 0,
  wispDamage: 0,
  wispPierce: 0,
  guardianRestMs: 0,
  sacrificeMs: 0,
  soulBurstRadius: 0,
  hauntBonus: 0,
  greatSpiritEveryMs: 0,
};
