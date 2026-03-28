"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";

type Locale = "en" | "fr";

// Both message files are bundled statically — no async loading needed for 2 locales
const MESSAGES: Record<Locale, Record<string, unknown>> = {
  en: enMessages as Record<string, unknown>,
  fr: frMessages as Record<string, unknown>,
};

const LANG_KEY = "dig-language";

interface LanguageContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  setLocale: () => {},
});

// Read the saved locale synchronously on first render to avoid a flash
function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(LANG_KEY);
  return saved === "fr" ? "fr" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = (lang: Locale) => {
    localStorage.setItem(LANG_KEY, lang);
    setLocaleState(lang);
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
