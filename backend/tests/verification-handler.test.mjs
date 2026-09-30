import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { verifyEvidence } from '../functions/_shared/verify-evidence.mjs';

// Execute the maintained Edge entrypoint with only its network/service boundary
// stubbed. This catches a verifier error accidentally becoming a retryable job.
const source = await readFile(new URL('../functions/verify-submission/index.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''), { mode: 'strip' });

test('Edge handler terminally rejects simulated evidence using its current lease', async () => {
  const id = 'submission-test', owner = 'rider-test', token = 'lease-test', calls = [];
  const base = Date.now() - 10000;
  const evidence = { schemaVersion: 1, challengeId: 'challenge-test', source: 'corelocation', samples: [0, 1, 2, 3].map(i => ({
    timestampMs: base + i * 1000, latitude: 13.7 + i * .00009, longitude: 100.5,
    speedMps: 10, horizontalAccuracyM: 4, speedAccuracyMps: .4, isSimulatedBySoftware: true,
  })) };
  const window = { starts_at: new Date(base).toISOString(), ends_at: new Date(base + 60000).toISOString() };
  const rows = {
    rs_submissions: { id, owner_id: owner, challenge_id: evidence.challengeId, evidence_path: 'owned-evidence', state: 'queued' },
    rs_challenges: { id: evidence.challengeId, mode: 'timed_race', state: 'open', course_session_id: 'session-test', ...window },
    rs_course_sessions: { course_id: 'course-test', approved: true, ...window },
    rs_courses: { closed_course_approved: true, boundary_polygon: [{lat:13.6,lng:100.4},{lat:13.9,lng:100.4},{lat:13.9,lng:100.8},{lat:13.6,lng:100.8}] },
  };
  const from = table => {
    assert.ok(Object.hasOwn(rows, table));
    const query = { select: () => query, eq: () => query, single: async () => ({ data: rows[table], error: null }), maybeSingle: async () => ({ data: rows[table], error: null }) };
    return query;
  };
  const admin = {
    from,
    storage: { from: () => ({ download: async () => ({ data: new Blob([JSON.stringify(evidence)]), error: null }) }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'rs_claim_submission') return { data: token, error: null };
      if (name === 'rs_reject_submission') return { data: true, error: null };
      throw new Error(`Unexpected mutation: ${name}`);
    },
  };
  let handler;
  runInNewContext(executable, {
    Deno: { serve: fn => { handler = fn; } }, Error, TextDecoder,
    authenticate: async () => ({ userId: owner, userClient: { from }, admin }),
    readId: async () => id, preflight: () => null, verifyEvidence,
    HttpError: class extends Error {},
    response: (_req, body, status = 200) => new Response(JSON.stringify(body), { status }),
    failure: () => new Response('unexpected failure', { status: 500 }),
  });
  const response = await handler(new Request('https://example.test/verify', { method: 'POST' }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { state: 'rejected', reason: 'SIMULATED_LOCATION' });
  // Normalize the VM's record prototypes; values, identity and order matter here.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { name: 'rs_claim_submission', args: { p_id: id, p_owner: owner } },
    { name: 'rs_reject_submission', args: { p_id: id, p_reason: 'SIMULATED_LOCATION', p_token: token } },
  ]);
});
