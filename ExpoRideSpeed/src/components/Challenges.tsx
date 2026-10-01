import { randomUUID } from "expo-crypto";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useNow } from "../lib/useNow";
import { useApp } from "../state/AppState";
import {
  accountClient,
  accountRpc,
  isAccountCurrent,
  useAuth,
} from "../state/AuthState";
import { useOnline, type Friend } from "../state/OnlineState";
import {useI18n} from '../lib/i18n';
import {getRouteOwner,getRouteProjection} from '../features/routes/syncService';
import {isReviewableShareSnapshot,sharePreview} from '../features/routes/compatibilityModel';
import SharedRouteSnapshot from '../features/routes/SharedRouteSnapshot';
import type {RouteCategory,RouteProjection} from '../features/routes/syncTypes';
import {
  Button,
  Empty,
  Field,
  Icon,
  Note,
  Panel,
  Row,
  Segments,
  T,
} from "./ui";

type Mode = "group_ride" | "timed_race";
type CloudRoute = {
  id: string;
  owner_id: string;
  title: string;
  revision: number;
  category: RouteCategory;
  approved_course_id: string | null;
  approved_revision: number | null;
};
type Course = { id: string; name: string; closed_course_approved: boolean };
type CourseSession = {
  id: string;
  course_id: string;
  starts_at: string;
  ends_at: string;
  approved: boolean;
};
type Challenge = {
  id: string;
  creator_id: string;
  route_snapshot: unknown;
  mode: Mode;
  metric: string;
  course_session_id: string | null;
  starts_at: string;
  ends_at: string;
  state: "open" | "cancelled";
};
type Member = {
  challenge_id: string;
  user_id: string;
  state: "invited" | "accepted" | "declined" | "withdrawn";
  friendship_generation: number | null;
};
type Review = {
  id: string;
  route: CloudRoute;
  shared:RouteProjection;
  mode: Mode;
  friend: Friend;
  course?: Course;
  session?: CourseSession;
  startsAt: string;
  endsAt: string;
};
type Data = {
  routes: CloudRoute[];
  courses: Course[];
  sessions: CourseSession[];
  challenges: Challenge[];
  members: Member[];
};
const empty: Data = {
  routes: [],
  courses: [],
  sessions: [],
  challenges: [],
  members: [],
};
const routeColumns =
  "id,owner_id,title,revision,category,approved_course_id,approved_revision";
const date = (value: string) =>
  new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function localInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function parseLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return NaN;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  return d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day &&
    d.getHours() === hour &&
    d.getMinutes() === minute
    ? d.getTime()
    : NaN;
}
function validRouteMetadata(value:CloudRoute|null|undefined):value is CloudRoute {
  return (
    !!value?.title &&
    Number.isInteger(value.revision) &&
    value.revision > 0 &&
    typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)&&['scooter','motorcycle','car','bicycle'].includes(value.category)
  );
}
function failure(error: unknown, fallback: string) {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (/revision|Save your route/i.test(raw))
    return "เส้นทางเปลี่ยนแล้ว กลับไปเลือกและตรวจสอบฉบับล่าสุดก่อนส่งคำชวน";
  if (/approved|session|future.*window/i.test(raw))
    return "สนามหรือช่วงเวลานี้ไม่พร้อมแล้ว กรุณารีเฟรชและเลือกรอบใหม่";
  if (/friend|Invitation|Challenge unavailable/i.test(raw))
    return "คำชวนหรือสถานะเพื่อนเปลี่ยนแล้ว กรุณารีเฟรช";
  if (/limit|quota/i.test(raw))
    return "ถึงจำนวนที่ทำได้ในวันนี้แล้ว กรุณาลองใหม่ภายหลัง";
  return fallback;
}

function Choice({
  title,
  detail,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 58,
        paddingVertical: 13,
        paddingHorizontal: 15,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.line,
        backgroundColor: selected ? colors.raised : colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Row>
        <View style={{ flex: 1 }}>
          <T weight={selected ? "semibold" : "medium"}>{title}</T>
          {detail && (
            <T muted size={12}>
              {detail}
            </T>
          )}
        </View>
        <Icon
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          color={selected ? colors.accent : colors.muted}
          size={22}
        />
      </Row>
    </Pressable>
  );
}

