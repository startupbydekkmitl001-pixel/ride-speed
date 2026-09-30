import { authenticate, failure, HttpError, preflight, readId, response } from '../_shared/http.ts';
import { verifyEvidence } from '../_shared/verify-evidence.mjs';

const invalidEvidence = new Set(['SCHEMA_UNSUPPORTED','CHALLENGE_MISMATCH','SESSION_INVALID','SAMPLE_COUNT','SAMPLE_MALFORMED','SIMULATED_LOCATION','TIMESTAMP_ORDER','NO_ELIGIBLE_WINDOW','EVIDENCE_TOO_LARGE','EVIDENCE_INVALID_JSON','CHALLENGE_INELIGIBLE']);

Deno.serve(async req => {
  let job: { admin: Awaited<ReturnType<typeof authenticate>>['admin']; id: string; token: string } | null = null;
  try {
    const options = preflight(req); if (options) return options;
    const { userId, userClient, admin } = await authenticate(req);
    const id = await readId(req, 'submissionId');
    const { data: submission, error } = await userClient.from('rs_submissions').select('id,owner_id,challenge_id,evidence_path,state,rejection_reason').eq('id', id).maybeSingle();
    if (error) throw new HttpError(503, 'SUBMISSION_LOOKUP_FAILED');
    if (!submission || submission.owner_id !== userId) throw new HttpError(404, 'SUBMISSION_UNAVAILABLE');
    if (submission.state === 'verified') {
      const { data: record, error: recordError } = await userClient.from('rs_verified_records').select('sustained_kmh,window_start,window_end,method').eq('submission_id', id).single();
      if (recordError) throw new HttpError(503, 'RECORD_UNAVAILABLE');
      return response(req, { state: 'verified', record });
    }
    if (submission.state === 'rejected') return response(req, { state: 'rejected', reason: submission.rejection_reason });
    const { data: token, error: claimError } = await admin.rpc('rs_claim_submission', { p_id: id, p_owner: userId });
    if (claimError) throw new HttpError(503, 'CLAIM_FAILED');
    if (!token) throw new HttpError(409, 'NOT_QUEUED_OR_BUSY_OR_ATTEMPTS_EXHAUSTED');
    job = { admin, id, token };
    const { data: challenge, error: challengeError } = await admin.from('rs_challenges').select('id,mode,state,course_session_id,starts_at,ends_at').eq('id', submission.challenge_id).single();
    if (challengeError) throw new HttpError(503, 'CHALLENGE_LOOKUP_FAILED');
    if (challenge.mode !== 'timed_race' || challenge.state !== 'open') throw new Error('CHALLENGE_INELIGIBLE');
    const { data: session, error: sessionError } = await admin.from('rs_course_sessions').select('course_id,approved,starts_at,ends_at').eq('id', challenge.course_session_id).single();
    if (sessionError) throw new HttpError(503, 'SESSION_LOOKUP_FAILED');
    const { data: course, error: courseError } = await admin.from('rs_courses').select('closed_course_approved,boundary_polygon').eq('id', session.course_id).single();
    if (courseError) throw new HttpError(503, 'COURSE_LOOKUP_FAILED');
    if (!session.approved || !course.closed_course_approved) throw new Error('CHALLENGE_INELIGIBLE');
    const { data: blob, error: downloadError } = await admin.storage.from('ride-evidence').download(submission.evidence_path);
    if (downloadError || !blob) throw new HttpError(503, 'EVIDENCE_DOWNLOAD_FAILED');
    if (blob.size > 2097152) throw new Error('EVIDENCE_TOO_LARGE');
    const bytes = await blob.arrayBuffer(); let evidence;
    try { evidence = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('EVIDENCE_INVALID_JSON'); }
    const result = verifyEvidence(evidence, {
      challengeId: challenge.id, startsAtMs: Math.max(Date.parse(challenge.starts_at), Date.parse(session.starts_at)),
      endsAtMs: Math.min(Date.parse(challenge.ends_at), Date.parse(session.ends_at)), nowMs: Date.now(), polygon: course.boundary_polygon,
    });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
    const { error: finalizeError } = await admin.rpc('rs_finalize_submission', {
      p_id: id, p_token: token, p_speed: result.sustainedKmh, p_start: new Date(result.windowStartMs).toISOString(),
      p_end: new Date(result.windowEndMs).toISOString(), p_samples: result.sampleCount, p_max_gap: result.maximumGapSeconds, p_sha256: sha256,
    });
    if (finalizeError) throw new HttpError(409, 'ELIGIBILITY_OR_LEASE_CHANGED');
    job = null;
    return response(req, { state: 'verified', record: { sustained_kmh: result.sustainedKmh, window_start: new Date(result.windowStartMs).toISOString(), window_end: new Date(result.windowEndMs).toISOString(), method: result.method } });
  } catch (error) {
    if (job) {
      const code = error instanceof Error ? error.message : '';
      if (invalidEvidence.has(code)) {
        const { data: rejected, error: rejectionError } = await job.admin.rpc('rs_reject_submission', { p_id: job.id, p_reason: code, p_token: job.token });
        if (!rejectionError && rejected === true) return response(req, { state: 'rejected', reason: code }, 422);
        if (!rejectionError) return response(req, { error: 'LEASE_CHANGED_REFRESH_STATUS' }, 409);
      } else {
        await job.admin.rpc('rs_release_submission', { p_id: job.id, p_token: job.token });
      }
    }
    return failure(req, error);
  }
});
