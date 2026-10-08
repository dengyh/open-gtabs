import english from './locales/en.json';

export type Language = 'auto' | 'zh-CN' | 'en';
export type Locale = Exclude<Language, 'auto'>;
const messages: Readonly<Record<string, string>> = english;

export function normalizeLanguage(value: unknown): Language {
  return value === 'zh-CN' || value === 'en' ? value : 'auto';
}

export function resolveLanguage(value: unknown, browserLanguage?: string): Locale {
  const language = normalizeLanguage(value);
  if (language !== 'auto') return language;
  const browser = browserLanguage ?? globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? 'en';
  return /^zh(?:-|_|$)/i.test(browser) ? 'zh-CN' : 'en';
}

let locale = resolveLanguage('auto');
export function setLanguage(value: unknown): void { locale = resolveLanguage(value); }
export function getLocale(): Locale { return locale; }

/** Source-language message IDs, with positional parameters; never translates user data. */
export function messageIn(language: Locale, message: string, ...values: unknown[]): string {
  const template = language === 'en' ? messages[message] ?? message : message;
  // One pass ensures braces or dollar signs inside user data are never reinterpreted.
  return template.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : match);
}

export function tr(message: string, ...values: unknown[]): string {
  return messageIn(locale, message, ...values);
}

/** Translate only explicitly marked, developer-owned labels. Never use innerHTML. */
export function localizeDocument(root: Document = document): void {
  root.documentElement.lang = locale;
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = tr(element.dataset.i18n!);
  }
  for (const attribute of ['placeholder', 'title', 'aria-label']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, tr(element.getAttribute(`data-i18n-${attribute}`)!));
    }
  }
}
