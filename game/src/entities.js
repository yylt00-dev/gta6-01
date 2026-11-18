// Moving things: the player on foot and behind the wheel, traffic cars with
// simple road-following AI, pedestrians who stroll and flee, police cars that
// chase and ram, bullets and particles. No drawing here — only positions,
// speeds and collisions against the city's buildings.
import { CAR, PALETTE, PLAYER, POLICE, ROADS, WORLD } from './config.js';
import { onRoad } from './world.js';
import { ACTION_ENTER, ACTION_SHOOT } from './input.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI;
  return d;
}

/** Push a circle out of every building it overlaps; returns true on a hit. */
export function collideBuildings(state, x, y, r) {
  let hit = false;
  for (const b of state.city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        x = b.x - r;
      }
    }
  }
  return { x, y, hit };
}

/** Nearest car within reach of the player, for entering / stealing. */
export function nearestCar(state, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.driver === 'police') continue;
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function spawnParticles(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({
      x, y, vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.6),
      vy: Math.sin(a) * speed * (0.4 + Math.random() * 0.6),
      life: 0.5 + Math.random() * 0.4, max: 0.9, color,
    });
  }
}

function updatePlayerOnFoot(state, dt, input, actions, addWanted) {
  const p = state.player;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    mx /= len;
    my /= len;
    const speed = PLAYER.walkSpeed;
    const nx = clamp(p.x + mx * speed * dt, 20, WORLD.width - 20);
    const ny = clamp(p.y + my * speed * dt, 20, WORLD.height - 20);
    const fixed = collideBuildings(state, nx, ny, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.angle = Math.atan2(my, mx);
  }

  if (actions & ACTION_ENTER) {
    const car = nearestCar(state, 70);
    if (car) {
      p.onFoot = false;
      p.car = car;
      const firstTime = !car.stolen;
      car.driver = 'player';
      if (firstTime) {
        // Taking a car that is not yours is a crime, and the street notices.
        car.stolen = true;
        state.stats.stolen += 1;
        addWanted(1);
        state.message = 'You stole the car! The cops are on their way.';
        state.messageT = 4;
      }
      spawnParticles(state, p.x, p.y, '#ffffff', 6, 60);
    }
  }

  if (actions & ACTION_SHOOT) {
    if (p.punchT <= 0) {
      p.punchT = 0.35;
      // A punch up close, or a pistol shot when there is ammo to spend.
      let hit = false;
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (dist(p.x, p.y, ped.x, ped.y) < PLAYER.punchRange + 8) {
          ped.down = 3;
          ped.flee = 5;
          hit = true;
        }
      }
      for (const car of state.cars) {
        if (car.driver === 'police' && dist(p.x, p.y, car.x, car.y) < PLAYER.punchRange + 26) {
          car.health -= PLAYER.punchDamage;
          hit = true;
        }
      }
      if (!hit && state.ammo > 0) {
        state.ammo -= 1;
        state.bullets.push({
          x: p.x + Math.cos(p.angle) * 18, y: p.y + Math.sin(p.angle) * 18,
          vx: Math.cos(p.angle) * 900, vy: Math.sin(p.angle) * 900, life: 0.7, fromPlayer: true,
        });
        addWanted(1);
        spawnParticles(state, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, '#ffd166', 4, 120);
      } else if (!hit && state.ammo === 0) {
        state.message = 'Out of ammo — finish a mission to restock.';
        state.messageT = 3;
      }
    }
  }
}

function updatePlayerDriving(state, dt, input, actions, addWanted) {
  const p = state.player;
  const car = p.car;
  if (!car) {
    p.onFoot = true;
    return;
  }
  const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const moving = Math.abs(car.speed) > 12;
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) car.speed -= (car.speed > 20 ? CAR.brake : CAR.accel * 0.6) * dt;
  else car.speed *= Math.max(0, 1 - 1.4 * dt);
  car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
  if (moving) car.angle += steer * CAR.turnRate * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 120);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
  const fixed = collideBuildings(state, car.x, car.y, CAR.length / 2);
  if (fixed.hit) {
    car.speed *= 0.4;
    car.x = fixed.x;
    car.y = fixed.y;
    if (Math.abs(car.speed) > 200) spawnParticles(state, car.x, car.y, '#cccccc', 5, 100);
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.moving = Math.abs(car.speed) > 20;

  // Running over a pedestrian is a crime; knocking one down hard is worse.
  for (const ped of state.peds) {
    if (ped.down > 0) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
      ped.down = 4;
      ped.flee = 6;
      addWanted(1);
      state.message = 'You hit a pedestrian! Wanted level up.';
      state.messageT = 3;
      spawnParticles(state, ped.x, ped.y, '#ff8fa3', 8, 140);
    }
  }

  if (actions & ACTION_ENTER) {
    // Step out beside the car and leave it where it stands.
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 34;
    p.y = car.y + Math.sin(side) * 34;
    const fixedOut = collideBuildings(state, p.x, p.y, PLAYER.radius);
    p.x = fixedOut.x;
    p.y = fixedOut.y;
    car.speed = 0;
    car.driver = 'parked';
    p.car = null;
    p.onFoot = true;
  }
}

