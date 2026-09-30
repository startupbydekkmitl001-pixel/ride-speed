import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MotionProvider } from "../features/motion";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../state/AppState";
import { AuthProvider } from "../state/AuthState";
import { OnlineProvider } from "../state/OnlineState";
import { RiderProfileProvider } from "../state/RiderProfile";
import { Button, T } from "../components/ui";
import { errorKey, useI18n } from "../lib/i18n";

void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const { ready, dark, colors, motion, storageError, retryStorage } = useApp();
  const { t } = useI18n();
  const [fonts, fontError] = useFonts({
    "Anuphan-400": require("../../assets/fonts/Anuphan-400.ttf"),
    "Anuphan-500": require("../../assets/fonts/Anuphan-500.ttf"),
    "Anuphan-600": require("../../assets/fonts/Anuphan-600.ttf"),
    "Manrope-400": require("../../assets/fonts/Manrope-400.ttf"),
    "Manrope-500": require("../../assets/fonts/Manrope-500.ttf"),
    "Manrope-600": require("../../assets/fonts/Manrope-600.ttf"),
  });
  useEffect(() => {
    if (ready && (fonts || fontError)) void SplashScreen.hideAsync();
  }, [ready, fonts, fontError]);
  if (!ready || (!fonts && !fontError)) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{ flex: 1, width: "100%", maxWidth: Platform.OS === "web" ? 560 : undefined, alignSelf: "center" }}
      >
        <StatusBar style={dark ? "light" : "dark"} />
        {!!storageError && (
          <View accessibilityRole="alert" style={{ paddingTop: 32, paddingHorizontal: 16, paddingBottom: 8, gap: 8, borderBottomColor: colors.line, borderBottomWidth: 1 }}>
            <T size={13}>{t(errorKey(storageError, "storage"))}</T>
            <Button small secondary label={t("common.retry")} onPress={() => { void retryStorage(); }} />
          </View>
        )}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: motion ? "slide_from_right" : "none",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="vehicle-picker" options={{ presentation: "modal" }} />
          <Stack.Screen name="auth" options={{ presentation: "modal" }} />
          <Stack.Screen name="compose" options={{ presentation: "modal" }} />
        </Stack>
      </View>
    </View>
  );
}
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <OnlineProvider>
            <RiderProfileProvider>
              <MotionProvider><Navigation /></MotionProvider>
            </RiderProfileProvider>
          </OnlineProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
