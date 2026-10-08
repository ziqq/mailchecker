/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * DOM helpers for extension pages: element creation with `textContent`
 * only, theme application and worker messaging.
 *
 * @module shared/dom
 */
import {handle} from '../sandbox/worker';
import type {Preferences, Reply, Request} from './types';

/** Set by the build: `true` only in the sandbox build (`npm run sandbox`). */
declare const __SANDBOX__: boolean;

/** A child accepted by [el]: nodes, text, nested lists or skipped empty values. */
export type Child = Node | string | null | undefined | false | Child[];

/** Attribute values; `on…` keys take listeners. */
type Attributes = Record<string, string | number | boolean | null | undefined | EventListener>;

/**
 * Creates an element.
 *
 * Attributes named `on…` become event listeners, `class` sets the class
 * name and `false`/`null` values are skipped. Strings become text nodes.
 *
 * @param tag The tag name.
 * @param attributes Attributes and listeners.
 * @param children Child nodes or text.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
    else if (key === 'class') element.className = String(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  const flat = (children as unknown[]).flat(Infinity) as (Node | string | null | undefined | false)[];
  element.append(...flat.filter((child): child is Node | string => child != null && child !== false));
  return element;
}

/**
 * Applies the theme and palette preferences to the document root.
 *
 * @param preferences Normalized preferences.
 */
export function applyTheme({theme, palette}: Pick<Preferences, 'theme' | 'palette'>): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  root.dataset.palette = palette === 'neutral' ? 'neutral' : 'accent';
}

/**
 * Sends a request to the service worker; the sandbox build answers from fixtures instead.
 *
 * @param message The typed request.
 * @returns The reply value.
 * @throws With the worker's user-facing message.
 */
export async function request<R = unknown>(message: Request): Promise<R> {
  const reply: Reply<R> | undefined = __SANDBOX__
    ? ((await handle(message)) as Reply<R>)
    : await chrome.runtime.sendMessage(message);
  if (!reply || !reply.ok) throw new Error(reply?.error || 'Расширение не ответило. Перезагрузите страницу.');
  return reply.value;
}

/**
 * Returns a required element by ID.
 *
 * @throws When the page is missing the element.
 */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}.`);
  return element as T;
}

/** Returns the message of an unknown error. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Неизвестная ошибка.';
