export type Preferences = {
  theme: 'dark' | 'light' | 'system';
  language: 'system' | 'th' | 'en';
  reduceMotion: boolean;
  reduceGlass: boolean;
  welcomeDone: boolean;
  unit: 'kmh' | 'mph';
};

export function parsePreferences(value: unknown): Preferences {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    theme: stored.theme === 'dark' || stored.theme === 'light' ? stored.theme : 'system',
    language: stored.language === 'th' || stored.language === 'en' ? stored.language : 'system',
    reduceMotion: stored.reduceMotion === true,
    reduceGlass: stored.reduceGlass === true,
    welcomeDone: stored.welcomeDone === true,
    unit: stored.unit === 'mph' ? 'mph' : 'kmh',
  };
}

export function resolveDarkTheme(preference: Preferences['theme'], system: 'dark' | 'light' | 'unspecified' | null | undefined) {
  return preference === 'dark' || (preference === 'system' && system !== 'light');
}
