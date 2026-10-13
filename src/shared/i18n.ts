/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Interface strings from `_locales/<locale>/messages.json` through `chrome.i18n`.
 *
 * Keys are snake_case and messages take `$1`…`$9` substitutions. A counted
 * string has one key per CLDR plural form of the language (`key_one`,
 * `key_few`, `key_many`, `key_other`), chosen with `Intl.PluralRules`; every
 * locale defines `key_other`. The browser picks the locale from its own
 * language and falls back to English. Without `chrome.i18n` (the sandbox and
 * unit tests) the Russian messages from `sandbox/messages.ts` are used;
 * release builds replace that module with an empty one.
 *
 * @module shared/i18n
 */
import {sandboxLocale, sandboxMessages} from '../sandbox/messages';

/** The extension's `chrome.i18n`, absent in the sandbox and unit tests. */
const native = (): typeof chrome.i18n | undefined => globalThis.chrome?.i18n;

/** Returns the message for [key] with substitutions, or an empty string when it is missing. */
function message(key: string, values: string[]): string {
  const i18n = native();
  if (i18n) return i18n.getMessage(key, values);
  const text = sandboxMessages()[key]?.message ?? '';
  return text.replace(/\$(\d)/g, (_, index: string) => values[Number(index) - 1] ?? '').replace(/\$\$/g, '$');
}

/**
 * Returns the interface string for [key]; the key itself when it is missing,
 * so a missing translation is visible rather than blank.
 *
 * @param key The message key.
 * @param substitutions Values for `$1`…`$9`.
 */
export function t(key: string, ...substitutions: (string | number)[]): string {
  return message(key, substitutions.map(String)) || key;
}

/** The interface language, e.g. `ru` or `pt-BR`. */
export const locale = (): string => native()?.getUILanguage() || sandboxLocale().replace('_', '-');

/** Plural rules by language. */
const rules = new Map<string, Intl.PluralRules>();

/**
 * Returns the counted interface string for [count]: `key_<form>` with the
 * count as `$1` and [substitutions] from `$2`.
 *
 * @param key The message key without the plural suffix.
 * @param count The number the string agrees with.
 * @param substitutions Values for `$2`…`$9`.
 */
export function tn(key: string, count: number, ...substitutions: (string | number)[]): string {
  const language = locale();
  let rule = rules.get(language);
  if (!rule) rules.set(language, (rule = new Intl.PluralRules(language)));
  const values = [count, ...substitutions].map(String);
  return message(`${key}_${rule.select(count)}`, values) || message(`${key}_other`, values) || key;
}

/**
 * Fills a page's static strings: `data-i18n` sets the text, `data-i18n-title`,
 * `data-i18n-placeholder` and `data-i18n-aria-label` set those attributes; the
 * document language follows the interface language.
 *
 * @param root The page to fill.
 */
export function localize(root: Document = document): void {
  root.documentElement.lang = locale();
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]'))
    element.textContent = t(element.dataset.i18n!);
  for (const name of ['title', 'placeholder', 'aria-label'])
    for (const element of root.querySelectorAll<HTMLElement>(`[data-i18n-${name}]`))
      element.setAttribute(name, t(element.getAttribute(`data-i18n-${name}`)!));
}
