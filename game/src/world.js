// The city of Neon Harbor and the game's state, with no drawing and no
// browser in it: road grid, buildings, park, beach, spawn points, the player,
// cars, pedestrians and police. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react without the world
// knowing about screens or sound.
import { CAR, PALETTE, PLAYER, POLICE, ROADS, WANTED, WORLD, pick, range } from './config.js';
import { stepEntities } from './entities.js';
import { MISSIONS, missionTarget, updateMission } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_MISSION = 1;
export const EVENT_OVER = 2;
export const EVENT_CASH = 4;
export const EVENT_WANTED = 8;

const TRAFFIC_COLORS = ['#e63946', '#457b9d', '#f4a261', '#e9c46a', '#2a9d8f', '#b5838d', '#6d6875', '#90be6d'];
const PED_COLORS = ['#ff8fa3', '#ffb703', '#8ecae6', '#b5179e', '#06d6a0', '#f3722c', '#90a955', '#e07a5f'];

/** True when the point is on a road (asphalt), false when it is on a block. */
export function onRoad(x, y) {
  for (const cx of ROADS.vertical) if (Math.abs(x - cx) <= ROADS.width / 2) return true;
  for (const cy of ROADS.horizontal) if (Math.abs(y - cy) <= ROADS.width / 2) return true;
  return false;
}

/** Build the static city: buildings fill every block between roads, except the park. */
export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const roadW = ROADS.width;
  // Block edges: each block runs from one road's far edge to the next road's
  // near edge, so no building ever overlaps the asphalt.
  const blockXs = [];
  {
    let start = 60;
    for (const c of ROADS.vertical) {
      blockXs.push([start, c - roadW / 2]);
      start = c + roadW / 2;
    }
    blockXs.push([start, WORLD.width - 60]);
  }
  const blockYs = [];
  {
    let start = 60;
    for (const c of ROADS.horizontal) {
      blockYs.push([start, c - roadW / 2]);
      start = c + roadW / 2;
    }
    blockYs.push([start, WORLD.height - 60]);
  }
  for (let col = 0; col < blockXs.length; col += 1) {
    for (let row = 0; row < blockYs.length; row += 1) {
      const x0 = blockXs[col][0];
      const x1 = blockXs[col][1];
      const y0 = blockYs[row][0];
      const y1 = blockYs[row][1];
      if (x1 - x0 < 120 || y1 - y0 < 120) continue;
      // The park: one whole block of green, trees and a pond.
      if (col === 2 && row === 1) {
        for (let t = 0; t < 26; t += 1) {
          trees.push({ x: range(rng, x0 + 30, x1 - 30), y: range(rng, y0 + 30, y1 - 30), r: range(rng, 12, 20) });
        }
        continue;
      }
      // The beach strip at the south edge has no buildings.
      if (y0 > 2050) continue;
      const count = 1 + Math.floor(rng() * 3);
      for (let b = 0; b < count; b += 1) {
        const bw = range(rng, 110, Math.min(220, (x1 - x0) / count - 24));
        const bh = range(rng, 90, Math.min(190, y1 - y0 - 24));
        const bx = x0 + 14 + ((x1 - x0 - 28 - bw) * (count === 1 ? 0.5 : b / (count - 1 || 1)));
        const by = y0 + 14 + rng() * Math.max(1, y1 - y0 - 28 - bh);
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          color: pick(rng, PALETTE.building),
          roof: pick(rng, PALETTE.roof),
          name: pick(rng, ['HOTEL', 'MARKET', 'GARAGE', 'CAFE', 'OFFICE', 'APTS', 'SHOP', 'CLINIC']),
        });
      }
    }
  }
  return {
    buildings,
    trees,
    park: { x: blockXs[2][0], y: blockYs[1][0], w: blockXs[2][1] - blockXs[2][0], h: blockYs[1][1] - blockYs[1][0] },
    beach: { y: 2190 },
  };
}

