// Playtesting only: hits still land (flash, i-frames, TRANS-AM gauge loss) but never cost HP. Dev builds toggle it
// with G, and it is remembered across reloads; production builds never turn it on.
const STORAGE_KEY = 'space-invader.godMode';

let on = import.meta.env.DEV && load();

export function godMode(): boolean {
  return on;
}

export function toggleGodMode(): void {
  if (!import.meta.env.DEV) return;
  on = !on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // Storage can be blocked; the toggle still holds for this session.
  }
}

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
