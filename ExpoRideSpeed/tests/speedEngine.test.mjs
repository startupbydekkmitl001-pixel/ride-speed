import assert from 'node:assert/strict';
import test from 'node:test';
import { SpeedEngine } from '../src/speedEngine.ts';

const origin = 1_700_000_000_000;

function sample(speedMps, second, horizontalAccuracyM = 8) {
  return {
    speedMps,
    horizontalAccuracyM,
    timestampMs: origin + second * 1000,
  };
}

function process(engine, fix) {
  return engine.process(fix, fix.timestampMs);
}

test('three good fixes show median live speed and conservative max', () => {
  const engine = new SpeedEngine();
  const first = process(engine, sample(10, 0));
  assert.equal(first.quality, 'good');
  assert.equal(first.liveMps, null);
  assert.equal(first.maxMps, null);

  assert.equal(process(engine, sample(11, 1)).liveMps, null);
  const third = process(engine, sample(12, 2));
  assert.equal(third.liveMps, 11);
  assert.equal(third.maxMps, 10);
  assert.equal(third.horizontalAccuracyM, 8);
});

test('invalid speed with a usable position fix is weak and preserves confirmed max', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  for (const [second, speedMps, accuracy] of [
    [3, -1, 8],
    [4, null, 8],
    [5, Number.NaN, 8],
    [6, Number.POSITIVE_INFINITY, 30],
  ]) {
    const snapshot = process(engine, sample(speedMps, second, accuracy));
    assert.equal(snapshot.quality, 'weak');
    assert.equal(snapshot.liveMps, null);
    assert.equal(snapshot.maxMps, 12);
    assert.equal(snapshot.horizontalAccuracyM, accuracy);
  }

  // Bad speed must also discard every speed in the confirmation window.
  assert.equal(process(engine, sample(12, 7)).liveMps, null);
  assert.equal(process(engine, sample(12, 8)).liveMps, null);
  assert.equal(process(engine, sample(12, 9)).liveMps, 12);
});

test('invalid position accuracy is no fix even if speed is finite', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  for (const [second, accuracy] of [
    [3, -1],
    [4, null],
    [5, Number.NaN],
    [6, Number.POSITIVE_INFINITY],
  ]) {
    const snapshot = process(engine, sample(12, second, accuracy));
    assert.equal(snapshot.quality, 'noFix');
    assert.equal(snapshot.liveMps, null);
    assert.equal(snapshot.maxMps, 12);
    assert.equal(snapshot.horizontalAccuracyM, null);
  }

  const poorFixWithBadSpeed = process(engine, sample(null, 7, 60));
  assert.equal(poorFixWithBadSpeed.quality, 'noFix');
  assert.equal(poorFixWithBadSpeed.horizontalAccuracyM, 60);
});

test('weak and no-fix horizontal accuracy never confirm speed', () => {
  const engine = new SpeedEngine();
  const weak = process(engine, sample(20, 0, 30));
  assert.equal(weak.quality, 'weak');
  assert.equal(weak.liveMps, null);
  assert.equal(weak.horizontalAccuracyM, 30);

  const noFix = process(engine, sample(20, 1, 60));
  assert.equal(noFix.quality, 'noFix');
  assert.equal(noFix.liveMps, null);
  assert.equal(noFix.maxMps, null);
});

test('stale, future, duplicate and out-of-order fixes cannot change speed', () => {
  const engine = new SpeedEngine();
  assert.equal(engine.process(sample(100, 0), origin + 4000).quality, 'noFix');
  assert.equal(engine.process(sample(100, 5), origin + 4000).quality, 'noFix');

  for (let second = 6; second <= 8; second += 1) process(engine, sample(10, second));
  const prior = engine.snapshot;
  assert.deepEqual(engine.process(sample(100, 7.5), origin + 8000), prior);
  assert.deepEqual(engine.process(sample(100, 8), origin + 8000), prior);
});

test('a single plausible GPS spike cannot set a fake max', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  assert.equal(process(engine, sample(25, 3)).maxMps, 12);
  process(engine, sample(12, 4));
  const recovered = process(engine, sample(12, 5));
  assert.equal(recovered.liveMps, 12);
  assert.equal(recovered.maxMps, 12);
});

test('an implausible jump becomes weak and breaks the confirmation window', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  const spike = process(engine, sample(100, 3));
  assert.equal(spike.quality, 'weak');
  assert.equal(spike.liveMps, null);
  assert.equal(spike.maxMps, 12);

  assert.equal(process(engine, sample(12, 4)).liveMps, null);
  assert.equal(process(engine, sample(12, 5)).liveMps, null);
  assert.equal(process(engine, sample(12, 6)).liveMps, 12);
});

test('a gap or weak fix restarts the confirmation window', () => {
  const engine = new SpeedEngine();
  process(engine, sample(20, 0));
  process(engine, sample(20, 1));
  assert.equal(process(engine, sample(20, 5)).liveMps, null);
  assert.equal(process(engine, sample(20, 6)).liveMps, null);
  assert.equal(process(engine, sample(20, 7)).liveMps, 20);

  assert.equal(process(engine, sample(20, 8, 30)).quality, 'weak');
  assert.equal(process(engine, sample(20, 9)).liveMps, null);
});

test('sustained higher speed updates the max with no vehicle speed cap', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));
  for (let second = 3; second < 6; second += 1) process(engine, sample(20, second));
  assert.equal(engine.snapshot.maxMps, 20);

  const fasterSession = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(fasterSession, sample(80, second));
  assert.equal(fasterSession.snapshot.maxMps, 80);
});

test('tick expires the display but preserves confirmed max', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  const expired = engine.tick(origin + 5100);
  assert.equal(expired.quality, 'noFix');
  assert.equal(expired.liveMps, null);
  assert.equal(expired.maxMps, 12);
});

test('resetMax preserves fresh live speed but uses only post-reset fixes for new max', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  const reset = engine.resetMax();
  assert.equal(reset.liveMps, 12);
  assert.equal(reset.maxMps, null);

  assert.equal(process(engine, sample(20, 3)).maxMps, null);
  assert.equal(process(engine, sample(20, 4)).maxMps, null);
  const confirmed = process(engine, sample(20, 5));
  assert.equal(confirmed.maxMps, 20);
});

test('markUnavailable and resetSession clear the active readout', () => {
  const engine = new SpeedEngine();
  for (let second = 0; second < 3; second += 1) process(engine, sample(12, second));

  const unavailable = engine.markUnavailable();
  assert.equal(unavailable.quality, 'noFix');
  assert.equal(unavailable.liveMps, null);
  assert.equal(unavailable.maxMps, 12);

  const reset = engine.resetSession();
  assert.equal(reset.quality, 'noFix');
  assert.equal(reset.liveMps, null);
  assert.equal(reset.maxMps, null);
});
