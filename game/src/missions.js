// The story of Neon Harbor: three missions from Mara, the fixer who runs the
// garage on Dock Street. Each mission is stages of "reach a place" / "be in a
// car" / "survive", with cash on completion. The mission module owns only the
// mission state machine; the world owns the player and the cars.
import { EVENT_CASH, EVENT_MISSION } from './world.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: '1 — First Wheels',
    giver: 'Mara',
    briefing: 'Steal any car on the street and bring it to my garage on Dock Street.',
    reward: 500,
    stages: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)', target: null },
      { type: 'reach', text: 'Deliver the car to Mara\'s garage', target: { x: 1450, y: 350, label: 'GARAGE' } },
    ],
  },
  {
    id: 'courier-run',
    title: '2 — Courier Run',
    giver: 'Mara',
    briefing: 'A package is waiting at the park gate. Pick it up and run it to the beach cafe before the clock runs out.',
    reward: 800,
    stages: [
      { type: 'reach', text: 'Pick up the package at the park gate', target: { x: 1400, y: 800, label: 'PACKAGE' } },
      { type: 'deliver', text: 'Deliver the package to the beach cafe — 90 seconds!', target: { x: 2400, y: 2050, label: 'BEACH CAFE' }, timer: 90 },
    ],
  },
  {
    id: 'the-big-score',
    title: '3 — The Big Score',
    giver: 'Mara',
    briefing: 'Grab the harbour van at the docks, then lose the heat and get to the safehouse. The whole force will be after you.',
    reward: 2500,
    stages: [
      { type: 'reach', text: 'Steal the harbour van at the docks', target: { x: 2900, y: 2050, label: 'HARBOUR VAN' } },
      { type: 'escape', text: 'Lose the cops and reach the safehouse', target: { x: 400, y: 350, label: 'SAFEHOUSE' }, timer: 120 },
    ],
  },
];

/** The current mission and stage, or null when the story is finished. */
export function currentMission(state) {
  if (state.mission.index >= MISSIONS.length) return null;
  return MISSIONS[state.mission.index];
}

/** The current stage object, or null. */
export function currentStage(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.stages[state.mission.stage] ?? null;
}

/** The objective line the HUD shows. */
export function objectiveText(state) {
  const mission = currentMission(state);
  if (!mission) return 'Story complete — Neon Harbor is yours. Free roam!';
  const stage = currentStage(state);
  return `${mission.title}: ${stage ? stage.text : ''}`;
}

/** Where the yellow marker points right now, or null. */
export function missionTarget(state) {
  const stage = currentStage(state);
  return stage && stage.target ? stage.target : null;
}

function advanceStage(state) {
  const mission = currentMission(state);
  state.mission.stage += 1;
  if (state.mission.stage >= mission.stages.length) {
    state.cash += mission.reward;
    state.ammo = Math.min(24, state.ammo + 12);
    state.mission.done[state.mission.index] = true;
    state.mission.index += 1;
    state.mission.stage = 0;
    state.mission.timer = 0;
    state.mission.packageHeld = false;
    state.stats.delivered += 1;
    const next = currentMission(state);
    state.message = next
      ? `${next.giver}: "${next.briefing}" (+$${mission.reward})`
      : `Story complete! You earned $${mission.reward}. Neon Harbor is yours. (+$${mission.reward})`;
    state.messageT = 9;
    return EVENT_MISSION | EVENT_CASH;
  }
  state.message = mission.stages[state.mission.stage].text;
  state.messageT = 6;
  return EVENT_MISSION;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Advance the mission state machine one step. Returns event flags. Timed
 * stages fail back to their start when the clock runs out (no game over).
 */
export function updateMission(state, dt, addWanted) {
  const mission = currentMission(state);
  if (!mission || !state.mission.active) return 0;
  const stage = currentStage(state);
  if (!stage) return 0;
  const player = state.player;

  if (stage.timer && state.mission.timer === 0 && state.mission.stage > 0) {
    state.mission.timer = stage.timer;
  }
  if (stage.timer && state.mission.timer > 0) {
    state.mission.timer -= dt;
    if (state.mission.timer <= 0) {
      state.mission.timer = 0;
      state.mission.stage = 0;
      state.mission.packageHeld = false;
      state.message = 'Too slow — Mara gives you another shot. Start the run again.';
      state.messageT = 6;
      return EVENT_MISSION;
    }
  }

  if (stage.type === 'steal') {
    if (!player.onFoot) return advanceStage(state);
    return 0;
  }
  if (!stage.target) return 0;
  const near = dist(player.x, player.y, stage.target.x, stage.target.y) < 70;
  if (stage.type === 'reach') {
    if (!near) return 0;
    // Mission 1's delivery only counts while driving the stolen car.
    if (mission.id === 'first-wheels' && state.mission.stage === 1 && player.onFoot) return 0;
    if (mission.id === 'courier-run' && state.mission.stage === 0) {
      state.mission.packageHeld = true;
      state.message = 'Package grabbed. Now run it to the beach cafe — fast!';
      state.messageT = 5;
      state.mission.stage = 1;
      state.mission.timer = 90;
      return EVENT_MISSION;
    }
    if (mission.id === 'the-big-score' && state.mission.stage === 0) {
      // Grabbing the van trips the alarm: the whole force responds.
      addWanted(3);
      state.message = 'Alarm! Wanted level 3 — lose the cops and reach the safehouse!';
      state.messageT = 6;
      state.mission.stage = 1;
      state.mission.timer = 120;
      return EVENT_MISSION;
    }
    return advanceStage(state);
  }
  if (stage.type === 'deliver') {
    if (near && state.mission.packageHeld) return advanceStage(state);
    return 0;
  }
  if (stage.type === 'escape') {
    if (near && state.wanted <= 2) return advanceStage(state);
    return 0;
  }
  return 0;
}
