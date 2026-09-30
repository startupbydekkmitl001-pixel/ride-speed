import assert from 'node:assert/strict';
import test from 'node:test';
import { MotionBudget, mayAnimate } from '../src/features/motion/budget.ts';
import { observePowerMode } from '../src/features/motion/powerMode.ts';

test('motion requires visibility, focus, foreground, consent, and known normal power', () => {
  const allowed = { visible: true, focused: true, active: true, motion: true, lowPower: false };
  assert.equal(mayAnimate(allowed), true);
  for (const key of ['visible', 'focused', 'active', 'motion']) {
    assert.equal(mayAnimate({ ...allowed, [key]: false }), false, key);
  }
  assert.equal(mayAnimate({ ...allowed, lowPower: true }), false);
  assert.equal(mayAnimate({ ...allowed, lowPower: null }), false);
});

test('at most two eligible loops hold leases, including repeated requests', () => {
  const budget = new MotionBudget();
  budget.setEnabled(true);
  for (const id of ['a', 'a', 'b', 'c', 'd']) budget.request(id);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(id => budget.isGranted(id)), [true, true, false, false]);
  assert.equal(budget.activeCount, 2);
  const revision = budget.getSnapshot();
  budget.request('a');
  assert.equal(budget.getSnapshot(), revision, 'idempotent requests do not notify React');
});

test('a hidden or unmounted loop releases its slot to the oldest waiting visible loop', () => {
  const budget = new MotionBudget();
  budget.setEnabled(true);
  for (const id of ['a', 'b', 'c', 'd']) budget.request(id);
  budget.release('a');
  assert.equal(budget.isGranted('c'), true);
  assert.equal(budget.isGranted('d'), false);
  budget.release('b');
  assert.equal(budget.isGranted('d'), true);
  assert.equal(budget.activeCount, 2);
});

test('cancelled waiting loops do not consume a future slot', () => {
  const budget = new MotionBudget();
  budget.setEnabled(true);
  for (const id of ['a', 'b', 'c', 'd']) budget.request(id);
  budget.release('c');
  budget.release('a');
  assert.equal(budget.isGranted('c'), false);
  assert.equal(budget.isGranted('d'), true);
});

test('revocation stops an existing player before granting its slot to another player', () => {
  const budget = new MotionBudget();
  budget.setEnabled(true);
  budget.request('a');
  budget.request('b');
  budget.request('c');
  const events = [];
  budget.attachStop('a', () => events.push(['pause a', budget.isGranted('c')]));
  budget.subscribe(() => events.push(['notify', budget.isGranted('c')]));
  budget.release('a');
  assert.deepEqual(events, [['pause a', false], ['notify', true]]);
});

test('global restrictions immediately pause both players and preserve fair resume order', () => {
  const budget = new MotionBudget();
  budget.setEnabled(true);
  for (const id of ['a', 'b', 'c']) budget.request(id);
  const stopped = [];
  budget.attachStop('a', () => stopped.push('a'));
  budget.attachStop('b', () => stopped.push('b'));
  budget.setEnabled(false);
  assert.deepEqual(stopped, ['a', 'b']);
  assert.equal(budget.activeCount, 0);
  assert.equal(budget.isGranted('c'), false);
  budget.setEnabled(true);
  assert.deepEqual(['a', 'b', 'c'].map(id => budget.isGranted(id)), [true, true, false]);
});

test('disabled budget cannot grant new leases', () => {
  const budget = new MotionBudget();
  budget.request('a');
  assert.equal(budget.activeCount, 0);
  budget.release('a');
  budget.setEnabled(true);
  assert.equal(budget.activeCount, 0);
});

test('cleanup detaches subscriptions and only its own stop callback', () => {
  const budget = new MotionBudget();
  let notifications = 0;
  let stopped = 0;
  const unsubscribe = budget.subscribe(() => notifications++);
  budget.setEnabled(true);
  budget.request('a');
  const detachOld = budget.attachStop('a', () => stopped++);
  const detachNew = budget.attachStop('a', () => stopped += 2);
  detachOld();
  unsubscribe();
  const prior = notifications;
  budget.release('a');
  assert.equal(stopped, 2);
  assert.equal(notifications, prior);
  detachNew();
  budget.release('missing');
  assert.equal(stopped, 2);
});

test('a stop callback failure cannot strand the global budget', () => {
  const budget = new MotionBudget();
  budget.setEnabled(true);
  budget.request('a');
  budget.attachStop('a', () => { throw new Error('player was already disposed'); });
  budget.setEnabled(false);
  assert.equal(budget.activeCount, 0);
});

test('web never subscribes to the missing SDK listener and reports its documented unsupported default', () => {
  const states = [];
  const observer = observePowerMode('web', {
    read: () => { throw new Error('web must not access native power'); },
    subscribe: () => { throw new TypeError('ExpoBattery.default.addListener is not a function'); },
  }, state => states.push(state));
  observer.refresh();
  observer.remove();
  assert.deepEqual(states, [false, false]);
});

test('native power read failures retain an unknown state and cannot enable motion', async () => {
  const states = [];
  const observer = observePowerMode('native', {
    read: async () => { throw new Error('native module unavailable'); },
    subscribe: () => ({ remove() {} }),
  }, state => states.push(state));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, [null, null]);
  assert.equal(mayAnimate({ visible: true, focused: true, active: true, motion: true, lowPower: states.at(-1) }), false);
  observer.remove();
});

test('native subscription failures keep posters without crashing or trusting an unobserved read', () => {
  const states = [];
  const observer = observePowerMode('native', {
    read: () => { throw new Error('no read without a working native observer'); },
    subscribe: () => { throw new Error('cannot observe native power'); },
  }, state => states.push(state));
  observer.refresh();
  observer.remove();
  assert.deepEqual(states, [null, null]);
});

test('a low-power event cancels a stale normal-power read', async () => {
  let completeRead;
  let powerChanged;
  let removals = 0;
  const states = [];
  const observer = observePowerMode('native', {
    read: () => new Promise(resolve => { completeRead = resolve; }),
    subscribe: listener => { powerChanged = listener; return { remove() { removals++; } }; },
  }, state => states.push(state));
  powerChanged(true);
  completeRead(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, [null, true]);
  observer.remove();
  observer.remove();
  assert.equal(removals, 1);
});

test('resume re-reads native power with an immediate poster until the result arrives', async () => {
  const pending = [];
  const states = [];
  const observer = observePowerMode('native', {
    read: () => new Promise(resolve => pending.push(resolve)),
    subscribe: () => ({ remove() {} }),
  }, state => states.push(state));
  pending.shift()(false);
  await new Promise(resolve => setImmediate(resolve));
  observer.refresh();
  assert.deepEqual(states, [null, false, null]);
  pending.shift()(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, [null, false, null, true]);
  observer.remove();
});

test('power observer cleanup ignores an in-flight read and late native events', async () => {
  let completeRead;
  let powerChanged;
  const states = [];
  const observer = observePowerMode('native', {
    read: () => new Promise(resolve => { completeRead = resolve; }),
    subscribe: listener => { powerChanged = listener; return { remove() {} }; },
  }, state => states.push(state));
  observer.remove();
  completeRead(false);
  powerChanged(false);
  observer.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, [null]);
});
