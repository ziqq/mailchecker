/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Original 24×24 line icons and provider marks rendered as inline SVG.
 *
 * Elements are created with DOM APIs only; no markup strings are parsed.
 *
 * @module shared/icons
 */
import type {ProviderID} from './types';

/** Line-icon path data by name. */
const paths: Readonly<Record<string, string>> = Object.freeze({
  refresh: 'M20 11a8 8 0 1 0-2 6M20 3v8h-8',
  settings:
    'M9.89 5.11 10.58 2.51 13.42 2.51 14.11 5.11 15.38 5.64 17.71 4.28 19.72 6.29 18.36 8.62 18.89 9.89 21.49 10.58 21.49 13.42 18.89 14.11 18.36 15.38 19.72 17.71 17.71 19.72 15.38 18.36 14.11 18.89 13.42 21.49 10.58 21.49 9.89 18.89 8.62 18.36 6.29 19.72 4.28 17.71 5.64 15.38 5.11 14.11 2.51 13.42 2.51 10.58 5.11 9.89 5.64 8.62 4.28 6.29 6.29 4.28 8.62 5.64zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  theme: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 0v18',
  check: 'm5 12 4 4L20 5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 6h16M9 6V4h6v2m3 0-1 15H7L6 6',
  external: 'M14 3h7v7m0-7-12 12M11 3H3v18h18v-8',
  mail: 'M3 5h18v14H3zm0 1 9 7 9-7',
  inbox: 'M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z',
  server: 'M4 4h16v7H4zm0 9h16v7H4zm3-5.5h.01M7 16.5h.01',
  lock: 'M5 11h14v10H5zm3 0V7a4 4 0 0 1 8 0v4',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 3 8 3 8H3s3-2 3-8m4 12h4',
  key: 'M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8m3 1 9-9m-4 4 3 3',
  alert: 'M12 3 2 20h20zm0 6v5m0 3h.01',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3 3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  shield: 'M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z',
  archive: 'M3 4h18v4H3zm2 4v12h14V8M10 12h4',
  pin: 'm8 3 8 0-1 6 4 4H5l4-4zm4 10v8',
  expand: 'M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
  back: 'm15 5-7 7 7 7',
  chevron: 'm6 9 6 6 6-6',
  unread: 'M3 5h13M3 5v14h18v-7M3 6l9 7 4-3M19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  clip: 'm21 11-9 9a6 6 0 0 1-8-8l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8',
  image: 'M3 3h18v18H3zm0 15 6-6 4 4 3-3 5 5M15 7h1',
  layers: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5',
});

/** Filled provider marks: `[path, colour]` pairs. */
const marks: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = Object.freeze({
  gmail: [
    ['M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3', '#4285F4'],
    ['M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22', '#34A853'],
    ['M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z', '#FBBC05'],
    ['M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6', '#EA4335'],
  ],
  outlook: [
    ['M3 3h8.5v8.5H3z', '#F25022'],
    ['M12.5 3H21v8.5h-8.5z', '#7FBA00'],
    ['M3 12.5h8.5V21H3z', '#00A4EF'],
    ['M12.5 12.5H21V21h-8.5z', '#FFB900'],
  ],
  yandex: [
    ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', '#FC3F1D'],
    [
      'M13.2 6H15v12h-1.8v-4.6h-1.1L9.6 18H7.7l2.8-5.1c-1.4-.5-2.2-1.6-2.2-3.3C8.3 7.3 9.8 6 12.3 6zm0 1.5h-.9c-1.3 0-2.1.7-2.1 2.1s.8 2.3 2.1 2.3h.9z',
      '#FFFFFF',
    ],
  ],
  mailru: [
    ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', '#005FF9'],
    ['M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11zm0 2.5a3 3 0 1 1 0 6 3 3 0 1 1 0-6z', '#FF9E00'],
  ],
  icloud: [['M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6 3.8 3.8 0 0 1-.5 7.4z', '#3693F3']],
});

/** SVG namespace. */
const ns = 'http://www.w3.org/2000/svg';

/**
 * Creates a line icon that inherits `currentColor`.
 *
 * @param name An icon name; unknown names use the mail icon.
 * @param className An extra CSS class.
 */
export function icon(name: string, className = ''): SVGSVGElement {
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  if (className) svg.classList.add(className);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', paths[name] || paths.mail);
  svg.append(path);
  return svg;
}

/**
 * Creates a provider mark: a coloured service mark, or a server icon for JMAP.
 *
 * @param provider A provider ID.
 */
export function providerMark(provider: ProviderID): SVGSVGElement {
  if (!marks[provider]) return icon('server');
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const [d, fill] of marks[provider]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    svg.append(path);
  }
  return svg;
}
