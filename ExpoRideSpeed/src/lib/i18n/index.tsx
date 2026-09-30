import { useLocales } from "expo-localization";
import React, { createContext, useContext, useMemo } from "react";
import { createTranslator, localeFor, resolveLanguage, type Language, type LanguagePreference, type Translate } from "./core";

export type { Language, LanguagePreference, Translate, TranslationValues } from "./core";
export type { TranslationKey } from "./resources";
export { errorKey } from "./errors";
export { normalizeLanguagePreference } from "./core";

type I18n = { t: Translate; language: Language; locale: "th-TH" | "en-US" };
const Context = createContext<I18n | null>(null);
export function I18nProvider({ preference, children }: { preference: LanguagePreference; children: React.ReactNode }) {
  const locales = useLocales();
  const language = resolveLanguage(preference, locales);
  const value = useMemo(() => ({ t: createTranslator(language), language, locale: localeFor(language) }), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error("I18nProvider is required");
  return value;
}
