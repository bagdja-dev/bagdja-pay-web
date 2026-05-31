export type Language = "id" | "en" | "zh" | "es" | "ar";

import idTranslations from "../lang/id/translations.json";
import enTranslations from "../lang/en/translations.json";
import zhTranslations from "../lang/zh/translations.json";
import esTranslations from "../lang/es/translations.json";
import arTranslations from "../lang/ar/translations.json";

export const translations = {
  id: idTranslations,
  en: enTranslations,
  zh: zhTranslations,
  es: esTranslations,
  ar: arTranslations,
} as const;

export function getLanguageFromUrl(searchParams: URLSearchParams): Language {
  const lang = searchParams.get("lang");
  if (lang && (lang === "id" || lang === "en" || lang === "zh" || lang === "es" || lang === "ar")) {
    return lang as Language;
  }
  return "id"; // Default to Indonesian
}

export function getTranslations(lang: Language) {
  return translations[lang];
}
