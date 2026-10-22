// The place each stage is fought in, so a run reads as a journey toward the Void Empress.
// Colors are canvas CSS strings; set piece sizes are in art pixels before the art scale.

type Glow = readonly [x: number, y: number, radius: number, color: string];

export type Sky = { stops: readonly [top: string, middle: string, bottom: string]; glows: readonly Glow[] };

export type SetPiece =
  | { kind: 'ringedPlanet'; radius: number; body: string; band: string; ring: string; tilt: number }
  | { kind: 'moon'; radius: number; body: string; crater: string }
  | { kind: 'gasGiant'; radius: number; bands: readonly string[]; storm: string }
  | { kind: 'shatteredMoon'; radius: number; body: string; crater: string }
  | { kind: 'star'; radius: number; core: string; body: string; rim: string; corona: string }
  | { kind: 'station'; radius: number; hull: string; edge: string; light: string }
  | { kind: 'eclipse'; radius: number; corona: readonly string[] };

export type SetPieceKind = SetPiece['kind'];

export type DebrisKind = 'rock' | 'shard' | 'scrap';

export type Sector = {
  name: string;
  nameTh: string;
  sky: Sky;
  piece: SetPiece;
  // World position of the set piece's center when the stage starts; it then drifts down.
  at: { x: number; y: number };
  debris: { kind: DebrisKind; tint: number; count: number };
};

