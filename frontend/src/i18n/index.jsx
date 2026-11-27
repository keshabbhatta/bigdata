// English / Nepali language support for the whole app.
//
//   t('Sign in')                      -> 'साइन इन' when Nepali is chosen
//   t('{n} changes waiting', { n: 3 }) -> '३ परिवर्तन पठाउन बाँकी' (numbers in Nepali digits)
//   tMsg(err.message)                 -> translates messages that come from the server or form checks
//
// English text is the key; Nepali translations live in ne.js. Changing the
// language re-renders the whole app (see I18nProvider), so plain t() calls are enough.
// tools/check-i18n.mjs fails the build check if any t('...') text has no Nepali version.
import { createContext, Fragment, useContext, useEffect, useState } from 'react';
import NE from './ne.js';
import { translatePatternNe } from './messages.js';
import { toNepaliDigits } from '../../../shared/areas.js';

const cx = (...c) => c.filter(Boolean).join(' ');

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ne', label: 'नेपाली', short: 'ने' },
];
const STORAGE_KEY = 'rh.lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ne') return saved;
  } catch { /* storage blocked */ }
  return typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('ne') ? 'ne' : 'en';
}

let current = initialLang();
export const getLang = () => current;
export const isNepali = () => current === 'ne';

/** A number written with the current language's digits. */
export const num = (value) => (current === 'ne' && value !== null && value !== undefined ? toNepaliDigits(value) : value);

const reported = new Set();
export function t(text, vars) {
  let s = text;
  if (current === 'ne') {
    const ne = NE[text];
    if (ne === undefined) {
      if (import.meta.env.DEV && !reported.has(text)) { reported.add(text); console.warn('[i18n] missing Nepali text:', text); }
    } else s = ne;
  }
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars[k];
      if (v === undefined || v === null) return m;
      return typeof v === 'number' ? String(num(v)) : String(v);
    });
  }
  return s;
}

/** Translate a message from the server, the sync engine or shared form checks. */
export function tMsg(message) {
  if (!message || current !== 'ne') return message;
  const text = String(message);
  if (NE[text] !== undefined) return NE[text];
  return translatePatternNe(text, t) ?? text;
}

const I18nContext = createContext({ lang: current, setLang: () => {} });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current);
  const setLang = (next) => {
    if (next === current) return;
    current = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    setLangState(next);
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // The key makes every screen render again in the new language.
  return (
    <I18nContext.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

/** English | नेपाली switch. tone="dark" for the dark navigation bars. */
export function LanguageSwitcher({ tone = 'light', className }) {
  const { lang, setLang } = useI18n();
  const dark = tone === 'dark';
  return (
    <div role="group" aria-label="Language / भाषा"
      className={cx('inline-flex flex-none items-center rounded-full p-0.5 text-[13px] font-semibold',
        dark ? 'border border-white/15 bg-white/10' : 'border border-line bg-white', className)}>
      {LANGUAGES.map((l) => {
        const on = lang === l.code;
        return (
          <button key={l.code} type="button" lang={l.code} aria-pressed={on} onClick={() => setLang(l.code)}
            title={l.code === 'ne' ? 'नेपालीमा हेर्नुहोस्' : 'View in English'}
            className={cx('h-8 cursor-pointer rounded-full px-2.5 transition-colors',
              on ? (dark ? 'bg-white text-ink' : 'bg-ink text-white') : (dark ? 'text-white/75 hover:text-white' : 'text-ink-soft hover:text-ink'))}>
            <span className="sm:hidden">{l.short}</span>
            <span className="hidden sm:inline">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
