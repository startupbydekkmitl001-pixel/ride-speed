import type { TranslationKey } from "./resources";
import { socialErrorKey } from './m5a';
import { liveErrorKey } from './m5b';

type ErrorContext = "google" | "apple" | "onboarding" | "avatar" | "deletion" | "login" | "signup" | "reset" | "password" | "callback" | "profile" | "photo" | "logout" | "online" | "storage" | "ride" | "rideSync" | "social" | "live";
const fallback: Record<ErrorContext, TranslationKey> = {
  google: "errors.googleLogin", apple: "errors.appleLogin", onboarding: "errors.onboarding", avatar: "errors.avatarUnavailable", deletion: "errors.deletion", login: "errors.connection", signup: "errors.connection",
  reset: "errors.connection", password: "errors.passwordSave", callback: "errors.callbackExpired",
  profile: "errors.profileSave", photo: "errors.photoOpen", logout: "errors.signOut",
  online: "errors.connection", storage: "errors.localRead", ride: "errors.gpsStart",
  rideSync: "m2.sync.unavailable",
  social: 'm5a.errors.unavailable',
  live: 'm5b.errors.unavailable',
};
const codes: Record<string, TranslationKey> = {
  ACCOUNT_CHANGED: "errors.accountChanged", LOCAL_READ_FAILED: "errors.localRead", LOCAL_WRITE_FAILED: "errors.localWrite",
  AUTH_NOT_READY: "errors.connection", AUTH_CALLBACK_EXPIRED: "errors.callbackExpired", AUTH_CALLBACK_CONNECTION: "errors.connection", AUTH_SESSION_READ_FAILED: "errors.accountChanged",
  ACCOUNT_STATE_CONFLICT: "errors.stateConflict", ACCOUNT_STATE_INVALID: "errors.onboarding", ACCOUNT_STATE_UNAVAILABLE: "errors.onboarding",
  PROFILE_CLOUD_UNAVAILABLE: "errors.profileLoad", AVATAR_REVISION_CONFLICT: "profile.photoConflict",
  AVATAR_UPLOAD_REQUIRED: "errors.avatarUnavailable", AVATAR_INVALID_OBJECT: "errors.avatarInvalid", AVATAR_UNAVAILABLE: "errors.avatarUnavailable",
  AVATAR_LOOKUP_FAILED: "errors.avatarUnavailable", AVATAR_PROFILE_REQUIRED: "errors.avatarNeedsProfile",
  PROFILE_REQUIRED: "errors.avatarNeedsProfile", ACCOUNT_DELETION_PENDING: "errors.deletionInProgress",
  DELETION_IN_PROGRESS: "errors.deletionInProgress", DELETION_STORAGE_FAILED: "errors.deletion", DELETION_DATABASE_FAILED: "errors.deletion", DELETION_AUTH_FAILED: "errors.deletion",
  DELETION_STATUS_UNAVAILABLE: "errors.deletion",
  RIDE_SUMMARY_INVALID: "m2.sync.invalid", RIDE_SUMMARY_TOO_LARGE: "m2.sync.tooLarge",
  RIDE_OPERATION_CONFLICT: "m2.sync.operationConflict", RIDE_REVISION_CONFLICT: "m2.sync.revisionConflict",
  RIDE_SNAPSHOT_CONFLICT: "m2.sync.snapshotConflict", RIDE_UNAVAILABLE: "m2.sync.unavailable",
  RIDE_SYNC_UNAVAILABLE: "m2.sync.unavailable", RIDE_SYNC_AUTH_REQUIRED: "m2.sync.authRequired",
  RIDE_SYNC_RATE_LIMITED: "m2.sync.rateLimited", RIDE_SYNC_INVALID_RESPONSE: "m2.sync.invalidResponse",
  invalid_credentials: "errors.invalidCredentials",
  over_request_rate_limit: "errors.rateLimited", over_email_send_rate_limit: "errors.rateLimited",
  over_sms_send_rate_limit: "errors.rateLimited", rate_limit_exceeded: "errors.rateLimited",
  weak_password: "errors.weakPassword", same_password: "errors.samePassword",
  session_not_found: "errors.accountChanged", refresh_token_not_found: "errors.accountChanged",
  E_LOCATION_PERMISSION: "errors.locationPermission", E_PRECISE_LOCATION_REQUIRED: "errors.preciseLocation",
  E_BACKGROUND: "errors.backgroundStopped",
};

