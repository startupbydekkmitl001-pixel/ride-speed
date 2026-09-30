import React from "react";
import { View } from "react-native";
import { useApp } from "../state/AppState";
import type { RouteMapProps } from "./RouteMap";
import { Icon, T } from "./ui";

export default function RouteMap({ stops }: RouteMapProps) {
  const { colors } = useApp();
  return (
    <View
      style={{
        minHeight: 250,
        borderRadius: 28,
        padding: 28,
        gap: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="map-outline" size={42} color={colors.accent} />
      <T size={20} weight="semibold" style={{ textAlign: "center" }}>
        แผนที่พร้อมในแอป iPhone
      </T>
      <T muted style={{ textAlign: "center", maxWidth: 300 }}>
        เว็บนี้ไม่แสดง Apple Maps คุณเพิ่มพิกัด ตั้งชื่อ
        และจัดลำดับจุดด้านล่างได้
      </T>
      <T size={13} weight="medium">
        {stops.length} / 12 จุด
      </T>
    </View>
  );
}
