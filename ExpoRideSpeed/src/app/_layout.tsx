import { Stack,router,usePathname } from "expo-router";
import 'maplibre-gl/dist/maplibre-gl.css';
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
import { RideProvider,useRide } from "../state/RideState";
import { GarageProvider } from "../state/GarageState";
import { RouteProvider } from "../state/RouteState";
import { SocialProvider } from "../state/SocialState";
import { LiveProvider,useLive } from "../state/LiveState";
import {RaceProvider,useRace} from '../state/RaceState';
import {RankedProvider} from '../state/RankedState';
import {CommunityProvider} from '../state/CommunityState';
import { Button, T } from "../components/ui";
import { errorKey, useI18n } from "../lib/i18n";

void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const { ready, dark, colors, motion, storageError, retryStorage } = useApp();
  const { t } = useI18n();
  const ride=useRide(),live=useLive(),race=useRace(),pathname=usePathname();
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
        style={{ flex: 1, width: "100%", maxWidth: Platform.OS === "web" && pathname !== "/" ? 560 : undefined, alignSelf: "center" }}
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
          <Stack.Screen name="community-post" />
          <Stack.Screen name="community-posts" />
          <Stack.Screen name="convoy" />
          <Stack.Screen name="friend-links" />
          <Stack.Screen name="races" />
          <Stack.Screen name="ranked-publication" />
          <Stack.Screen name="ranked-report" options={{presentation:'modal'}} />
        </Stack>
        {(live.share.armed||live.share.pending)&&pathname!=="/convoy"&&<View style={{position:'absolute',left:16,right:16,top:48,backgroundColor:colors.bg,borderWidth:1,borderColor:colors.line,borderRadius:20,padding:12,gap:8}}>
          <T size={13}>{t(live.share.pending?'m5b.sharingPending':'m5b.sharingActive',{time:live.share.expiresAt?new Date(live.share.expiresAt).toLocaleTimeString():''})}</T>
          <Button small secondary label={t('m5b.stopSharing')} onPress={()=>{void live.stopSharing().catch(()=>{});}} />
        </View>}
        {race.port.attempt?.state==='armed'&&pathname!=='/races'&&<View style={{position:'absolute',left:16,right:16,bottom:100,backgroundColor:colors.bg,borderWidth:1,borderColor:colors.line,borderRadius:20,padding:12,gap:8}}><T size={13}>{t('m5c.attemptStates.armed')}</T><Button small secondary label={t('m5c.stopAttempt')} onPress={()=>{void race.stopCompetitiveAttempt().catch(()=>{});}}/></View>}
        {ride.movingLocked&&pathname!=="/"&&pathname!=='/races'&&<View style={{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:colors.bg,justifyContent:'center',padding:24,gap:20}} accessibilityViewIsModal>
          <T size={24} weight="semibold">{t('m2.ride.movingLock')}</T>
          <Button label={t('nav.map')} onPress={()=>router.replace('/')}/>
          {race.port.attempt?.state==='armed'&&<Button secondary label={t('m5c.stopAttempt')} onPress={()=>{void race.stopCompetitiveAttempt().catch(()=>{});}}/>}
        </View>}
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
            <RiderProfileProvider>
              <GarageProvider><RideProvider><RouteProvider><SocialProvider><LiveProvider><RaceProvider><RankedProvider><CommunityProvider><OnlineProvider><MotionProvider><Navigation /></MotionProvider></OnlineProvider></CommunityProvider></RankedProvider></RaceProvider></LiveProvider></SocialProvider></RouteProvider></RideProvider></GarageProvider>
            </RiderProfileProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
