/**
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
  palette: 'accent',
});

/** Allowed theme values, in toggle order. */
export const themes: readonly Theme[] = Object.freeze(['auto', 'light', 'dark']);

/** Allowed palette values. */
export const palettes: readonly Palette[] = Object.freeze(['accent', 'neutral']);

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
