import { Pixels, sym, type Grid } from './painter';

const SERAPH_HEAD = sym([
  '.......Y',
  '......rY',
  '....rrrY',
  '..rrRrrr',
  '.rrRrrrr',
  '.rRWWWWW',
  'rRWWwWWw',
  'rRWmWmmW',
  'rRWkkmmm',
  'rRWwrmmm',
  'rRWrRmmm',
  'rRWnmmmm',
  '.rRWmmmr',
  '..rRWmmm',
  '...rYYYY',
]);

// Wings are fanned feathers from the shoulder; listed back to front so nearer ones overlap.
const SERAPH_FEATHERS: readonly [number, number][] = [
  [10, 40],
  [3, 31],
  [0, 21],
  [2, 11],
  [8, 3],
];

function crimsonSeraph(): Grid {
  const p = new Pixels(63, 52);
  const [ax, ay] = [24, 22];
  for (const [tx, ty] of SERAPH_FEATHERS) {
    p.line(ax, ay, tx, ty, 'R', 6);
    p.line(ax, ay, tx, ty, 'w', 4);
    p.line(ax - 1, ay, tx + 1, ty + 1, 'h', 2);
    p.line(tx + (ax - tx) * 0.2, ty + (ay - ty) * 0.2, tx, ty, 'p', 2);
  }
  p.rect(18, 24, 4, 12, 'S').rect(19, 24, 2, 12, 's');
  p.rect(17, 36, 6, 4, 's').rect(18, 40, 4, 1, 'c').rect(19, 36, 2, 3, 'S');
  p.poly([[25, 18], [32, 18], [32, 34], [27, 34]], 'r');
  p.rect(25, 19, 2, 13, 'R');
  p.ellipse(31, 25, 2.5, 2.5, 'Y').ellipse(31, 25, 1.5, 1.5, 'c').set(30, 24, 'w');
  p.line(27, 30, 32, 30, 'Y');
  p.ellipse(22, 21, 4, 3, 'r').ellipse(21, 20, 2, 1, 'h').line(18, 24, 26, 24, 'Y');
  p.poly([[26, 33], [32, 33], [32, 44], [21, 44]], 'r');
  p.line(28, 33, 24, 44, 'R').line(30, 34, 28, 44, 'R');
  p.line(21, 44, 32, 44, 'Y');
  p.rect(27, 45, 3, 3, 'S').rect(28, 48, 1, 2, 'y').set(28, 50, 'o');
  p.stamp(SERAPH_HEAD, 24, 4);
  p.ring(31, 2, 8, 2, 'y');
  return p.mirror().outline().grid();
}

const EMPRESS_HEAD = sym([
  '...y.y.c',
  '...YyYyY',
  '..kYYYYY',
  '.uuVVVVV',
  'uuVvVVVV',
  'uVvmmVmm',
  'uVmkkmmm',
  'uVmwvmmm',
  'uVmvVmmm',
  'uVnmmmmm',
  'uVVmmmmP',
  'uVVkmmmm',
  'uuVVkmmm',
  '.uuVVYYY',
]);

function voidEmpress(): Grid {
  const p = new Pixels(63, 58);
  p.ring(31, 17, 16, 16, 'v', 2).ring(31, 17, 13, 13, 'l');
  for (const [x, y] of [[15, 17], [20, 5], [31, 1], [19, 29]] as const) p.set(x, y, 'w');
  p.poly([[22, 26], [31, 25], [31, 57], [3, 57]], 'u');
  p.line(22, 26, 3, 57, 'V', 2).line(21, 28, 4, 57, 'Y');
  p.poly([[24, 9], [27, 9], [26, 46], [16, 48], [18, 30]], 'V');
  p.line(23, 14, 18, 44, 'u').line(25, 16, 22, 46, 'u').line(22, 12, 17, 36, 'v');
  p.poly([[26, 24], [32, 24], [32, 56], [17, 56]], 'V');
  p.line(28, 28, 22, 56, 'v').line(30, 30, 27, 56, 'u');
  p.line(25, 37, 32, 37, 'Y').line(19, 55, 32, 55, 'Y');
  p.ellipse(31, 26, 1.5, 1.5, 'c').set(31, 25, 'w');
  p.line(24, 27, 15, 37, 'u', 3).ellipse(14, 38, 1.5, 1.5, 'm');
  p.ellipse(11, 42, 3.5, 3.5, 'P').ellipse(11, 42, 2.5, 2.5, 'p').ellipse(10, 41, 1, 1, 'h').set(10, 40, 'w');
  p.rect(29, 20, 3, 4, 'm');
  p.stamp(EMPRESS_HEAD, 24, 7);
  return p.mirror().outline().grid();
}

const CANOPY = sym(['..kc', '.kcw', '.kpp', 'kpmm', 'kpkm', 'kcVv', '.kkk']);

function playerShip(): Grid {
  const p = new Pixels(21, 24);
  p.poly([[9, 8], [0, 18], [0, 21], [9, 18]], 'b');
  p.line(9, 8, 0, 18, 'p').line(9, 10, 1, 19, 'P').line(1, 20, 9, 18, 'B');
  p.rect(0, 15, 1, 6, 'p');
  p.rect(3, 10, 1, 6, 's').set(3, 9, 'c');
  p.poly([[10, 0], [11, 0], [11, 22], [6, 22], [6, 10]], 'b');
  p.line(10, 1, 7, 12, 'W').line(7, 12, 7, 21, 'B');
  p.rect(10, 13, 1, 8, 'c');
  p.rect(7, 20, 2, 3, 'S').set(8, 22, 's');
  p.stamp(CANOPY, 7, 5);
  return p.mirror().outline().grid();
}

export const COMPOSED_ART = {
  player: playerShip(),
  crimsonSeraph: crimsonSeraph(),
  voidEmpress: voidEmpress(),
};