// Compatibility for bounded messages emitted by the existing capture/account
// modules. Unknown server strings always use a localized fallback, never raw text.
const legacy: Record<string, TranslationKey> = {
  'duplicate key value violates unique constraint "rs_profiles_handle_key"': "errors.usernameTaken",
  "บัญชีเปลี่ยนแล้ว กรุณาลองใหม่ในบัญชีปัจจุบัน": "errors.accountChanged",
  "บัญชีเปลี่ยนแล้ว กรุณาลองใหม่": "errors.accountChanged",
  "บัญชีเปลี่ยนหรือโปรไฟล์ยังโหลดไม่เสร็จ": "errors.accountChanged",
  "เลือกรูปขนาดไม่เกิน 20 MB": "errors.photoTooLarge",
  "เตรียมรูปไม่สำเร็จ": "errors.photoPrepare",
  "รูปยังใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง": "errors.photoCompressedLarge",
  "อ่านข้อมูลในเครื่องไม่สำเร็จ": "errors.localRead",
  "บันทึกข้อมูลในเครื่องไม่สำเร็จ": "errors.localWrite",
  "อ่านข้อมูลบัตรในเครื่องไม่สำเร็จ": "errors.localRead",
  "โหลดโปรไฟล์ไม่สำเร็จ": "errors.profileLoad",
  "หยุด GPS ไม่สำเร็จ ปิดแล้วเปิดแอปใหม่ก่อนเริ่มอีกครั้ง": "errors.gpsStop",
  "ยังรับสัญญาณ GPS ไม่ได้ ลองไปยังจุดที่เปิดโล่ง": "errors.gpsSignal",
  "เริ่ม GPS ไม่สำเร็จ ตรวจสอบบริการหาตำแหน่งแล้วลองใหม่": "errors.gpsStart",
  "อนุญาตตำแหน่งในระหว่างใช้แอป เพื่อเริ่มวัดความเร็ว": "errors.locationPermission",
  "เปิดตำแหน่งที่ตั้งจริง (Precise Location) ในการตั้งค่า": "errors.preciseLocation",
  "เปิดบริการหาตำแหน่งในการตั้งค่า เพื่อเริ่มวัดความเร็ว": "errors.locationServices",
  "หยุดการวัดแล้วเมื่อแอปอยู่เบื้องหลังหรือหน้าจอล็อก เปิดแอปแล้วเริ่มใหม่ได้": "errors.backgroundStopped",
};

export function errorKey(
  error: unknown,
  context: ErrorContext,
  options: { publicEmailDelivery?: boolean } = {},
): TranslationKey {
  if (context === 'social') return socialErrorKey(error);
  if (context === 'live') return liveErrorKey(error);
  const object = error !== null && typeof error === "object" ? error : null;
  const code = object && "code" in object ? String(object.code) : "";
  if (code === "email_not_confirmed")
    return options.publicEmailDelivery ? "errors.emailUnconfirmed" : "errors.emailTeamOnly";
  if (context === "profile" && code === "23505") return "errors.usernameTaken";
  if (context === "deletion" && code === "AUTH_REQUIRED") return "errors.deletionAuth";
  if (Object.hasOwn(codes, code)) return codes[code];
  const message = typeof error === "string" ? error : object && "message" in object ? String(object.message) : "";
  if (context === "deletion" && message === "AUTH_REQUIRED") return "errors.deletionAuth";
  if (Object.hasOwn(codes, message)) return codes[message];
  if (Object.hasOwn(legacy, message)) return legacy[message];
  if (context === "reset" && options.publicEmailDelivery === false) return "errors.resetTeamOnly";
  return fallback[context];
}
