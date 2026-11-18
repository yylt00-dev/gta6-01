// The screenshot scenes behind ?shot=1-chase|2-drive|3-mission|4-title.
// Each one stages a fixed scene from the real game state — real cars, real
// pedestrians, the real HUD — and then nothing moves, so the same URL always
// gives the same frame. The first by name, 1-chase, is the cover.
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Put the player in a car of `color` at (x, y) heading `angle`. */
function putPlayerInCar(state, x, y, angle, color, kind) {
  const car = {
    x, y, angle, speed: 380, color, kind: kind || 'sport',
    driver: 'player', stolen: true, health: 100,
  };
  state.cars.push(car);
  state.player.onFoot = false;
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

/** A traffic car parked in the frame at a fixed spot. */
function addTraffic(state, x, y, angle, color, speed) {
  state.cars.push({
    x, y, angle, speed: speed ?? 150, color, kind: 'sedan',
    driver: 'traffic', stolen: false, health: 100,
  });
}

/** A police car in the frame at a fixed spot. */
function addPolice(state, x, y, angle) {
  state.cars.push({
    x, y, angle, speed: 420, color: '#1e3a8a', kind: 'police',
    driver: 'police', stolen: false, health: 100, siren: 2.5,
  });
}

/** A pedestrian standing in the frame at a fixed spot. */
function addPed(state, x, y, color) {
  state.peds.push({
    x, y, angle: 0, speed: 60, color, flee: 0, down: 0, walkT: 3,
  });
}

/** Clear the random traffic and pedestrians so the frame is fully staged. */
function clearStreet(state) {
  state.cars = state.cars.filter((c) => c.driver === 'parked');
  state.peds = [];
  state.bullets = [];
  state.particles = [];
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the save line to show. Any unknown name stages the title.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  state.time = 12.5;
  state.clockMin = 17 * 60 + 40;
  state.messageT = 0;

  if (name === '1-chase') {
    clearStreet(state);
    state.cash = 2650;
    state.health = 78;
    state.ammo = 9;
    state.wanted = 3;
    state.mission.index = 2;
    state.mission.stage = 1;
    state.mission.timer = 96;
    state.message = 'Alarm! Wanted level 3 — lose the cops and reach the safehouse!';
    state.messageT = 9;
    putPlayerInCar(state, 1400, 1000, Math.PI / 2, '#e63946', 'sport');
    addPolice(state, 1400, 830, Math.PI / 2);
    addPolice(state, 1362, 890, Math.PI / 2);
    addTraffic(state, 1445, 700, Math.PI / 2, '#457b9d', 170);
    addTraffic(state, 1355, 1180, -Math.PI / 2, '#f4a261', 150);
    addTraffic(state, 1900, 1250, 0, '#2a9d8f', 160);
    addPed(state, 1330, 1080, '#ff8fa3');
    addPed(state, 1470, 940, '#ffb703');
    return { screen: SCREEN_PLAY, save: 'Saved: $2,650 · 2 missions done' };
  }

  if (name === '2-drive') {
    clearStreet(state);
    state.cash = 650;
    state.health = 100;
    state.ammo = 12;
    state.wanted = 0;
    state.mission.index = 0;
    state.mission.stage = 1;
    state.message = '';
    putPlayerInCar(state, 900, 800, 0, '#f4a261', 'sedan');
    addTraffic(state, 1150, 774, 0, '#e63946', 170);
    addTraffic(state, 650, 826, Math.PI, '#457b9d', 150);
    addTraffic(state, 1400, 1000, Math.PI / 2, '#2a9d8f', 160);
    addTraffic(state, 900, 560, -Math.PI / 2, '#e9c46a', 140);
    addPed(state, 830, 730, '#8ecae6');
    addPed(state, 1010, 870, '#ff8fa3');
    addPed(state, 1180, 735, '#06d6a0');
    addPed(state, 760, 880, '#ffb703');
    return { screen: SCREEN_PLAY, save: 'Saved: $650 · 0 missions done' };
  }

  if (name === '3-mission') {
    clearStreet(state);
    state.cash = 650;
    state.health = 92;
    state.ammo = 12;
    state.wanted = 0;
    state.mission.index = 1;
    state.mission.stage = 0;
    state.message = 'Mara: "A package is waiting at the park gate. Pick it up."';
    state.messageT = 9;
    state.player.x = 1360;
    state.player.y = 880;
    state.player.angle = Math.PI / 4;
    state.player.onFoot = true;
    state.player.car = null;
    addTraffic(state, 1400, 700, 0, '#e63946', 0);
    addPed(state, 1300, 820, '#b5179e');
    addPed(state, 1470, 900, '#ffb703');
    addPed(state, 1330, 960, '#8ecae6');
    return { screen: SCREEN_PLAY, save: 'Saved: $650 · 1 mission done' };
  }

  // 4-title and anything else: the start screen over the living city.
  state.cash = 150;
  state.health = 100;
  state.ammo = 12;
  state.wanted = 0;
  state.mission.index = 0;
  state.mission.stage = 0;
  return { screen: SCREEN_TITLE, save: 'Saved: $150 · 0 missions done' };
}
