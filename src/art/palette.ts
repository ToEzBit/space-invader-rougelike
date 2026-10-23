// One character per pixel in sprite grids. '.' is transparent.
export const PALETTE: Record<string, string> = {
  k: '#0d0b26',
  w: '#ffffff',
  W: '#c9d4ff',
  s: '#8a96c8',
  S: '#565f94',
  c: '#46f0ff',
  C: '#1e9bff',
  p: '#ff6ec7',
  P: '#d81b8c',
  h: '#ffc7ea',
  r: '#ff3d5a',
  o: '#ff9b30',
  y: '#ffe84a',
  v: '#a66bff',
  V: '#5a22b0',
};

export const COLORS = {
  space: 0x07061a,
  spaceTop: 0x0e0b33,
  ink: 0x0d0b26,
  white: 0xffffff,
  cyan: 0x46f0ff,
  azure: 0x1e9bff,
  cornflower: 0x7094ff,
  pink: 0xff6ec7,
  magenta: 0xd81b8c,
  red: 0xff3d5a,
  orange: 0xff9b30,
  yellow: 0xffe84a,
  gold: 0xffb31a,
  green: 0x5dff9b,
  lime: 0x90ff40,
  violet: 0xa66bff,
  purple: 0x5a22b0,
  steel: 0x8a96c8,
} as const;

export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
