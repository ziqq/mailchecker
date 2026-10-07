/**
 * Text formatting for message lists and notifications.
 *
 * @module shared/format
 */

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
    return date.toLocaleTimeString('ru', {hour: '2-digit', minute: '2-digit'});
  return date.toLocaleDateString('ru', {day: 'numeric', month: 'short'});
}

/**
 * Returns the first letter or digit of an address for an avatar.
 *
 * @param email An address.
 */
export function initial(email: string): string {
  return (String(email || '?').match(/[\p{L}\p{N}]/u)?.[0] || '?').toUpperCase();
}

/**
 * Returns the Russian plural form for [count].
 *
 * @param count A count.
 * @param forms Forms for 1, 2–4 and 5+.
 */
export function plural(count: number, [one, few, many]: readonly [string, string, string]): string {
  const tens = Math.abs(count) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return many;
  if (units === 1) return one;
  if (units > 1 && units < 5) return few;
  return many;
}
