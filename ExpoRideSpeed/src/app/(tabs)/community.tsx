import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, View } from "react-native";
import { AccountGate } from "../../components/AccountGate";
import InvitationsScreen from "../../features/social/InvitationsScreen";
import FriendsScreen from "../../features/social/FriendsScreen";
import {useI18n} from "../../lib/i18n";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useRide} from "../../state/RideState";
import {
  Button,
  Empty,
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
      {!!error && <Note>{error}</Note>}
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
          {!!post.media_path && (
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
export default function CommunityScreen() {
  const {scope}=useAuth(),{colors}=useApp(),{movingLocked}=useRide(),{t}=useI18n(),insets=useSafeAreaInsets();
  const [tab,setTab]=useState<"feed"|"friends"|"challenges">("feed");
  return <View style={{flex:1,backgroundColor:colors.bg}}>
    <View style={{paddingHorizontal:24,paddingTop:insets.top+18,paddingBottom:12,gap:18}}>
      <Heading eyebrow={t('m5a.communityEyebrow')} title={t('m5a.communityTitle')}/>
      <Segments items={[{value:'feed',label:t('m5a.community')},{value:'friends',label:t('m5a.friends')},{value:'challenges',label:t('m5a.invitations')}]} value={tab} onChange={value=>{if(!movingLocked)setTab(value);}}/>
    </View>
    {tab==='feed'?<Screen style={{paddingTop:8}}><AccountGate><View key={scope.generation}><Feed/></View></AccountGate></Screen>:tab==='friends'?<FriendsScreen key={scope.generation} embedded/>:<InvitationsScreen key={scope.generation} embedded/>}
  </View>;
}