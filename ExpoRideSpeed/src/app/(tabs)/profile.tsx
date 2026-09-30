import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import { RiderCard } from "../../components/RiderCard";
import {
  Button,
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
import { pickPicture } from "../../lib/photos";
import { supabase } from "../../lib/supabase";
import { useApp } from "../../state/AppState";
import { accountRpc, isAccountCurrent, useAuth } from "../../state/AuthState";
import { useRiderProfile } from "../../state/RiderProfile";
import { useOnline } from "../../state/OnlineState";
export default function ProfileScreen() {
  const { scope } = useAuth();
  // Reset only the profile form on account change; never remount navigation.
  return <AccountProfile key={scope.generation} />;
}
function AccountProfile() {
  const { data, update, colors, vehicle, storageError } = useApp(),
    { session, scope } = useAuth();
  const rider = useRiderProfile(),
    online = useOnline();
  const [name, setName] = useState(rider.displayName),
    [handle, setHandle] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const [formLoaded, setFormLoaded] = useState(!session);
  useFocusEffect(
    useCallback(() => {
      if (editing) return;
      let alive = true;
      if (session && supabase)
        void supabase
          .from("rs_profiles")
          .select("handle,display_name")
          .eq("user_id", session.user.id)
          .setHeader("Authorization", `Bearer ${session.access_token}`)
          .maybeSingle()
          .then(({ data: profile, error }) => {
            if (alive && isAccountCurrent(scope)) {
              if (profile) {
                setName(profile.display_name);
                setHandle(profile.handle);
              } else setHandle("");
              setFormLoaded(true);
              if (error) setMessage("ยังโหลดโปรไฟล์ออนไลน์ไม่ได้ ลองอีกครั้ง");
            }
          });
      return () => {
        alive = false;
      };
    }, [session, scope, editing]),
  );
  function toggleEdit() {
    if (!rider.ready || !formLoaded || busy) return;
    if (!editing) setName(rider.displayName);
    setEditing(!editing);
  }
  async function saveProfile() {
    if (busy || !rider.ready || !isAccountCurrent(scope)) return;
    if (!name.trim() || name.trim().length > 40) {
      setMessage("ชื่อแสดงผลต้องมี 1–40 ตัวอักษร");
      return;
    }
    if (session && !/^[a-z0-9_]{3,24}$/.test(handle.trim().toLowerCase())) {
      setMessage("ชื่อผู้ใช้ใช้ a–z, 0–9 หรือ _ จำนวน 3–24 ตัว");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (session) {
        await accountRpc(scope, session, "rs_upsert_profile", {
          p_handle: handle.trim().toLowerCase(),
          p_display_name: name.trim(),
        });
        await online.refresh();
      }
      if (!isAccountCurrent(scope)) return;
      await rider.save({ displayName: name.trim() });
      if (!isAccountCurrent(scope)) return;
      setEditing(false);
      setMessage("บันทึกโปรไฟล์แล้ว");
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  async function photo() {
    if (busy || !rider.ready || !isAccountCurrent(scope)) return;
    try {
      const selected = await pickPicture(true);
      if (selected && isAccountCurrent(scope)) {
        await rider.save({ photoUri: selected.uri });
        if (isAccountCurrent(scope))
          setMessage("เปลี่ยนรูปบนบัตรแล้ว · รูปนี้เก็บในเครื่อง");
      }
    } catch (e) {
      if (isAccountCurrent(scope))
        setMessage(e instanceof Error ? e.message : "เปิดรูปไม่สำเร็จ");
    }
  }
  async function logout() {
    if (!supabase || busy || !isAccountCurrent(scope)) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error && isAccountCurrent(scope)) setMessage(error.message);
    } catch {
      if (isAccountCurrent(scope))
        setMessage("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      if (isAccountCurrent(scope)) setBusy(false);
    }
  }
  return (
    <Screen onScroll={(y) => setCardVisible(y < 400)}>
      <Heading
        eyebrow="YOUR CORNER"
        title="พื้นที่ของคุณ"
        right={
          <IconButton
            name="create-outline"
            label="แก้ไขโปรไฟล์"
            onPress={toggleEdit}
          />
        }
      />
      <View>
        <RiderCard handle={handle} visible={cardVisible} />
      </View>
      <Row>
        <Button
          secondary
          small
          icon="image-outline"
          label="เปลี่ยนรูป"
          disabled={!rider.ready || busy}
          onPress={photo}
          style={{ flex: 1 }}
        />
        <Button
          secondary
          small
          icon="create-outline"
          label="แก้ไขบัตร"
          disabled={!rider.ready || !formLoaded || busy}
          onPress={toggleEdit}
          style={{ flex: 1 }}
        />
      </Row>
      <Note>บัตรสมาชิกในแอป · ไม่ใช่ใบอนุญาตขับขี่</Note>
      {editing && (
        <Panel>
          <Field
            label="ชื่อบนบัตร"
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
          {session && (
            <Field
              label="ชื่อผู้ใช้สำหรับเพิ่มเพื่อน"
              value={handle}
              onChangeText={setHandle}
              placeholder="rider_name"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
            />
          )}
          <Button
            label="บันทึกโปรไฟล์"
            disabled={!rider.ready}
            onPress={saveProfile}
            busy={busy}
          />
        </Panel>
      )}
      {message ? <Note>{message}</Note> : null}
      {!!rider.error && <Note error>{rider.error}</Note>}
      {!!storageError && <Note error>{storageError}</Note>}
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <T size={22} weight="semibold">
            โรงรถ
          </T>
          <T size={12} muted>
            {data.vehicles.length} คัน · เลือกคันที่ใช้วันนี้
          </T>
        </View>
        <IconButton
          name="add"
          label="เพิ่มรถ"
          onPress={() => router.push("/garage")}
        />
      </Row>
      {data.vehicles.length ? (
        data.vehicles.map((v) => (
          <Button
            key={v.id}
            secondary={vehicle?.id !== v.id}
            label={`${v.brand} ${v.model}${v.engineCc !== null ? ` · ${v.engineCc} cc` : v.powertrain === "electric" ? " · EV" : ""}`}
            icon={v.category === "car" ? "car-outline" : "bicycle-outline"}
            onPress={() => update({ selectedVehicleId: v.id })}
          />
        ))
      ) : (
        <Panel>
          <T muted>
            เริ่มด้วยรถคันแรก แล้วเลือกจากสกู๊ตเตอร์ บิ๊กไบค์ หรือรถยนต์
          </T>
          <Button
            label="เพิ่มรถคันแรก"
            icon="add"
            onPress={() => router.push("/garage")}
          />
        </Panel>
      )}
      <Panel>
        <T size={18} weight="semibold">
          หน้าตาของแอป
        </T>
        <Segments
          items={[
            { value: "light", label: "สว่าง" },
            { value: "dark", label: "ดำ" },
            { value: "system", label: "ตามเครื่อง" },
          ]}
          value={data.theme}
          onChange={(theme) => update({ theme })}
        />
        <Row style={{ justifyContent: "space-between" }}>
          <T>ลดการเคลื่อนไหว</T>
          <Switch
            accessibilityLabel="ลดการเคลื่อนไหว"
            value={data.reduceMotion}
            onValueChange={(reduceMotion) => update({ reduceMotion })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <T>ลดความโปร่งใส</T>
          <Switch
            accessibilityLabel="ลดความโปร่งใส"
            value={data.reduceGlass}
            onValueChange={(reduceGlass) => update({ reduceGlass })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
      </Panel>
      {session ? (
        <Panel>
          <Row>
            <Icon name="checkmark-circle-outline" color={colors.good} />
            <View style={{ flex: 1 }}>
              <T weight="medium">เชื่อมต่อบัญชีแล้ว</T>
              <T muted size={12}>
                {session.user.email}
              </T>
            </View>
          </Row>
          <Button secondary label="ออกจากระบบ" busy={busy} onPress={logout} />
        </Panel>
      ) : (
        <Button
          label="เข้าสู่ระบบ / สร้างบัญชี"
          icon="person-outline"
          onPress={() => router.push("/auth")}
        />
      )}
    </Screen>
  );
}
