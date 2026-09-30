import { router } from "expo-router";
import { Button, Empty } from "./ui";
import { useAuth } from "../state/AuthState";
import { useOnline } from "../state/OnlineState";
export function AccountGate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth(),
    { profileReady, error, refresh } = useOnline();
  if (!ready)
    return (
      <Empty
        icon="person-circle-outline"
        title="กำลังเปิดบัญชี"
        body="รอสักครู่"
      />
    );
  if (!session)
    return (
      <Empty
        icon="people-outline"
        title="เส้นทางดี ๆ มีไว้แบ่งปัน"
        body="เข้าสู่ระบบเพื่อเพิ่มเพื่อน แชร์ทริป และร่วมชาเลนจ์"
      >
        <Button
          label="เข้าสู่ระบบ / สร้างบัญชี"
          onPress={() => router.push("/auth")}
        />
      </Empty>
    );
  if (!profileReady && error)
    return (
      <Empty
        icon="cloud-offline-outline"
        title="ยังเชื่อมต่อไม่ได้"
        body={error}
      >
        <Button label="ลองอีกครั้ง" onPress={() => void refresh()} />
      </Empty>
    );
  if (!profileReady)
    return (
      <Empty
        icon="person-circle-outline"
        title="ตั้งชื่อให้เพื่อนหาคุณเจอ"
        body="ไปที่แก้ไขบัตร แล้วบันทึกชื่อผู้ใช้ก่อนเริ่มใช้งานชุมชน"
      >
        <Button
          label="ตั้งค่าโปรไฟล์"
          onPress={() => router.push("/profile")}
        />
      </Empty>
    );
  return children;
}
