/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Text formatting for message lists and notifications.
 *
 * @module shared/format
 */
import {locale} from './i18n';

/**
 * Returns the display name of a `Name <address>` sender, or the address.
 *
 * @param from The sender header.
 */
export function senderName(from: string): string {
  const name = String(from || '')
    .replace(/<[^>]*>/, '')
    .replace(/"/g, '')
    .trim();
  return name || String(from || '').replace(/[<>]/g, '');
}

/**
 * Returns a short date: the time today, otherwise day and month.
 *
 * @param timestamp Milliseconds since the epoch.
 * @param now The current time.
 */
export function shortDate(timestamp: number, now: Date = new Date()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString(locale(), {hour: '2-digit', minute: '2-digit'});
  return date.toLocaleDateString(locale(), {day: 'numeric', month: 'short'});
}

/**
 * Returns the first letter or digit of an address for an avatar.
 *
 * @param email An address.
 */
export function initial(email: string): string {
  return (String(email || '?').match(/[\p{L}\p{N}]/u)?.[0] || '?').toUpperCase();
}
