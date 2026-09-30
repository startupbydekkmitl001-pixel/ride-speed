import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Switch, View } from "react-native";
import { AccountGate } from "../../components/AccountGate";
import Challenges from "../../components/Challenges";
import {
  Button,
  Empty,
  Field,
  Heading,
  Icon,
  IconButton,
  Note,
  Panel,
  Row,
  Screen,
  Segments,
  T,
} from "../../components/ui";
import { useApp } from "../../state/AppState";
import {
  accountClient,
  accountRpc,
  isAccountCurrent,
  useAuth,
} from "../../state/AuthState";
import { useOnline } from "../../state/OnlineState";
import { useNow } from "../../lib/useNow";

type Post = {
  id: string;
  owner_id: string;
  caption: string;
  description: string;
  claimed_speed_kmh: number | null;
  route_snapshot: {
    title: string;
    stops: { label: string; lat: number; lng: number }[];
  } | null;
  media_path: string | null;
  visibility: string;
  created_at: string;
  display_name: string;
  handle: string;
};
const date = (value: string) =>
  new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function PostPhoto({ postId }: { postId: string }) {
  const { session, scope } = useAuth();
  const client = useMemo(
    () =>
      session && isAccountCurrent(scope) ? accountClient(scope, session) : null,
    [scope, session],
  );
  const [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    if (client && isAccountCurrent(scope))
      void client.functions
        .invoke("media-url", { body: { postId } })
        .then(({ data, error: e }) => {
          if (alive && isAccountCurrent(scope)) {
            if (e || !data?.url) setError(true);
            else {
              setError(false);
              setUrl(data.url);
            }
          }
        })
        .catch(() => {
          if (alive && isAccountCurrent(scope)) setError(true);
        });
    return () => {
      alive = false;
    };
  }, [client, postId, scope]);
  return url && !error ? (
    <Image
      source={{ uri: url }}
      accessibilityLabel="รูปภาพในโพสต์"
      style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 18 }}
      onError={() => setError(true)}
    />
  ) : (
    <Note>
      {error ? "โหลดรูปไม่สำเร็จ รีเฟรชเพื่อลองใหม่" : "กำลังโหลดรูป…"}
    </Note>
  );
}
function Feed() {
  const { colors } = useApp(),
    { session, scope } = useAuth();
  const client = useMemo(
    () =>
      session && isAccountCurrent(scope) ? accountClient(scope, session) : null,
    [scope, session],
  );
  const request = useRef(0);
  const [posts, setPosts] = useState<Post[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [revision, setRevision] = useState(0);
  const fetchFeed = useCallback(
    async (before: string | null = null, beforeId: string | null = null) => {
      if (!isAccountCurrent(scope)) return;
      const sequence = ++request.current;
      setBusy(true);
      try {
        const rows = await accountRpc<Post[]>(scope, session, "rs_feed", {
          p_limit: 20,
          p_before: before,
          p_before_id: beforeId,
        });
        if (!isAccountCurrent(scope) || sequence !== request.current) return;
        setPosts((old) =>
          before
            ? [
                ...old,
                ...rows.filter((row) => !old.some((p) => p.id === row.id)),
              ]
            : rows,
        );
        setMore(rows.length === 20);
        setRevision((v) => v + 1);
        setError("");
      } catch (e) {
        if (isAccountCurrent(scope) && sequence === request.current)
          setError(e instanceof Error ? e.message : "โหลดโพสต์ไม่สำเร็จ");
      } finally {
        if (isAccountCurrent(scope) && sequence === request.current)
          setBusy(false);
      }
    },
    [scope, session],
  );
  useFocusEffect(
    useCallback(() => {
      void fetchFeed();
      return () => {
        request.current++;
      };
    }, [fetchFeed]),
  );
  async function report(post: Post) {
    try {
      await accountRpc(scope, session, "rs_report_post", {
        p_id: post.id,
        p_reason: "other",
        p_detail: "Reported from community feed for moderator review.",
      });
      if (isAccountCurrent(scope)) setError("ส่งรายงานให้ผู้ดูแลแล้ว");
    } catch (e) {
      if (isAccountCurrent(scope))
        setError(e instanceof Error ? e.message : "รายงานไม่สำเร็จ");
    }
  }
  async function remove(post: Post) {
    try {
      await accountRpc(scope, session, "rs_delete_post", { p_id: post.id });
      if (!isAccountCurrent(scope)) return;
      if (post.media_path && client) {
        const result = await client.storage
          .from("ride-community")
          .remove([post.media_path]);
        if (result.error) throw result.error;
      }
      if (isAccountCurrent(scope)) await fetchFeed();
    } catch (e) {
      if (isAccountCurrent(scope))
        setError(e instanceof Error ? e.message : "ลบโพสต์ไม่สำเร็จ");
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Button
        label="แบ่งปันทริปของคุณ"
        icon="add"
        onPress={() => router.push("/compose")}
      />
      <Row style={{ justifyContent: "space-between" }}>
        <T size={21} weight="semibold">
          ระหว่างทาง
        </T>
        <IconButton
          name="refresh-outline"
          label="รีเฟรชโพสต์"
          onPress={() => void fetchFeed()}
        />
      </Row>
      {error && <Note>{error}</Note>}
      {!posts.length && (
        <Empty
          icon="images-outline"
          title={busy ? "กำลังเปิดเรื่องราว…" : "เรื่องราวแรก เริ่มที่คุณ"}
          body="แบ่งปันรูป เส้นทาง และความทรงจำจากทริปครั้งล่าสุด"
        />
      )}
      {posts.map((post) => (
        <Panel key={post.id}>
          <Row>
            <View
              style={{
                height: 42,
                width: 42,
                borderRadius: 21,
                backgroundColor: colors.raised,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T weight="semibold">{post.display_name.slice(0, 1)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T weight="semibold">{post.display_name}</T>
              <T size={11} muted>
                @{post.handle} · {date(post.created_at)}
              </T>
            </View>
            <Icon
              name={
                post.visibility === "private"
                  ? "lock-closed-outline"
                  : post.visibility === "friends"
                    ? "people-outline"
                    : "globe-outline"
              }
              size={17}
              color={colors.muted}
            />
          </Row>
          {post.media_path && (
            <PostPhoto key={`${post.id}-${revision}`} postId={post.id} />
          )}
          <T size={20} weight="semibold">
            {post.caption}
          </T>
          {post.description ? <T>{post.description}</T> : null}
          {post.claimed_speed_kmh !== null && (
            <Row>
              <T numeric size={30}>
                {post.claimed_speed_kmh}
              </T>
              <View>
                <T size={12}>km/h</T>
                <T size={10} muted>
                  ผู้โพสต์ระบุ
                </T>
              </View>
            </Row>
          )}
          {post.route_snapshot && (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingTop: 15,
                gap: 6,
              }}
            >
              <Row>
                <Icon name="map-outline" size={18} />
                <T weight="medium">{post.route_snapshot.title}</T>
              </Row>
              {post.route_snapshot.stops?.map((s, i) => (
                <T key={i} size={12} muted>
                  {i + 1}. {s.label}
                </T>
              ))}
            </View>
          )}
          <Row style={{ justifyContent: "flex-end" }}>
            {post.owner_id === session?.user.id ? (
              <Button
                small
                secondary
                label="ลบโพสต์"
                onPress={() =>
                  Alert.alert("ลบโพสต์นี้?", "โพสต์จะหายไปจากชุมชน", [
                    { text: "ยกเลิก", style: "cancel" },
                    {
                      text: "ลบโพสต์",
                      style: "destructive",
                      onPress: () => void remove(post),
                    },
                  ])
                }
              />
            ) : (
              <Button
                small
                secondary
                label="รายงาน"
                onPress={() => void report(post)}
              />
            )}
          </Row>
        </Panel>
      ))}
      {more && (
        <Button
          secondary
          label="โหลดโพสต์เพิ่มเติม"
          busy={busy}
          onPress={() =>
            void fetchFeed(
              posts.at(-1)?.created_at ?? null,
              posts.at(-1)?.id ?? null,
            )
          }
        />
      )}
    </View>
  );
}
function Friends() {
  const now = useNow();
  const { session, scope } = useAuth();
  const actionLock = useRef(false);
  const { colors } = useApp(),
    online = useOnline();
  const [handle, setHandle] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(fn: () => Promise<unknown>) {
    if (actionLock.current || !isAccountCurrent(scope)) return;
    actionLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      if (isAccountCurrent(scope)) await online.refresh();
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage(e instanceof Error ? e.message : "ลองอีกครั้ง");
    } finally {
      actionLock.current = false;
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Panel>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T weight="semibold">แสดงสถานะออนไลน์</T>
            <T size={12} muted>
              เฉพาะเพื่อน · ไม่แชร์ตำแหน่ง
            </T>
          </View>
          <Switch
            accessibilityLabel="แสดงสถานะออนไลน์ให้เพื่อน"
            value={online.optedIn}
            disabled={busy}
            onValueChange={(enabled) =>
              void action(() => online.setPresence(enabled))
            }
            trackColor={{ true: colors.accent }}
          />
        </Row>
      </Panel>
      <Field
        label="เพิ่มเพื่อนด้วยชื่อผู้ใช้"
        placeholder="rider_name"
        value={handle}
        onChangeText={setHandle}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        icon="person-add-outline"
        label="ส่งคำขอเป็นเพื่อน"
        disabled={!handle.trim()}
        busy={busy}
        onPress={() =>
          void action(async () => {
            const result = await accountRpc<string>(
              scope,
              session,
              "rs_request_friend",
              { p_handle: handle.trim() },
            );
            if (!isAccountCurrent(scope)) return;
            setHandle("");
            setMessage(
              result === "incoming"
                ? "เพื่อนส่งคำขอมาแล้ว กดยอมรับด้านล่าง"
                : result === "accepted"
                  ? "เป็นเพื่อนกันอยู่แล้ว"
                  : "ส่งคำขอแล้ว",
            );
          })
        }
      />
      {message && <Note>{message}</Note>}
      {online.error && <Note error>{online.error}</Note>}
      <Row style={{ justifyContent: "space-between" }}>
        <T size={21} weight="semibold">
          เพื่อนร่วมทาง
        </T>
        <IconButton
          name="refresh-outline"
          label="รีเฟรชเพื่อน"
          onPress={() => void online.refresh()}
        />
      </Row>
      {!online.friends.length && (
        <Empty
          icon="people-outline"
          title="ชวนเพื่อนมาเจอกัน"
          body="ใช้ชื่อผู้ใช้ส่งคำขอ เพื่อนจะต้องกดยอมรับก่อนแชร์สถานะและส่งคำท้า"
        />
      )}
      {online.friends.map((friend) => {
        const p = online.presence.find((row) => row.user_id === friend.user_id),
          isOnline =
            !!p?.online && !!p.expires_at && Date.parse(p.expires_at) > now;
        return (
          <Panel key={friend.user_id}>
            <Row>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.raised,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={22}>{friend.display_name.slice(0, 1)}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T weight="semibold">{friend.display_name}</T>
                <T size={12} muted>
                  @{friend.handle}
                </T>
              </View>
              {friend.state === "accepted" && (
                <Row style={{ gap: 5 }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: isOnline ? colors.good : colors.muted,
                    }}
                  />
                  <T size={11} muted>
                    {isOnline ? "ออนไลน์" : "ออฟไลน์"}
                  </T>
                </Row>
              )}
            </Row>
            {friend.state === "pending" ? (
              friend.direction === "incoming" ? (
                <Row>
                  <Button
                    small
                    label="ยอมรับ"
                    disabled={busy}
                    onPress={() =>
                      void action(() =>
                        accountRpc(scope, session, "rs_friend_action", {
                          p_other: friend.user_id,
                          p_action: "accept",
                        }),
                      )
                    }
                    style={{ flex: 1 }}
                  />
                  <Button
                    small
                    secondary
                    label="ปฏิเสธ"
                    disabled={busy}
                    onPress={() =>
                      void action(() =>
                        accountRpc(scope, session, "rs_friend_action", {
                          p_other: friend.user_id,
                          p_action: "decline",
                        }),
                      )
                    }
                    style={{ flex: 1 }}
                  />
                </Row>
              ) : (
                <Button
                  small
                  secondary
                  label="ยกเลิกคำขอ"
                  disabled={busy}
                  onPress={() =>
                    void action(() =>
                      accountRpc(scope, session, "rs_friend_action", {
                        p_other: friend.user_id,
                        p_action: "cancel",
                      }),
                    )
                  }
                />
              )
            ) : (
              <Row>
                <Button
                  small
                  secondary
                  label="นำเพื่อนออก"
                  onPress={() =>
                    void action(() =>
                      accountRpc(scope, session, "rs_friend_action", {
                        p_other: friend.user_id,
                        p_action: "remove",
                      }),
                    )
                  }
                />
                <Button
                  small
                  secondary
                  label="บล็อก"
                  onPress={() =>
                    Alert.alert(
                      "บล็อกเพื่อน?",
                      "หยุดแสดงสถานะและแชร์ข้อมูลระหว่างกัน",
                      [
                        { text: "ยกเลิก", style: "cancel" },
                        {
                          text: "บล็อก",
                          onPress: () =>
                            void action(() =>
                              accountRpc(scope, session, "rs_friend_action", {
                                p_other: friend.user_id,
                                p_action: "block",
                              }),
                            ),
                        },
                      ],
                    )
                  }
                />
              </Row>
            )}
          </Panel>
        );
      })}
    </View>
  );
}
export default function CommunityScreen() {
  const { scope } = useAuth();
  const [tab, setTab] = useState<"feed" | "friends" | "challenges">("feed");
  return (
    <Screen>
      <Heading eyebrow="BETTER TOGETHER" title="เพื่อนร่วมทาง" />
      <Segments
        items={[
          { value: "feed", label: "ชุมชน" },
          { value: "friends", label: "เพื่อน" },
          { value: "challenges", label: "ชาเลนจ์" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <AccountGate>
        <View key={scope.generation}>
          {tab === "feed" ? (
            <Feed />
          ) : tab === "friends" ? (
            <Friends />
          ) : (
            <Challenges />
          )}
        </View>
      </AccountGate>
    </Screen>
  );
}