export default function Challenges() {
  const { session, scope } = useAuth();
  // Only this account-owned surface remounts; the router and auth callback stay mounted.
  return session ? (
    <AccountChallenges key={scope.generation} userId={session.user.id} />
  ) : null;
}

function AccountChallenges({ userId }: { userId: string }) {
  const {t}=useI18n();
  const now = useNow(),
    { colors } = useApp(),
    { friends } = useOnline();
  const { session, scope } = useAuth();
  const client = useMemo(
    () =>
      session && isAccountCurrent(scope) ? accountClient(scope, session) : null,
    [scope, session],
  );
  const [data, setData] = useState<Data>(empty),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<Mode>("group_ride"),
    [courseId, setCourseId] = useState(""),
    [routeId, setRouteId] = useState(""),
    [sessionId, setSessionId] = useState(""),
    [friendId, setFriendId] = useState("");
  const [startText, setStartText] = useState(() =>
    localInput(Date.now() + 3600000),
  );
  const [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [messageError, setMessageError] = useState(false),
    [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const mounted = useRef(false),
    request = useRef(0),
    actionLock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!client || !isAccountCurrent(scope)) return;
    const sequence = ++request.current;
    setLoading(true);
    try {
      const [routes, courses, sessions, challenges, members] =
        await Promise.all([
          client
            .from("rs_routes")
            .select(routeColumns)
            .eq("owner_id", userId)
            .order("updated_at", { ascending: false }),
          client
            .from("rs_courses")
            .select("id,name,closed_course_approved")
            .eq("closed_course_approved", true)
            .order("name"),
          client
            .from("rs_course_sessions")
            .select("id,course_id,starts_at,ends_at,approved")
            .eq("approved", true)
            .gte("ends_at", new Date().toISOString())
            .order("starts_at"),
          client
            .from("rs_challenges")
            .select("*")
            .order("starts_at", { ascending: false })
            .limit(100),
          client
            .from("rs_challenge_members")
            .select("challenge_id,user_id,state,friendship_generation"),
        ]);
      if (
        !mounted.current ||
        !isAccountCurrent(scope) ||
        sequence !== request.current
      )
        return;
      if (
        routes.error ||
        courses.error ||
        sessions.error ||
        challenges.error ||
        members.error
      )
        throw new Error("LOAD_FAILED");
      setData({
        routes: routes.data as CloudRoute[],
        courses: courses.data as Course[],
        sessions: sessions.data as CourseSession[],
        challenges: challenges.data as Challenge[],
        members: members.data as Member[],
      });
      setLoadError("");
    } catch {
      if (
        mounted.current &&
        isAccountCurrent(scope) &&
        sequence === request.current
      )
        setLoadError(
          "เชื่อมต่อไม่สำเร็จ ข้อมูลล่าสุดอาจยังไม่แสดง ลองรีเฟรชอีกครั้ง",
        );
    } finally {
      if (
        mounted.current &&
        isAccountCurrent(scope) &&
        sequence === request.current
      )
        setLoading(false);
    }
  }, [client, scope, userId]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        request.current++;
      };
    }, [load]),
  );

  const acceptedFriends = friends.filter((f) => f.state === "accepted");
  const routes = data.routes.filter(
    (r) =>
      validRouteMetadata(r) &&
      (mode === "group_ride" ||
        (r.approved_course_id === courseId &&
          r.approved_revision === r.revision)),
  );
  const sessions = data.sessions.filter(
    (s) =>
      s.course_id === courseId &&
      s.approved &&
      Date.parse(s.starts_at) > now &&
      Date.parse(s.ends_at) > Date.parse(s.starts_at),
  );
  const selectedRoute = routes.find((r) => r.id === routeId),
    selectedSession = sessions.find((s) => s.id === sessionId),
    selectedFriend = acceptedFriends.find((f) => f.user_id === friendId);
  const startMs =
    mode === "timed_race"
      ? selectedSession
        ? Date.parse(selectedSession.starts_at)
        : NaN
      : parseLocal(startText);
  const validStart = Number.isFinite(startMs) && startMs > now;
  const canReview =
    !!selectedRoute &&
    !!selectedFriend &&
    validStart &&
    (mode === "group_ride" || !!selectedSession) &&
    !loading &&
    !loadError;
  const tell = (text: string, error = false) => {
    setMessage(text);
    setMessageError(error);
  };

  async function prepareReview() {
    if (
      !client ||
      !isAccountCurrent(scope) ||
      !canReview ||
      !selectedRoute ||
      !selectedFriend ||
      actionLock.current
    )
      return;
    actionLock.current = true;
    setBusy(true);
    tell("");
    try {
      // Load the exact cloud version that will be shown for consent, never the device draft.
      const [result,owner,shared] = await Promise.all([
        client.from('rs_routes').select(routeColumns).eq('id',selectedRoute.id).eq('owner_id',userId).single(),
        getRouteOwner(scope,session!,selectedRoute.id),getRouteProjection(scope,session!,selectedRoute.id),
      ]);
      if (!mounted.current || !isAccountCurrent(scope)) return;
      if (result.error || !validRouteMetadata(result.data))
        throw new Error("revision");
      const route = result.data as CloudRoute;
      sharePreview(owner,shared);
      if(!shared||route.revision!==shared.revision)throw Error('revision');
      let course: Course | undefined, round: CourseSession | undefined;
      if (mode === "timed_race") {
        const [courseResult, roundResult] = await Promise.all([
          client
            .from("rs_courses")
            .select("id,name,closed_course_approved")
            .eq("id", courseId)
            .single(),
          client
            .from("rs_course_sessions")
            .select("id,course_id,starts_at,ends_at,approved")
            .eq("id", sessionId)
            .single(),
        ]);
        if (!mounted.current || !isAccountCurrent(scope)) return;
        if (courseResult.error || roundResult.error) throw new Error("session");
        course = courseResult.data as Course;
        round = roundResult.data as CourseSession;
        if (
          !course.closed_course_approved ||
          !round.approved ||
          round.course_id !== course.id ||
          route.approved_course_id !== course.id ||
          route.approved_revision !== route.revision
        )
          throw new Error("approved");
      }
      const starts = round
        ? Date.parse(round.starts_at)
        : parseLocal(startText);
      const ends = Math.min(
        starts + 3 * 3600000,
        round ? Date.parse(round.ends_at) : Infinity,
      );
      // This handler runs only after a press; useNow also expires the review while it is open.
      // eslint-disable-next-line react-hooks/purity
      const pressedAt = Date.now();
      if (
        !Number.isFinite(starts) ||
        starts <= pressedAt ||
        ends - starts < 3000
      )
        throw new Error("future challenge window");
      setReview({
        id: randomUUID(),
        route,
        shared,
        mode,
        friend: selectedFriend,
        course,
        session: round,
        startsAt: new Date(starts).toISOString(),
        endsAt: new Date(ends).toISOString(),
      });
    } catch (error) {
      if (mounted.current && isAccountCurrent(scope))
        tell(failure(error, "ตรวจสอบเส้นทางไม่สำเร็จ ลองอีกครั้ง"), true);
    } finally {
      actionLock.current = false;
      if (mounted.current && isAccountCurrent(scope)) setBusy(false);
    }
  }

  async function create() {
    if (!review || !client || !isAccountCurrent(scope) || actionLock.current)
      return;
    actionLock.current = true;
    setBusy(true);
    tell("");
    let created = false;
    try {
      if (Date.parse(review.startsAt) <= Date.now())
        throw new Error("future challenge window");
      // Keep the preview's UUID across retries, including a response lost after creation.
      const existing = await client
        .from("rs_challenges")
        .select("id,state")
        .eq("id", review.id)
        .eq("creator_id", userId)
        .maybeSingle();
      if (!mounted.current || !isAccountCurrent(scope)) return;
      if (existing.error) throw existing.error;
      if (existing.data?.state === "cancelled")
        throw new Error("Challenge unavailable");
      if (!existing.data)
        await accountRpc(scope, session, "rs_create_challenge", {
          p_id: review.id,
          p_route: review.route.id,
          p_revision: review.route.revision,
          p_mode: review.mode,
          p_session: review.session?.id ?? null,
          p_starts: review.startsAt,
          p_ends: review.endsAt,
        });
      created = true;
      if (!mounted.current || !isAccountCurrent(scope)) return;
      await accountRpc(scope, session, "rs_invite_challenge", {
        p_challenge: review.id,
        p_friend: review.friend.user_id,
      });
      if (!mounted.current || !isAccountCurrent(scope)) return;
      setReview(null);
      tell(`ส่งคำชวนให้ ${review.friend.display_name} แล้ว`);
      await load();
    } catch (error) {
      if (mounted.current && isAccountCurrent(scope)) {
        tell(
          created
            ? "สร้างชาเลนจ์แล้ว แต่ส่งคำชวนยังไม่สำเร็จ กดส่งอีกครั้ง หรือยกเลิกชาเลนจ์จากรายการด้านล่าง"
            : failure(error, "ส่งคำชวนไม่สำเร็จ ลองอีกครั้ง"),
          true,
        );
        await load();
      }
    } finally {
      actionLock.current = false;
      if (mounted.current && isAccountCurrent(scope)) setBusy(false);
    }
  }

  async function decide(
    id: string,
    action: "accept" | "decline" | "withdraw" | "cancel",
  ) {
    if (actionLock.current || !isAccountCurrent(scope)) return;
    actionLock.current = true;
    setBusy(true);
    tell("");
    try {
      await accountRpc(scope, session, "rs_challenge_action", {
        p_challenge: id,
        p_action: action,
      });
      if (!mounted.current || !isAccountCurrent(scope)) return;
      setConfirmCancel(null);
      if (review?.id === id && action === "cancel") setReview(null);
      tell(
        action === "accept"
          ? "ตอบรับคำชวนแล้ว"
          : action === "decline"
            ? "ปฏิเสธคำชวนแล้ว"
            : action === "withdraw"
              ? "ถอนตัวแล้ว"
              : "ยกเลิกชาเลนจ์แล้ว",
      );
      await load();
    } catch (error) {
      if (mounted.current && isAccountCurrent(scope))
        tell(failure(error, "อัปเดตคำชวนไม่สำเร็จ ลองอีกครั้ง"), true);
    } finally {
      actionLock.current = false;
      if (mounted.current && isAccountCurrent(scope)) setBusy(false);
    }
  }

  return (
    <View style={{ gap: 24 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <T size={24} weight="semibold">
          ไปด้วยกัน
        </T>
        <Button
          small
          secondary
          icon="refresh-outline"
          label="รีเฟรช"
          busy={loading}
          disabled={busy}
          onPress={() => void load()}
        />
      </Row>
      {!!loadError && <Note error>{loadError}</Note>}
      {review ? (
        <View style={{ gap: 18 }}>
          <Row>
            <Icon
              name={
                review.mode === "timed_race" ? "flag-outline" : "map-outline"
              }
              color={colors.accent}
            />
            <View style={{ flex: 1 }}>
              <T size={22} weight="semibold">
                ตรวจสอบคำชวน
              </T>
              <T muted size={13}>
                {review.mode === "timed_race"
                  ? review.course?.name
                  : "ออกทริปด้วยกัน"}{" "}
                · ถึง {review.friend.display_name}
              </T>
            </View>
          </Row>
          <Panel>
            <SharedRouteSnapshot value={review.shared} invitation />
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingTop: 16,
                gap: 5,
              }}
            >
              <T weight="medium">{date(review.startsAt)}</T>
              <T muted size={13}>
                ถึง {date(review.endsAt)} · เวลาตามเครื่อง
              </T>
              {review.mode === "timed_race" && (
                <T muted size={13}>
                  วัดความเร็วต่อเนื่อง 3 วินาที ไม่ใช่เวลาต่อรอบ
                </T>
              )}
            </View>
          </Panel>
          <Note>
            เพื่อนที่ได้รับคำชวนจะเห็นพิกัดทุกจุดด้านบน
            โปรดตรวจสอบจุดใกล้บ้านก่อนส่ง
          </Note>
          {!!message && <Note error={messageError}>{message}</Note>}
          {Date.parse(review.startsAt) <= now && (
            <Note error>เลยเวลาเริ่มแล้ว กลับไปเลือกเวลาใหม่</Note>
          )}
          <Button
            icon="paper-plane-outline"
            label="ส่งคำชวน"
            busy={busy}
            disabled={
              Date.parse(review.startsAt) <= now ||
              !acceptedFriends.some((f) => f.user_id === review.friend.user_id)
            }
            onPress={() => void create()}
          />
          <Button
            secondary
            label="กลับไปเลือกใหม่"
            disabled={busy}
            onPress={() => {
              setReview(null);
              tell("");
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          <Segments
            items={[
              { value: "group_ride", label: "ออกทริป" },
              { value: "timed_race", label: "สนามปิด" },
            ]}
            value={mode}
            onChange={(value) => {
              if (!busy) {
                setMode(value);
                setRouteId("");
                setSessionId("");
                tell("");
              }
            }}
          />
          <T muted>
            {mode === "group_ride"
              ? "เลือกเส้นทาง แล้วนัดเพื่อนออกเดินทาง"
              : "ท้าความเร็วต่อเนื่อง 3 วินาที บนสนามและรอบที่ได้รับอนุมัติ"}
          </T>
          {loading && !data.routes.length && (
            <Note>กำลังเปิดเส้นทางและคำชวน…</Note>
          )}
          {mode === "timed_race" && (
            <View style={{ gap: 10 }}>
              <T weight="semibold">สนาม</T>
              {data.courses.map((course) => (
                <Choice
                  key={course.id}
                  title={course.name}
                  selected={courseId === course.id}
                  disabled={busy}
                  onPress={() => {
                    setCourseId(course.id);
                    setRouteId("");
                    setSessionId("");
                  }}
                />
              ))}
              {!loading && !data.courses.length && (
                <Empty
                  icon="flag-outline"
                  title="ยังไม่มีสนามที่พร้อม"
                  body="เมื่อผู้ดูแลยืนยันสนามปิดและเปิดรอบ คุณจะเลือกชาเลนจ์ได้ที่นี่"
                >
                  <Button
                    small
                    secondary
                    label="เลือกออกทริปกับเพื่อน"
                    onPress={() => {
                      setMode("group_ride");
                      setRouteId("");
                    }}
                  />
                </Empty>
              )}
            </View>
          )}
          {(mode === "group_ride" || !!courseId) && (
            <View style={{ gap: 10 }}>
              <T weight="semibold">เส้นทางออนไลน์</T>
              {routes.map((route) => (
                <Choice
                  key={route.id}
                  title={route.title}
                  detail={t('m4.compatibility.revision',{revision:route.revision,category:t(`m4.compatibility.category.${route.category}`)})}
                  selected={routeId === route.id}
                  disabled={busy}
                  onPress={() => setRouteId(route.id)}
                />
              ))}
              {!loading && !routes.length && (
                <>
                  <Note>
                    {mode === "group_ride"
                      ? "บันทึกเส้นทางออนไลน์ก่อนส่งคำชวน"
                      : "ยังไม่มีเส้นทางฉบับที่ได้รับอนุมัติสำหรับสนามนี้ การแก้เส้นทางต้องได้รับการตรวจสอบอีกครั้ง"}
                  </Note>
                  <Button
                    small
                    secondary
                    icon="map-outline"
                    label="เปิดเส้นทางของคุณ"
                    onPress={() => router.push("/routes")}
                  />
                </>
              )}
            </View>
          )}
          {mode === "timed_race" && !!courseId && (
            <View style={{ gap: 10 }}>
              <T weight="semibold">รอบถัดไป</T>
              {sessions.map((round) => (
                <Choice
                  key={round.id}
                  title={date(round.starts_at)}
                  detail={`ถึง ${date(round.ends_at)} · เวลาตามเครื่อง`}
                  selected={sessionId === round.id}
                  disabled={busy}
                  onPress={() => setSessionId(round.id)}
                />
              ))}
              {!loading && !sessions.length && (
                <Note>
                  ยังไม่มีรอบในอนาคตสำหรับสนามนี้ กรุณากลับมาเมื่อผู้ดูแลเปิดรอบ
                </Note>
              )}
            </View>
          )}
          {selectedRoute && (
            <View style={{ gap: 10 }}>
              <T weight="semibold">ชวนเพื่อน</T>
              {acceptedFriends.map((friend) => (
                <Choice
                  key={friend.user_id}
                  title={friend.display_name}
                  detail={`@${friend.handle}`}
                  selected={friendId === friend.user_id}
                  disabled={busy}
                  onPress={() => setFriendId(friend.user_id)}
                />
              ))}
              {!acceptedFriends.length && (
                <Note>เพิ่มเพื่อนและรอการยอมรับในแท็บเพื่อนก่อนส่งคำชวน</Note>
              )}
            </View>
          )}
          {mode === "group_ride" && selectedRoute && (
            <>
              <Field
                label="เริ่มทริป · เวลาตามเครื่อง"
                value={startText}
                onChangeText={setStartText}
                editable={!busy}
                autoCorrect={false}
                maxLength={16}
                placeholder="YYYY-MM-DD HH:mm"
              />
              <Note>
                ใช้ปี ค.ศ. เช่น 2026-10-01 09:00 · ทริปมีระยะเวลา 3 ชั่วโมง
              </Note>
              {startText.length === 16 && !validStart && (
                <Note error>ระบุวันและเวลาที่มีอยู่จริงในอนาคต</Note>
              )}
            </>
          )}
          {mode === "timed_race" && selectedSession && (
            <Note>
              ชาเลนจ์เริ่มพร้อมรอบสนาม และสิ้นสุดภายใน 3
              ชั่วโมงหรือเมื่อรอบสนามจบ ระบบตรวจสอบผลจากข้อมูล GPS
              ที่มีความแม่นยำเพียงพอ
            </Note>
          )}
          {!!message && <Note error={messageError}>{message}</Note>}
          <Button
            label="ตรวจสอบเส้นทางและคำชวน"
            icon="arrow-forward"
            disabled={!canReview}
            busy={busy}
            onPress={() => void prepareReview()}
          />
        </View>
      )}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.line,
          paddingTop: 24,
          gap: 18,
        }}
      >
        <T size={22} weight="semibold">
          คำชวนของคุณ
        </T>
        {!loading && !data.challenges.length && (
          <T muted>คำชวนที่ส่งและได้รับจะอยู่ตรงนี้</T>
        )}
        {data.challenges.map((row) => {
          const mine = row.creator_id === userId,
            member = data.members.find(
              (m) => m.challenge_id === row.id && m.user_id === userId,
            );
          const beforeStart = now < Date.parse(row.starts_at),
            current =
              now >= Date.parse(row.starts_at) && now < Date.parse(row.ends_at),
            expired = now >= Date.parse(row.ends_at),
            open = row.state === "open";
          const round = data.sessions.find(
              (s) => s.id === row.course_session_id,
            ),
            course = data.courses.find((c) => c.id === round?.course_id);
          const canOpen =
            open &&
            current &&
            member?.state === "accepted" &&
            row.mode === "timed_race" &&
            row.metric === "sustained_speed_3s" &&
            !!round?.approved &&
            !!course?.closed_course_approved &&
            now >= Date.parse(round.starts_at) &&
            now < Date.parse(round.ends_at);
          const status = !open
            ? "ยกเลิกแล้ว"
            : expired
              ? "จบแล้ว"
              : current
                ? "อยู่ในช่วงเวลา"
                : member?.state === "accepted"
                  ? "ตอบรับแล้ว"
                  : "รอการตอบรับ";
          const others = data.members.filter(
            (m) =>
              m.challenge_id === row.id &&
              m.user_id !== userId &&
              acceptedFriends.some(
                (f) =>
                  f.user_id === m.user_id &&
                  typeof m.friendship_generation === "number" &&
                  (f as Friend & { generation?: number }).generation ===
                    m.friendship_generation,
              ),
          );
          return (
            <Panel key={row.id}>
              <Row>
                <Icon
                  name={
                    row.mode === "timed_race"
                      ? "flag-outline"
                      : "people-outline"
                  }
                  color={colors.accent}
                />
                <View style={{ flex: 1 }}>
                  <T weight="semibold">
                    {row.mode === "timed_race"
                      ? "ความเร็วต่อเนื่อง 3 วินาที"
                      : "ออกทริปด้วยกัน"}
                  </T>
                  <T muted size={12}>
                    {mine ? "คุณเป็นผู้ชวน" : "คำชวนถึงคุณ"} · {status}
                  </T>
                </View>
              </Row>
              <SharedRouteSnapshot value={row.route_snapshot} invitation map={false} />
              <View style={{ gap: 4 }}>
                <T size={14}>{date(row.starts_at)}</T>
                <T muted size={12}>
                  ถึง {date(row.ends_at)} · เวลาตามเครื่อง
                </T>
                {row.mode === "timed_race" && (
                  <T muted size={12}>
                    {course?.name ?? "สนามปิด"} · วัดความเร็ว ไม่ใช่เวลาต่อรอบ
                  </T>
                )}
                {mine && (
                  <T muted size={12}>
                    เพื่อนตอบรับ{" "}
                    {others.filter((m) => m.state === "accepted").length} คน ·
                    รอตอบ {others.filter((m) => m.state === "invited").length}{" "}
                    คน
                  </T>
                )}
              </View>
              {canOpen && (
                <Button
                  icon="speedometer-outline"
                  label="เปิดหน้าปัดสำหรับชาเลนจ์"
                  disabled={busy || !!loadError || loading}
                  onPress={() => {
                    const at = Date.now();
                    if (
                      isAccountCurrent(scope) &&
                      at >= Date.parse(row.starts_at) &&
                      at < Date.parse(row.ends_at)
                    )
                      router.push({
                        pathname: "/",
                        params: { challengeId: row.id },
                      });
                  }}
                />
              )}
              {open && beforeStart && !mine && member?.state === "invited" && (
                <>
                  <Note>ตอบรับหลังตรวจสอบจุดนัดหมายและพิกัดทั้งหมดด้านบน</Note>
                  <Row>
                    <Button
                      small
                      label="ยอมรับ"
                      disabled={
                        busy ||
                        !isReviewableShareSnapshot(row.route_snapshot) ||
                        !!loadError
                      }
                      onPress={() => void decide(row.id, "accept")}
                      style={{ flex: 1 }}
                    />
                    <Button
                      small
                      secondary
                      label="ปฏิเสธ"
                      disabled={busy}
                      onPress={() => void decide(row.id, "decline")}
                      style={{ flex: 1 }}
                    />
                  </Row>
                </>
              )}
              {open && beforeStart && !mine && member?.state === "accepted" && (
                <Button
                  small
                  secondary
                  label="ถอนตัว"
                  disabled={busy}
                  onPress={() => void decide(row.id, "withdraw")}
                />
              )}
              {open && current && !mine && member?.state === "invited" && (
                <Note>เลยเวลาตอบรับแล้ว จึงเข้าร่วมรอบนี้ไม่ได้</Note>
              )}
              {open &&
                mine &&
                !expired &&
                (confirmCancel === row.id ? (
                  <View style={{ gap: 10 }}>
                    <Note>ยกเลิกชาเลนจ์นี้สำหรับผู้ร่วมทุกคน?</Note>
                    <Button
                      small
                      label="ยืนยันยกเลิกชาเลนจ์"
                      disabled={busy}
                      onPress={() => void decide(row.id, "cancel")}
                    />
                    <Button
                      small
                      secondary
                      label="เก็บชาเลนจ์ไว้"
                      disabled={busy}
                      onPress={() => setConfirmCancel(null)}
                    />
                  </View>
                ) : (
                  <Button
                    small
                    secondary
                    label="ยกเลิกชาเลนจ์"
                    disabled={busy}
                    onPress={() => setConfirmCancel(row.id)}
                  />
                ))}
            </Panel>
          );
        })}
      </View>
    </View>
  );
}
