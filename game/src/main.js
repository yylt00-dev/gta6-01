// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over.
//
// ?seed=N fixes the city. ?shot=1-chase|2-drive|3-mission|4-title (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP, createRandom } from './config.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

/** Load the save (cash, missions done) or start fresh. */
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { cash: 150, missionsDone: 0 };
    const parsed = JSON.parse(raw);
    return {
      cash: typeof parsed.cash === 'number' ? parsed.cash : 150,
      missionsDone: typeof parsed.missionsDone === 'number' ? parsed.missionsDone : 0,
    };
  } catch {
    return { cash: 150, missionsDone: 0 };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function saveLine(save) {
  return `Saved: $${Math.floor(save.cash).toLocaleString('en-US')} · ${save.missionsDone} mission${save.missionsDone === 1 ? '' : 's'} done`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = readSave();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let sirenT = 0;

  // A fresh visit starts with the saved cash; missions restart from the top.
  world.state.cash = save.cash;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.state.cash = save.cash;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce('Playing. Mara needs a car stolen and delivered to her garage.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    save.cash = world.state.cash;
    save.missionsDone = world.state.mission.done.filter(Boolean).length;
    writeSave(save);
    announce(`Game over. ${world.state.overReason}`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      save.cash = world.state.cash;
      save.missionsDone = world.state.mission.done.filter(Boolean).length;
      writeSave(save);
      announce('Paused. Progress saved.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { up: false, down: false, left: false, right: false }, 0);
      return;
    }
    const before = world.state.cash;
    const events = world.step(STEP, input.held, actions);
    if (world.state.cash > before) audio.cash();
    if (world.state.wanted > 0) {
      sirenT -= STEP;
      if (sirenT <= 0) {
        audio.siren();
        sirenT = 2.4;
      }
    }
    if (world.state.over) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Take the one-shot presses once per frame: the screen handler eats
    // confirm/pause/mute, the world gets enter/shoot on the first step.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let pending = screen === SCREEN_PLAY ? actions : 0;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(pending);
        pending = 0;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (screen === SCREEN_PLAY) {
      save.cash = world.state.cash;
      save.missionsDone = world.state.mission.done.filter(Boolean).length;
    }
    const driving = screen === SCREEN_PLAY && !world.state.player.onFoot && world.state.player.car;
    audio.engine(driving ? world.state.player.car.speed : 0, Boolean(driving));
    renderer.draw(world.state, screen, saveLine(save));
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      save.cash = world.state.cash;
      save.missionsDone = world.state.mission.done.filter(Boolean).length;
      writeSave(save);
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
