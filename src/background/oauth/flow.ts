/**
 * OAuth sign-in through `chrome.identity.launchWebAuthFlow`.
 *
 * - Google: implicit flow; a new access token is obtained silently with
 *   `prompt=none` while the browser's Google session is alive.
 * - Microsoft: authorization code with SHA-256 PKCE and refresh tokens.
 *
 * Every flow sends a random `state` and accepts only the exact callback
 * URL for its provider. No client secret is shipped.
 *
 * @module background/oauth/flow
 */
import type {Credentials} from '../../shared/types';
import {AuthError, HttpError, requestJSON} from '../http';
import {hasIdentity} from '../platform';
import {oauthConfig as config} from './config';

/** OAuth providers. */
export type OAuthProvider = 'google' | 'microsoft';

/** Gmail scope: read, mark read and move to Trash. */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

/** Microsoft Graph scopes; `offline_access` returns a refresh token. */
export const MICROSOFT_SCOPE = 'offline_access openid email User.Read Mail.ReadWrite';

/** Microsoft identity platform endpoints for work, school and personal accounts. */
const MICROSOFT = 'https://login.microsoftonline.com/common/oauth2/v2.0';

/** Returns whether a provider has a client ID in this build. */
export function available(provider: OAuthProvider): boolean {
  return hasIdentity() && /^[\w.-]{8,256}$/.test(config[provider]);
}

/** Returns the callback URL registered for a provider: `https://<extension-id>.chromiumapp.org/<provider>`. */
export function redirectUri(provider: OAuthProvider): string {
  return hasIdentity() ? chrome.identity.getRedirectURL(provider) : '';
}

/** Returns the client ID or throws a user-facing error. */
function clientId(provider: OAuthProvider): string {
  if (!hasIdentity())
    throw new Error(
      'В этом браузере вход выполняется через приложение Mail Checker (Safari). Используйте JMAP или Chrome.',
    );
  if (!available(provider))
    throw new Error('Вход не настроен в этой сборке: укажите OAuth Client ID в src/background/oauth/config.ts.');
  return config[provider];
}

/** Encodes bytes as base64url without padding. */
function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Returns a random URL-safe string. */
const random = (bytes = 32): string => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

/**
 * Opens the provider's sign-in page and returns the validated callback URL.
 *
 * @param url The authorization URL.
 * @param provider The provider, used to check the callback path.
 * @param interactive Whether a window may be shown.
 * @throws {AuthError} When a silent attempt fails.
 */
async function launch(url: URL, provider: OAuthProvider, interactive: boolean): Promise<URL> {
  let result: URL;
  try {
    const callback = await chrome.identity.launchWebAuthFlow({url: url.toString(), interactive});
    result = new URL(callback || '');
  } catch {
    if (!interactive) throw new AuthError();
    throw new Error('Вход отменён или не удался.');
  }
  if (result.origin + result.pathname !== redirectUri(provider)) throw new Error('Неверный адрес возврата OAuth.');
  return result;
}

/** Validates a bearer token value. */
function token(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 8192 || /\s/.test(value))
    throw new Error('Сервис входа не вернул корректный токен.');
  return value;
}

/**
 * Signs in to Google.
 *
 * @param options.loginHint The account address to preselect.
 * @param options.interactive `false` for a silent renewal.
 */
export async function google({
  loginHint,
  interactive,
}: {
  loginHint?: string;
  interactive: boolean;
}): Promise<Credentials> {
  const state = random(16);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId('google'),
    response_type: 'token',
    redirect_uri: redirectUri('google'),
    scope: GOOGLE_SCOPE,
    state,
    include_granted_scopes: 'true',
    prompt: interactive ? 'select_account' : 'none',
    ...(loginHint ? {login_hint: loginHint} : {}),
  }).toString();
  const result = new URLSearchParams((await launch(url, 'google', interactive)).hash.slice(1));
  if (result.get('state') !== state) throw new Error('Ответ входа Google не прошёл проверку.');
  if (result.get('error')) {
    if (!interactive) throw new AuthError();
    throw new Error('Google отклонил вход.');
  }
  const expiresIn = Number(result.get('expires_in')) || 3600;
  return {token: token(result.get('access_token')), expiresAt: Date.now() + (expiresIn - 60) * 1000};
}

/**
 * Signs in to Microsoft with PKCE.
 *
 * @param options.loginHint The account address to preselect.
 */
export async function microsoft({loginHint}: {loginHint?: string} = {}): Promise<Credentials> {
  const state = random(16);
  const verifier = random(32);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const url = new URL(`${MICROSOFT}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId('microsoft'),
    response_type: 'code',
    redirect_uri: redirectUri('microsoft'),
    scope: MICROSOFT_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    ...(loginHint ? {login_hint: loginHint} : {}),
  }).toString();
  const result = (await launch(url, 'microsoft', true)).searchParams;
  if (result.get('state') !== state) throw new Error('Ответ входа Microsoft не прошёл проверку.');
  const code = result.get('code');
  if (!code) throw new Error('Microsoft отклонил вход.');
  return microsoftToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri('microsoft'),
    code_verifier: verifier,
  });
}

/**
 * Exchanges a Microsoft refresh token for a new access token.
 *
 * @param refreshToken The stored refresh token.
 * @throws {AuthError} When the refresh token is no longer valid.
 */
export async function microsoftRefresh(refreshToken: string): Promise<Credentials> {
  try {
    return await microsoftToken({grant_type: 'refresh_token', refresh_token: refreshToken}, refreshToken);
  } catch (error) {
    if (error instanceof HttpError && error.status >= 400 && error.status < 500) throw new AuthError();
    throw error;
  }
}

/** Posts to the Microsoft token endpoint and validates the credentials. */
async function microsoftToken(parameters: Record<string, string>, previousRefresh = ''): Promise<Credentials> {
  const value = await requestJSON<{access_token?: unknown; refresh_token?: unknown; expires_in?: unknown}>(
    `${MICROSOFT}/token`,
    {
      method: 'POST',
      form: {client_id: clientId('microsoft'), scope: MICROSOFT_SCOPE, ...parameters},
      service: 'Microsoft',
    },
  );
  const expiresIn = Number(value?.expires_in) || 3600;
  return {
    token: token(value?.access_token),
    refreshToken: typeof value?.refresh_token === 'string' ? token(value.refresh_token) : previousRefresh,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };
}
