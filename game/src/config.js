// Neon Harbor — every tuning number, colour and constant in one place.
// The view is a fixed 1280x720 logical area; the renderer scales it to the
// window. The city itself is a much bigger world the camera pans across.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The city is 3200 x 2400 world units, about 2.5 screens wide. */
export const WORLD = { width: 3200, height: 2400 };

/** Road centre lines (world units) and road width. */
export const ROADS = {
  vertical: [400, 900, 1400, 1900, 2400, 2900],
  horizontal: [350, 800, 1250, 1700, 2050],
  width: 110,
};

/** Sun-soaked harbour city palette: warm asphalt, sand, teal water, pastel blocks. */
export const PALETTE = {
  grass: '#79c74f',
  grassDark: '#68b544',
  road: '#3d3a4a',
  roadLine: '#f4d35e',
  sidewalk: '#b9b3a4',
  sand: '#f0d9a0',
  water: '#2fa8c9',
  waterDeep: '#1d7fa3',
  park: '#4da33a',
  pond: '#4db2d8',
  building: ['#e8a87c', '#d9a5b3', '#9bb8d3', '#f2c14e', '#b5d8a8', '#c9a0dc', '#f28b82', '#8ecae6'],
  roof: ['#b5654a', '#7a6a8a', '#5a7d9a', '#a67c52'],
  player: '#ff5d8f',
  playerDark: '#c93a68',
  police: '#1e3a8a',
  taxi: '#ffc300',
  text: '#ffffff',
  hudBg: 'rgba(12, 16, 28, 0.72)',
  hudText: '#ffffff',
  hudMuted: '#ffd166',
  marker: '#ffe14d',
  danger: '#ff4d4d',
  cash: '#7dff8a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, missions done) is kept between visits. */
export const SAVE_KEY = 'neon-harbor.save.v1';

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  health: 100,
  punchRange: 36,
  punchDamage: 25,
  shootDamage: 34,
  startAmmo: 12,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 700,
  maxSpeed: 520,
  reverseMax: 180,
  turnRate: 2.9,
};

export const POLICE = {
  maxSpeed: 560,
  accel: 520,
  ramDamage: 9,
  bustSeconds: 1.6,
};

export const WANTED = {
  decaySeconds: 26,
  maxStars: 5,
};

/** A tiny deterministic RNG (mulberry32) so a seed always builds the same city. */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a value in [min, max) from a random function. */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Pick one item from an array with a random function. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length) % items.length];
}
