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
import type {Palette, Preferences, Theme} from './types';

/** Default preferences. */
export const defaults: Readonly<Preferences> = Object.freeze({
  interval: 2,
  notifications: true,
  limit: 30,
  theme: 'auto',
  palette: 'orange',
});

/** Allowed theme values, in toggle order. */
export const themes: readonly Theme[] = Object.freeze(['auto', 'light', 'dark']);

/** Accent colours (Telegram iOS accents, our orange) and the text on them: white where it reaches 3:1. */
export const accents: Readonly<Record<Exclude<Palette, 'neutral'>, {color: string; text: string}>> = Object.freeze({
  orange: {color: '#ff9418', text: '#1a0f00'},
  blue: {color: '#0088ff', text: '#ffffff'},
  cyan: {color: '#00c2ed', text: '#1a0f00'},
  green: {color: '#29b327', text: '#1a0f00'},
  pink: {color: '#eb6ca4', text: '#1a0f00'},
  purple: {color: '#9472ee', text: '#ffffff'},
  red: {color: '#d33213', text: '#ffffff'},
  yellow: {color: '#edb400', text: '#1a0f00'},
  gray: {color: '#6d839e', text: '#ffffff'},
});

/** Allowed palette values, in picker order; anything else (such as the former `accent`) falls back to orange. */
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
  };
}
