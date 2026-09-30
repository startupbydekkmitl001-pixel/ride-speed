import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import RouteMap from "../../components/RouteMap";
import {
  Button,
  Field,
  Heading,
  Icon,
  IconButton,
  Note,
  Row,
  Screen,
  Segments,
  T,
  type IconName,
} from "../../components/ui";
import {
  moveStop,
  routeDistanceKm,
  uid,
  validCoordinate,
  validateRoute,
  type SavedRoute,
  type Stop,
} from "../../lib/domain";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";
import { accountRpc, isAccountCurrent, useAuth } from "../../state/AuthState";

type Category = "scooter" | "motorcycle" | "car" | "bicycle";
type CloudRoute = {
  id: string;
  owner_id: string;
  revision: number;
  title: string;
  category: Category;
  stops: { label: string; lat: number; lng: number }[];
};
type StopForm = {
  id: string | null;
  name: string;
  latitude: string;
  longitude: string;
};
type Confirmation = {
  title: string;
  body: string;
  label: string;
  action: () => void;
};
const categories: { value: Category; label: string }[] = [
  { value: "scooter", label: "สกู๊ตเตอร์" },
  { value: "motorcycle", label: "บิ๊กไบค์" },
  { value: "car", label: "รถยนต์" },
  { value: "bicycle", label: "จักรยาน" },
];
const copyRoute = (route: SavedRoute): SavedRoute => ({
  ...route,
  stops: route.stops.map((stop) => ({ ...stop })),
});

function routeFromCloud(row: CloudRoute, localId?: string): SavedRoute {
  if (
    !row ||
    !row.id ||
    !Number.isInteger(row.revision) ||
    !Array.isArray(row.stops) ||
    !categories.some((category) => category.value === row.category)
  )
    throw new Error("ข้อมูลเส้นทางจากคลาวด์ไม่สมบูรณ์");
  const route: SavedRoute = {
    id: localId ?? uid(),
    cloudId: row.id,
    cloudRevision: row.revision,
    category: row.category,
    name: row.title,
    closedCourse: false,
    stops: row.stops.map((stop) => ({
      id: uid(),
      name: stop.label,
      latitude: stop.lat,
      longitude: stop.lng,
    })),
  };
  const invalid = validateRoute(route);
  if (invalid) throw new Error(invalid);
  return route;
}