function updateTrafficCar(state, car, dt) {
  // Traffic follows its road: straight ahead, turning at an intersection.
  const speed = car.speed;
  car.x += Math.cos(car.angle) * speed * dt;
  car.y += Math.sin(car.angle) * speed * dt;
  const onV = ROADS.vertical.some((cx) => Math.abs(car.x - cx) < 40);
  const onH = ROADS.horizontal.some((cy) => Math.abs(car.y - cy) < 40);
  if (onV && onH && Math.random() < dt * 0.25) {
    car.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
  if (car.x < 80 || car.x > WORLD.width - 80 || car.y < 80 || car.y > WORLD.height - 80) {
    car.angle += Math.PI;
    car.x = clamp(car.x, 80, WORLD.width - 80);
    car.y = clamp(car.y, 80, WORLD.height - 80);
  }
  // Keep traffic on the asphalt: drift back toward the nearest road centre.
  if (!onRoad(car.x, car.y)) {
    let best = null;
    let bestD = 1e9;
    for (const cx of ROADS.vertical) {
      const d = Math.abs(car.x - cx);
      if (d < bestD) { bestD = d; best = { axis: 'v', at: cx }; }
    }
    for (const cy of ROADS.horizontal) {
      const d = Math.abs(car.y - cy);
      if (d < bestD) { bestD = d; best = { axis: 'h', at: cy }; }
    }
    if (best) {
      car.angle = best.axis === 'v'
        ? (Math.sin(car.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2)
        : (Math.cos(car.angle) >= 0 ? 0 : Math.PI);
    }
  }
}

function updatePoliceCar(state, car, dt) {
  const p = state.player;
  car.siren = (car.siren ?? 0) + dt;
  const target = angleTo(car.x, car.y, p.x, p.y);
  const diff = angleDiff(car.angle, target);
  car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
  const want = POLICE.maxSpeed * (state.wanted >= 3 ? 1 : 0.85);
  car.speed = Math.min(want, car.speed + POLICE.accel * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.height - 30);
  const fixed = collideBuildings(state, car.x, car.y, CAR.length / 2);
  if (fixed.hit) {
    car.speed *= 0.5;
    car.x = fixed.x;
    car.y = fixed.y;
    car.angle += 0.6;
  }
  // Ram the player: damage on foot, or shove the player's car.
  const d = dist(car.x, car.y, p.x, p.y);
  if (d < 46) {
    if (p.onFoot) {
      if (state.player.hurtT <= 0) {
        state.health -= POLICE.ramDamage;
        state.player.hurtT = 0.8;
        spawnParticles(state, p.x, p.y, '#ff4d4d', 8, 140);
      }
      state.player.bustedT += dt;
      if (state.player.bustedT > POLICE.bustSeconds) {
        state.health = 0;
        state.overReason = 'Busted! The Neon Harbor police took you in.';
      }
    } else if (p.car) {
      p.car.speed *= 0.92;
      car.speed *= 0.9;
      if (state.player.hurtT <= 0 && Math.abs(car.speed) > 150) {
        state.health -= 3;
        state.player.hurtT = 0.8;
        spawnParticles(state, car.x, car.y, '#ffd166', 6, 120);
      }
    }
  } else if (state.player.bustedT > 0) {
    state.player.bustedT = Math.max(0, state.player.bustedT - dt * 2);
  }
}

function updatePedestrian(state, ped, dt) {
  if (ped.down > 0) {
    ped.down -= dt;
    return;
  }
  ped.walkT -= dt;
  if (ped.walkT <= 0) {
    ped.walkT = 2 + Math.random() * 4;
    ped.angle = Math.random() * Math.PI * 2;
  }
  // Flee from a fast car or a gunshot nearby.
  const playerCar = state.player.car;
  let fleeX = 0;
  let fleeY = 0;
  if (playerCar && dist(ped.x, ped.y, playerCar.x, playerCar.y) < 130 && Math.abs(playerCar.speed) > 80) {
    fleeX = ped.x - playerCar.x;
    fleeY = ped.y - playerCar.y;
    ped.flee = 1.5;
  }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const len = Math.hypot(fleeX, fleeY) || 1;
    ped.x += (fleeX / len) * ped.speed * 1.8 * dt;
    ped.y += (fleeY / len) * ped.speed * 1.8 * dt;
  } else {
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }
  ped.x = clamp(ped.x, 30, WORLD.width - 30);
  ped.y = clamp(ped.y, 30, WORLD.height - 30);
  const fixed = collideBuildings(state, ped.x, ped.y, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
}

function updateBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      for (const ped of state.peds) {
        if (ped.down <= 0 && dist(b.x, b.y, ped.x, ped.y) < 14) {
          ped.down = 4;
          ped.flee = 6;
          dead = true;
          spawnParticles(state, ped.x, ped.y, '#ff8fa3', 8, 140);
          break;
        }
      }
    }
    if (!dead) {
      for (const car of state.cars) {
        if (car.driver === 'police' && dist(b.x, b.y, car.x, car.y) < 30) {
          car.health -= PLAYER.shootDamage;
          dead = true;
          spawnParticles(state, b.x, b.y, '#ffd166', 6, 120);
          if (car.health <= 0) {
            car.health = 100;
            car.speed = 0;
            car.x += 400;
            car.y += 400;
            spawnParticles(state, car.x, car.y, '#888888', 16, 200);
          }
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

/**
 * Advance every moving thing one fixed step. `input` holds the held keys,
 * `actions` the one-shot flags. Returns event flags (currently none; the
 * world adds wanted and mission events itself).
 */
export function stepEntities(state, dt, input, actions, addWanted) {
  if (state.player.onFoot) updatePlayerOnFoot(state, dt, input, actions, addWanted);
  else updatePlayerDriving(state, dt, input, actions, addWanted);

  for (const car of state.cars) {
    if (car.driver === 'traffic') updateTrafficCar(state, car, dt);
    else if (car.driver === 'police') updatePoliceCar(state, car, dt);
  }
  for (const ped of state.peds) updatePedestrian(state, ped, dt);
  updateBullets(state, dt);

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  return 0;
}
