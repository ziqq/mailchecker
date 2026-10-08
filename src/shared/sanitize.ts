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

/**
 * Sanitizes an HTML email body.
 *
 * @param html Untrusted HTML.
 * @param allowRemote Whether remote images may load.
 */
export function sanitizeEmail(html: string, allowRemote: boolean): SanitizedBody {
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
  }
  const css = styles.map(style => `<style>${style.replace(/<\/style/gi, '')}</style>`).join('');
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
 * @param options.dark Whether to use the dark plain-text palette (HTML mail keeps a light paper).
 * @param options.plain Whether the body came from plain text.
 */
export function frameDocument(
  body: string,
  {allowRemote, dark, plain}: {allowRemote: boolean; dark: boolean; plain: boolean},
): string {
  const remote = allowRemote ? ' https: http:' : '';
  const csp = `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'; font-src data:${remote}`;
  const background = plain && dark ? '#151619' : '#ffffff';
  const color = plain && dark ? '#f2f1ed' : '#1a1a1a';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
html,body{margin:0;background:${background};color:${color}}html{overflow-y:hidden}
body{padding:16px 18px;font:14px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}img[data-blocked]{display:inline-block;min-width:16px;min-height:16px;background:rgba(127,127,127,.15)}
table{max-width:100%}pre{white-space:pre-wrap}a{color:${plain && dark ? '#ffb562' : '#0b62d6'}}
.plain{white-space:pre-wrap}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid rgba(127,127,127,.35);color:inherit}
</style></head><body>${body}</body></html>`;
}
