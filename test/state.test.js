import test from 'node:test';
import assert from 'node:assert/strict';
import { moveStage, sanitize } from '../src/state.js';

test('migrates old stage data to stable stage and action ids', () => {
  const input = {
    version: 2,
    metadata: { name: 'Lineout', tags: ['test'] },
    currentStageIndex: 1,
    stages: [
      { boardView: 'pitchIn', players: [{ id: 'p1', team: 'attack', number: 1, x: 100, y: 200 }], ball: { x: 200, y: 300 }, actions: [{ kind: 'run', points: [{ x: 100, y: 200 }, { x: 200, y: 300 }] }] },
      { boardView: 'lineout', players: [{ id: 'p1', team: 'attack', number: 1, x: 300, y: 400 }], ball: { x: 300, y: 400 }, actions: [{ id: 'a1', kind: 'pass', points: [{ x: 300, y: 400 }, { x: 500, y: 450 }] }] }
    ]
  };

  const result = sanitize(input);
  assert.equal(result.version, 3);
  assert.equal(result.stages.length, 2);
  assert.notEqual(result.stages[0].id, result.stages[1].id);
  assert.equal(result.stages[0].players[0].id, 'p1');
  assert.equal(result.stages[1].players[0].id, 'p1');
  assert.ok(result.stages.every(stage => stage.actions[0].id));
  assert.notEqual(result.stages[0].actions[0].id, result.stages[1].actions[0].id);
  assert.equal(result.currentStageIndex, 1);
});

test('repairs duplicate ids without changing stage content', () => {
  const result = sanitize({ stages: [
    { id: 'same', players: [{ id: 'p', x: 10, y: 10 }, { id: 'p', x: 20, y: 20 }], actions: [] },
    { id: 'same', players: [], actions: [] }
  ] });
  assert.equal(new Set(result.stages.map(stage => stage.id)).size, 2);
  assert.equal(new Set(result.stages[0].players.map(player => player.id)).size, 2);
});

test('reordering stages keeps the active stage by stable id', () => {
  const data = { currentStageIndex: 1, stages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const result = moveStage(data, 0, 2);
  assert.deepEqual(result.stages.map(stage => stage.id), ['b', 'c', 'a']);
  assert.equal(result.currentStageIndex, 0);
  assert.deepEqual(data.stages.map(stage => stage.id), ['a', 'b', 'c']);
});
