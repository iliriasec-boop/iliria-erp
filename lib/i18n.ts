
import { useEffect, useState } from 'react';
import en from '@/i18n/en.json';
import el from '@/i18n/el.json';

type Dict = typeof en;

export function useI18n() {
  const [lang, setLang] = useState<'en'|'el'>(() => {
    if (typeof window === 'undefined') return 'el';
    return (localStorage.getItem('lang') as 'en'|'el') || 'el';
  });
  const dict: Dict = lang === 'en' ? en : el;
  const switchLang = (l: 'en'|'el') => {
    setLang(l);
    if (typeof window !== 'undefined') localStorage.setItem('lang', l);
  };
  return { t: dict, lang, switchLang };
}
