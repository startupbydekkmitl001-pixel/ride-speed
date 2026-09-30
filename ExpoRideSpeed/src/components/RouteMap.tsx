import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import MapView, { Marker, Polyline, type LatLng } from "react-native-maps";
import type { Stop } from "../lib/domain";
import { useApp } from "../state/AppState";
import { Glass, Icon, Note, T } from "./ui";

export type RouteMapProps = {
  stops: Stop[];
  selectedId?: string;
  disabled?: boolean;
  onAddStop: (coordinate: { latitude: number; longitude: number }) => void;
  onSelectStop: (stop: Stop) => void;
  focus?: { latitude: number; longitude: number; token: number };
};

const THAILAND = {
  latitude: 15.6,
  longitude: 101.1,
  latitudeDelta: 10,
  longitudeDelta: 8,
};

export default function RouteMap({
  stops,
  selectedId,
  disabled,
  onAddStop,
  onSelectStop,
  focus,
}: RouteMapProps) {
  const { colors, dark, motion } = useApp();
  const map = useRef<MapView>(null);
  const alive = useRef(true);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const first = stops[0];

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (ready && focus)
      map.current?.animateToRegion(
        { ...focus, latitudeDelta: 0.035, longitudeDelta: 0.035 },
        motion ? 350 : 0,
      );
  }, [focus, motion, ready]);

  const fitStops = () => {
    if (stops.length === 1)
      map.current?.animateToRegion(
        { ...stops[0], latitudeDelta: 0.04, longitudeDelta: 0.04 },
        motion ? 350 : 0,
      );
    else if (stops.length > 1)
      map.current?.fitToCoordinates(stops, {
        edgePadding: { top: 76, right: 62, bottom: 62, left: 48 },
        animated: motion,
      });
  };

  const locate = async () => {
    if (locating) return;
    setLocating(true);
    setMessage(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        if (alive.current)
          setMessage("ยังไม่ได้รับสิทธิ์ตำแหน่ง คุณยังปักหมุดหรือกรอกพิกัดได้");
        return;
      }
      if (!(await Location.hasServicesEnabledAsync()))
        throw new Error("เปิดบริการตำแหน่งของเครื่อง แล้วลองอีกครั้ง");
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error("ยังหาตำแหน่งไม่พบ ลองอีกครั้งในบริเวณเปิดโล่ง"),
              ),
            15000,
          );
        }),
      ]);
      if (!alive.current) return;
      const coordinate = {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      };
      setLocation(coordinate);
      map.current?.animateToRegion(
        { ...coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 },
        motion ? 450 : 0,
      );
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error ? error.message : "ค้นหาตำแหน่งไม่สำเร็จ",
        );
    } finally {
      if (timeout) clearTimeout(timeout);
      if (alive.current) setLocating(false);
    }
  };

  if (Platform.OS !== "ios")
    return (
      <View
        style={[
          styles.fallback,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <Icon name="map-outline" size={40} />
        <T size={20} weight="semibold">
          ปักหมุดด้วย Apple Maps บน iPhone
        </T>
        <T muted style={{ textAlign: "center" }}>
          บนอุปกรณ์นี้ คุณยังเพิ่มและแก้ไขจุดด้วยพิกัดด้านล่างได้
        </T>
      </View>
    );

  return (
    <View style={{ gap: 10 }}>
      <View
        style={[
          styles.mapFrame,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={
            first
              ? { ...first, latitudeDelta: 0.15, longitudeDelta: 0.15 }
              : THAILAND
          }
          userInterfaceStyle={dark ? "dark" : "light"}
          onMapReady={() => {
            setReady(true);
            if (stops.length > 1) fitStops();
          }}
          onLongPress={(event) => {
            if (!disabled) onAddStop(event.nativeEvent.coordinate);
          }}
          loadingEnabled
          loadingBackgroundColor={colors.surface}
          loadingIndicatorColor={colors.accent}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          rotateEnabled={false}
          pitchEnabled={false}
          mapPadding={{ top: 48, right: 12, bottom: 10, left: 12 }}
          accessibilityLabel="แผนที่ Apple Maps กดค้างเพื่อเพิ่มจุด หรือใช้ปุ่มเพิ่มพิกัดใต้แผนที่"
        >
          {stops.length > 1 && (
            <Polyline
              coordinates={stops}
              strokeColor={dark ? "#99B9FF" : "#285FE7"}
              strokeWidth={3}
              lineDashPattern={[7, 7]}
              geodesic
            />
          )}
          {stops.map((stop, index) => (
            <Marker
              key={`${stop.id}-${index}-${dark}-${selectedId === stop.id}`}
              identifier={stop.id}
              coordinate={stop}
              title={`${index + 1}. ${stop.name}`}
              description={`${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`}
              onPress={() => onSelectStop(stop)}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.marker,
                  {
                    backgroundColor:
                      selectedId === stop.id ? colors.ink : "#285FE7",
                    borderColor: "#FFFFFF",
                  },
                ]}
              >
                <T
                  numeric
                  size={15}
                  weight="semibold"
                  style={{
                    color: selectedId === stop.id ? colors.bg : "#FFFFFF",
                  }}
                >
                  {index + 1}
                </T>
              </View>
            </Marker>
          ))}
          {location && (
            <Marker
              coordinate={location}
              title="ตำแหน่งที่ค้นหาล่าสุด"
              description="แตะค้างบริเวณนี้เพื่อเพิ่มเป็นจุดในเส้นทาง"
              pinColor="#508FE9"
            />
          )}
        </MapView>
        <Glass style={styles.hint}>
          <T size={12} weight="medium">
            {stops.length >= 12
              ? "ครบ 12 จุดแล้ว"
              : "แตะค้างบนแผนที่เพื่อปักหมุด"}
          </T>
        </Glass>
        <Glass style={styles.tools}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ค้นหาตำแหน่งของฉัน"
            accessibilityState={{
              busy: locating,
              disabled: locating || !ready,
            }}
            disabled={locating || !ready}
            onPress={locate}
            style={styles.mapButton}
          >
            {locating ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Icon name="locate-outline" color={colors.accent} />
            )}
          </Pressable>
          <View
            style={{
              width: 27,
              height: StyleSheet.hairlineWidth,
              backgroundColor: colors.line,
              alignSelf: "center",
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="แสดงทุกจุดบนแผนที่"
            accessibilityState={{ disabled: !ready || !stops.length }}
            disabled={!ready || !stops.length}
            onPress={fitStops}
            style={[styles.mapButton, { opacity: stops.length ? 1 : 0.4 }]}
          >
            <Icon name="scan-outline" />
          </Pressable>
        </Glass>
      </View>
      <T size={12} muted>
        เส้นประแสดงลำดับจุดเท่านั้น ไม่ใช่เส้นทางขับขี่
      </T>
      {message && <Note error>{message}</Note>}
    </View>
  );
}

const styles = StyleSheet.create({
  mapFrame: {
    height: 336,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
    maxWidth: "80%",
  },
  tools: { position: "absolute", right: 12, top: 62, borderRadius: 24 },
  mapButton: {
    width: 46,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  marker: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  fallback: {
    minHeight: 260,
    padding: 28,
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
