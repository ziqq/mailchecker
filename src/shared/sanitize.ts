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

/** Skips a quoted CSS string or comment, including an unterminated final token. */
function cssLiteralEnd(css: string, start: number): number {
  if (css[start] === '/') {
    const close = css.indexOf('*/', start + 2);
    return close < 0 ? css.length : close + 2;
  }
  const quote = css[start];
  for (let index = start + 1; index < css.length; index++) {
    if (css[index] === '\\') index++;
    else if (css[index] === quote) return index + 1;
  }
  return css.length;
}

/** Skips a CSS function without interpreting quoted, escaped or commented parentheses. */
function cssFunctionEnd(css: string, start: number): number {
  let depth = 1;
  for (let index = start + 1; index < css.length; index++) {
    const char = css[index];
    if (char === '"' || char === "'" || (char === '/' && css[index + 1] === '*')) index = cssLiteralEnd(css, index) - 1;
    else if (char === '\\') index++;
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return index + 1;
  }
  return css.length;
}

/** Recognizes a remote image URL after CSS quote and escape processing, without resolving or requesting it. */
function remoteCSSURL(value: string): boolean {
  const url = value
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, '$2')
    .replace(/\\(?:([0-9a-f]{1,6})\s?|([\s\S]))/gi, (_whole, hex: string | undefined, escaped: string) =>
      hex ? String.fromCodePoint(Math.min(0x10ffff, parseInt(hex, 16))) : /[\r\n]/.test(escaped) ? '' : escaped,
    );
  return /^(?:https?:)?\/\//i.test(url);
}

/** Adapts colours and reports remote CSS images without modifying their URLs or allowing network access. */
function transformCSS(css: string, dark: boolean, onRemoteImage?: () => void): string {
  const parts: string[] = [];
  let copied = 0;
  let statement = 0;
  let inValue = false;
  let colored = false;
  let background = false;
  let image = false;
  let parentheses = 0;
  const imageSets: number[] = [];
  for (let index = 0; index < css.length;) {
    const start = index;
    const char = css[index];
    if (char === '"' || char === "'" || (char === '/' && css[index + 1] === '*')) {
      index = cssLiteralEnd(css, index);
      if (image && imageSets.length && char !== '/' && remoteCSSURL(css.slice(start, index))) onRemoteImage?.();
      continue;
    }
    if (char === '\\') {
      index += 2;
      continue;
    }
    let color = '';
    if (/[a-z_-]/i.test(char)) {
      while (index < css.length && /[a-z0-9_-]/i.test(css[index])) index++;
      const word = css.slice(start, index).toLowerCase();
      let opening = index;
      if (word === 'url' || word === 'rgb' || word === 'rgba' || word === 'image-set' || word === '-webkit-image-set')
        while (opening < css.length && /\s/.test(css[opening])) opening++;
      if (image && (word === 'image-set' || word === '-webkit-image-set') && css[opening] === '(')
        imageSets.push(parentheses + 1);
      if (css[opening] === '(' && (word === 'url' || (colored && (word === 'rgb' || word === 'rgba')))) {
        index = cssFunctionEnd(css, opening);
        if (word !== 'url') color = css.slice(start, index);
        else if (image && onRemoteImage) {
          if (remoteCSSURL(css.slice(opening + 1, index - 1))) onRemoteImage();
        }
      } else if (colored && Object.hasOwn(NAMED, word)) color = css.slice(start, index);
    } else if (colored && char === '#') {
      color = /^#[0-9a-f]{3,8}\b/i.exec(css.slice(index, index + 10))?.[0] || '';
      index += color.length || 1;
    } else {
      if (char === '(') parentheses++;
      else if (char === ')') {
        parentheses = Math.max(0, parentheses - 1);
        while (imageSets.length && imageSets[imageSets.length - 1] > parentheses) imageSets.pop();
      } else if (!parentheses && char === ':' && !inValue) {
        const property = css
          .slice(statement, index)
          .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
          .trim();
        inValue = true;
        colored = dark && COLORED.test(property);
        background = BACKGROUND.test(property);
        image =
          /^(?:background(?:-image)?|border-image(?:-source)?|list-style(?:-image)?|(?:-webkit-)?mask(?:-image)?|content|cursor)$/i.test(
            property,
          );
      } else if (!parentheses && (char === ';' || char === '{' || char === '}')) {
        statement = index + 1;
        inValue = false;
        colored = false;
        image = false;
      }
      index++;
    }
    if (color) {
      const adapted = darkColor(color, background);
      if (adapted !== color) {
        parts.push(css.slice(copied, start), adapted);
        copied = index;
      }
    }
  }
  return parts.length ? parts.join('') + css.slice(copied) : css;
}

/** Adapts declaration colours in one forward scan, preserving comments, strings and complete URL functions. */
export function darkCSS(css: string): string {
  return transformCSS(css, true);
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
  const onRemoteImage = allowRemote
    ? undefined
    : () => {
        blocked++;
      };
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
    const style = element.getAttribute('style');
    if (style) element.setAttribute('style', transformCSS(style, dark, onRemoteImage));
    if (dark) {
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
    .map(style => `<style>${transformCSS(style, dark, onRemoteImage).replace(/<\/style/gi, '')}</style>`)
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
