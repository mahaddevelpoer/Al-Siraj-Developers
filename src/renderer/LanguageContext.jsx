import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, LANGUAGES } from './i18n';

const LangContext = createContext({ lang: 'en', t: translations.en, langMeta: LANGUAGES[0], setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('zk_lang') || 'en');

  const setLang = (code) => {
    localStorage.setItem('zk_lang', code);
    setLangState(code);
  };

  const t = translations[lang] || translations.en;
  const langMeta = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  // Apply RTL direction and font for Urdu
  useEffect(() => {
    document.documentElement.dir = langMeta.dir || 'ltr';
    if (langMeta.font) {
      document.body.style.fontFamily = langMeta.font;
    } else {
      document.body.style.fontFamily = '';
    }
  }, [langMeta]);

  return (
    <LangContext.Provider value={{ lang, t, langMeta, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