function RoutesEditor() {
  const { data, update, colors, vehicle, ready, storageError, motion } =
    useApp();
  const { session, scope } = useAuth();
  const category: Category =
    vehicle?.category === "bigbike"
      ? "motorcycle"
      : (vehicle?.category ?? "scooter");
  const newRoute = (): SavedRoute => ({
    id: uid(),
    name: "",
    stops: [],
    closedCourse: false,
    category,
  });
  const [tab, setTab] = useState<"build" | "saved">("build");
  const [draft, setDraft] = useState<SavedRoute>(newRoute);
  const [baseline, setBaseline] = useState("");
  const [form, setForm] = useState<StopForm | null>(null);
  const [focus, setFocus] = useState<{
    latitude: number;
    longitude: number;
    token: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const routesRef = useRef(data.routes);
  const lifecycle = useRef({ mounted: true, request: 0, busy: false });
  useEffect(() => {
    routesRef.current = data.routes;
  }, [data.routes]);
  useEffect(() => {
    const current = lifecycle.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
      current.request++;
    };
  }, []);
  const dirty =
    draft.name !== "" || draft.stops.length > 0
      ? JSON.stringify(draft) !== baseline
      : false;
  const distance = routeDistanceKm(draft.stops);

  const storeRoutes = (routes: SavedRoute[]) => {
    routesRef.current = routes;
    update({ routes });
  };
  const change = (patch: Partial<SavedRoute>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
  };
  const notifyError = (error: unknown) =>
    setMessage({
      error: true,
      text:
        error instanceof Error
          ? error.message
          : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง",
    });
  const withoutLosingDraft = (action: () => void) => {
    if (dirty || form)
      setConfirmation({
        title: "มีเส้นทางที่ยังไม่ได้บันทึก",
        body: "หากดำเนินการต่อ การแก้ไขในหน้านี้จะถูกแทนที่",
        label: "ดำเนินการต่อ",
        action,
      });
    else action();
  };
  const startNew = () =>
    withoutLosingDraft(() => {
      setDraft(newRoute());
      setBaseline("");
      setForm(null);
      setFocus(undefined);
      setMessage(null);
      setTab("build");
    });
  const openRoute = (route: SavedRoute) =>
    withoutLosingDraft(() => {
      const next = copyRoute(route);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setForm(null);
      setFocus(undefined);
      setMessage(null);
      setTab("build");
    });

  const editStop = (stop: Stop) => {
    if (busy) return;
    setForm({
      id: stop.id,
      name: stop.name,
      latitude: String(stop.latitude),
      longitude: String(stop.longitude),
    });
    setFocus({
      latitude: stop.latitude,
      longitude: stop.longitude,
      token: Date.now(),
    });
    setMessage(null);
  };
  const addOnMap = (coordinate: { latitude: number; longitude: number }) => {
    if (busy) return;
    if (draft.stops.length >= 12) {
      setMessage({
        error: true,
        text: "เพิ่มได้สูงสุด 12 จุด ลบจุดเดิมก่อนเพิ่มจุดใหม่",
      });
      return;
    }
    const stop = {
      ...coordinate,
      id: uid(),
      name: draft.stops.length
        ? `จุดที่ ${draft.stops.length + 1}`
        : "จุดเริ่มต้น",
    };
    change({ stops: [...draft.stops, stop] });
    setMessage({
      text: `เพิ่ม ${stop.name} แล้ว แตะชื่อจุดด้านล่างเพื่อแก้ไข`,
    });
  };
  const applyStop = () => {
    if (!form || busy) return;
    const decimal = (text: string) => {
      const value = text.trim().replace(",", ".");
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : NaN;
    };
    const latitude = decimal(form.latitude);
    const longitude = decimal(form.longitude);
    if (!form.name.trim() || form.name.trim().length > 80) {
      setMessage({ error: true, text: "ตั้งชื่อจุด 1–80 ตัวอักษร" });
      return;
    }
    if (!validCoordinate(latitude, longitude)) {
      setMessage({
        error: true,
        text: "ละติจูดต้องอยู่ระหว่าง −90 ถึง 90 และลองจิจูด −180 ถึง 180",
      });
      return;
    }
    if (!form.id && draft.stops.length >= 12) {
      setMessage({ error: true, text: "เพิ่มได้สูงสุด 12 จุด" });
      return;
    }
    const stop = {
      id: form.id ?? uid(),
      name: form.name.trim(),
      latitude,
      longitude,
    };
    change({
      stops: form.id
        ? draft.stops.map((current) =>
            current.id === form.id ? stop : current,
          )
        : [...draft.stops, stop],
    });
    setFocus({ latitude, longitude, token: Date.now() });
    setForm(null);
  };
  const saveLocal = () => {
    if (!ready || busy) return;
    if (form) {
      setMessage({
        error: true,
        text: "บันทึกหรือยกเลิกการแก้ไขจุดก่อนบันทึกเส้นทาง",
      });
      return;
    }
    const route = { ...copyRoute(draft), name: draft.name.trim() };
    const invalid = validateRoute(route);
    if (invalid) {
      setMessage({ error: true, text: invalid });
      return;
    }
    storeRoutes([
      route,
      ...routesRef.current.filter((item) => item.id !== route.id),
    ]);
    setDraft(route);
    setBaseline(JSON.stringify(route));
    setMessage({
      text: route.cloudId
        ? "บันทึกในเครื่องแล้ว กดซิงก์เพื่ออัปเดตสำเนาบนคลาวด์"
        : "บันทึกในเครื่องแล้ว",
    });
  };

  const sync = async (route: SavedRoute) => {
    const actingUser = session?.user.id;
    const current = lifecycle.current;
    if (
      !actingUser ||
      !session ||
      !supabase ||
      current.busy ||
      !current.mounted ||
      !isAccountCurrent(scope)
    )
      return;
    const invalid = validateRoute(route);
    if (invalid) {
      setMessage({ error: true, text: invalid });
      return;
    }
    if (
      route.cloudId &&
      (!Number.isInteger(route.cloudRevision) || (route.cloudRevision ?? 0) < 1)
    ) {
      setMessage({
        error: true,
        text: "ยังไม่ทราบเวอร์ชันบนคลาวด์ เลือกโหลดใหม่ก่อนซิงก์",
      });
      return;
    }
    const version = ++current.request;
    const applicable = () =>
      current.mounted && current.request === version && isAccountCurrent(scope);
    current.busy = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await accountRpc<CloudRoute | CloudRoute[]>(
        scope,
        session,
        "rs_save_route",
        {
          p_id: route.cloudId ?? null,
          p_expected_revision: route.cloudId ? route.cloudRevision : 0,
          p_title: route.name,
          p_category: route.category ?? category,
          p_stops: route.stops.map((stop) => ({
            label: stop.name,
            lat: stop.latitude,
            lng: stop.longitude,
          })),
        },
      );
      if (!applicable()) return;
      const row = Array.isArray(response)
        ? response.length === 1
          ? response[0]
          : null
        : response;
      if (
        !row?.id ||
        row.owner_id !== actingUser ||
        !Number.isInteger(row.revision)
      )
        throw new Error("เซิร์ฟเวอร์ยังไม่ยืนยันการบันทึก");
      const saved = {
        ...route,
        cloudId: row.id,
        cloudRevision: row.revision,
        category: row.category,
      };
      storeRoutes(
        routesRef.current.map((item) => (item.id === route.id ? saved : item)),
      );
      if (draft.id === route.id && !dirty) {
        setDraft(copyRoute(saved));
        setBaseline(JSON.stringify(saved));
      }
      setMessage({ text: "ซิงก์เส้นทางกับคลาวด์แล้ว" });
    } catch (error) {
      if (!applicable()) return;
      const text = error instanceof Error ? error.message : "";
      if (/revision|conflict|stale/i.test(text))
        setMessage({
          error: true,
          text: "คลาวด์มีเวอร์ชันใหม่กว่า สำเนาในเครื่องยังอยู่ เลือกโหลดใหม่จากคลาวด์ก่อนซิงก์อีกครั้ง",
        });
      else notifyError(error);
    } finally {
      if (current.request === version) {
        current.busy = false;
        if (applicable()) setBusy(false);
      }
    }
  };

  const loadCloud = async (replace?: SavedRoute) => {
    const actingUser = session?.user.id;
    const current = lifecycle.current;
    if (
      !actingUser ||
      !session ||
      !supabase ||
      current.busy ||
      !current.mounted ||
      !isAccountCurrent(scope)
    )
      return;
    const version = ++current.request;
    const applicable = () =>
      current.mounted && current.request === version && isAccountCurrent(scope);
    current.busy = true;
    setBusy(true);
    setMessage(null);
    try {
      let query = supabase
        .from("rs_routes")
        .select("id,owner_id,revision,title,category,stops")
        .eq("owner_id", actingUser)
        .setHeader("Authorization", `Bearer ${session.access_token}`);
      if (replace?.cloudId) query = query.eq("id", replace.cloudId);
      const { data: rows, error } = await query.order("updated_at", {
        ascending: false,
      });
      if (!applicable()) return;
      if (error) throw error;
      if (rows?.some((row) => row.owner_id !== actingUser))
        throw new Error("ข้อมูลเส้นทางไม่ตรงกับบัญชีปัจจุบัน");
      if (replace) {
        if (!rows?.length)
          throw new Error("ไม่พบเส้นทางนี้บนคลาวด์ สำเนาในเครื่องยังคงอยู่");
        const route = routeFromCloud(rows[0] as CloudRoute, replace.id);
        storeRoutes(
          routesRef.current.map((item) =>
            item.id === route.id ? route : item,
          ),
        );
        if (draft.id === route.id) {
          setDraft(copyRoute(route));
          setBaseline(JSON.stringify(route));
          setForm(null);
        }
        setMessage({ text: "โหลดเวอร์ชันล่าสุดจากคลาวด์แล้ว" });
      } else {
        const additions = ((rows as CloudRoute[]) ?? [])
          .filter(
            (row) =>
              !routesRef.current.some((route) => route.cloudId === row.id),
          )
          .map((row) => routeFromCloud(row));
        storeRoutes([...additions, ...routesRef.current]);
        setMessage({
          text: additions.length
            ? `เพิ่ม ${additions.length} เส้นทางจากคลาวด์แล้ว`
            : "ไม่มีเส้นทางใหม่บนคลาวด์ สำเนาในเครื่องยังคงเดิม",
        });
      }
    } catch (error) {
      if (applicable()) notifyError(error);
    } finally {
      if (current.request === version) {
        current.busy = false;
        if (applicable()) setBusy(false);
      }
    }
  };

  const removeLocal = (route: SavedRoute) =>
    setConfirmation({
      title: "ลบเส้นทางจากเครื่อง?",
      body: route.cloudId
        ? "สำเนาบนคลาวด์ยังคงอยู่ และโหลดกลับมาได้"
        : "เส้นทางนี้มีเฉพาะในเครื่อง การลบจะนำชื่อและจุดที่บันทึกไว้ออก",
      label: "ลบจากเครื่อง",
      action: () => {
        storeRoutes(routesRef.current.filter((item) => item.id !== route.id));
        if (draft.id === route.id) {
          setDraft(newRoute());
          setBaseline("");
          setForm(null);
        }
        setMessage({ text: "ลบเส้นทางจากเครื่องแล้ว" });
      },
    });
  const removeCloud = async (route: SavedRoute) => {
    const actingUser = session?.user.id;
    const current = lifecycle.current;
    if (
      !actingUser ||
      !session ||
      !route.cloudId ||
      current.busy ||
      !current.mounted ||
      !isAccountCurrent(scope)
    )
      return;
    const version = ++current.request;
    const applicable = () =>
      current.mounted && current.request === version && isAccountCurrent(scope);
    current.busy = true;
    setBusy(true);
    setMessage(null);
    try {
      const removed = await accountRpc<boolean>(
        scope,
        session,
        "rs_delete_route",
        { p_id: route.cloudId, p_expected_revision: route.cloudRevision ?? 0 },
      );
      if (!applicable()) return;
      if (removed !== true) throw new Error("เซิร์ฟเวอร์ยังไม่ยืนยันการลบ");
      storeRoutes(routesRef.current.filter((item) => item.id !== route.id));
      if (draft.id === route.id) {
        setDraft(newRoute());
        setBaseline("");
        setForm(null);
      }
      setMessage({ text: "ลบเส้นทางจากเครื่องและคลาวด์แล้ว" });
    } catch (error) {
      if (!applicable()) return;
      const text = error instanceof Error ? error.message : "";
      if (/revision|conflict|stale/i.test(text))
        setMessage({
          error: true,
          text: "เส้นทางบนคลาวด์เปลี่ยนแล้ว ยังไม่ได้ลบข้อมูล โหลดเวอร์ชันล่าสุดก่อนลองใหม่",
        });
      else notifyError(error);
    } finally {
      if (current.request === version) {
        current.busy = false;
        if (applicable()) setBusy(false);
      }
    }
  };
  const savedDraft = data.routes.find((route) => route.id === draft.id);

  const action = (
    name: IconName,
    label: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled || busy ? 0.3 : 1,
      }}
    >
      <Icon name={name} size={19} />
    </Pressable>
  );

  return (
    <Screen>
      <Heading
        eyebrow="วางแผนการเดินทาง"
        title="เส้นทาง"
        right={
          <IconButton
            name="add-outline"
            label="สร้างเส้นทางใหม่"
            onPress={() => {
              if (!busy) startNew();
            }}
          />
        }
      />
      <Segments
        items={[
          { value: "build", label: "สร้างเส้นทาง" },
          { value: "saved", label: `ที่บันทึกไว้ · ${data.routes.length}` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {message && <Note error={message.error}>{message.text}</Note>}
      {storageError && <Note error>{storageError}</Note>}

      {tab === "build" ? (
        <>
          <Row style={{ justifyContent: "space-between", gap: 6 }}>
            {["ปักหมุด", "จัดลำดับ", "บันทึก"].map((label, index) => (
              <Row key={label} style={{ gap: 6 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      index === 0 ||
                      (index === 1 && draft.stops.length > 1) ||
                      (index === 2 && savedDraft && !dirty)
                        ? colors.accent
                        : colors.raised,
                  }}
                >
                  <T
                    size={11}
                    numeric
                    weight="semibold"
                    style={{
                      color:
                        index === 0 ||
                        (index === 1 && draft.stops.length > 1) ||
                        (index === 2 && savedDraft && !dirty)
                          ? colors.onAccent
                          : colors.muted,
                    }}
                  >
                    {index + 1}
                  </T>
                </View>
                <T size={12} muted>
                  {label}
                </T>
              </Row>
            ))}
          </Row>
          <RouteMap
            key={draft.id}
            stops={draft.stops}
            selectedId={form?.id ?? undefined}
            disabled={busy || draft.stops.length >= 12}
            focus={focus}
            onAddStop={addOnMap}
            onSelectStop={editStop}
          />
          <Field
            label="ชื่อเส้นทาง"
            placeholder="เช่น เขาใหญ่เช้าวันอาทิตย์"
            value={draft.name}
            onChangeText={(name) => change({ name })}
            maxLength={80}
            editable={!busy}
          />
          <View style={{ gap: 9 }}>
            <T size={13} weight="medium">
              ประเภทเส้นทาง
            </T>
            <Segments
              items={categories}
              value={draft.category ?? category}
              onChange={(value) => {
                if (!busy) change({ category: value });
              }}
            />
          </View>
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <T size={21} weight="semibold">
                จุดในเส้นทาง{" "}
                <T size={14} muted>
                  {draft.stops.length}/12
                </T>
              </T>
              {draft.stops.length > 1 && (
                <T size={12} muted>
                  เส้นตรง {distance.toFixed(1)} กม.
                </T>
              )}
            </Row>
            {!draft.stops.length && (
              <T muted size={14}>
                เลือกจุดเริ่มต้นและปลายทางบนแผนที่ หรือกรอกพิกัดด้วยปุ่มด้านล่าง
              </T>
            )}
            {draft.stops.map((stop, index) => (
              <View
                key={stop.id}
                style={{
                  paddingVertical: 10,
                  borderBottomColor: colors.line,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                }}
              >
                <Row style={{ alignItems: "flex-start", gap: 10 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      marginTop: 8,
                      borderRadius: 14,
                      backgroundColor: colors.raised,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <T numeric size={13} weight="semibold">
                      {index + 1}
                    </T>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`แก้ไขจุดที่ ${index + 1} ${stop.name}`}
                    disabled={busy}
                    onPress={() => editStop(stop)}
                    style={{ flex: 1, paddingVertical: 5, minHeight: 48 }}
                  >
                    <T weight="medium" size={16}>
                      {stop.name}
                    </T>
                    <T numeric muted size={11} style={{ marginTop: 5 }}>
                      {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
                    </T>
                  </Pressable>
                  {action("create-outline", `แก้ไข ${stop.name}`, () =>
                    editStop(stop),
                  )}
                </Row>
                <Row style={{ justifyContent: "flex-end", gap: 0 }}>
                  {action(
                    "arrow-up-outline",
                    `ย้าย ${stop.name} ขึ้น`,
                    () => change({ stops: moveStop(draft.stops, index, -1) }),
                    index === 0,
                  )}
                  {action(
                    "arrow-down-outline",
                    `ย้าย ${stop.name} ลง`,
                    () => change({ stops: moveStop(draft.stops, index, 1) }),
                    index === draft.stops.length - 1,
                  )}
                  {action("trash-outline", `ลบจุด ${stop.name}`, () => {
                    change({
                      stops: draft.stops.filter((item) => item.id !== stop.id),
                    });
                    if (form?.id === stop.id) setForm(null);
                  })}
                </Row>
              </View>
            ))}
          </View>

          {form ? (
            <View
              style={{
                padding: 18,
                gap: 15,
                backgroundColor: colors.surface,
                borderRadius: 23,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <T size={19} weight="semibold">
                {form.id ? "แก้ไขจุด" : "เพิ่มจุดด้วยพิกัด"}
              </T>
              <Field
                label="ชื่อจุด"
                value={form.name}
                maxLength={80}
                editable={!busy}
                onChangeText={(name) => setForm({ ...form, name })}
              />
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="ละติจูด"
                    placeholder="13.7563"
                    value={form.latitude}
                    editable={!busy}
                    keyboardType={
                      Platform.OS === "ios"
                        ? "numbers-and-punctuation"
                        : "default"
                    }
                    autoCorrect={false}
                    onChangeText={(latitude) => setForm({ ...form, latitude })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="ลองจิจูด"
                    placeholder="100.5018"
                    value={form.longitude}
                    editable={!busy}
                    keyboardType={
                      Platform.OS === "ios"
                        ? "numbers-and-punctuation"
                        : "default"
                    }
                    autoCorrect={false}
                    onChangeText={(longitude) =>
                      setForm({ ...form, longitude })
                    }
                  />
                </View>
              </Row>
              <Row>
                <Button
                  label="ยกเลิก"
                  secondary
                  small
                  onPress={() => setForm(null)}
                  disabled={busy}
                  style={{ flex: 1 }}
                />
                <Button
                  label={form.id ? "บันทึกจุด" : "เพิ่มจุด"}
                  small
                  onPress={applyStop}
                  disabled={busy}
                  style={{ flex: 1 }}
                />
              </Row>
            </View>
          ) : (
            <Button
              label="เพิ่มจุดด้วยพิกัด"
              secondary
              icon="add-outline"
              onPress={() => {
                setForm({
                  id: null,
                  name: draft.stops.length
                    ? `จุดที่ ${draft.stops.length + 1}`
                    : "จุดเริ่มต้น",
                  latitude: "",
                  longitude: "",
                });
                setMessage(null);
              }}
              disabled={busy || draft.stops.length >= 12}
            />
          )}

          <View style={{ gap: 10, paddingVertical: 8 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <T weight="medium">ใช้ภายในสนามปิด</T>
                <T muted size={12}>
                  ระบุลักษณะเส้นทางที่คุณวางแผน
                </T>
              </View>
              <Switch
                accessibilityLabel="เส้นทางภายในสนามปิด"
                value={draft.closedCourse}
                disabled={busy}
                onValueChange={(closedCourse) => change({ closedCourse })}
                trackColor={{ false: colors.line, true: colors.accent }}
              />
            </Row>
            {draft.closedCourse && (
              <Note>
                ตัวเลือกนี้ไม่ใช่การอนุมัติสนามสำหรับการแข่งขันจับเวลา
                ต้องใช้สนามและรอบที่ผู้ดูแลอนุมัติ
              </Note>
            )}
          </View>
          <Button
            label={
              savedDraft ? "บันทึกการแก้ไขในเครื่อง" : "บันทึกเส้นทางในเครื่อง"
            }
            icon="checkmark-outline"
            onPress={saveLocal}
            disabled={!ready || busy || draft.stops.length < 2}
          />
          {savedDraft && session && (
            <Button
              label="ซิงก์เส้นทางนี้กับคลาวด์"
              secondary
              icon="cloud-upload-outline"
              onPress={() => sync(savedDraft)}
              disabled={dirty || Boolean(form) || busy}
              busy={busy}
            />
          )}
          {!session && (
            <Note>
              ใช้งานและบันทึกเส้นทางในเครื่องได้
              เข้าสู่ระบบจากหน้าโปรไฟล์เมื่อต้องการซิงก์
            </Note>
          )}
        </>
      ) : (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <T size={21} weight="semibold">
              เส้นทางของคุณ
            </T>
            {session && (
              <Button
                label="โหลดจากคลาวด์"
                secondary
                small
                icon="cloud-download-outline"
                onPress={() => loadCloud()}
                disabled={busy}
                busy={busy}
              />
            )}
          </Row>
          {!data.routes.length && (
            <View
              style={{ paddingVertical: 30, alignItems: "center", gap: 13 }}
            >
              <Icon name="trail-sign-outline" size={38} color={colors.muted} />
              <T size={19} weight="medium">
                ยังไม่มีเส้นทางที่บันทึกไว้
              </T>
              <T muted style={{ textAlign: "center" }}>
                เริ่มจากสองจุด แล้วจัดลำดับการเดินทางของคุณ
              </T>
              <Button label="สร้างเส้นทาง" onPress={startNew} small />
            </View>
          )}
          {data.routes.map((route) => (
            <View
              key={route.id}
              style={{
                paddingBottom: 20,
                gap: 12,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.line,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`เปิดเส้นทาง ${route.name}`}
                disabled={busy}
                onPress={() => openRoute(route)}
                style={{ minHeight: 48 }}
              >
                <T size={21} weight="medium">
                  {route.name}
                </T>
                <T muted size={13}>
                  {route.stops.length} จุด · เส้นตรง{" "}
                  {routeDistanceKm(route.stops).toFixed(1)} กม.
                  {route.closedCourse ? " · สนามปิด" : ""}
                </T>
              </Pressable>
              <Row style={{ flexWrap: "wrap", gap: 8 }}>
                <Button
                  label="เปิดแก้ไข"
                  small
                  secondary
                  onPress={() => openRoute(route)}
                  disabled={busy}
                />
                {session && (
                  <Button
                    label="ซิงก์"
                    small
                    secondary
                    icon="cloud-upload-outline"
                    onPress={() => sync(route)}
                    disabled={busy}
                  />
                )}
                {route.cloudId && session && (
                  <Button
                    label="โหลดใหม่"
                    small
                    secondary
                    icon="refresh-outline"
                    onPress={() =>
                      setConfirmation({
                        title: "โหลดเวอร์ชันจากคลาวด์?",
                        body: "การแก้ไขเฉพาะในเครื่องของเส้นทางนี้จะถูกแทนที่ด้วยเวอร์ชันล่าสุดบนคลาวด์",
                        label: "โหลดใหม่",
                        action: () => {
                          void loadCloud(route);
                        },
                      })
                    }
                    disabled={busy}
                  />
                )}
                {action("trash-outline", `ลบ ${route.name} จากเครื่อง`, () =>
                  removeLocal(route),
                )}
              </Row>
              {route.cloudId && (
                <T size={11} muted>
                  มีสำเนาบนคลาวด์ · เวอร์ชันที่ซิงก์ล่าสุด{" "}
                  {route.cloudRevision ?? "—"}
                </T>
              )}
              {route.cloudId && session && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`ลบ ${route.name} จากเครื่องและคลาวด์`}
                  disabled={busy}
                  onPress={() =>
                    setConfirmation({
                      title: "ลบเส้นทางจากคลาวด์ด้วย?",
                      body: "จะลบเส้นทางต้นฉบับทั้งในเครื่องและคลาวด์ สำเนาที่ใช้ในคำเชิญเดิมอาจยังคงอยู่",
                      label: "ลบทั้งเครื่องและคลาวด์",
                      action: () => {
                        void removeCloud(route);
                      },
                    })
                  }
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    alignSelf: "flex-start",
                  }}
                >
                  <T size={12} style={{ color: colors.danger }}>
                    ลบทั้งเครื่องและคลาวด์
                  </T>
                </Pressable>
              )}
            </View>
          ))}
          {!session && (
            <Note>
              เข้าสู่ระบบจากหน้าโปรไฟล์ เพื่อโหลดหรือซิงก์เส้นทางของคุณ
            </Note>
          )}
        </>
      )}

      <Modal
        visible={Boolean(confirmation)}
        transparent
        animationType={motion ? "fade" : "none"}
        onRequestClose={() => setConfirmation(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000088",
            justifyContent: "center",
            padding: 28,
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              padding: 24,
              borderRadius: 28,
              backgroundColor: colors.surface,
              gap: 18,
            }}
          >
            <T size={22} weight="semibold">
              {confirmation?.title}
            </T>
            <T muted>{confirmation?.body}</T>
            <Button
              label={confirmation?.label ?? "ยืนยัน"}
              onPress={() => {
                const perform = confirmation?.action;
                setConfirmation(null);
                perform?.();
              }}
            />
            <Button
              label="ยกเลิก"
              secondary
              onPress={() => setConfirmation(null)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// Reset only this screen's account-bound editor/confirmations, never the navigation tree.
export default function RoutesScreen() {
  const { scope } = useAuth();
  return <RoutesEditor key={scope.generation} />;
}
