import { router } from "expo-router";
import { Button, Empty } from "./ui";
import { useAuth } from "../state/AuthState";
import { useOnline } from "../state/OnlineState";
import { errorKey, useI18n } from "../lib/i18n";
export function AccountGate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth(),
    { ready: socialReady, loading, profileReady, error, refresh } = useOnline();
  const { t } = useI18n();
  if (!ready)
    return (
      <Empty
        icon="person-circle-outline"
        title={t("account.loading")}
        body={t("common.wait")}
      />
    );
  if (!session)
    return (
      <Empty
        icon="people-outline"
        title={t("account.shareTitle")}
        body={t("account.shareBody")}
      >
        <Button
          label={t("common.signInOrCreate")}
          onPress={() => router.push("/auth")}
        />
      </Empty>
    );
  if (!profileReady && error)
    return (
      <Empty
        icon="cloud-offline-outline"
        title={t("account.offlineTitle")}
        body={t(errorKey(error, "online"))}
      >
        <Button label={t("common.retry")} onPress={() => void refresh()} />
      </Empty>
    );
  if (loading || (!socialReady && !error))
    return <Empty icon="person-circle-outline" title={t("account.loading")} body={t("common.wait")} />;
  if (!profileReady)
    return (
      <Empty
        icon="person-circle-outline"
        title={t("account.profileTitle")}
        body={t("account.profileBody")}
      >
        <Button
          label={t("account.setupProfile")}
          onPress={() => router.push("/profile")}
        />
      </Empty>
    );
  return children;
}
