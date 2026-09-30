import { createClient, type Session } from "@supabase/supabase-js";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Switch, View } from "react-native";

import { Button, Icon, Note, Panel, Row, Segments, T } from "./ui";
import { publicService } from "../lib/publicService";
import {
  challengeUnavailable,
  prepareRideEvidence,
  sendRideSubmission,
  type CaptureBinding,
  type PreparedEvidence,
  type ResultAudience,
  type SubmissionDraft,
  type SubmissionRow,
  type SubmissionTransport,
  type TimedChallenge,
} from "../lib/rideSubmission";
import { configured } from "../lib/supabase";
import { useNow } from "../lib/useNow";
import { useApp } from "../state/AppState";
import { isAccountCurrent, useAuth, type AuthScope } from "../state/AuthState";
import type { CapturedRideEvidence, useRideSession } from "../useRideSession";

type Props = {
  ride: ReturnType<typeof useRideSession>;
  challengeId?: string;
  onSessionStart: () => void;
};
type Review = {
  binding: CaptureBinding;
  evidence: CapturedRideEvidence;
  prepared: PreparedEvidence | null;
  error: string | null;
};
type LoadedChallenge = {
  key: string;
  challenge: TimedChallenge | null;
  accepted: boolean;
  error: string | null;
};
const audienceItems: { value: ResultAudience; label: string }[] = [
  { value: "private", label: "เฉพาะฉัน" },
  { value: "friends", label: "เพื่อน" },
  { value: "community", label: "ชุมชน" },
];
const submissionFields =
  "id,owner_id,challenge_id,evidence_path,visibility,state,rejection_reason,verification_started_at,verification_attempts";
const date = (value: string | number) =>
  new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const title = (challenge: TimedChallenge) =>
  typeof challenge.route_snapshot?.title === "string"
    ? challenge.route_snapshot.title
    : "รายการจับเวลา";

