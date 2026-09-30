import type { CapturedRideEvidence } from "../useRideSession";

export type ResultAudience = "private" | "friends" | "community";
export type TimedChallenge = {
  id: string;
  route_snapshot: { title?: string } | null;
  mode: string;
  metric: string;
  course_session_id: string | null;
  starts_at: string;
  ends_at: string;
  state: string;
};
export type CaptureBinding = {
  sessionId: string;
  ownerId: string;
  challenge: TimedChallenge;
};
export type SubmissionRow = {
  id: string;
  owner_id: string;
  challenge_id: string;
  evidence_path: string;
  visibility: ResultAudience;
  state: "pending_upload" | "queued" | "verifying" | "verified" | "rejected";
  rejection_reason: string | null;
  verification_started_at: string | null;
  verification_attempts: number;
};
export type SubmissionDraft = {
  id: string;
  ownerId: string;
  challengeId: string;
  visibility: ResultAudience;
  bytes: ArrayBuffer;
};
export type PreparedEvidence = {
  bytes: ArrayBuffer;
  sampleCount: number;
  startsAtMs: number;
  endsAtMs: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SUBMISSION_BYTES = 2 * 1024 * 1024;

export function challengeUnavailable(
  challenge: TimedChallenge,
  accepted: boolean,
  now: number,
): string | null {
  if (!accepted) return "ต้องยอมรับคำเชิญของรายการนี้ก่อนเริ่ม";
  if (
    challenge.mode !== "timed_race" ||
    challenge.metric !== "sustained_speed_3s" ||
    !challenge.course_session_id
  )
    return "รายการนี้เป็นทริปกลุ่ม จึงไม่มีการส่งผลจับเวลา";
  if (challenge.state !== "open") return "รายการนี้ถูกยกเลิกแล้ว";
  const start = Date.parse(challenge.starts_at),
    end = Date.parse(challenge.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "เวลาเริ่มและสิ้นสุดของรายการไม่ถูกต้อง";
  if (now < start) return "ยังไม่ถึงเวลาเริ่มรายการ";
  if (now >= end) return "รายการนี้สิ้นสุดแล้ว";
  return null;
}

/** Client preflight only. Course boundaries, signal quality and eligibility remain server decisions. */
export function prepareRideEvidence(
  evidence: CapturedRideEvidence,
  binding: CaptureBinding,
): PreparedEvidence {
  if (!evidence.sessionId || evidence.sessionId !== binding.sessionId)
    throw new Error("ข้อมูลนี้ไม่ใช่รอบที่เริ่มกับรายการนี้ กรุณาเริ่มรอบใหม่");
  if (!UUID.test(binding.challenge.id))
    throw new Error("ไม่พบรหัสรายการที่ถูกต้อง");
  if (!evidence.nativeSource)
    throw new Error(
      "รอบนี้ไม่มีค่าความแม่นยำความเร็วจาก iPhone เปิดแอปที่ติดตั้งบน iPhone แล้วเริ่มรอบใหม่เพื่อส่งผล",
    );
  if (evidence.truncated)
    throw new Error("รอบนี้ยาวเกินขนาดข้อมูลที่ส่งได้ กรุณาเริ่มรอบที่สั้นลง");
  if (evidence.samples.length < 4)
    throw new Error(
      "ข้อมูล GPS ยังน้อยเกินไป ต้องมีอย่างน้อย 4 จุดต่อเนื่องครอบคลุม 3 วินาที",
    );
  let previous = -Infinity;
  for (const sample of evidence.samples) {
    if (
      ![
        sample.timestampMs,
        sample.latitude,
        sample.longitude,
        sample.speedMps,
        sample.horizontalAccuracyM,
        sample.speedAccuracyMps,
      ].every((value) => typeof value === "number" && Number.isFinite(value))
    )
      throw new Error(
        "รอบนี้มีข้อมูลตำแหน่งหรือค่าความแม่นยำไม่ครบ จึงส่งผลไม่ได้",
      );
    if (
      !Number.isSafeInteger(sample.timestampMs) ||
      Math.abs(sample.latitude) > 90 ||
      Math.abs(sample.longitude) > 180
    )
      throw new Error(
        "ข้อมูลเวลาและตำแหน่งของรอบนี้ไม่ถูกต้อง กรุณาเริ่มรอบใหม่",
      );
    if (sample.timestampMs <= previous)
      throw new Error(
        "ข้อมูล GPS ของรอบนี้มีเวลาซ้ำหรือไม่เรียงลำดับ จึงส่งผลไม่ได้",
      );
    if (sample.isSimulatedBySoftware === true || sample.mocked === true)
      throw new Error("รายการจับเวลาไม่รับข้อมูลตำแหน่งจำลอง");
    previous = sample.timestampMs;
  }
  const startsAtMs = evidence.samples[0].timestampMs,
    endsAtMs = evidence.samples[evidence.samples.length - 1].timestampMs;
  if (endsAtMs - startsAtMs < 3000)
    throw new Error("ข้อมูล GPS ยังไม่ครอบคลุม 3 วินาที กรุณาเริ่มรอบใหม่");
  // Preserve every delivered sample and field. Never filter, interpolate, round or insert accuracy here.
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 1,
      challengeId: binding.challenge.id,
      source: "corelocation",
      samples: evidence.samples,
    }),
  ).buffer;
  if (bytes.byteLength > MAX_SUBMISSION_BYTES)
    throw new Error("ข้อมูลรอบนี้ใหญ่เกินขนาดที่ส่งได้ กรุณาเริ่มรอบที่สั้นลง");
  return { bytes, sampleCount: evidence.samples.length, startsAtMs, endsAtMs };
}

