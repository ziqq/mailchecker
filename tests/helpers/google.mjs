/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Ephemeral signed Google identity fixtures; no real account or credential is used.
 *
 * @module tests/helpers/google
 */

/** A fresh test-only signing pair shared within one test process. */
const pair = await crypto.subtle.generateKey(
  {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'},
  true,
  ['sign', 'verify'],
);

/** Public JWKS fixture corresponding to the ephemeral signing key. */
export const googleKey = {
  ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
};

/** Signs arbitrary test claims so claim failures cannot be mistaken for signature failures. */
export async function googleToken({
  header = {},
  claims = {},
  nonce = 'test-nonce',
  audience = 'test-selection-id',
  subject = 'google-account',
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {iss: 'https://accounts.google.com', aud: audience, sub: subject, nonce, iat: now, exp: now + 3600};
  const unsigned = [
    {alg: 'RS256', kid: googleKey.kid, ...header},
    {...payload, ...claims},
  ]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
}
