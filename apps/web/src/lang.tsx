import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ca' | 'es';
const KEY = 'pau-lang';

/** Any bilingual content field from the API. */
export interface Localized {
  ca: string;
  es?: string;
}

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  /** Pick the current language from a bilingual field, falling back to ca. */
  t: (text: Localized | undefined | null) => string;
}

const LangContext = createContext<LangValue | null>(null);

function readInitial(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ca' || v === 'es') return v;
  } catch {
    /* ignore */
  }
  return 'ca'; // Català is primary for Catalunya
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setLang(lang === 'ca' ? 'es' : 'ca'), [lang, setLang]);

  const t = useCallback(
    (text: Localized | undefined | null): string => {
      if (!text) return '';
      return lang === 'es' && text.es ? text.es : text.ca;
    },
    [lang],
  );

  const value = useMemo<LangValue>(() => ({ lang, setLang, toggle, t }), [lang, setLang, toggle, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