/** A point on a road, for spawning cars and pedestrians. */
export function roadPoint(rng) {
  if (rng() < 0.5) {
    return { x: pick(rng, ROADS.vertical), y: range(rng, 120, WORLD.height - 120), vertical: true };
  }
  return { x: range(rng, 120, WORLD.width - 120), y: pick(rng, ROADS.horizontal), vertical: false };
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    city,
    time: 0,
    clockMin: 8 * 60 + 12,
    cash: 150,
    health: PLAYER.health,
    ammo: PLAYER.startAmmo,
    wanted: 0,
    wantedQuiet: 0,
    player: { x: 900, y: 800, angle: -Math.PI / 2, onFoot: true, car: null, punchT: 0, hurtT: 0, bustedT: 0, moving: false },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    mission: { index: 0, stage: 0, active: true, timer: 0, done: [false, false, false], packageHeld: false },
    message: '',
    messageT: 0,
    stats: { stolen: 0, delivered: 0 },
    over: false,
    overReason: '',
  };

  function spawnParkedCars() {
    const spots = [
      { x: 900, y: 700, angle: 0, color: '#e63946', kind: 'sedan' },
      { x: 1400, y: 720, angle: Math.PI, color: '#457b9d', kind: 'sedan' },
      { x: 1900, y: 1180, angle: Math.PI / 2, color: '#f4a261', kind: 'sport' },
      { x: 400, y: 1330, angle: -Math.PI / 2, color: '#2a9d8f', kind: 'taxi' },
      { x: 2400, y: 720, angle: 0, color: '#e9c46a', kind: 'van' },
      { x: 2900, y: 1630, angle: Math.PI, color: '#b5838d', kind: 'sedan' },
      { x: 900, y: 1780, angle: Math.PI / 2, color: '#6d6875', kind: 'sport' },
      { x: 1400, y: 1980, angle: 0, color: '#90be6d', kind: 'sedan' },
      { x: 2850, y: 1980, angle: Math.PI, color: '#5a7d9a', kind: 'van' },
    ];
    for (const s of spots) {
      state.cars.push({ ...s, speed: 0, driver: 'parked', stolen: false, health: 100 });
    }
  }

  function spawnTraffic() {
    for (let i = 0; i < 10; i += 1) {
      const p = roadPoint(random);
      const angle = p.vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
      state.cars.push({
        x: p.x + (p.vertical ? (random() < 0.5 ? -26 : 26) : 0),
        y: p.y + (p.vertical ? 0 : (random() < 0.5 ? -26 : 26)),
        angle, speed: range(random, 120, 190),
        color: pick(random, TRAFFIC_COLORS), kind: random() < 0.2 ? 'taxi' : 'sedan',
        driver: 'traffic', stolen: false, health: 100,
      });
    }
  }

  function spawnPeds() {
    for (let i = 0; i < 16; i += 1) {
      const p = roadPoint(random);
      state.peds.push({
        x: p.x + range(random, -70, 70), y: p.y + range(random, -70, 70),
        angle: random() * Math.PI * 2, speed: range(random, 45, 85),
        color: pick(random, PED_COLORS), flee: 0, down: 0, walkT: range(random, 0, 4),
      });
    }
  }

  function reset() {
    state.time = 0;
    state.clockMin = 8 * 60 + 12;
    state.cash = 150;
    state.health = PLAYER.health;
    state.ammo = PLAYER.startAmmo;
    state.wanted = 0;
    state.wantedQuiet = 0;
    state.player.x = 900;
    state.player.y = 800;
    state.player.angle = -Math.PI / 2;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.punchT = 0;
    state.player.hurtT = 0;
    state.player.bustedT = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.mission = { index: 0, stage: 0, active: true, timer: 0, done: [false, false, false], packageHeld: false };
    state.message = 'Mara: "Kid, you need wheels. Steal a car and bring it to my garage."';
    state.messageT = 8;
    state.stats = { stolen: 0, delivered: 0 };
    state.over = false;
    state.overReason = '';
    spawnParkedCars();
    spawnTraffic();
    spawnPeds();
  }

  function addWanted(stars) {
    const before = state.wanted;
    state.wanted = Math.min(WANTED.maxStars, state.wanted + stars);
    state.wantedQuiet = 0;
    if (state.wanted > before) return EVENT_WANTED;
    return EVENT_NONE;
  }

  /** One fixed step: input is the held-keys object, actions the one-shot flags. */
  function step(dt, input, actions) {
    let events = EVENT_NONE;
    state.time += dt;
    state.clockMin += dt * 0.6;
    if (state.messageT > 0) state.messageT -= dt;
    if (state.player.hurtT > 0) state.player.hurtT -= dt;
    if (state.player.punchT > 0) state.player.punchT -= dt;

    // Wanted level cools off after a quiet spell with no new crime.
    if (state.wanted > 0) {
      state.wantedQuiet += dt;
      if (state.wantedQuiet > WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedQuiet = 0;
      }
    }

    events |= stepEntities(state, dt, input, actions, addWanted);
    events |= updateMission(state, dt, addWanted);

    // Police arrive while wanted and leave when the heat is off.
    const wantPolice = state.wanted > 0 ? Math.min(1 + Math.floor(state.wanted / 2), 4) : 0;
    const policeNow = state.cars.filter((c) => c.driver === 'police').length;
    if (policeNow < wantPolice) {
      const angle = random() * Math.PI * 2;
      const px = Math.max(80, Math.min(WORLD.width - 80, state.player.x + Math.cos(angle) * 700));
      const py = Math.max(80, Math.min(WORLD.height - 80, state.player.y + Math.sin(angle) * 700));
      state.cars.push({
        x: px, y: py, angle, speed: 0, color: PALETTE.police, kind: 'police',
        driver: 'police', stolen: false, health: 100, siren: random() * 10,
      });
    } else if (policeNow > wantPolice) {
      const cop = state.cars.find((c) => c.driver === 'police');
      if (cop) state.cars.splice(state.cars.indexOf(cop), 1);
    }

    // Health regen on foot, slowly, when not being chased hard.
    if (state.player.onFoot && state.wanted === 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + 2 * dt);
    }

    if (state.health <= 0 && !state.over) {
      state.over = true;
      state.overReason = 'You were taken down in the streets of Neon Harbor.';
      events |= EVENT_OVER;
    }
    return events;
  }

  reset();
  return { state, city, reset, step, addWanted, missionTarget: () => missionTarget(state) };
}

export { MISSIONS };
