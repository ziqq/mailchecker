/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Google sign-in through Chrome Identity and Microsoft web OAuth with PKCE.
 *
 * - Google: Chrome owns token expiration; stored account IDs bind silent
 *   renewal to the chosen mailbox rather than the profile's default account.
 * - Microsoft: authorization code with SHA-256 PKCE and refresh tokens.
 *
 * Google account selection verifies a signed OpenID identity before requesting
 * native Gmail access. Web flows check state and the exact callback URL.
 * No client secret is shipped.
 *
 * @module background/oauth/flow
 */
import type {Credentials} from '../../shared/types';
import {AuthError, HTTPError, requestJSON} from '../http';
import {
  forgetGoogleToken,
  googleAuthToken,
  hasGoogleIdentity,
  hasIdentity,
  supportsIdentity,
  webAuthFlow,
} from '../platform';
import {oauthConfig as config} from './config';
import {googleSubject} from './google-identity';
import {t} from '../../shared/i18n';

/** OAuth providers. */
export type OAuthProvider = 'google' | 'microsoft';

/** Gmail scope: read, mark read, move to Trash and send replies. */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

/** Retrieves the stable Google account ID needed to renew multiple mailboxes independently. */
export const GOOGLE_IDENTITY_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

/** Microsoft Graph scopes; `offline_access` returns a refresh token, `Mail.Send` sends replies. */
export const MICROSOFT_SCOPE = 'offline_access openid email User.Read Mail.ReadWrite Mail.Send';

/** Microsoft identity platform endpoints for work, school and personal accounts. */
const MICROSOFT = 'https://login.microsoftonline.com/common/oauth2/v2.0';

/** Returns whether a provider has a client ID in this build. */
export function available(provider: OAuthProvider): boolean {
  return (
    supportsIdentity() &&
    /^[\w.-]{8,256}$/.test(config[provider]) &&
    (provider !== 'google' || /^[\w.-]{8,256}$/.test(config.googleSelection))
  );
}

/** Returns the exact registered web callback, including Google's identity-only account selector. */
export function redirectURI(provider: OAuthProvider): string {
  if (hasIdentity()) return chrome.identity.getRedirectURL(provider);
  return supportsIdentity() ? `https://${chrome.runtime.id}.chromiumapp.org/${provider}` : '';
}

/** Returns the client ID or throws a user-facing error. */
function clientID(provider: OAuthProvider): string {
  if (!(provider === 'google' ? hasGoogleIdentity() : hasIdentity())) throw new Error(t('error_oauth_safari'));
  if (!available(provider)) throw new Error(t('error_oauth_unconfigured'));
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
    result = new URL(await webAuthFlow(url.toString(), interactive));
  } catch {
    if (!interactive) throw new AuthError();
    throw new Error(t('error_oauth_cancelled'));
  }
  if (result.origin + result.pathname !== redirectURI(provider) || result.username || result.password)
    throw new Error(t('error_oauth_redirect'));
  return result;
}

/** Selects a Google identity without requesting Gmail access or relying on Chrome's default account. */
async function selectGoogleAccount(): Promise<string> {
  if (!hasIdentity()) throw new Error(t('error_oauth_safari'));
  const state = random(32);
  const nonce = random(32);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.googleSelection,
    redirect_uri: redirectURI('google'),
    response_type: 'id_token',
    scope: 'openid email',
    prompt: 'select_account',
    state,
    nonce,
  }).toString();
  const callback = await launch(url, 'google', true);
  const result = new URLSearchParams(callback.hash.slice(1));
  if (callback.search || result.getAll('state').length !== 1 || result.get('state') !== state)
    throw new Error(t('error_oauth_state', 'Google'));
  if (result.has('error')) throw new Error(t('error_oauth_denied', 'Google'));
  if (result.getAll('id_token').length !== 1) throw new Error(t('error_oauth_token'));
  return googleSubject(result.get('id_token') || '', config.googleSelection, nonce);
}

/** Validates a bearer token value. */
function token(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 8192 || /\s/.test(value))
    throw new Error(t('error_oauth_token'));
  return value;
}

/**
 * Signs in to Google.
 *
 * @param options.credentials Existing mailbox credentials for account-specific renewal.
 * @param options.interactive `false` for a silent renewal.
 */
export async function google({
  credentials,
  interactive,
}: {
  credentials?: Credentials;
  interactive: boolean;
}): Promise<Credentials> {
  clientID('google');
  let accountID = credentials?.googleAccountID;
  if (!interactive && !accountID) throw new AuthError();
  if (interactive && !accountID) accountID = await selectGoogleAccount();
  let result: chrome.identity.GetAuthTokenResult;
  try {
    if (!interactive && credentials?.token) await forgetGoogleToken(credentials.token);
    result = await googleAuthToken(interactive, accountID);
  } catch {
    if (!interactive) throw new AuthError();
    throw new Error(t('error_oauth_cancelled'));
  }
  const accessToken = token(result.token);
  if (![GOOGLE_SCOPE, GOOGLE_IDENTITY_SCOPE].every(scope => result.grantedScopes?.includes(scope)))
    throw new Error(t('error_oauth_denied', 'Google'));
  const profile = await requestJSON<{id?: unknown}>('https://www.googleapis.com/oauth2/v2/userinfo', {
    token: accessToken,
    service: 'Google',
  });
  if (typeof profile?.id !== 'string' || !/^[\w-]{1,255}$/.test(profile.id)) throw new Error(t('error_oauth_token'));
  if (accountID && accountID !== profile.id) throw new AuthError();
  return {token: accessToken, googleAccountID: profile.id};
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
    client_id: clientID('microsoft'),
    response_type: 'code',
    redirect_uri: redirectURI('microsoft'),
    scope: MICROSOFT_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    ...(loginHint ? {login_hint: loginHint} : {}),
  }).toString();
  const result = (await launch(url, 'microsoft', true)).searchParams;
  if (result.get('state') !== state) throw new Error(t('error_oauth_state', 'Microsoft'));
  const code = result.get('code');
  if (!code) throw new Error(t('error_oauth_denied', 'Microsoft'));
  return microsoftToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectURI('microsoft'),
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
    if (error instanceof HTTPError && error.status >= 400 && error.status < 500) throw new AuthError();
    throw error;
  }
}

/** Posts to the Microsoft token endpoint and validates the credentials. */
async function microsoftToken(parameters: Record<string, string>, previousRefresh = ''): Promise<Credentials> {
  const value = await requestJSON<{access_token?: unknown; refresh_token?: unknown; expires_in?: unknown}>(
    `${MICROSOFT}/token`,
    {
      method: 'POST',
      form: {client_id: clientID('microsoft'), scope: MICROSOFT_SCOPE, ...parameters},
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
