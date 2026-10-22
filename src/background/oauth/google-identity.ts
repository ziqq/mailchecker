/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Validates Google's signed account-selection response before native Gmail authorization.
 * Keys come only from Google's fixed JWKS endpoint; identity tokens are never stored.
 *
 * @module background/oauth/google-identity
 */
import {t} from '../../shared/i18n';
import {requestJSON} from '../http';

/** Decodes a bounded JWT segment; callers bound the complete token first. */
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

/** Reads an object from a UTF-8 JWT header or payload. */
function object(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(decode(value)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('error_oauth_token'));
  return parsed as Record<string, unknown>;
}

/**
 * Returns the signed Google subject for this one account-selection transaction.
 *
 * Only RS256, the registered audience, Google issuer, fresh nonce and unexpired claims are accepted.
 * No token-supplied key URL is followed and no provider token or identity claim reaches a page.
 */
export async function googleSubject(value: string, audience: string, nonce: string): Promise<string> {
  const invalid = (): Error => new Error(t('error_oauth_token'));
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  if (value.length > 16384) throw invalid();
  const parts = value.split('.');
  try {
    if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) throw invalid();
    header = object(parts[0]);
    claims = object(parts[1]);
  } catch {
    throw invalid();
  }
  const now = Date.now() / 1000;
  if (
    header.alg !== 'RS256' ||
    typeof header.kid !== 'string' ||
    !header.kid ||
    header.kid.length > 128 ||
    header.crit !== undefined ||
    (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') ||
    claims.aud !== audience ||
    (claims.azp !== undefined && claims.azp !== audience) ||
    claims.nonce !== nonce ||
    typeof claims.exp !== 'number' ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= now ||
    typeof claims.iat !== 'number' ||
    !Number.isSafeInteger(claims.iat) ||
    claims.iat <= 0 ||
    claims.iat > now + 60 ||
    claims.exp <= claims.iat ||
    typeof claims.sub !== 'string' ||
    !/^[\w-]{1,255}$/.test(claims.sub)
  )
    throw invalid();

  const jwks = await requestJSON<{keys?: (JsonWebKey & {kid?: string})[]}>(
    'https://www.googleapis.com/oauth2/v3/certs',
    {service: 'Google'},
  );
  if (!Array.isArray(jwks?.keys) || jwks.keys.length > 10) throw invalid();
  const matches = jwks.keys.filter(key => key?.kid === header.kid);
  const key = matches[0];
  if (
    matches.length !== 1 ||
    key.kty !== 'RSA' ||
    (key.alg !== undefined && key.alg !== 'RS256') ||
    (key.use !== undefined && key.use !== 'sig') ||
    typeof key.n !== 'string' ||
    !/^[\w-]{1,1024}$/.test(key.n) ||
    typeof key.e !== 'string' ||
    !/^[\w-]{1,8}$/.test(key.e)
  )
    throw invalid();
  try {
    const imported = await crypto.subtle.importKey(
      'jwk',
      {kty: 'RSA', n: key.n, e: key.e},
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        imported,
        decode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      ))
    )
      throw invalid();
  } catch {
    throw invalid();
  }
  if (claims.exp <= Date.now() / 1000) throw invalid();
  return claims.sub;
}
