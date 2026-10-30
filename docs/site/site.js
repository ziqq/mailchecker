/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Browser-language selection and the public site's manual locale preference.
 *
 * @module site/locale
 */
/* global document, URL, location, localStorage, navigator */

const languageKey = 'mailchecker.site.language';
const siteURL = new URL('.', document.currentScript.src);
const currentLanguage = document.documentElement.lang;
const page = location.pathname.endsWith('/privacy.html') ? 'privacy.html' : '';

/** Accepts only locales shipped by this static site. */
function supportedLanguage(value) {
  return value === 'en' || value === 'ru';
}

/** Reads this site's preference; storage may be unavailable in a private browser. */
function savedLanguage() {
  try {
    const value = localStorage.getItem(languageKey);
    return supportedLanguage(value) ? value : '';
  } catch {
    return '';
  }
}

/** Returns the equivalent static page with an explicit locale for storage-free navigation. */
function languageURL(language) {
  const target = new URL(`${language === 'ru' ? 'ru/' : ''}${page}`, siteURL);
  target.searchParams.set('lang', language);
  target.hash = location.hash;
  return target;
}

const explicitLanguage = new URL(location.href).searchParams.get('lang');
const browserLanguage = (navigator.languages || [navigator.language])
  .map(value => value.split('-')[0].toLowerCase())
  .find(supportedLanguage);
const preferredLanguage = supportedLanguage(explicitLanguage)
  ? explicitLanguage
  : savedLanguage() || (currentLanguage === 'ru' ? 'ru' : browserLanguage || 'en');

if (preferredLanguage !== currentLanguage) location.replace(languageURL(preferredLanguage));

/** Keeps a manual choice ahead of browser detection, preserving the current page. */
function bindLanguagePicker() {
  const picker = document.getElementById('site-language');
  picker.value = currentLanguage;
  picker.addEventListener('change', () => {
    const language = picker.value;
    if (!supportedLanguage(language)) return;
    try {
      localStorage.setItem(languageKey, language);
    } catch {
      // The explicit URL still preserves this selection when storage is blocked.
    }
    if (language !== currentLanguage) location.assign(languageURL(language));
  });
}

document.addEventListener('DOMContentLoaded', bindLanguagePicker, {once: true});
