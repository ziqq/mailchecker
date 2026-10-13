/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Email body sanitization and the sandboxed frame document.
 *
 * Runs in extension pages (it needs `DOMParser`). Bodies are untrusted:
 * active content, forms, frames and navigation targets are removed, links
 * open in a new tab, and remote images are blocked unless the user allows
 * them. The result is shown in an `<iframe sandbox>` without scripts and
 * with its own Content Security Policy, so CSS `url()` loads are blocked
 * too unless remote content is allowed.
 *
 * In the dark theme each colour of the message is adapted on its own, as
 * dark-mode mail clients do: light backgrounds become dark and dark text
 * becomes light, keeping hue and saturation; colours already fit for a dark
 * page and images are left as they are.
 *
 * @module shared/sanitize
 */

/** Elements removed with their content. */
const REMOVED = new Set([
  'script',
  'noscript',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'link',
  'meta',
  'base',
  'audio',
  'video',
  'source',
  'track',
  'portal',
  'template',
  'image',
]);

/** URL attributes checked against the allowed schemes. */
const URL_ATTRIBUTES = ['href', 'src', 'srcset', 'background', 'poster', 'xlink:href', 'action', 'formaction', 'ping'];

/** Result of sanitizing a body. */
export interface SanitizedBody {
  /** Safe markup for the frame body, including the message's own `<style>` blocks. */
  html: string;
  /** Remote images that were blocked. */
  blocked: number;
  /** Blocked images that look like tracking pixels (1×1 or hidden). */
  trackers: number;
}

/** Returns whether a link target is safe to keep. */
function safeLink(value: string): boolean {
  return /^(https?:|mailto:|tel:|#)/i.test(value.trim());
}

/** Returns whether an image looks like a tracking pixel. */
function isTracker(image: Element): boolean {
  const width = Number(image.getAttribute('width'));
  const height = Number(image.getAttribute('height'));
  const style = image.getAttribute('style') || '';
  return (
    (width > 0 && width <= 2) ||
    (height > 0 && height <= 2) ||
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)
  );
}

/** Named colours whose lightness matters in mail: greys, white and black. */
const NAMED: Readonly<Record<string, string>> = Object.freeze({
  white: '#ffffff',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  gainsboro: '#dcdcdc',
  whitesmoke: '#f5f5f5',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  dimgray: '#696969',
  dimgrey: '#696969',
  snow: '#fffafa',
  ivory: '#fffff0',
  linen: '#faf0e6',
  beige: '#f5f5dc',
  navy: '#000080',
});

/** Colour literals in CSS: hex, `rgb()`/`rgba()` and the names above. */
const COLOR = new RegExp(`#[0-9a-f]{3,8}\\b|rgba?\\([^)]*\\)|\\b(?:${Object.keys(NAMED).join('|')})\\b`, 'gi');

/** Returns red, green, blue (0–255) and alpha of a colour literal, or null. */
function parseColor(value: string): [number, number, number, number] | null {
  const literal = NAMED[value.toLowerCase()] || value;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(literal)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map(char => char + char).join('') : hex;
    if (full.length !== 6 && full.length !== 8) return null;
    const [r, g, b, a = 255] = (full.match(/../g) || []).map(pair => parseInt(pair, 16));
    return [r, g, b, a / 255];
  }
  const parts = /^rgba?\(([^)]*)\)$/i
    .exec(literal)?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (!parts || parts.length < 3) return null;
  const channel = (part: string) => (part.endsWith('%') ? (parseFloat(part) * 255) / 100 : parseFloat(part));
  const alpha = parts[3] == null ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  const rgb = parts.slice(0, 3).map(channel);
  return rgb.some(Number.isNaN) || Number.isNaN(alpha) ? null : [rgb[0], rgb[1], rgb[2], alpha];
}

/** The dark page under a message. */
const PAGE = '#171717';

/** Returns two hex digits for an alpha from 0 to 1. */
const alphaHex = (alpha: number): string =>
  Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');

/**
 * Returns [value] adapted to a dark page. Every grey or near-white background,
 * white paper included, becomes [PAGE]: the message reads as one dark surface. A coloured
 * background lighter than half is mirrored to a dark one, a foreground darker
 * than half to a light one.
 *
 * @param value A colour literal.
 * @param background Whether the colour paints a background.
 */
