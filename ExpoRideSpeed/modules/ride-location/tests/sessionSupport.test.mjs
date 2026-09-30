import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExclusiveLocationCapture, RideEvidenceBuffer, MAX_EVIDENCE_SAMPLES, MAX_EVIDENCE_JSON_BYTES,
} from '../src/sessionSupport.ts';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('cancel a pending start, then start again: old provider fully stops first', async () => {
  const capture = new ExclusiveLocationCapture(), pending = deferred(), entered = deferred();
  const first = Symbol('first'), next = Symbol('next'), calls = [];
  let wanted = true, active = 0, peak = 0;
  const starting = capture.start(first, () => wanted, {
    start: async () => { calls.push('start first'); active += 1; peak = Math.max(peak, active); entered.resolve(); await pending.promise; },
    stop: async () => { calls.push('stop first'); active -= 1; },
  });
  await entered.promise;
  wanted = false;
  const stopping = capture.stop(first);
  const restarting = capture.start(next, () => true, {
    start: async () => { calls.push('start next'); active += 1; peak = Math.max(peak, active); },
    stop: async () => { calls.push('stop next'); active -= 1; },
  });
  pending.resolve();
  assert.equal(await starting, false);
  await stopping;
  assert.equal(await restarting, true);
  assert.equal(peak, 1);
  assert.deepEqual(calls, ['start first', 'stop first', 'start next']);
  // A delayed cleanup from the earlier hook generation must not stop this one.
  await capture.stop(first);
  assert.equal(capture.owns(next), true);
  await capture.stop(next);
  assert.equal(active, 0);
});

test('cancel before acquisition avoids starting the provider at all', async () => {
  const capture = new ExclusiveLocationCapture();
  let starts = 0;
  assert.equal(await capture.start(Symbol(), () => false, {
    start: async () => { starts += 1; }, stop: async () => {},
  }), false);
  assert.equal(starts, 0);
});

test('a failed start cleans up, keeps its original error, and allows a later session', async () => {
  const capture = new ExclusiveLocationCapture(), owner = Symbol(), next = Symbol();
  const denied = Object.assign(new Error('denied'), { code: 'E_LOCATION_PERMISSION' });
  let stops = 0;
  await assert.rejects(capture.start(owner, () => true, {
    start: async () => { throw denied; }, stop: async () => { stops += 1; },
  }), error => error === denied);
  assert.equal(stops, 1);
  assert.equal(capture.owns(owner), false);
  assert.equal(await capture.start(next, () => true, { start: async () => {}, stop: async () => {} }), true);
  await capture.stop(next);
});

test('failed stop retains ownership and prevents overlapping new capture', async () => {
  const capture = new ExclusiveLocationCapture(), owner = Symbol();
  let newStarts = 0, failStop = true;
  await capture.start(owner, () => true, {
    start: async () => {}, stop: async () => { if (failStop) throw new Error('stop failed'); },
  });
  await assert.rejects(capture.stop(owner), /stop failed/);
  await assert.rejects(capture.start(Symbol(), () => true, {
    start: async () => { newStarts += 1; }, stop: async () => {},
  }), /already running/);
  assert.equal(newStarts, 0);
  failStop = false;
  await capture.stop(owner);
});

const sample = {
  timestampMs: 1700000000000, latitude: 13.7563, longitude: 100.5018,
  speedMps: 10, horizontalAccuracyM: 8, speedAccuracyMps: -1,
  isSimulatedBySoftware: null, isProducedByAccessory: null, mocked: null,
};

test('raw invalid accuracy, unknown flags and captured values survive snapshot mutation', () => {
  const buffer = new RideEvidenceBuffer();
  buffer.reset(true);
  const input = { ...sample };
  buffer.append(input);
  input.speedMps = 999;
  const first = buffer.snapshot();
  assert.equal(first.nativeSource, true);
  assert.equal(first.samples[0].speedAccuracyMps, -1);
  assert.equal(first.samples[0].isSimulatedBySoftware, null);
  first.samples[0].speedMps = 888;
  first.samples.push(sample);
  assert.equal(buffer.snapshot().samples.length, 1);
  assert.equal(buffer.snapshot().samples[0].speedMps, 10);
  buffer.reset(false);
  assert.deepEqual(buffer.snapshot(), { samples: [], nativeSource: false, truncated: false });
});

test('evidence never exceeds either limit and explicitly reports truncation', () => {
  const buffer = new RideEvidenceBuffer();
  buffer.reset(true);
  for (let index = 0; index < MAX_EVIDENCE_SAMPLES + 100; index += 1) {
    buffer.append({ ...sample, timestampMs: sample.timestampMs + index });
  }
  const saved = buffer.snapshot();
  assert.equal(saved.truncated, true);
  assert.ok(saved.samples.length <= MAX_EVIDENCE_SAMPLES);
  assert.ok(Buffer.byteLength(JSON.stringify(saved.samples), 'utf8') <= MAX_EVIDENCE_JSON_BYTES);
  assert.equal(saved.samples[0].timestampMs, sample.timestampMs);
  assert.equal(saved.samples.at(-1).timestampMs, sample.timestampMs + saved.samples.length - 1);
});

test('large numeric representations hit the byte cap before the sample count cap', () => {
  const buffer = new RideEvidenceBuffer();
  for (let index = 0; index < MAX_EVIDENCE_SAMPLES; index += 1) {
    buffer.append({ ...sample, timestampMs: 1.2345678901234567e100, latitude: -1.2345678901234567e100,
      longitude: 1.2345678901234567e100, speedMps: 1.2345678901234567e100,
      horizontalAccuracyM: 1.2345678901234567e100, speedAccuracyMps: 1.2345678901234567e100 });
  }
  const saved = buffer.snapshot();
  assert.equal(saved.truncated, true);
  assert.ok(saved.samples.length < MAX_EVIDENCE_SAMPLES);
  assert.ok(Buffer.byteLength(JSON.stringify(saved.samples), 'utf8') <= MAX_EVIDENCE_JSON_BYTES);
});
