import { router } from "expo-router";
import { Button, Heading, Note, Panel, Screen, T } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
export default function LegalScreen() {
  const { t } = useI18n();
  return <Screen>
    <Heading eyebrow="" title={t("legal.title")} />
    <Note>{t("legal.draft")}</Note>
    <Panel><T size={22} weight="semibold">{t("legal.privacyTitle")}</T><T>{t("legal.privacyBody")}</T><Note>{t("legal.routePrivacy")}</Note></Panel>
    <Panel><T size={22} weight="semibold">{t("legal.termsTitle")}</T><T>{t("legal.termsBody")}</T></Panel>
    <Button secondary label={t("legal.back")} onPress={() => router.canGoBack() ? router.back() : router.replace("/profile")} />
  </Screen>;
}
