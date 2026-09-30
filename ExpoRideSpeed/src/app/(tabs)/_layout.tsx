import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Icon, type IconName } from "../../components/ui";
import { useApp } from "../../state/AppState";
export default function TabLayout() {
  const { colors, data } = useApp(),
    inset = useSafeAreaInsets();
  const tabs: {
    name: string;
    title: string;
    icon: IconName;
    active: IconName;
  }[] = [
    {
      name: "index",
      title: "ความเร็ว",
      icon: "speedometer-outline",
      active: "speedometer",
    },
    { name: "routes", title: "เส้นทาง", icon: "map-outline", active: "map" },
    {
      name: "community",
      title: "ชุมชน",
      icon: "people-outline",
      active: "people",
    },
    {
      name: "rankings",
      title: "อันดับ",
      icon: "podium-outline",
      active: "podium",
    },
    {
      name: "profile",
      title: "โปรไฟล์",
      icon: "person-circle-outline",
      active: "person-circle",
    },
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontFamily: "Anuphan-500", fontSize: 10 },
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
    </Tabs>
  );
}
