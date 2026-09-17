export const BOARD_WIDTH = 1100;
export const BOARD_HEIGHT = 700;
export const BOARD_VIEWS = [['pitchIn', 'Pitch In'], ['pitchMiddle', 'Pitch Middle'], ['pitchOut', 'Pitch Out'], ['lineout', 'Lineout']];
export const STORAGE_KEY = 'implacables-rugby-tactics-v1';
export const DATA_VERSION = 3;

export const clone = value => JSON.parse(JSON.stringify(value));
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const uid = (prefix = 'id') => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;

export function defaultStage() {
  return { id: uid('stage'), boardView: 'pitchIn', players: [], ball: { x: 500, y: 460 }, actions: [] };
}

export function defaultData() {
  return { version: DATA_VERSION, metadata: { name: 'Untitled Play', description: '', tags: [] }, stages: [defaultStage()], currentStageIndex: 0 };
}

function uniqueId(candidate, prefix, used) {
  let id = String(candidate || uid(prefix));
  while (used.has(id)) id = uid(prefix);
  used.add(id);
  return id;
}

export function sanitize(value) {
  const base = defaultData();
  if (!value || !Array.isArray(value.stages) || !value.stages.length) return base;
  const stageIds = new Set();
  const playerIds = new Set();
  const actionIds = new Set();
  const clean = clone(base);
  clean.metadata = {
    name: String(value.metadata?.name || 'Untitled Play').slice(0, 120),
    description: String(value.metadata?.description || '').slice(0, 1000),
    tags: Array.isArray(value.metadata?.tags) ? value.metadata.tags.slice(0, 12).map(tag => String(tag).slice(0, 32)) : []
  };
  clean.stages = value.stages.slice(0, 120).map(stage => {
    const playersInStage = new Set();
    const players = Array.isArray(stage.players) ? stage.players.slice(0, 60).map(player => {
      const originalId = String(player.id || '');
      const id = originalId && !playersInStage.has(originalId) ? originalId : uniqueId('player', 'player', playerIds);
      playersInStage.add(id);
      playerIds.add(id);
      return {
        id,
        team: player.team === 'defence' ? 'defence' : 'attack',
        number: String(player.number ?? ''),
        x: clamp(Number(player.x) || 0, 15, BOARD_WIDTH - 15),
        y: clamp(Number(player.y) || 0, 15, BOARD_HEIGHT - 15)
      };
    }) : [];
    const actions = Array.isArray(stage.actions) ? stage.actions.slice(0, 160).map(action => {
      const id = uniqueId(action.id, 'action', actionIds);
      return { ...action, id };
    }) : [];
    return {
      id: uniqueId(stage.id, 'stage', stageIds),
      boardView: BOARD_VIEWS.some(([id]) => id === stage.boardView) ? stage.boardView : 'pitchIn',
      players,
      ball: { x: clamp(Number(stage.ball?.x) || 500, 8, BOARD_WIDTH - 8), y: clamp(Number(stage.ball?.y) || 460, 8, BOARD_HEIGHT - 8) },
      actions
    };
  });
  clean.version = DATA_VERSION;
  clean.currentStageIndex = clamp(Number(value.currentStageIndex) || 0, 0, clean.stages.length - 1);
  return clean;
}

export function moveStage(data, fromIndex, toIndex) {
  const next = clone(data);
  const from = clamp(Number(fromIndex), 0, next.stages.length - 1);
  const to = clamp(Number(toIndex), 0, next.stages.length - 1);
  if (from === to) return next;
  const activeId = next.stages[next.currentStageIndex]?.id;
  const [stage] = next.stages.splice(from, 1);
  next.stages.splice(to, 0, stage);
  next.currentStageIndex = Math.max(0, next.stages.findIndex(item => item.id === activeId));
  return next;
}
