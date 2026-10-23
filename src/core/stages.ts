export type EnemyKind = 'drone' | 'gunner' | 'tank' | 'diver';

export type EnemyDef = {
  name: string;
  hp: number;
  coin: number;
  // Multiplies the stage's base fire chance for this kind.
  fireWeight: number;
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: { name: 'Pico Drone', hp: 2, coin: 1, fireWeight: 0.6 },
  gunner: { name: 'Gunner Girl', hp: 4, coin: 2, fireWeight: 1.6 },
  tank: { name: 'Bulwark', hp: 10, coin: 3, fireWeight: 0.8 },
  diver: { name: 'Kamikaze Kitsune', hp: 4, coin: 3, fireWeight: 0.4 },
};

export type BossId = 'crimsonSeraph' | 'voidEmpress';

// The character texture a boss form wears. Each first form wears its boss id.
export type BossTexture = BossId | 'crimsonSeraphAscended' | 'voidEmpressEclipse';

export type BossPattern =
  | 'fanSpread'
  | 'aimedBurst'
  | 'summonMinions'
  | 'spiral'
  | 'sweepLaser'
  | 'bulletRain'
  | 'featherStorm'
  | 'crossJudgement'
  | 'blackHole'
  | 'eclipseNova';

// A phase starts when boss HP falls to hpRatio or below; the boss cycles its patterns.
export type BossPhase = { hpRatio: number; patterns: readonly BossPattern[]; patternGapMs: number };

export type BossForm = {
  name: string;
  texture: BossTexture;
  // hpRatio thresholds are fractions of the boss's full HP, in falling order. The first phase starts at 1.
  phases: readonly BossPhase[];
  bulletSpeedScale: number;
  minionKind: EnemyKind;
};

// The first form becomes the second once HP falls to atHpRatio. For durationMs the boss is immune while it heals
// healRatio of its full HP, then it summons minions.
export type BossTransform = { atHpRatio: number; healRatio: number; summon: number; durationMs: number };

export type BossDef = { hp: number; forms: readonly [BossForm, BossForm]; transform: BossTransform };

export type FormIndex = 0 | 1;

export const BOSSES: Record<BossId, BossDef> = {
  crimsonSeraph: {
    hp: 540,
    forms: [
      {
        name: 'Crimson Seraph',
        texture: 'crimsonSeraph',
        phases: [
          { hpRatio: 1, patterns: ['fanSpread', 'aimedBurst'], patternGapMs: 1500 },
          { hpRatio: 0.75, patterns: ['fanSpread', 'summonMinions', 'aimedBurst'], patternGapMs: 1200 },
        ],
        bulletSpeedScale: 1,
        minionKind: 'drone',
      },
      {
        name: 'Crimson Seraph · Ascended',
        texture: 'crimsonSeraphAscended',
        phases: [
          { hpRatio: 1, patterns: ['featherStorm', 'aimedBurst', 'crossJudgement', 'aimedBurst'], patternGapMs: 1200 },
          { hpRatio: 0.3, patterns: ['featherStorm', 'crossJudgement', 'aimedBurst', 'fanSpread'], patternGapMs: 1000 },
        ],
        bulletSpeedScale: 1,
        minionKind: 'drone',
      },
    ],
    transform: { atHpRatio: 0.5, healRatio: 0, summon: 2, durationMs: 2200 },
  },
  voidEmpress: {
    hp: 2900,
    forms: [
      {
        name: 'Void Empress',
        texture: 'voidEmpress',
        phases: [
          { hpRatio: 1, patterns: ['spiral', 'aimedBurst', 'bulletRain'], patternGapMs: 850 },
          { hpRatio: 0.75, patterns: ['sweepLaser', 'spiral', 'summonMinions', 'aimedBurst'], patternGapMs: 750 },
        ],
        bulletSpeedScale: 1.1,
        minionKind: 'drone',
      },
      {
        name: 'Void Empress · Eclipse',
        texture: 'voidEmpressEclipse',
        phases: [
          { hpRatio: 1, patterns: ['blackHole', 'spiral', 'aimedBurst', 'bulletRain', 'eclipseNova', 'aimedBurst'], patternGapMs: 650 },
          { hpRatio: 0.3, patterns: ['eclipseNova', 'bulletRain', 'blackHole', 'spiral', 'sweepLaser', 'aimedBurst'], patternGapMs: 600 },
        ],
        bulletSpeedScale: 1.15,
        minionKind: 'gunner',
      },
    ],
    transform: { atHpRatio: 0.5, healRatio: 0.2, summon: 3, durationMs: 2500 },
  },
};

