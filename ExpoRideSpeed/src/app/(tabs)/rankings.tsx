import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { View } from "react-native";
import { AccountGate } from "../../components/AccountGate";
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
import { accountRpc, isAccountCurrent, useAuth } from "../../state/AuthState";
type Rank = {
  rank: number;
  user_id: string;
  display_name: string;
  sustained_kmh: number;
  recorded_at: string;
  method: string;
};
function Rankings() {
  const { colors } = useApp();
  const { session, scope: accountScope } = useAuth();
  const [period, setPeriod] = useState<"today" | "week" | "month">("today"),
    [category, setCategory] = useState<"scooter" | "motorcycle" | "car">(
      "scooter",
    ),
    [scope, setScope] = useState<"community" | "friends">("community");
  const filterKey = `${period}:${category}:${scope}`;
  const [result, setResult] = useState<{
    key: string;
    ranks: Rank[];
    error: string;
    busy: boolean;
  }>({ key: "", ranks: [], error: "", busy: false });
  const request = useRef(0);
  const { ranks, error, busy } =
    result.key === filterKey ? result : { ranks: [], error: "", busy: true };
  const refresh = useCallback(async () => {
    if (!session || !isAccountCurrent(accountScope)) return;
    const version = ++request.current;
    setResult({ key: filterKey, ranks: [], error: "", busy: true });
    try {
      const ranks = await accountRpc<Rank[]>(
        accountScope,
        session,
        "rs_leaderboard",
        {
          p_period: period,
          p_category: category,
          p_scope: scope,
          p_course: null,
        },
      );
      if (version === request.current && isAccountCurrent(accountScope))
        setResult({ key: filterKey, ranks, error: "", busy: false });
    } catch (e) {
      if (version === request.current && isAccountCurrent(accountScope))
        setResult({
          key: filterKey,
          ranks: [],
          error: e instanceof Error ? e.message : "โหลดอันดับไม่สำเร็จ",
          busy: false,
        });
    }
  }, [period, category, scope, filterKey, session, accountScope]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        request.current++;
      };
    }, [refresh]),
  );
  return (
    <View style={{ gap: 22 }}>
      <Segments
        items={[
          { value: "today", label: "วันนี้" },
          { value: "week", label: "สัปดาห์นี้" },
          { value: "month", label: "เดือนนี้" },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <Segments
        items={[
          { value: "scooter", label: "สกู๊ตเตอร์" },
          { value: "motorcycle", label: "บิ๊กไบค์" },
          { value: "car", label: "รถยนต์" },
        ]}
        value={category}
        onChange={setCategory}
      />
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Segments
            items={[
              { value: "community", label: "ชุมชน" },
              { value: "friends", label: "เพื่อน" },
            ]}
            value={scope}
            onChange={setScope}
          />
        </View>
        <IconButton
          name="refresh-outline"
          label="รีเฟรชอันดับ"
          onPress={() => void refresh()}
        />
      </Row>
      {!!error && <Note error>{error}</Note>}
      {ranks[0] && (
        <Panel style={{ paddingVertical: 28 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T muted size={11}>
              ผู้นำ
              {period === "today"
                ? "วันนี้"
                : period === "week"
                  ? "สัปดาห์นี้"
                  : "เดือนนี้"}
            </T>
            <Icon name="ribbon-outline" color={colors.accent} />
          </Row>
          <T size={25} weight="semibold">
            {ranks[0].display_name}
          </T>
          <Row style={{ alignItems: "baseline" }}>
            <T numeric size={62}>
              {Number(ranks[0].sustained_kmh).toFixed(1)}
            </T>
            <T muted>km/h</T>
          </Row>
          <Note>ความเร็วต่อเนื่อง 3 วินาที · ผลที่ตรวจสอบแล้ว</Note>
        </Panel>
      )}
      {!ranks.length && (
        <Empty
          icon="podium-outline"
          title={busy ? "กำลังโหลดอันดับ…" : "พื้นที่ของสถิติครั้งแรก"}
          body="อันดับจะแสดงผลที่ผ่านการตรวจสอบจากชาเลนจ์สนามปิด โดยแยกประเภทรถอย่างชัดเจน"
        >
          <Button
            secondary
            label="ดูชาเลนจ์ในชุมชน"
            onPress={() => router.push("/community")}
          />
        </Empty>
      )}
      {ranks.map((row) => (
        <Row
          key={row.user_id}
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
            paddingVertical: 14,
          }}
        >
          <T numeric size={22} muted style={{ width: 30 }}>
            {row.rank}
          </T>
          <View style={{ flex: 1 }}>
            <T weight="semibold">{row.display_name}</T>
            <T muted size={11}>
              {new Date(row.recorded_at).toLocaleDateString("th-TH")}
            </T>
          </View>
          <T numeric weight="semibold" size={21}>
            {Number(row.sustained_kmh).toFixed(1)}
          </T>
          <T size={10} muted>
            km/h
          </T>
        </Row>
      ))}
      <Note>
        อัปเดตตามเวลาไทย · วันใหม่เริ่ม 00:00 น.{"\n"}สัปดาห์เริ่มวันจันทร์ ·
        ไม่นับค่าที่กรอกในโพสต์
      </Note>
    </View>
  );
}
export default function RankingScreen() {
  const { scope } = useAuth();
  return (
    <Screen>
      <Heading eyebrow="THE LEADERBOARD" title="ทำสถิติในแบบคุณ" />
      <T muted>ความเร็วที่มีที่มา บนสนามที่พร้อม</T>
      <AccountGate>
        <Rankings key={scope.generation} />
      </AccountGate>
    </Screen>
  );
}
