import { createInstance } from "i18next";
import { messages, type TranslationKey } from "./resources";

export type Language = "th" | "en";
export type LanguagePreference = "system" | Language;
export type TranslationValues = Record<string, string | number | boolean>;
export type Translate = (key: TranslationKey, values?: TranslationValues) => string;
type DeviceLocale = { languageCode?: string | null; languageTag?: string };

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === "th" || value === "en" ? value : "system";
}

export function resolveLanguage(
  preference: LanguagePreference,
  locales: readonly DeviceLocale[],
): Language {
  if (preference === "th" || preference === "en") return preference;
  for (const locale of locales) {
    const code = (locale.languageCode || locale.languageTag?.split("-")[0])?.toLowerCase();
    if (code === "th" || code === "en") return code;
  }
  return "en";
}

export function localeFor(language: Language): "th-TH" | "en-US" {
  return language === "th" ? "th-TH" : "en-US";
}

const translators = new Map<Language, Translate>();
export function createTranslator(language: Language): Translate {
  const cached = translators.get(language);
  if (cached) return cached;
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: "en",
    supportedLngs: ["th", "en"],
    resources: { en: { translation: messages.en }, th: { translation: messages.th } },
    keySeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false, skipOnVariables: true },
  });
  // Each language has its own immutable translator; changing a preference cannot
  // mutate strings in another mounted provider. Text is rendered by RN, never HTML.
  const translate: Translate = (key, values) => String(instance.t(key, values));
  translators.set(language, translate);
  return translate;
}
