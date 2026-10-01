import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Icon, type IconName } from "../../components/ui";
import { useApp } from "../../state/AppState";
import { useI18n } from "../../lib/i18n";
import { theme } from "../../lib/theme";
export default function TabLayout() {
  const { colors, data } = useApp(),
    inset = useSafeAreaInsets();
  const { t } = useI18n();
  const tabs: {
    name: string;
    title: string;
    icon: IconName;
    active: IconName;
  }[] = [
    {
      name: "index",
      title: t("nav.map"),
      icon: "map-outline",
      active: "map",
    },
    { name: "garage", title: t("nav.garage"), icon: "car-sport-outline", active: "car-sport" },
    {
      name: "community",
      title: t("nav.community"),
      icon: "people-outline",
      active: "people",
    },
    {
      name: "rankings",
      title: t("nav.ranked"),
      icon: "podium-outline",
      active: "podium",
    },
    {
      name: "profile",
      title: t("nav.me"),
      icon: "person-circle-outline",
      active: "person-circle",
    },
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontFamily: theme.typography.medium, fontSize: 11, lineHeight: 11 * theme.typography.thaiLeading },
        tabBarStyle: {
          display: data.welcomeDone ? "flex" : "none",
          position: "absolute",
          bottom: Math.max(inset.bottom, 12),
          left: 16,
          right: 16,
          height: 72,
          paddingTop: 10,
          paddingBottom: 9,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => <Glass style={StyleSheet.absoluteFill} />,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color }) => (
              <Icon
                name={focused ? tab.active : tab.icon}
                color={color}
                size={23}
              />
            ),
          }}
        />
      ))}
      <Tabs.Screen name="routes" options={{ href: null }} />
    </Tabs>
  );
}
