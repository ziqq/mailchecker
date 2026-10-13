/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * User preferences with defaults and bounds.
 *
 * Side-effect free; used by the service worker, the popup and Settings.
 *
 * @module shared/preferences
 */
import type {Palette, PopupSize, Preferences, Theme} from './types';

/** Default preferences. */
export const defaults: Readonly<Preferences> = Object.freeze({
  interval: 0.5,
  notifications: true,
  limit: 30,
  theme: 'auto',
  palette: 'neutral',
  popup: 'full',
});

/** Allowed popup sizes. */
export const popupSizes: readonly PopupSize[] = Object.freeze(['full', 'mini']);

/** Allowed theme values, in toggle order. */
export const themes: readonly Theme[] = Object.freeze(['auto', 'light', 'dark']);

/** Dark text on light accents, matching the default orange button. */
const DARK_TEXT = '#1a0f00';

/** Light text on dark accents. */
const LIGHT_TEXT = '#ffffff';

/** Returns the APCA screen luminance of a `#rrggbb` colour, with the soft clamp for near-black. */
function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map(index => (parseInt(color.slice(index, index + 2), 16) / 255) ** 2.4);
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
}

/**
 * Returns the APCA lightness contrast (Lc, 0.0.98G-4g) of [text] on [background]: positive for dark text on a light
 * background, negative for light text on a dark one.
 */
function contrast(text: string, background: string): number {
  const [foreground, back] = [luminance(text), luminance(background)];
  if (Math.abs(back - foreground) < 0.0005) return 0;
  if (back > foreground) {
    const value = (back ** 0.56 - foreground ** 0.57) * 1.14;
    return value < 0.1 ? 0 : (value - 0.027) * 100;
  }
  const value = (back ** 0.65 - foreground ** 0.62) * 1.14;
  return value > -0.1 ? 0 : (value + 0.027) * 100;
}

/**
 * Returns the text colour that reads best on [background]: dark or white, whichever has the higher APCA contrast.
 *
 * @param background A `#rrggbb` colour.
 */
export function textOn(background: string): string {
  return Math.abs(contrast(LIGHT_TEXT, background)) > Math.abs(contrast(DARK_TEXT, background))
    ? LIGHT_TEXT
    : DARK_TEXT;
}

/** Accent colours and the text on them, chosen by contrast. */
export const accents: Readonly<Record<Exclude<Palette, 'neutral'>, {color: string; text: string}>> = Object.freeze(
  Object.fromEntries(
    Object.entries({
      orange: '#ff9418',
      blue: '#0088ff',
      cyan: '#00c2ed',
      green: '#29b327',
      pink: '#eb6ca4',
      purple: '#9472ee',
      red: '#d33213',
      yellow: '#edb400',
      gray: '#6d839e',
    }).map(([name, color]) => [name, {color, text: textOn(color)}]),
  ) as Record<Exclude<Palette, 'neutral'>, {color: string; text: string}>,
);

/** Allowed palette values, in picker order. */
export const palettes: readonly Palette[] = Object.freeze([
  'orange',
  'blue',
  'cyan',
  'green',
  'pink',
  'purple',
  'red',
  'yellow',
  'gray',
  'neutral',
]);

/** Returns [input] clamped to [min, max], or [fallback] when it is not a finite number. */
function bounded(input: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/**
 * Returns complete, bounded preferences from a partial or untrusted value.
 *
 * @param value Stored or submitted preferences.
 */
export function preferences(value: Partial<Record<keyof Preferences, unknown>> = {}): Preferences {
  return {
    interval: bounded(value.interval, 0.5, 60, defaults.interval),
    notifications: typeof value.notifications === 'boolean' ? value.notifications : defaults.notifications,
    limit: Math.round(bounded(value.limit, 1, 50, defaults.limit)),
    theme: themes.includes(value.theme as Theme) ? (value.theme as Theme) : defaults.theme,
    palette: palettes.includes(value.palette as Palette) ? (value.palette as Palette) : defaults.palette,
    popup: popupSizes.includes(value.popup as PopupSize) ? (value.popup as PopupSize) : defaults.popup,
  };
}
