/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Interface strings for the sandbox build and unit tests, which have no `chrome.i18n`.
 *
 * Russian by default; the sandbox page picks another locale with `?lang=de`
 * and so on. Release builds replace this module with an empty one
 * (`scripts/build.mjs`); `scripts/check.mjs` fails if the messages ship.
 *
 * @module sandbox/messages
 */
import de from '../_locales/de/messages.json';
import en from '../_locales/en/messages.json';
import es from '../_locales/es/messages.json';
import fr from '../_locales/fr/messages.json';
import it from '../_locales/it/messages.json';
import ja from '../_locales/ja/messages.json';
import ko from '../_locales/ko/messages.json';
import pl from '../_locales/pl/messages.json';
import ptBR from '../_locales/pt_BR/messages.json';
import ru from '../_locales/ru/messages.json';
import tr from '../_locales/tr/messages.json';
import uk from '../_locales/uk/messages.json';
import zhCN from '../_locales/zh_CN/messages.json';

/** Messages by locale code (`pt_BR`, `zh_CN` as in `_locales`). */
const LOCALES: Record<string, Record<string, {message: string}>> = {
  de,
  en,
  es,
  fr,
  it,
  ja,
  ko,
  pl,
  pt_BR: ptBR,
  ru,
  tr,
  uk,
  zh_CN: zhCN,
};

/** The locale code asked for with `?lang=`, or `ru`. */
export function sandboxLocale(): string {
  const asked = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('lang') || '';
  const code = asked.replace('-', '_');
  return code in LOCALES ? code : 'ru';
}

/** Returns the messages of [sandboxLocale] by key. */
export const sandboxMessages = (): Record<string, {message: string}> => LOCALES[sandboxLocale()];