// The latest phase of the form whose threshold the boss HP has fallen to.
export function bossPhaseAt(def: BossDef, form: FormIndex, hpRatio: number): number {
  let index = 0;
  def.forms[form].phases.forEach((p, i) => {
    if (hpRatio <= p.hpRatio) index = i;
  });
  return index;
}

// Only the first form transforms, so a boss whose HP dips below the threshold again never transforms twice.
export function transformDue(def: BossDef, form: FormIndex, hpRatio: number): boolean {
  return form === 0 && hpRatio <= def.transform.atHpRatio;
}

export type WaveStage = {
  kind: 'wave';
  cols: number;
  // Top row first.
  rows: readonly EnemyKind[];
  marchSpeed: number;
  // Expected enemy shots per second across the whole formation. A Gunner Girl's shot can be a fan of needles.
  fireRate: number;
  hpMultiplier: number;
  // Needles in each Gunner Girl shot, fanned around her aim at the ship.
  gunnerFan: number;
  reward: number;
};

export type BossStage = {
  kind: 'boss';
  boss: BossId;
  reward: number;
};

export type StageDef = WaveStage | BossStage;

export const STAGES: readonly StageDef[] = [
  { kind: 'wave', cols: 8, rows: ['gunner', 'drone', 'drone'], marchSpeed: 20, fireRate: 1.2, hpMultiplier: 1, gunnerFan: 1, reward: 30 },
  { kind: 'wave', cols: 8, rows: ['gunner', 'drone', 'drone', 'drone'], marchSpeed: 24, fireRate: 1.6, hpMultiplier: 1, gunnerFan: 1, reward: 35 },
  { kind: 'wave', cols: 9, rows: ['tank', 'gunner', 'drone', 'drone'], marchSpeed: 28, fireRate: 2, hpMultiplier: 1.1, gunnerFan: 1, reward: 40 },
  { kind: 'wave', cols: 9, rows: ['tank', 'gunner', 'gunner', 'drone', 'drone'], marchSpeed: 32, fireRate: 2.4, hpMultiplier: 1.2, gunnerFan: 3, reward: 45 },
  { kind: 'boss', boss: 'crimsonSeraph', reward: 100 },
  { kind: 'wave', cols: 10, rows: ['tank', 'diver', 'gunner', 'drone', 'drone'], marchSpeed: 36, fireRate: 2.8, hpMultiplier: 1.8, gunnerFan: 3, reward: 55 },
  { kind: 'wave', cols: 10, rows: ['tank', 'tank', 'diver', 'gunner', 'drone'], marchSpeed: 40, fireRate: 3.2, hpMultiplier: 2.1, gunnerFan: 3, reward: 60 },
  { kind: 'wave', cols: 10, rows: ['tank', 'diver', 'gunner', 'gunner', 'diver', 'drone'], marchSpeed: 44, fireRate: 3.6, hpMultiplier: 2.4, gunnerFan: 3, reward: 65 },
  { kind: 'wave', cols: 11, rows: ['tank', 'tank', 'diver', 'gunner', 'gunner', 'diver'], marchSpeed: 48, fireRate: 4, hpMultiplier: 2.7, gunnerFan: 3, reward: 70 },
  { kind: 'boss', boss: 'voidEmpress', reward: 0 },
];

export const STAGE_COUNT = STAGES.length;

export function stageDef(stage: number): StageDef {
  const def = STAGES[stage - 1];
  if (!def) throw new Error(`No stage ${stage}`);
  return def;
}

// HP the boss regains over its transformation, capped at its full HP.
export function healedHp(def: BossDef, hpAtTransform: number): number {
  return Math.min(def.hp, hpAtTransform + def.hp * def.transform.healRatio);
}
