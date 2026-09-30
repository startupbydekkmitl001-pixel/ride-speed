export type ThemeColors = {
  bg: string; surface: string; raised: string; ink: string; muted: string;
  line: string; accent: string; accentText: string; onAccent: string; good: string; danger: string;
  glassTint: string; glassScrim: string; specular: string;
};

export const theme = {
  dark: {
    bg: '#000000', surface: '#0A0A0A', raised: '#111111',
    ink: '#FFFFFF', muted: '#A8A8AD', line: 'rgba(255,255,255,0.12)',
    accent: '#FF5A1F', accentText: '#FF5A1F', onAccent: '#000000', good: '#2EE6A6', danger: '#FF3B5C',
    glassTint: 'rgba(255,255,255,0.08)', glassScrim: 'rgba(0,0,0,0.65)',
    specular: 'rgba(255,255,255,0.22)',
  } satisfies ThemeColors,
  light: {
    bg: '#FAFAF8', surface: '#FFFFFF', raised: '#F1F1EF',
    ink: '#171717', muted: '#5C5C62', line: 'rgba(0,0,0,0.10)',
    accent: '#FF5A1F', accentText: '#B93806', onAccent: '#000000', good: '#087D58', danger: '#BD1636',
    glassTint: 'rgba(255,255,255,0.12)', glassScrim: 'rgba(255,255,255,0.90)',
    specular: 'rgba(255,255,255,0.80)',
  } satisfies ThemeColors,
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, hero: 48 },
  radius: { small: 12, control: 20, card: 24, sheet: 28, pill: 999 },
  typography: { body: 'Anuphan-400', medium: 'Anuphan-500', semibold: 'Anuphan-600', numbers: 'Manrope-600', thaiLeading: 1.55 },
  motion: { pressMs: 100, stateMs: 260, staggerMs: 40, spring: { damping: 20, stiffness: 220 } },
  material: { blur: 24, minTarget: 44, maxVideos: 2 },
  speedHeat: ['#35D6E8', '#B8ED55', '#FFB444', '#FF3B5C'],
  map: {
    dark: { background: '#000000', land: '#000000', water: '#000000', building: '#0A0A0A', road: '#333333', majorRoad: '#555555', roadCasing: '#111111', boundary: '#444444', label: '#D8D8D8', secondaryLabel: '#999999', halo: '#000000' },
    light: { background: '#FAFAF8', land: '#F1F1EF', water: '#E4E4E2', building: '#DCDCD9', road: '#FFFFFF', majorRoad: '#FFFFFF', roadCasing: '#C9C9C5', boundary: '#B0B0AD', label: '#252525', secondaryLabel: '#666663', halo: '#FAFAF8' },
  },
} as const;