export const SECTORS: readonly Sector[] = [
  {
    name: 'Azure Reach',
    nameTh: 'ห้วงคราม',
    sky: {
      stops: ['#0b1640', '#060a1f', '#0a1430'],
      glows: [
        [110, 150, 200, 'rgba(40,120,255,0.16)'],
        [400, 430, 200, 'rgba(70,240,255,0.07)'],
        [200, 600, 180, 'rgba(120,90,255,0.08)'],
      ],
    },
    piece: { kind: 'ringedPlanet', radius: 30, body: '#3c74c4', band: '#5a9ae0', ring: '#9cc4e4', tilt: -0.32 },
    at: { x: 410, y: 230 },
    debris: { kind: 'rock', tint: 0x8aa0c8, count: 5 },
  },
  {
    name: 'Frost Halo',
    nameTh: 'วงแหวนน้ำแข็ง',
    sky: {
      stops: ['#0c1c3a', '#060b1c', '#0b1a2e'],
      glows: [
        [380, 120, 190, 'rgba(120,220,255,0.12)'],
        [90, 380, 200, 'rgba(70,160,255,0.08)'],
        [300, 600, 170, 'rgba(200,240,255,0.05)'],
      ],
    },
    piece: { kind: 'moon', radius: 36, body: '#9cc8e0', crater: '#6890b0' },
    at: { x: 60, y: 240 },
    debris: { kind: 'shard', tint: 0xbfe8ff, count: 6 },
  },
  {
    name: 'Amber Drift',
    nameTh: 'กระแสอำพัน',
    sky: {
      stops: ['#1e1430', '#0b0818', '#1a1020'],
      glows: [
        [400, 180, 220, 'rgba(255,155,48,0.11)'],
        [80, 420, 190, 'rgba(70,200,200,0.06)'],
        [260, 620, 180, 'rgba(255,110,150,0.07)'],
      ],
    },
    piece: { kind: 'gasGiant', radius: 50, bands: ['#946638', '#b8946a', '#74422c', '#a8784a', '#c0a682', '#663828'], storm: '#c8aa88' },
    at: { x: 440, y: 250 },
    debris: { kind: 'rock', tint: 0xc8a07a, count: 6 },
  },
  {
    name: 'Shattered Belt',
    nameTh: 'แถบดาวแตก',
    sky: {
      stops: ['#141a24', '#08090f', '#12181c'],
      glows: [
        [100, 160, 200, 'rgba(160,200,120,0.07)'],
        [420, 400, 200, 'rgba(70,200,190,0.06)'],
        [220, 620, 160, 'rgba(200,170,120,0.06)'],
      ],
    },
    piece: { kind: 'shatteredMoon', radius: 34, body: '#8a8070', crater: '#5a5248' },
    at: { x: 60, y: 250 },
    debris: { kind: 'rock', tint: 0xa09484, count: 8 },
  },
  {
    name: 'Crimson Gate',
    nameTh: 'ประตูชาด',
    sky: {
      stops: ['#260814', '#0e040a', '#1c0610'],
      glows: [
        [420, 110, 240, 'rgba(200,30,50,0.16)'],
        [60, 360, 200, 'rgba(255,120,40,0.06)'],
        [260, 620, 200, 'rgba(150,20,90,0.10)'],
      ],
    },
    piece: { kind: 'star', radius: 50, core: '#8e3a2a', body: '#6a2020', rim: '#42101a', corona: '#2a0812' },
    at: { x: 430, y: 110 },
    debris: { kind: 'rock', tint: 0x8a4a48, count: 5 },
  },
  {
    name: 'Hollow Station',
    nameTh: 'สถานีร้าง',
    sky: {
      stops: ['#0c1a1c', '#050b0c', '#0d1618'],
      glows: [
        [120, 140, 200, 'rgba(93,255,155,0.06)'],
        [400, 380, 200, 'rgba(70,200,220,0.06)'],
        [220, 610, 170, 'rgba(160,180,170,0.05)'],
      ],
    },
    piece: { kind: 'station', radius: 44, hull: '#2c3a40', edge: '#6a8088', light: '#c8b060' },
    at: { x: 70, y: 250 },
    debris: { kind: 'scrap', tint: 0x8fa0a0, count: 7 },
  },
  {
    name: 'Rose Abyss',
    nameTh: 'ห้วงกุหลาบ',
    sky: {
      stops: ['#1c0a2a', '#0a0514', '#160a22'],
      glows: [
        [80, 160, 210, 'rgba(216,27,140,0.12)'],
        [420, 420, 200, 'rgba(166,107,255,0.10)'],
        [240, 620, 180, 'rgba(90,34,176,0.12)'],
      ],
    },
    piece: { kind: 'ringedPlanet', radius: 32, body: '#6a3478', band: '#8a4a90', ring: '#c088b4', tilt: 0.3 },
    at: { x: 60, y: 240 },
    debris: { kind: 'shard', tint: 0xc890d8, count: 6 },
  },
  {
    name: 'Umbral Moon',
    nameTh: 'จันทร์มืด',
    sky: {
      stops: ['#110a26', '#06040f', '#0e0820'],
      glows: [
        [400, 150, 200, 'rgba(120,90,220,0.10)'],
        [80, 420, 190, 'rgba(60,40,140,0.12)'],
        [260, 620, 160, 'rgba(166,107,255,0.06)'],
      ],
    },
    piece: { kind: 'moon', radius: 40, body: '#5a5080', crater: '#3a3258' },
    at: { x: 420, y: 240 },
    debris: { kind: 'rock', tint: 0x7a70a0, count: 6 },
  },
  {
    name: 'Dying Star',
    nameTh: 'ดาวสิ้นแสง',
    sky: {
      stops: ['#140626', '#07030f', '#12062a'],
      glows: [
        [90, 140, 220, 'rgba(140,90,255,0.12)'],
        [400, 380, 180, 'rgba(70,240,255,0.04)'],
        [240, 620, 200, 'rgba(90,34,176,0.14)'],
      ],
    },
    piece: { kind: 'star', radius: 24, core: '#a898d0', body: '#6a54a0', rim: '#3a2670', corona: '#22103e' },
    at: { x: 80, y: 220 },
    debris: { kind: 'shard', tint: 0x8a70c0, count: 6 },
  },
  {
    name: 'Void Throne',
    nameTh: 'บัลลังก์ห้วงมืด',
    sky: {
      stops: ['#08030f', '#030107', '#0a0414'],
      glows: [
        [390, 100, 220, 'rgba(120,80,200,0.10)'],
        [60, 400, 200, 'rgba(60,30,120,0.10)'],
        [240, 640, 220, 'rgba(90,34,176,0.08)'],
      ],
    },
    piece: { kind: 'eclipse', radius: 28, corona: ['#1a1430', '#2e2648', '#4c4470', '#8a82b0'] },
    at: { x: 410, y: 120 },
    debris: { kind: 'shard', tint: 0x6a5a8a, count: 4 },
  },
];

export function sectorFor(stage: number): Sector {
  const sector = SECTORS[stage - 1];
  if (!sector) throw new Error(`No sector for stage ${stage}`);
  return sector;
}
