import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, View } from "react-native";
import { AccountGate } from "../components/AccountGate";
import {
  Button,
  Field,
  Heading,
  IconButton,
  Note,
  Panel,
  Screen,
  Segments,
  T,
} from "../components/ui";
import { pickPicture, pictureBytes } from "../lib/photos";
import type { supabase } from "../lib/supabase";
import { accountClient, isAccountCurrent, useAuth } from "../state/AuthState";
import {useI18n} from '../lib/i18n';
import {useRoutes} from '../state/RouteState';
import {fingerprintRoute} from '../features/routes/localModel';
import {getRouteOwner,getRouteProjection} from '../features/routes/syncService';
import {sharePreview,type ShareSnapshot} from '../features/routes/compatibilityModel';
import SharedRouteSnapshot from '../features/routes/SharedRouteSnapshot';

type PreviewRoute = ShareSnapshot & {
  id: string;
};
type Picture = { uri: string; base64: string };
type Attempt = {
  id: string;
  ownerId: string;
  path: string | null;
  picture: Picture | null;
  args: Record<string, unknown>;
  publishAttempted: boolean;
  revisionRejected: boolean;
};
type Client = NonNullable<typeof supabase>;
function message(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : fallback;
}
async function readPost(client: Client, attempt: Attempt) {
  const result = await client
    .from("rs_posts")
    .select("moderation_state")
    .eq("id", attempt.id)
    .eq("owner_id", attempt.ownerId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.moderation_state as
    | "draft"
    | "published"
    | "hidden"
    | undefined;
}

async function deliverPost(
  client: Client,
  attempt: Attempt,
  active: () => boolean,
) {
  const check = () => {
    if (!active()) throw new Error("ACCOUNT_CHANGED");
  };
  try {
    check();
    const existing = await readPost(client, attempt);
    check();
    if (existing === "published") return;
    if (existing === "hidden")
      throw new Error("โพสต์นี้ถูกระงับการแสดง โปรดตรวจสอบในชุมชน");
    const created = await client.rpc("rs_create_post", { p_id: attempt.id });
    check();
    if (created.error) throw created.error;
    if (attempt.path && attempt.picture) {
      const bucket = client.storage.from("ride-community");
      const existingImage = await bucket.exists(attempt.path);
      check();
      if (existingImage.error) {
        // This SDK returns data:false plus its 400/404 error for a missing object.
        const missing = existingImage.error as {
          status?: number;
          originalError?: { status?: number };
        };
        if (
          ![400, 404].includes(
            missing.status ?? missing.originalError?.status ?? 0,
          )
        )
          throw existingImage.error;
      }
      if (!existingImage.data) {
        const uploaded = await bucket.upload(
          attempt.path,
          pictureBytes(attempt.picture.base64),
          { contentType: "image/jpeg", upsert: false },
        );
        check();
        if (uploaded.error) {
          // A lost upload response may still have stored the exact immutable object.
          const confirmed = await bucket.exists(attempt.path);
          check();
          if (confirmed.error || !confirmed.data) throw uploaded.error;
        }
      }
    }
    attempt.publishAttempted = true;
    attempt.revisionRejected = false;
    const published = await client.rpc("rs_publish_post", attempt.args);
    check();
    if (published.error) {
      // This database response proves this request was rejected, unlike a network error.
      attempt.revisionRejected =
        published.error.code === "P0001" &&
        /route.*revision|revision.*changed/i.test(published.error.message);
      throw published.error;
    }
  } catch (error) {
    check();
    // A server commit can outlive its HTTP response. Never delete the row or image here.
    try {
      if ((await readPost(client, attempt)) === "published") {
        check();
        return;
      }
    } catch {
      /* Leave the same attempt available when reconciliation is offline. */
    }
    check();
    throw error;
  }
}

export default function ComposeScreen() {
  const { session, scope } = useAuth();
  return session ? (
    <AccountComposer key={scope.generation} userId={session.user.id} />
  ) : (
    <Screen>
      <Heading eyebrow="" title="แบ่งปันทริป" />
      <AccountGate>{null}</AccountGate>
    </Screen>
  );
}

function AccountComposer({ userId }: { userId: string }) {
  const routes=useRoutes(),{t}=useI18n();
  const { session, scope } = useAuth();
  const client = useMemo(
    () =>
      session && isAccountCurrent(scope) ? accountClient(scope, session) : null,
    [scope, session],
  );
  const [caption, setCaption] = useState(""),
    [description, setDescription] = useState(""),
    [speed, setSpeed] = useState(""),
    [routeId, setRouteId] = useState<string | null>(null),
    [picture, setPicture] = useState<Picture | null>(null);
  const [visibility, setVisibility] = useState<
      "private" | "friends" | "community"
    >("friends"),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [cloudSnapshot, setCloudSnapshot] = useState<PreviewRoute | null>(null);
  const alive = useRef(false),
    lock = useRef(false),
    attempt = useRef<Attempt | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const attachable=routes.records.filter(r=>!r.sync.deleted&&r.sync.cloudId&&!r.sync.pending&&!r.sync.blocked&&r.sync.cleanFingerprint===fingerprintRoute(r.document));
  const localRoute = attachable.find((r) => r.localId === routeId);

  async function preparePreview() {
    if (!client || lock.current || !isAccountCurrent(scope)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const number = speed.trim() ? Number(speed) : null;
      if (
        number !== null &&
        (!Number.isFinite(number) || number < 0 || number > 500)
      )
        throw new Error("ความเร็วต้องอยู่ระหว่าง 0–500 km/h");
      if (!caption.trim()) throw new Error("เพิ่มแคปชันก่อนดูตัวอย่าง");
      let snapshot: PreviewRoute | null = null;
      if (routeId) {
        if (!localRoute?.sync.cloudId)
          throw new Error(t('m4.compatibility.onlineRequired'));
        const [owner,projection]=await Promise.all([getRouteOwner(scope,session!,localRoute.sync.cloudId),getRouteProjection(scope,session!,localRoute.sync.cloudId)]);
        if (!alive.current || !isAccountCurrent(scope)) return;
        const shared=sharePreview(owner,projection);
        if(!owner)throw Error('ROUTE_UNAVAILABLE');
        snapshot={...shared,id:owner.id};
      }
      if (!alive.current || !isAccountCurrent(scope)) return;
      setCloudSnapshot(snapshot);
      setPreview(true);
      setPending(false);
      attempt.current = null;
    } catch (error) {
      if (alive.current && isAccountCurrent(scope))
        setError(error instanceof Error&&error.message==='ROUTE_REVISION_CONFLICT'?t('m4.compatibility.routeChanged'):message(error, "เตรียมตัวอย่างไม่สำเร็จ ลองอีกครั้ง"));
    } finally {
      lock.current = false;
      if (alive.current && isAccountCurrent(scope)) setBusy(false);
    }
  }

  async function pick() {
    if (lock.current || preview || !isAccountCurrent(scope)) return;
    lock.current = true;
    setBusy(true);
    try {
      const image = await pickPicture();
      if (alive.current && isAccountCurrent(scope) && image) setPicture(image);
    } catch (error) {
      if (alive.current && isAccountCurrent(scope))
        setError(message(error, "เปิดรูปไม่สำเร็จ"));
    } finally {
      lock.current = false;
      if (alive.current && isAccountCurrent(scope)) setBusy(false);
    }
  }

  async function publish() {
    if (!client || lock.current || !preview || !isAccountCurrent(scope)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    if (!attempt.current) {
      const id = randomUUID(),
        path = picture ? `${userId}/${id}/${randomUUID()}.jpg` : null;
      attempt.current = {
        id,
        ownerId: userId,
        path,
        picture,
        publishAttempted: false,
        revisionRejected: false,
        args: {
          p_id: id,
          p_caption: caption.trim(),
          p_description: description.trim(),
          p_speed: speed.trim() ? Number(speed) : null,
          p_route: cloudSnapshot?.id ?? null,
          p_route_revision: cloudSnapshot?.revision ?? null,
          p_visibility: visibility,
          p_media_path: path,
        },
      };
    }
    const current = attempt.current;
    try {
      await deliverPost(
        client,
        current,
        () => alive.current && isAccountCurrent(scope),
      );
      if (alive.current && isAccountCurrent(scope)) {
        setPending(false);
        router.replace("/community");
      }
    } catch (error) {
      if (!alive.current || !isAccountCurrent(scope)) return;
      if (current.revisionRejected) {
        setPending(false);
        setError(
          "เส้นทางเปลี่ยนแล้ว กลับไปแก้ไขและดูตัวอย่างฉบับล่าสุดก่อนโพสต์",
        );
      } else if (current.publishAttempted) {
        setPending(true);
        setError(
          "ยังยืนยันผลการโพสต์ไม่ได้ กดตรวจสอบและลองอีกครั้ง ระบบจะใช้โพสต์เดิมเพื่อป้องกันการส่งซ้ำ",
        );
      } else {
        setPending(false);
        setError(message(error, "เชื่อมต่อไม่สำเร็จ ลองอีกครั้งด้วยโพสต์เดิม"));
      }
    } finally {
      lock.current = false;
      if (alive.current && isAccountCurrent(scope)) setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading
        eyebrow=""
        title={preview ? "พร้อมแบ่งปัน" : "เรื่องราวของทริป"}
        right={
          !busy ? (
            <IconButton
              name="close"
              label="ปิดโพสต์"
              onPress={() => router.back()}
            />
          ) : undefined
        }
      />
      <AccountGate>
        <View style={{ gap: 22 }}>
          {picture ? (
            <Image
              accessibilityLabel="รูปภาพที่จะโพสต์"
              source={{ uri: picture.uri }}
              style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 24 }}
            />
          ) : !preview ? (
            <Button
              secondary
              label="เพิ่มภาพจากทริป"
              icon="image-outline"
              onPress={() => void pick()}
              disabled={busy}
            />
          ) : null}
          {!!picture && !preview && (
            <Button
              small
              secondary
              label="เปลี่ยนภาพ"
              onPress={() => void pick()}
              disabled={busy}
            />
          )}
          {preview ? (
            <Panel>
              <T size={23} weight="semibold">
                {caption}
              </T>
              <T>{description}</T>
              {speed ? (
                <T numeric size={32}>
                  {speed} km/h
                </T>
              ) : null}
              {speed ? (
                <Note>ความเร็วที่ผู้โพสต์ระบุ · ไม่ใช้จัดอันดับ</Note>
              ) : null}
              {cloudSnapshot && (
                <SharedRouteSnapshot value={{...cloudSnapshot,...cloudSnapshot.geometry}} />
              )}
              <T size={13}>
                ผู้ชม:{" "}
                {visibility === "private"
                  ? "เฉพาะฉัน"
                  : visibility === "friends"
                    ? "เพื่อนที่ยอมรับแล้ว"
                    : "สมาชิกชุมชนทั้งหมด"}
              </T>
            </Panel>
          ) : (
            <>
              <Field
                label="แคปชัน"
                value={caption}
                onChangeText={setCaption}
                maxLength={280}
                placeholder="วันนี้ไปเจออะไรมาบ้าง"
                editable={!busy}
              />
              <Field
                label="เรื่องราวเพิ่มเติม"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={4000}
                placeholder="บรรยากาศ รายละเอียดเส้นทาง หรือสิ่งที่อยากเล่า"
                style={{ minHeight: 110, textAlignVertical: "top" }}
                editable={!busy}
              />
              <Field
                label="ความเร็วสูงสุด (ไม่บังคับ) · km/h"
                value={speed}
                onChangeText={setSpeed}
                keyboardType="decimal-pad"
                placeholder="ความเร็วที่คุณต้องการแบ่งปัน"
                editable={!busy}
              />
              <Note>
                ค่าที่กรอกเองจะแสดงว่าเป็นข้อมูลจากผู้โพสต์
                และไม่เพิ่มคะแนนอันดับ
              </Note>
              <T weight="semibold">แนบเส้นทาง</T>
              <Button
                secondary
                small
                label={routeId === null ? "✓ ไม่แนบเส้นทาง" : "ไม่แนบเส้นทาง"}
                onPress={() => setRouteId(null)}
                disabled={busy}
              />
              {attachable
                .map((r) => (
                  <Button
                    key={r.localId}
                    small
                    secondary={routeId !== r.localId}
                    label={r.document.title}
                    onPress={() => setRouteId(r.localId)}
                    disabled={busy}
                  />
                ))}
              {!attachable.length && (
                <Note>
                  บันทึกเส้นทางออนไลน์จากแท็บเส้นทางก่อน เพื่อแนบลงในโพสต์
                </Note>
              )}
              <T weight="semibold">ใครเห็นโพสต์นี้</T>
              <Segments
                items={[
                  { value: "private", label: "เฉพาะฉัน" },
                  { value: "friends", label: "เพื่อน" },
                  { value: "community", label: "ชุมชน" },
                ]}
                value={visibility}
                onChange={(value) => {
                  if (!busy) setVisibility(value);
                }}
              />
            </>
          )}
          {(preview ? cloudSnapshot : localRoute) && (
            <Note>
              {t('m4.compatibility.shareNotice')}
            </Note>
          )}
          {!!error && <Note error>{error}</Note>}
          {preview ? (
            <>
              <Button
                label={pending ? "ตรวจสอบและลองอีกครั้ง" : "เผยแพร่โพสต์"}
                onPress={() => void publish()}
                busy={busy}
                icon={pending ? "refresh-outline" : "arrow-up"}
              />
              <Button
                secondary
                label="กลับไปแก้ไข"
                onPress={() => {
                  if (!pending) {
                    setPreview(false);
                    attempt.current = null;
                    setError("");
                  }
                }}
                disabled={busy || pending}
              />
              {pending && (
                <Note>
                  เนื้อหาและรูปจะคงเดิมระหว่างตรวจสอบ หากปิดหน้านี้
                  โพสต์อาจเผยแพร่แล้ว กรุณาตรวจสอบชุมชนก่อนสร้างโพสต์ใหม่
                </Note>
              )}
            </>
          ) : (
            <Button
              label="ดูตัวอย่างก่อนโพสต์"
              icon="arrow-forward"
              onPress={() => void preparePreview()}
              busy={busy}
              disabled={!caption.trim()}
            />
          )}
        </View>
      </AccountGate>
    </Screen>
  );
}
