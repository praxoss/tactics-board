import { BOARD_HEIGHT, BOARD_WIDTH, clamp } from './state.js';

export const DEFAULT_STAGE_DURATION = 800;

function curveSign(seed) {
  let hash = 0;
  for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return hash % 2 === 0 ? 1 : -1;
}

export function cubicBezierPoint(start, controlStart, controlEnd, end, amount) {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * controlStart.x + 3 * inverse * amount ** 2 * controlEnd.x + amount ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * amount * controlStart.y + 3 * inverse * amount ** 2 * controlEnd.y + amount ** 3 * end.y
  };
}

export function interpolateCurvePoint(from, to, amount, seed = '') {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance <= 0.5) return { x: to.x, y: to.y };

  // Avoid inventing a visible wobble for tiny corrections.
  const bend = distance < 24 ? 0 : Math.min(distance * 0.12, 36) * curveSign(seed);
  const normal = { x: -(to.y - from.y) / distance, y: (to.x - from.x) / distance };
  const controlStart = { x: from.x + (to.x - from.x) / 3 + normal.x * bend, y: from.y + (to.y - from.y) / 3 + normal.y * bend };
  const controlEnd = { x: from.x + 2 * (to.x - from.x) / 3 + normal.x * bend, y: from.y + 2 * (to.y - from.y) / 3 + normal.y * bend };
  const linearAmount = clamp(amount, 0, 1);
  const easedAmount = linearAmount * linearAmount * (3 - 2 * linearAmount);
  return cubicBezierPoint(from, controlStart, controlEnd, to, easedAmount);
}

function stageSnapshot(stage) {
  return {
    stageId: stage.id,
    boardView: stage.boardView,
    players: stage.players.map(player => ({ ...player, x: Number(player.x), y: Number(player.y) })),
    ball: { ...stage.ball }
  };
}

export function createPlaybackPlan(stages, options = {}) {
  const durationPerStage = Math.max(1, Number(options.durationPerStage ?? DEFAULT_STAGE_DURATION));
  const loop = options.loop !== false;
  const snapshots = (stages || []).map(stageSnapshot);
  const transitions = [];
  if (snapshots.length > 1) {
    for (let index = 0; index < snapshots.length - 1; index += 1) transitions.push({ from: snapshots[index], to: snapshots[index + 1], duration: durationPerStage });
    if (loop) transitions.push({ from: snapshots.at(-1), to: snapshots[0], duration: durationPerStage });
  }
  return {
    stages: snapshots,
    transitions,
    durationPerStage,
    loop,
    duration: transitions.reduce((sum, transition) => sum + transition.duration, 0)
  };
}

function stationarySnapshot(stage) {
  return {
    stageIndex: stage ? 0 : -1,
    stageId: stage?.stageId || null,
    nextStageId: null,
    progress: 1,
    players: stage?.players || [],
    ball: stage?.ball || { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 },
    boardView: stage?.boardView || 'pitchIn',
    complete: true
  };
}

export function samplePlayback(plan, timestamp) {
  if (!plan?.stages?.length) return stationarySnapshot(null);
  if (!plan.transitions.length) return stationarySnapshot(plan.stages[0]);

  const rawTime = Number(timestamp) || 0;
  const elapsed = plan.loop
    ? ((rawTime % plan.duration) + plan.duration) % plan.duration
    : clamp(rawTime, 0, plan.duration);
  const isFinished = !plan.loop && rawTime >= plan.duration;
  if (isFinished) {
    const last = plan.stages.at(-1);
    return { ...stationarySnapshot(last), stageIndex: plan.stages.length - 1, stageId: last.stageId, complete: true };
  }

  const transitionIndex = Math.min(Math.floor(elapsed / plan.durationPerStage), plan.transitions.length - 1);
  const transition = plan.transitions[transitionIndex];
  const progress = (elapsed - transitionIndex * plan.durationPerStage) / transition.duration;
  const fromPlayers = new Map(transition.from.players.map(player => [player.id, player]));
  return {
    stageIndex: transitionIndex,
    stageId: transition.from.stageId,
    nextStageId: transition.to.stageId,
    progress,
    boardView: transition.from.boardView,
    complete: false,
    players: transition.to.players.map(player => {
      const from = fromPlayers.get(player.id) || player;
      return { id: player.id, team: player.team, number: player.number, ...interpolateCurvePoint(from, player, progress, player.id) };
    }),
    ball: interpolateCurvePoint(transition.from.ball, transition.to.ball, progress, 'ball')
  };
}

export function renderPlaybackFrame(context, sample, options = {}) {
  if (!context || !sample) return;
  const width = options.width || BOARD_WIDTH;
  const height = options.height || BOARD_HEIGHT;
  const scaleX = width / BOARD_WIDTH;
  const scaleY = height / BOARD_HEIGHT;
  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(scaleX, scaleY);
  if (options.renderStage) options.renderStage(sample);
  context.restore();
}
