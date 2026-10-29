/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Public OAuth client IDs from the maintainer's registered applications.
 *
 * Empty IDs disable that sign-in; JMAP accounts keep working. Never add a
 * client secret: the extension is a public client.
 *
 * @module background/oauth/config
 */

/** Client IDs by provider; empty when not registered. */
export const oauthConfig: Readonly<{google: string; googleSelection: string; microsoft: string}> = Object.freeze({
  google: '1014715555178-fvb8f96qqh5aq10qpdg6hnv4isgkj3ph.apps.googleusercontent.com',
  googleSelection: '1014715555178-t9nscel1rpel7vtf4hvd2objqar5cnnf.apps.googleusercontent.com',
  microsoft: '',
});
