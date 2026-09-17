import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackPlan, interpolateCurvePoint, samplePlayback } from '../src/playback.js';

const stage = (id, x, y) => ({ id, boardView: 'pitchIn', players: [{ id: 'p1', team: 'attack', number: '1', x, y }], ball: { x, y }, actions: [] });

test('interpolates players and ball from saved stage positions on a curve', () => {
  const plan = createPlaybackPlan([stage('a', 100, 100), stage('b', 700, 500)], { loop: false, durationPerStage: 1000 });
  const start = samplePlayback(plan, 0);
  const middle = samplePlayback(plan, 500);
  const end = samplePlayback(plan, 1000);
  assert.deepEqual({ x: start.players[0].x, y: start.players[0].y }, { x: 100, y: 100 });
  assert.deepEqual({ x: end.players[0].x, y: end.players[0].y }, { x: 700, y: 500 });
  assert.notDeepEqual({ x: middle.players[0].x, y: middle.players[0].y }, { x: 400, y: 300 });
  assert.deepEqual(middle.ball, { x: middle.players[0].x, y: middle.players[0].y });
});

test('keeps stationary objects exact and avoids a bend for tiny moves', () => {
  assert.deepEqual(interpolateCurvePoint({ x: 10, y: 10 }, { x: 10, y: 10 }, .5, 'p'), { x: 10, y: 10 });
  const point = interpolateCurvePoint({ x: 10, y: 10 }, { x: 20, y: 10 }, .5, 'p');
  assert.equal(point.y, 10);
});

test('non-loop playback ends on the final saved stage', () => {
  const plan = createPlaybackPlan([stage('a', 100, 100), stage('b', 200, 200), stage('c', 300, 300)], { loop: false, durationPerStage: 400 });
  assert.equal(plan.transitions.length, 2);
  const result = samplePlayback(plan, plan.duration + 1);
  assert.equal(result.stageId, 'c');
  assert.equal(result.complete, true);
});

test('loop playback adds a transition from the last stage to the first', () => {
  const plan = createPlaybackPlan([stage('a', 100, 100), stage('b', 200, 200)], { loop: true, durationPerStage: 400 });
  assert.equal(plan.transitions.length, 2);
  const result = samplePlayback(plan, 400);
  assert.equal(result.stageId, 'b');
  assert.equal(result.nextStageId, 'a');
});
