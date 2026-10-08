/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Browser differences behind one interface (Chromium and Safari).
 *
 * Feature detection decides at run time; the build-time `__TARGET__`
 * constant only names the package. Safari has no `identity` or
 * `notifications` APIs, applies `setAccessLevel` only to session storage
 * and ignores badge colours (see docs/SAFARI.md).
 *
 * @module background/platform
 */

declare const __TARGET__: 'chromium' | 'safari';

/** The package this bundle was built for. */
export const target: 'chromium' | 'safari' = typeof __TARGET__ === 'string' ? __TARGET__ : 'chromium';

/** Whether the browser can run an OAuth window for the extension. */
export const hasIdentity = (): boolean => typeof chrome.identity?.launchWebAuthFlow === 'function';

/** Whether system notifications are available to the extension. */
export const hasNotifications = (): boolean => typeof chrome.notifications?.create === 'function';

/**
 * Limits local storage to trusted extension contexts where supported.
 *
 * Safari supports the access level only for session storage, so a
 * rejection is ignored: extension pages are the only contexts there anyway,
 * because this extension has no content scripts.
 */
export async function restrictStorage(): Promise<void> {
  try {
    await chrome.storage.local.setAccessLevel?.({accessLevel: 'TRUSTED_CONTEXTS'});
  } catch {
    /* Unsupported for the local area (Safari). */
  }
}

/**
 * Sets the toolbar badge; colours are applied only where supported.
 *
 * @param text Badge text, empty to clear.
 * @param colors Background and text colours.
 * @param title Toolbar button tooltip.
 */
export async function setBadge(text: string, colors: {background: string; text: string}, title: string): Promise<void> {
  await chrome.action.setBadgeText({text});
  await chrome.action.setBadgeBackgroundColor?.({color: colors.background}).catch(() => {});
  await chrome.action.setBadgeTextColor?.({color: colors.text}).catch(() => {});
  await chrome.action.setTitle({title});
}

/** Opens the full-tab client, focusing an existing one when the browser allows it. */
export async function openApp(): Promise<void> {
  const url = chrome.runtime.getURL('app.html');
  const [existing] = await chrome.tabs.query({url}).catch(() => [] as chrome.tabs.Tab[]);
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, {active: true});
    if (existing.windowId != null) await chrome.windows?.update(existing.windowId, {focused: true}).catch(() => {});
    return;
  }
  await chrome.tabs.create({url});
}