export function darkColor(value: string, background: boolean): string {
  const rgb = parseColor(value);
  if (!rgb) return value;
  const [r, g, b] = rgb.slice(0, 3).map(channel => Math.min(255, Math.max(0, channel)) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  // Grey and near-white (lightly tinted paper) backgrounds are the page itself.
  if (background && (saturation <= 0.15 || lightness >= 0.9)) return rgb[3] < 1 ? `${PAGE}${alphaHex(rgb[3])}` : PAGE;
  if (background ? lightness <= 0.5 : lightness >= 0.5) return value;
  const hue =
    delta === 0 ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  // Black text becomes `#e8e8e8`; light coloured backgrounds stay above the page.
  const mirrored = background ? Math.max(0.09, 1 - lightness) : Math.min(0.91, 1 - lightness);
  const chroma = (1 - Math.abs(2 * mirrored - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const m = mirrored - chroma / 2;
  const [red, green, blue] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][Math.floor(hue) % 6].map(channel => Math.round((channel + m) * 255));
  return rgb[3] < 1 ? `rgba(${red}, ${green}, ${blue}, ${rgb[3]})` : `rgb(${red}, ${green}, ${blue})`;
}

/** CSS properties whose colours paint a background; other colour properties are foregrounds. */
const BACKGROUND = /^(?:background|background-color|background-image)$/i;

/** Properties whose colours are adapted. */
const COLORED =
  /^(?:background|background-color|background-image|color|border(?:-[a-z]+)*-?color|border(?:-[a-z]+)?|outline(?:-color)?|text-decoration-color|fill|stroke)$/i;

/** Returns CSS declarations (a `style` attribute or a stylesheet) with colours adapted to a dark page. */
export function darkCSS(css: string): string {
  return css.replace(/([a-z-]+)(\s*:\s*)([^;{}]+)/gi, (whole, property: string, colon: string, value: string) =>
    COLORED.test(property)
      ? property + colon + value.replace(COLOR, color => darkColor(color, BACKGROUND.test(property)))
      : whole,
  );
}

/**
 * Sanitizes an HTML email body.
 *
 * @param html Untrusted HTML.
 * @param allowRemote Whether remote images may load.
 * @param dark Whether to adapt the message's colours to the dark theme.
 */
export function sanitizeEmail(html: string, allowRemote: boolean, dark = false): SanitizedBody {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let blocked = 0;
  let trackers = 0;
  const styles = [...doc.querySelectorAll('style')].map(style => style.textContent || '');
  for (const element of [...doc.querySelectorAll('*')]) {
    const tag = element.localName;
    if (REMOVED.has(tag) || tag === 'style') {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'action' || name === 'ping')
        element.removeAttribute(attribute.name);
    }
    if (tag === 'img') {
      const source = element.getAttribute('src') || '';
      if (/^https?:/i.test(source)) {
        if (!allowRemote) {
          if (isTracker(element)) trackers += 1;
          else blocked += 1;
          element.removeAttribute('src');
          element.removeAttribute('srcset');
          element.setAttribute('data-blocked', '');
          element.setAttribute('alt', element.getAttribute('alt') || '');
        }
      } else if (!/^data:image\//i.test(source)) {
        element.removeAttribute('src');
        element.removeAttribute('srcset');
      }
    }
    for (const name of URL_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value == null || (tag === 'img' && (name === 'src' || name === 'srcset'))) continue;
      if (name === 'href' && safeLink(value)) continue;
      if (name === 'background' && /^https?:/i.test(value) && allowRemote) continue;
      if (name === 'background' && /^https?:/i.test(value)) blocked += 1;
      element.removeAttribute(name);
    }
    if (tag === 'a' && element.hasAttribute('href')) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
    if (dark) {
      const style = element.getAttribute('style');
      if (style) element.setAttribute('style', darkCSS(style));
      for (const [name, background] of [
        ['bgcolor', true],
        ['color', false],
        ['text', false],
      ] as const) {
        const value = element.getAttribute(name);
        if (value) element.setAttribute(name, darkColor(value.trim(), background));
      }
    }
  }
  const css = styles
    .map(style => `<style>${(dark ? darkCSS(style) : style).replace(/<\/style/gi, '')}</style>`)
    .join('');
  return {html: css + (doc.body?.innerHTML || ''), blocked: blocked + trackers, trackers};
}

/** Escapes text for HTML. */
const escape = (value: string): string =>
  value.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[char]!);

/**
 * Converts a plain-text body to safe HTML with clickable links.
 *
 * @param text The plain-text body.
 */
export function textToHTML(text: string): string {
  const linked = escape(text).replace(
    /\bhttps?:\/\/[^\s<>"']+/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
  return `<div class="plain">${linked}</div>`;
}

/**
 * Builds the frame document for a sanitized body.
 *
 * @param body Sanitized body markup.
 * @param options.allowRemote Whether remote images and fonts may load.
 * @param options.dark Whether to use the dark palette; HTML mail is adapted by [sanitizeEmail].
 * @param options.plain Whether the body came from plain text.
 */
export function frameDocument(
  body: string,
  {allowRemote, dark, plain}: {allowRemote: boolean; dark: boolean; plain: boolean},
): string {
  const remote = allowRemote ? ' https: http:' : '';
  const csp = `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'; font-src data:${remote}`;
  const background = dark ? (plain ? '#151619' : PAGE) : '#ffffff';
  const color = dark ? (plain ? '#f2f1ed' : '#e8e8e8') : '#1a1a1a';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
html,body{margin:0;background:${background};color:${color}}html{overflow-y:hidden}
body{padding:16px 18px;font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;overflow-wrap:anywhere}
img{max-width:100%!important;height:auto!important}img[data-blocked]{display:inline-block;min-width:16px;min-height:16px;background:${dark && !plain ? 'transparent' : 'rgba(127,127,127,.15)'}}
table{width:100%!important;max-width:100%!important;table-layout:fixed!important}td,th{overflow-wrap:anywhere}pre{white-space:pre-wrap}a{color:${dark ? '#8ab4f8' : '#0b62d6'}}
.plain{white-space:pre-wrap}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid rgba(127,127,127,.35);color:inherit}
</style></head><body style="height:auto!important;min-height:0!important;display:flow-root!important">${body}</body></html>`;
}
