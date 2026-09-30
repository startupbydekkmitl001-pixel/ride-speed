import Svg, { Circle, Path } from "react-native-svg";
import { Platform } from "react-native";
import type { VehicleCategory } from "../../data/vehicleCatalog";
import { useApp } from "../../state/AppState";

export function CategoryGlyph({
  category,
  size = 64,
  color,
}: {
  category: VehicleCategory;
  size?: number;
  color?: string;
}) {
  const { colors } = useApp();
  return (
    <Svg
      width={size}
      height={(size * 2) / 3}
      viewBox="0 0 72 48"
      fill="none"
      stroke={color ?? colors.ink}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(Platform.OS === "web"
        ? { "aria-hidden": true }
        : { accessible: false })}
    >
      <Circle cx={15} cy={35} r={7} />
      <Circle cx={57} cy={35} r={7} />
      {category === "car" ? (
        <>
          <Path d="M8 35H4V26L11 22L19 12H43L54 22L66 25V35H64M22 35H50M13 22H53M24 12L22 22M39 12L43 22" />
          <Path d="M7 27H14M61 27H66" stroke={colors.accent} />
        </>
      ) : category === "bigbike" ? (
        <>
          <Path d="M15 35L29 19L41 21L32 35H15M32 35H41L49 26M57 35L44 11H51M29 19H21L16 16H9M29 19L31 13H40L47 23M38 27L45 29" />
          <Path d="M31 13H40L44 19H29" stroke={colors.accent} />
        </>
      ) : (
        <>
          <Path d="M15 35H33C39 35 41 30 42 25L45 13H51M57 35L48 16M15 28L20 20H31L34 29H43M20 20H17M18 18H34M46 12H42" />
          <Path d="M20 23H29L31 29H18" stroke={colors.accent} />
        </>
      )}
    </Svg>
  );
}