// An in-flight write keeps its initiating JWT; it cannot switch to another account mid-request.
function scopedClient(session: Session) {
  return createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? publicService.url,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      publicService.publishableKey,
    {
      accessToken: async () => session.access_token,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
function assertScope(scope: AuthScope) {
  if (!isAccountCurrent(scope))
    throw new Error(
      "บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่บัญชีที่เริ่มรอบนี้ก่อนส่งผล",
    );
}
async function fetchChallenge(
  id: string,
  session: Session,
  scope: AuthScope,
): Promise<{ challenge: TimedChallenge; accepted: boolean }> {
  assertScope(scope);
  const client = scopedClient(session);
  const [challenge, member] = await Promise.all([
    client
      .from("rs_challenges")
      .select(
        "id,route_snapshot,mode,metric,course_session_id,starts_at,ends_at,state",
      )
      .eq("id", id)
      .maybeSingle(),
    client
      .from("rs_challenge_members")
      .select("state")
      .eq("challenge_id", id)
      .eq("user_id", session.user.id)
      .maybeSingle(),
  ]);
  assertScope(scope);
  if (challenge.error || member.error)
    throw new Error("โหลดรายการไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  if (!challenge.data)
    throw new Error("ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์เข้าร่วมแล้ว");
  return {
    challenge: challenge.data as TimedChallenge,
    accepted: member.data?.state === "accepted",
  };
}
function transport(
  session: Session,
  scope: AuthScope,
  stillMounted: () => boolean,
): SubmissionTransport {
  const client = scopedClient(session),
    bucket = client.storage.from("ride-evidence");
  return {
    assertOwner: async () => {
      assertScope(scope);
      if (!stillMounted()) throw new Error("หยุดการส่งแล้ว");
    },
    read: async (id) => {
      const { data, error } = await client
        .from("rs_submissions")
        .select(submissionFields)
        .eq("id", id)
        .eq("owner_id", session.user.id)
        .maybeSingle();
      if (error) throw new Error("อ่านสถานะไม่สำเร็จ ลองตรวจสอบอีกครั้ง");
      return data as SubmissionRow | null;
    },
    reserve: async (draft) => {
      const { data, error } = await client.rpc("rs_reserve_submission", {
        p_id: draft.id,
        p_challenge: draft.challengeId,
        p_visibility: draft.visibility,
      });
      if (error)
        throw new Error(
          "ยังยืนยันรายการไม่ได้ ลองส่งต่ออีกครั้ง หากสิทธิ์เข้าร่วมเปลี่ยนไป ให้ตรวจสอบรายการในชุมชน",
        );
      return data as string;
    },
    exists: async (path) => {
      const { data, error } = await bucket.exists(path);
      if (data) return true;
      const status = error ? Number(error.status) : null;
      // storage-js treats HEAD 400/404 as a missing object; HEAD responses have no JSON message.
      if (error && status !== 404 && status !== 400)
        throw new Error("ตรวจสอบข้อมูลที่ส่งไว้ไม่สำเร็จ ลองส่งต่ออีกครั้ง");
      return false;
    },
    upload: async (path, bytes) => {
      const { error } = await bucket.upload(path, bytes, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (error)
        throw new Error(
          "ส่งข้อมูลยังไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองส่งต่อ",
        );
    },
    queue: async (id) => {
      const { error } = await client.rpc("rs_queue_submission", { p_id: id });
      if (error)
        throw new Error(
          "ส่งข้อมูลแล้ว แต่ยังยืนยันคิวตรวจสอบไม่ได้ ลองส่งต่ออีกครั้ง",
        );
    },
    verify: async (id) => {
      const { error } = await client.functions.invoke("verify-submission", {
        body: { submissionId: id },
      });
      if (error) throw error;
    },
  };
}
function rejectionText(reason: string | null) {
  if (reason === "NO_ELIGIBLE_WINDOW")
    return "ไม่มีช่วงข้อมูลต่อเนื่องที่ผ่านเกณฑ์เวลา สัญญาณ และขอบเขตสนาม";
  if (reason === "CHALLENGE_INELIGIBLE")
    return "รายการหรือสิทธิ์เข้าร่วมไม่ผ่านเงื่อนไขในเวลาที่ตรวจสอบ";
  if (reason === "TIMESTAMP_ORDER")
    return "ข้อมูล GPS มีเวลาซ้ำหรือไม่เรียงลำดับ";
  if (reason === "EVIDENCE_TOO_LARGE") return "ข้อมูลมีขนาดเกินที่ระบบรับได้";
  return "ข้อมูลรอบนี้ไม่ผ่านเกณฑ์ตรวจสอบของรายการ";
}

export function RideControls({ ride, challengeId, onSessionStart }: Props) {
  const { session, scope } = useAuth(),
    { colors } = useApp(),
    now = useNow();
  const [loaded, setLoaded] = useState<LoadedChallenge | null>(null),
    [reload, setReload] = useState(0);
  const [binding, setBinding] = useState<CaptureBinding | null>(null),
    [review, setReview] = useState<Review | null>(null);
  const [audience, setAudience] = useState<ResultAudience>("private"),
    [consent, setConsent] = useState(false),
    [showCoordinates, setShowCoordinates] = useState(false);
  const [draft, setDraft] = useState<SubmissionDraft | null>(null),
    [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [busy, setBusy] = useState(false),
    [starting, setStarting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const mounted = useRef(true),
    operation = useRef(false),
    startPending = useRef(false),
    contextVersion = useRef(0);
  const requestKey = `${scope.generation}:${challengeId ?? ""}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    contextVersion.current++;
  }, [requestKey]);

  useEffect(() => {
    let current = true;
    if (challengeId && session && configured) {
      void fetchChallenge(challengeId, session, scope)
        .then((value) => {
          if (current) setLoaded({ key: requestKey, ...value, error: null });
        })
        .catch((e) => {
          if (current)
            setLoaded({
              key: requestKey,
              challenge: null,
              accepted: false,
              error: e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ",
            });
        });
    }
    return () => {
      current = false;
    };
  }, [challengeId, session, scope, requestKey, reload]);

  const currentLoaded = loaded?.key === requestKey ? loaded : null;
  const boundHere =
    binding?.sessionId === ride.sessionId &&
    binding.ownerId === session?.user.id
      ? binding
      : null;
  const visibleReview =
    review?.binding.sessionId === ride.sessionId &&
    review.binding.ownerId === session?.user.id
      ? review
      : null;
  const currentChallenge =
    boundHere?.challenge ?? currentLoaded?.challenge ?? null;
  const unavailable = currentLoaded?.challenge
    ? challengeUnavailable(currentLoaded.challenge, currentLoaded.accepted, now)
    : null;
  const locked = !!draft;
  const terminal =
    submission?.state === "verified" || submission?.state === "rejected";

  const start = async () => {
    if (startPending.current || operation.current || ride.active) return;
    startPending.current = true;
    const version = contextVersion.current;
    setStarting(true);
    setError(null);
    let planned: TimedChallenge | null = null;
    try {
      if (challengeId) {
        if (!session || !configured)
          throw new Error("เข้าสู่ระบบก่อนเริ่มรอบของรายการนี้");
        const fresh = await fetchChallenge(challengeId, session, scope);
        if (!mounted.current || contextVersion.current !== version) return;
        setLoaded({ key: requestKey, ...fresh, error: null });
        const problem = challengeUnavailable(
          fresh.challenge,
          fresh.accepted,
          Date.now(),
        );
        if (problem) throw new Error(problem);
        planned = fresh.challenge;
      }
      // A new attempt can never borrow the binding or consent from a previous capture.
      setBinding(null);
      setReview(null);
      setDraft(null);
      setSubmission(null);
      setConsent(false);
      setAudience("private");
      setShowCoordinates(false);
      const id = await ride.start();
      if (!id) return;
      if (
        !mounted.current ||
        contextVersion.current !== version ||
        (planned && !isAccountCurrent(scope))
      ) {
        ride.stop();
        return;
      }
      onSessionStart();
      if (planned && session) {
        const problem = challengeUnavailable(planned, true, Date.now());
        if (problem) {
          ride.stop();
          throw new Error(problem);
        }
        setBinding({
          sessionId: id,
          ownerId: session.user.id,
          challenge: planned,
        });
      }
    } catch (e) {
      if (mounted.current && contextVersion.current === version)
        setError(e instanceof Error ? e.message : "เริ่มรอบไม่สำเร็จ");
    } finally {
      startPending.current = false;
      if (mounted.current) setStarting(false);
    }
  };

  const openReview = () => {
    if (!boundHere || ride.active) return;
    const evidence = ride.getEvidence();
    let prepared: PreparedEvidence | null = null,
      problem: string | null = null;
    try {
      prepared = prepareRideEvidence(evidence, boundHere);
    } catch (e) {
      problem = e instanceof Error ? e.message : "ข้อมูลรอบนี้ยังส่งไม่ได้";
    }
    setReview({ binding: boundHere, evidence, prepared, error: problem });
    setConsent(false);
    setAudience("private");
    setShowCoordinates(false);
    setError(null);
  };

  const canWork = useCallback(() => mounted.current, []);
  const send = async () => {
    if (
      operation.current ||
      !visibleReview?.prepared ||
      !consent ||
      !session ||
      ride.active
    )
      return;
    if (
      visibleReview.binding.ownerId !== session.user.id ||
      ride.getEvidence().sessionId !== visibleReview.binding.sessionId
    )
      return;
    operation.current = true;
    setBusy(true);
    setError(null);
    const current = draft ?? {
      id: randomUUID(),
      ownerId: session.user.id,
      challengeId: visibleReview.binding.challenge.id,
      visibility: audience,
      bytes: visibleReview.prepared.bytes,
    };
    setDraft(current);
    const api = transport(session, scope, canWork);
    try {
      const result = await sendRideSubmission(current, api);
      if (!mounted.current || !isAccountCurrent(scope)) return;
      setSubmission(result.row);
      if (result.verificationInterrupted)
        setError(
          "การตรวจสอบยังไม่เสร็จ คุณตรวจสอบสถานะหรือลองส่งต่อได้โดยใช้รายการเดิม",
        );
    } catch (e) {
      if (!mounted.current || !isAccountCurrent(scope)) return;
      setError(
        e instanceof Error ? e.message : "ส่งไม่สำเร็จ ลองส่งต่ออีกครั้ง",
      );
      // This is read-only. A lost response must not be interpreted as a failed upload or result.
      try {
        await api.assertOwner();
        const row = await api.read(current.id);
        if (mounted.current && isAccountCurrent(scope)) setSubmission(row);
      } catch {
        /* Keep the last confirmed state. */
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const refresh = async () => {
    if (
      !draft ||
      !session ||
      operation.current ||
      draft.ownerId !== session.user.id
    )
      return;
    operation.current = true;
    setBusy(true);
    setError(null);
    const api = transport(session, scope, canWork);
    try {
      await api.assertOwner();
      const row = await api.read(draft.id);
      if (mounted.current && isAccountCurrent(scope)) {
        setSubmission(row);
        if (!row)
          setError("ยังไม่พบรายการบนเซิร์ฟเวอร์ ลองส่งต่อได้ด้วยรายการเดิม");
      }
    } catch (e) {
      if (mounted.current && isAccountCurrent(scope))
        setError(e instanceof Error ? e.message : "อ่านสถานะไม่สำเร็จ");
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const first = visibleReview?.evidence.samples[0],
    last = visibleReview?.evidence.samples.at(-1);
  const signedOutChallenge = !!challengeId && !session;
  const challengeLoading = !!challengeId && !!session && !currentLoaded;
  return (
    <View style={{ gap: 16 }}>
      {currentChallenge && (
        <Panel style={{ gap: 7 }}>
          <Row>
            <Icon name="flag-outline" size={19} color={colors.accent} />
            <T size={13} muted>
              {ride.active && boundHere
                ? "รอบนี้กำลังบันทึกกับ"
                : currentChallenge.mode === "timed_race"
                  ? "รายการจับเวลา"
                  : "ทริปกลุ่ม"}
            </T>
          </Row>
          <T size={19} weight="semibold">
            {title(currentChallenge)}
          </T>
          {currentChallenge.metric === "sustained_speed_3s" && (
            <T size={13}>ความเร็วต่อเนื่อง 3 วินาที</T>
          )}
          <T size={12} muted>
            {date(currentChallenge.starts_at)} –{" "}
            {date(currentChallenge.ends_at)}
          </T>
          {!boundHere && unavailable && <Note>{unavailable}</Note>}
        </Panel>
      )}
      {signedOutChallenge && (
        <Panel>
          <T weight="medium">เข้าสู่ระบบเพื่อเริ่มรอบจับเวลา</T>
          <Button
            secondary
            label="เข้าสู่ระบบ"
            onPress={() => router.push("/auth")}
          />
        </Panel>
      )}
      {!!challengeId && !boundHere && currentLoaded?.error && (
        <Note error>{currentLoaded.error}</Note>
      )}
      {challengeLoading && !boundHere && <Note>กำลังเปิดรายการ…</Note>}
      {!!challengeId && !boundHere && !ride.active && (
        <Button
          small
          secondary
          label="ตรวจสอบรายการอีกครั้ง"
          icon="refresh-outline"
          disabled={starting || busy || signedOutChallenge}
          onPress={() => {
            setLoaded(null);
            setReload((value) => value + 1);
          }}
        />
      )}
      {ride.active ? (
        <Button label="จบทริป" icon="stop" onPress={ride.stop} />
      ) : (
        <Button
          label={
            boundHere || visibleReview
              ? "เริ่มรอบใหม่"
              : challengeId
                ? "เริ่มรอบจับเวลา"
                : "เริ่มวัดความเร็ว"
          }
          icon="arrow-forward"
          onPress={() => void start()}
          busy={starting || ride.permissionState === "requesting"}
          disabled={
            busy ||
            (!!challengeId &&
              (signedOutChallenge ||
                challengeLoading ||
                !!currentLoaded?.error ||
                !!unavailable))
          }
        />
      )}
      {!ride.active && boundHere && !visibleReview && (
        <Button
          secondary
          label="ตรวจทานก่อนส่งผล"
          icon="document-text-outline"
          onPress={openReview}
        />
      )}
      {!!challengeId && ride.active && !boundHere && (
        <Note>
          รอบที่เริ่มไว้ก่อนเปิดรายการนี้เป็นการวัดทั่วไป
          จบทริปแล้วเริ่มรอบใหม่เพื่อผูกกับรายการ
        </Note>
      )}
      {visibleReview && !ride.active && (
        <Panel style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <T size={21} weight="semibold">
              ตรวจทานรอบนี้
            </T>
            <T size={13} muted>
              {title(visibleReview.binding.challenge)}
            </T>
          </View>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <T size={11} muted>
                ข้อมูล GPS
              </T>
              <T numeric size={23}>
                {visibleReview.evidence.samples.length} <T size={13}>จุด</T>
              </T>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <T size={11} muted>
                ระยะเวลาที่บันทึก
              </T>
              <T numeric size={23}>
                {first && last
                  ? Math.max(
                      0,
                      (last.timestampMs - first.timestampMs) / 1000,
                    ).toFixed(1)
                  : "0"}{" "}
                <T size={13}>วินาที</T>
              </T>
            </View>
          </Row>
          {first && last && (
            <View style={{ gap: 5 }}>
              <T size={12} muted>
                {date(first.timestampMs)} – {date(last.timestampMs)}
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showCoordinates }}
                onPress={() => setShowCoordinates((value) => !value)}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <T size={13} style={{ color: colors.accent }}>
                  {showCoordinates
                    ? "ซ่อนตัวอย่างพิกัด"
                    : "ดูตัวอย่างพิกัดที่จะส่ง"}
                </T>
              </Pressable>
              {showCoordinates && (
                <View style={{ gap: 4 }}>
                  <T size={12}>
                    จุดแรก {first.latitude.toFixed(6)},{" "}
                    {first.longitude.toFixed(6)}
                  </T>
                  <T size={12}>
                    จุดสุดท้าย {last.latitude.toFixed(6)},{" "}
                    {last.longitude.toFixed(6)}
                  </T>
                  <T size={12} muted>
                    ส่งทุกจุดที่บันทึกจริง พร้อมเวลา ความเร็ว และค่าความแม่นยำ
                  </T>
                </View>
              )}
            </View>
          )}
          {visibleReview.error ? (
            <Note error>{visibleReview.error}</Note>
          ) : (
            <>
              <T size={14} weight="medium">
                ใครเห็นผลที่ตรวจสอบแล้ว
              </T>
              {locked ? (
                <T size={14}>
                  {
                    audienceItems.find(
                      (item) => item.value === draft.visibility,
                    )?.label
                  }
                </T>
              ) : (
                <Segments
                  items={audienceItems}
                  value={audience}
                  onChange={(value) => {
                    setAudience(value);
                    setConsent(false);
                  }}
                />
              )}
              <T size={13} muted>
                {audience === "private"
                  ? "เก็บผลไว้ดูเอง"
                  : audience === "friends"
                    ? "เพื่อนที่ยังเชื่อมต่อกันดูผลได้ในอันดับเพื่อน"
                    : "แสดงผลในอันดับชุมชน"}
                . ข้อมูล GPS ดิบให้ระบบใช้ตรวจสอบ โดยไม่เปิดพิกัดดิบให้ผู้ชมผล
              </T>
              <Row style={{ alignItems: "flex-start" }}>
                <Switch
                  accessibilityLabel="ยินยอมส่งตำแหน่งที่ตั้งจริงและข้อมูล GPS ของรอบนี้ให้ระบบตรวจสอบ"
                  value={consent}
                  disabled={busy || locked}
                  onValueChange={setConsent}
                  trackColor={{ true: colors.accent }}
                />
                <T size={13} style={{ flex: 1 }}>
                  ฉันยินยอมส่งตำแหน่งที่ตั้งจริง เวลา ความเร็ว
                  และค่าความแม่นยำของรอบนี้ให้ระบบตรวจสอบ
                </T>
              </Row>
              {!terminal && (
                <Button
                  label={
                    draft ? "ส่งต่อ / ลองตรวจสอบอีกครั้ง" : "ส่งผลเพื่อตรวจสอบ"
                  }
                  icon="cloud-upload-outline"
                  disabled={!consent}
                  busy={busy}
                  onPress={() => void send()}
                />
              )}
            </>
          )}
          {submission && (
            <View
              accessibilityLiveRegion="polite"
              style={{
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                gap: 5,
              }}
            >
              <Row>
                <Icon
                  name={
                    submission.state === "verified"
                      ? "checkmark-circle-outline"
                      : submission.state === "rejected"
                        ? "alert-circle-outline"
                        : "time-outline"
                  }
                  color={
                    submission.state === "verified" ? colors.good : colors.muted
                  }
                />
                <T weight="semibold">
                  {submission.state === "verified"
                    ? "ตรวจสอบผ่านแล้ว"
                    : submission.state === "rejected"
                      ? "ผลยังไม่ผ่านการตรวจสอบ"
                      : submission.state === "pending_upload"
                        ? "รอส่งข้อมูลให้ครบ"
                        : submission.state === "queued"
                          ? "อยู่ในคิวตรวจสอบ"
                          : "กำลังตรวจสอบ"}
                </T>
              </Row>
              <T size={13} muted>
                {submission.state === "verified"
                  ? "ผลนี้ผ่านการตรวจสอบข้อมูลแล้ว อันดับขึ้นอยู่กับผลอื่นและสิทธิ์ของรายการ"
                  : submission.state === "rejected"
                    ? rejectionText(submission.rejection_reason)
                    : "สถานะนี้มาจากเซิร์ฟเวอร์ คุณกลับมาตรวจสอบอีกครั้งได้"}
              </T>
            </View>
          )}
          {draft && (
            <Button
              small
              secondary
              label="ตรวจสอบสถานะ"
              icon="refresh-outline"
              busy={busy}
              onPress={() => void refresh()}
            />
          )}
          {!terminal && (
            <Note>เริ่มรอบใหม่จะล้างข้อมูลของรอบนี้ที่ยังอยู่ในเครื่อง</Note>
          )}
        </Panel>
      )}
      {error && <Note error>{error}</Note>}
    </View>
  );
}