export type SubmissionTransport = {
  assertOwner: () => Promise<void>;
  read: (id: string) => Promise<SubmissionRow | null>;
  reserve: (draft: SubmissionDraft) => Promise<string>;
  exists: (path: string) => Promise<boolean>;
  upload: (path: string, bytes: ArrayBuffer) => Promise<void>;
  queue: (id: string) => Promise<void>;
  verify: (id: string) => Promise<void>;
};

/** Same ID, immutable bytes and reserved path across explicit retries. Never runs on a timer. */
export async function sendRideSubmission(
  draft: SubmissionDraft,
  api: SubmissionTransport,
  now = Date.now(),
): Promise<{ row: SubmissionRow; verificationInterrupted: boolean }> {
  if (
    !UUID.test(draft.id) ||
    !UUID.test(draft.challengeId) ||
    draft.bytes.byteLength > MAX_SUBMISSION_BYTES
  )
    throw new Error("ข้อมูลที่จะส่งไม่ถูกต้อง");
  const path = `${draft.ownerId}/${draft.id}/samples.bin`;
  const checkRow = (row: SubmissionRow) => {
    if (
      row.id !== draft.id ||
      row.owner_id !== draft.ownerId ||
      row.challenge_id !== draft.challengeId ||
      row.visibility !== draft.visibility ||
      row.evidence_path !== path
    )
      throw new Error(
        "รายการที่บันทึกไว้ไม่ตรงกับรอบนี้ หยุดส่งเพื่อป้องกันข้อมูลผิดรายการ",
      );
    return row;
  };
  const read = async () => {
    await api.assertOwner();
    const row = await api.read(draft.id);
    return row ? checkRow(row) : null;
  };
  let row = await read();
  if (!row) {
    await api.assertOwner();
    const reservedPath = await api.reserve(draft);
    if (reservedPath !== path)
      throw new Error("ตำแหน่งจัดเก็บข้อมูลไม่ตรงกับรายการนี้");
    row = await read();
    if (!row)
      throw new Error("ยังยืนยันการบันทึกรายการไม่ได้ ลองส่งต่ออีกครั้ง");
  }
  if (row.state === "pending_upload") {
    await api.assertOwner();
    if (!(await api.exists(path))) {
      await api.assertOwner();
      try {
        await api.upload(path, draft.bytes);
      } catch (error) {
        // An upload can succeed while its response is lost. Never overwrite the object.
        await api.assertOwner();
        if (!(await api.exists(path))) throw error;
      }
    }
    await api.assertOwner();
    try {
      await api.queue(draft.id);
    } catch (error) {
      const latest = await read();
      if (!latest || latest.state === "pending_upload") throw error;
    }
    row = await read();
    if (!row) throw new Error("ยังอ่านสถานะรายการไม่ได้ ลองตรวจสอบอีกครั้ง");
  }
  let verificationInterrupted = false;
  const leaseExpired =
    row.state === "verifying" &&
    !!row.verification_started_at &&
    now - Date.parse(row.verification_started_at) >= 120_000 &&
    row.verification_attempts < 3;
  if (row.state === "queued" || leaseExpired) {
    await api.assertOwner();
    try {
      await api.verify(draft.id);
    } catch {
      verificationInterrupted = true;
    }
    row = await read();
    if (!row)
      throw new Error("ส่งแล้ว แต่ยังอ่านสถานะไม่ได้ ตรวจสอบสถานะอีกครั้งได้");
  }
  if (row.state === "verified" || row.state === "rejected")
    verificationInterrupted = false;
  return { row, verificationInterrupted };
}
