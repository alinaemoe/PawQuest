import type { I18n } from '@pawquest/i18n';
import { createContext, useContext, type ReactNode } from 'react';

const I18nContext = createContext<I18n | null>(null);

/** Gives every component the active language, units and formatters. */
export function I18nProvider({ i18n, children }: { i18n: I18n; children: ReactNode }) {
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

/** @throws Error when used outside an I18nProvider. */
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}
