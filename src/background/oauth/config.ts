/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

/**
 * Public OAuth client IDs from the maintainer's registered applications.
 *
 * Empty IDs disable that sign-in; JMAP accounts keep working. Never add a
 * client secret: the extension is a public client.
 *
 * @module background/oauth/config
 */

/** Client IDs by provider; empty when not registered. */
export const oauthConfig: Readonly<{google: string; microsoft: string}> = Object.freeze({google: '', microsoft: ''});
