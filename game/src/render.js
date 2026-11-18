// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 view is scaled to fit the window and centred; a camera follows the
// player across the city. Flat colours, canvas text for the HUD, the panels
// and the live minimap. Nothing here changes the game state.
import { CAR, FIELD, FONT, PALETTE, PLAYER, ROADS, WORLD } from './config.js';
import { missionTarget, objectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };
const MINIMAP = { x: 1052, y: 16, w: 212, h: 158 };

function fmtClock(minutes) {
  const total = Math.floor(minutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtMoney(cash) {
  return `$${Math.floor(cash).toLocaleString('en-US')}`;
}

function fmtTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has(`p${size}`)) fonts.set(`p${size}`, `${size}px ${FONT}`);
    context.font = fonts.get(`p${size}`);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Camera: centred on the player, clamped to the city's edges. */
  function camera(state) {
    const p = state.player;
    return {
      x: Math.max(0, Math.min(WORLD.width - FIELD.width, p.x - FIELD.width / 2)),
      y: Math.max(0, Math.min(WORLD.height - FIELD.height, p.y - FIELD.height / 2)),
    };
  }

  function drawGround(state, cam) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Mown stripes on the grass, for depth.
    context.fillStyle = PALETTE.grassDark;
    const stripeOff = -(cam.y % 240);
    for (let y = stripeOff; y < FIELD.height; y += 240) {
      context.fillRect(0, y, FIELD.width, 120);
    }
    // Beach sand and sea along the south edge.
    const beach = state.city.beach;
    const sandY = beach.y - cam.y;
    if (sandY < FIELD.height) {
      context.fillStyle = PALETTE.sand;
      context.fillRect(0, Math.max(0, sandY), FIELD.width, FIELD.height - Math.max(0, sandY));
      context.fillStyle = PALETTE.water;
      const waterY = sandY + 110;
      if (waterY < FIELD.height) {
        context.fillRect(0, Math.max(0, waterY), FIELD.width, FIELD.height - Math.max(0, waterY));
        context.fillStyle = PALETTE.waterDeep;
        for (let x = 0; x < FIELD.width; x += 90) {
          context.fillRect(x + ((state.time * 20) % 90), Math.max(0, waterY) + 26, 46, 4);
        }
      }
    }
    // The park: green block, pond, trees.
    const park = state.city.park;
    context.fillStyle = PALETTE.park;
    context.fillRect(park.x - cam.x, park.y - cam.y, park.w, park.h);
    context.fillStyle = PALETTE.pond;
    context.beginPath();
    context.ellipse(park.x + park.w / 2 - cam.x, park.y + park.h / 2 - cam.y, 90, 55, 0, 0, Math.PI * 2);
    context.fill();
    for (const tree of state.city.trees) {
      context.fillStyle = '#2e7d32';
      context.beginPath();
      context.arc(tree.x - cam.x, tree.y - cam.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#43a047';
      context.beginPath();
      context.arc(tree.x - cam.x - 3, tree.y - cam.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRoads(cam) {
    context.fillStyle = PALETTE.road;
    for (const cx of ROADS.vertical) {
      context.fillRect(cx - ROADS.width / 2 - cam.x, -cam.y, ROADS.width, WORLD.height);
    }
    for (const cy of ROADS.horizontal) {
      context.fillRect(-cam.x, cy - ROADS.width / 2 - cam.y, WORLD.width, ROADS.width);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const cx of ROADS.vertical) {
      for (let y = 0; y < WORLD.height; y += 80) {
        context.fillRect(cx - 3 - cam.x, y - cam.y, 6, 40);
      }
    }
    for (const cy of ROADS.horizontal) {
      for (let x = 0; x < WORLD.width; x += 80) {
        context.fillRect(x - cam.x, cy - 3 - cam.y, 40, 6);
      }
    }
    // Sidewalk edges.
    context.fillStyle = PALETTE.sidewalk;
    for (const cx of ROADS.vertical) {
      context.fillRect(cx - ROADS.width / 2 - 8 - cam.x, -cam.y, 8, WORLD.height);
      context.fillRect(cx + ROADS.width / 2 - cam.x, -cam.y, 8, WORLD.height);
    }
    for (const cy of ROADS.horizontal) {
      context.fillRect(-cam.x, cy - ROADS.width / 2 - 8 - cam.y, WORLD.width, 8);
      context.fillRect(-cam.x, cy + ROADS.width / 2 - cam.y, WORLD.width, 8);
    }
  }

  function drawBuildings(state, cam) {
    for (const b of state.city.buildings) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      if (x > FIELD.width || y > FIELD.height || x + b.w < 0 || y + b.h < 0) continue;
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(x + 6, y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(x, y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(x + 8, y + 8, b.w - 16, b.h - 16);
      // Windows: a sparse grid so the block reads as a building at a glance.
      context.fillStyle = 'rgba(255,255,255,0.75)';
      for (let wx = x + 16; wx < x + b.w - 14; wx += 26) {
        for (let wy = y + 16; wy < y + b.h - 14; wy += 26) {
          context.fillRect(wx, wy, 12, 9);
        }
      }
      plainText(b.name, x + b.w / 2, y + b.h / 2, 15, 'rgba(0,0,0,0.55)', 'center', 'middle');
    }
  }

  function drawCar(car, cam, state) {
    const x = car.x - cam.x;
    const y = car.y - cam.y;
    context.save();
    context.translate(x, y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.fillRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width);
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    context.fill();
    // Cabin and windshield.
    context.fillStyle = 'rgba(20,24,40,0.85)';
    context.fillRect(-8, -CAR.width / 2 + 4, 18, CAR.width - 8);
    context.fillStyle = 'rgba(180,220,255,0.7)';
    context.fillRect(10, -CAR.width / 2 + 5, 8, CAR.width - 10);
    // Headlights and tail lights.
    context.fillStyle = '#fff8c9';
    context.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 2, 3, 6);
    context.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 8, 3, 6);
    context.fillStyle = '#ff3b30';
    context.fillRect(-CAR.length / 2, -CAR.width / 2 + 2, 3, 6);
    context.fillRect(-CAR.length / 2, CAR.width / 2 - 8, 3, 6);
    if (car.kind === 'taxi') {
      context.fillStyle = '#111111';
      context.fillRect(-6, -CAR.width / 2 - 4, 14, 6);
      plainText('TAXI', 0, -CAR.width / 2 - 6, 9, '#111111', 'center', 'alphabetic');
    }
    if (car.kind === 'police') {
      const flash = Math.floor((car.siren ?? 0) * 4) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      context.fillRect(-4, -CAR.width / 2 - 5, 8, 6);
      context.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      context.fillRect(4, -CAR.width / 2 - 5, 8, 6);
      plainText('POLICE', 0, CAR.width / 2 + 16, 10, '#ffffff', 'center', 'alphabetic');
    }
    if (car.kind === 'van') {
      plainText('VAN', 0, 4, 11, 'rgba(255,255,255,0.85)', 'center', 'middle');
    }
    context.restore();
    // The player's car gets a white ring so it is easy to find.
    if (car.driver === 'player') {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, CAR.length / 2 + 8, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawPedestrian(ped, cam) {
    const x = ped.x - cam.x;
    const y = ped.y - cam.y;
    if (ped.down > 0) {
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(x, y, 14, 8, 0, 0, Math.PI * 2);
      context.fill();
      return;
    }
    const bob = ped.flee > 0 ? 2 : Math.sin((ped.walkT * 10)) * 1.5;
    context.fillStyle = 'rgba(0,0,0,0.2)';
    context.beginPath();
    context.ellipse(x, y + 10, 10, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(x, y + bob, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c89b';
    context.beginPath();
    context.arc(x, y - 11 + bob, 6, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer(state, cam) {
    const p = state.player;
    if (!p.onFoot) return;
    const x = p.x - cam.x;
    const y = p.y - cam.y;
    if (p.hurtT > 0 && Math.floor(p.hurtT * 12) % 2 === 0) return; // blink while hurt
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(x, y + 11, 11, 4, 0, 0, Math.PI * 2);
    context.fill();
    // Body, head, and a cap; the facing tick shows which way they run.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x, y, PLAYER.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c89b';
    context.beginPath();
    context.arc(x, y - 4, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.arc(x, y - 6, 7, Math.PI, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.playerDark;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(p.angle) * 20, y + Math.sin(p.angle) * 20);
    context.stroke();
    // Punch arc.
    if (p.punchT > 0) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(x, y, 30, p.angle - 0.7, p.angle + 0.7);
      context.stroke();
    }
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, PLAYER.radius + 3, 0, Math.PI * 2);
    context.stroke();
  }

  function drawMarker(state, cam) {
    const target = missionTarget(state);
    if (!target) return;
    const x = target.x - cam.x;
    const y = target.y - cam.y;
    const bounce = Math.sin(state.time * 4) * 6;
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(x, y - 44 + bounce);
    context.lineTo(x + 12, y - 22 + bounce);
    context.lineTo(x - 12, y - 22 + bounce);
    context.closePath();
    context.fill();
    context.strokeStyle = '#7a5b00';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#7a5b00';
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
    plainText(target.label, x, y - 52 + bounce, 14, '#ffffff', 'center', 'alphabetic');
    // A guiding arrow from the player toward the marker when it is off screen.
    const p = state.player;
    if (x < -20 || x > FIELD.width + 20 || y < -20 || y > FIELD.height + 20) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ex = FIELD.width / 2 + (dx / len) * 300;
      const ey = FIELD.height / 2 + (dy / len) * 220;
      const ang = Math.atan2(dy, dx);
      context.save();
      context.translate(ex, ey);
      context.rotate(ang);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(16, 0);
      context.lineTo(-10, -11);
      context.lineTo(-10, 11);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawWorld(state) {
    const cam = camera(state);
    drawGround(state, cam);
    drawRoads(cam);
    drawBuildings(state, cam);
    drawMarker(state, cam);
    for (const car of state.cars) drawCar(car, cam, state);
    for (const ped of state.peds) drawPedestrian(ped, cam);
    drawPlayer(state, cam);
    // Bullets and particles on top.
    for (const b of state.bullets) {
      context.fillStyle = '#ffe14d';
      context.beginPath();
      context.arc(b.x - cam.x, b.y - cam.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.max);
      context.fillStyle = pt.color;
      context.fillRect(pt.x - cam.x - 3, pt.y - cam.y - 3, 6, 6);
    }
    context.globalAlpha = 1;
    return cam;
  }

  function drawMinimap(state) {
    const m = MINIMAP;
    const sx = m.w / WORLD.width;
    const sy = m.h / WORLD.height;
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(m.x - 6, m.y - 6, m.w + 12, m.h + 12);
    context.fillStyle = '#2e5d3a';
    context.fillRect(m.x, m.y, m.w, m.h);
    context.fillStyle = '#3d3a4a';
    for (const cx of ROADS.vertical) context.fillRect(m.x + cx * sx - 2, m.y, 4, m.h);
    for (const cy of ROADS.horizontal) context.fillRect(m.x, m.y + cy * sy, m.w, 4);
    context.fillStyle = PALETTE.water;
    context.fillRect(m.x, m.y + 2190 * sy, m.w, m.h - 2190 * sy);
    const target = missionTarget(state);
    if (target) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(m.x + target.x * sx, m.y + target.y * sy, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.driver === 'police') {
        context.fillStyle = '#ff4d4d';
        context.fillRect(m.x + car.x * sx - 3, m.y + car.y * sy - 3, 6, 6);
      }
    }
    const p = state.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(m.x + p.x * sx, m.y + p.y * sy, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(m.x + p.x * sx, m.y + p.y * sy, 3, 0, Math.PI * 2);
    context.fill();
    plainText('NEON HARBOR', m.x + m.w / 2, m.y + m.h + 22, 12, PALETTE.hudText, 'center', 'alphabetic');
  }

  function drawHud(state, save) {
    // Top-left: cash, health, ammo.
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(14, 14, 300, 96);
    text(fmtMoney(state.cash), 28, 44, 26, PALETTE.cash, 'left', 'alphabetic');
    plainText(`AMMO ${state.ammo}`, 28, 68, 15, PALETTE.hudText, 'left', 'alphabetic');
    plainText('HEALTH', 28, 96, 13, PALETTE.hudText, 'left', 'alphabetic');
    context.fillStyle = '#333';
    context.fillRect(92, 84, 200, 14);
    context.fillStyle = state.health > 30 ? '#4ade80' : '#ff4d4d';
    context.fillRect(92, 84, 200 * Math.max(0, state.health / 100), 14);
    // Top-centre: wanted stars and clock.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, FIELD.width / 2, 46, 30, state.wanted > 0 ? '#ffd166' : 'rgba(255,255,255,0.35)', 'center', 'alphabetic');
    plainText(fmtClock(state.clockMin), FIELD.width / 2, 72, 16, PALETTE.hudText, 'center', 'alphabetic');
    if (state.wanted > 0) {
      plainText(state.wanted >= 3 ? 'THE WHOLE FORCE IS AFTER YOU' : 'WANTED — LOSE THE HEAT', FIELD.width / 2, 96, 14, '#ff8a8a', 'center', 'alphabetic');
    }
    // Bottom-left: objective and message.
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(14, FIELD.height - 96, 640, 82);
    plainText('OBJECTIVE', 28, FIELD.height - 72, 12, PALETTE.hudMuted, 'left', 'alphabetic');
    text(objectiveText(state), 28, FIELD.height - 44, 18, PALETTE.hudText, 'left', 'alphabetic');
    if (state.mission.timer > 0) {
      text(fmtTimer(state.mission.timer), 640, FIELD.height - 44, 20, '#ff8a8a', 'right', 'alphabetic');
    }
    if (state.messageT > 0 && state.message) {
      plainText(state.message, 28, FIELD.height - 18, 15, '#ffe9a8', 'left', 'alphabetic');
    }
    // Bottom-right: controls reminder and save line.
    plainText('WASD move/drive · E enter car · F punch/shoot · P pause · M mute', FIELD.width - 16, FIELD.height - 40, 13, 'rgba(255,255,255,0.75)', 'right', 'alphabetic');
    plainText(save, FIELD.width - 16, FIELD.height - 18, 13, 'rgba(255,255,255,0.6)', 'right', 'alphabetic');
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 12, 24, 0.82)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = '#ffd166';
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, PALETTE.hudText, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      plainText(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 19, '#d7dce6', 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.hudMuted, 'center');
  }

  const TITLE_LINES = [
    'Neon Harbor — a sun-soaked harbour city, and you are new in town.',
    'Mara runs the garage on Dock Street. She has work for you:',
    'steal cars, run packages, pull the big score — and stay free.',
    '',
    'WASD / arrows — walk and drive · E — enter or leave a car',
    'F — punch, or fire your pistol · P — pause · M — mute sound',
    'Stealing, hitting people and shooting all raise your wanted level.',
    '',
  ];

  /** Paint one frame: the city, then the HUD or a panel for the screen. */
  function draw(state, screen, saveText) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0c101c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawWorld(state);
      // Darken the city behind the title panel.
      context.fillStyle = 'rgba(8, 10, 22, 0.55)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      const lines = [...TITLE_LINES];
      lines.push(saveText || '');
      drawPanel('NEON HARBOR', lines, 'Press Space or click to start');
      return;
    }
    drawWorld(state);
    drawHud(state, saveText);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8, 10, 22, 0.55)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('Paused', ['The city waits for you.', 'Your cash and missions are saved.'], 'Press P to keep playing');
    } else if (screen === SCREEN_OVER) {
      context.fillStyle = 'rgba(8, 10, 22, 0.6)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('Game over', [state.overReason || 'Your run in Neon Harbor is over.', `Cash banked: ${fmtMoney(state.cash)}`], 'Press Space or click to start again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, camera };
}
