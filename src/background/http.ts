/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Bounded HTTP requests shared by the mail providers and OAuth flows.
 *
 * Every request refuses redirects and times out, and every body is streamed
 * with a byte limit so an unexpected response cannot exhaust memory. API
 * requests omit cookies; only session requests to the webmail hosts in
 * [SESSION_HOSTS] send the browser's own sign-in, for mailboxes read through
 * the browser.
 *
 * @module background/http
 */
import {t} from '../shared/i18n';

/** Request timeout in milliseconds. */
const TIMEOUT = 25000;

/** Default response limit: 4 MiB is far above a page of message metadata. */
const LIMIT = 4 * 1024 * 1024;

/** Webmail hosts that session requests may send the browser's cookies to. */
export const SESSION_HOSTS: readonly string[] = Object.freeze([
  'mail.google.com',
  'mail.yandex.ru',
  'e.mail.ru',
  'auth.mail.ru',
]);

/** An expired or revoked credential; the account needs a new sign-in. */
export class AuthError extends Error {
  readonly reauth = true;

  constructor(message = t('error_session_expired')) {
    super(message);
  }
}

/** A non-success HTTP status with its parsed body. */
export class HTTPError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

/**
 * Reads a response body up to [limit] bytes as strict UTF-8.
 *
 * @param response A fetch response.
 * @param limit Maximum body size in bytes.
 * @throws When the body is too large or not valid UTF-8.
 */
export async function responseText(response: Response, limit = LIMIT): Promise<string> {
  const tooLarge = t('error_too_large');
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel().catch(() => {});
    throw new Error(tooLarge);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new Error(tooLarge);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}

/** Options for [requestJSON]. */
export interface RequestOptions {
  method?: string;
  /** A bearer token; a 401/403 reply then raises [AuthError]. */
  token?: string;
  /** A body serialized as JSON. */
  json?: unknown;
  /** A body sent as `application/x-www-form-urlencoded`. */
  form?: Record<string, string>;
  /** A pre-serialized MIME request; still uses the same credential, timeout and response-size limits. */
  multipart?: {boundary: string; body: string};
  /** The service name used in error messages. */
  service?: string;
  /**
   * Sends the browser's cookies for a host in [SESSION_HOSTS] and follows its
   * redirects; a 401, or a redirect that leaves [SESSION_HOSTS] (to a
   * sign-in page), then raises [AuthError], and a 403/429 means the webmail
   * is limiting requests.
   */
  session?: boolean;
}

/** Sends a bounded request and returns the response with its text body. */
async function send(
  url: string,
  {method = 'GET', token, json, form, multipart, service = t('service_server'), session = false}: RequestOptions,
  accept: string,
): Promise<{response: Response; text: string}> {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error(t('error_https_only'));
  if (session && !SESSION_HOSTS.includes(target.hostname)) throw new Error(t('error_session_host'));
  if (session && !(await chrome.permissions.contains({origins: [`${target.origin}/*`]})))
    throw new Error(t('error_site_permission', service));
  const headers: Record<string, string> = {Accept: accept};
  let body: string | undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  } else if (multipart) {
    if (!/^[a-z0-9_-]{1,70}$/i.test(multipart.boundary)) throw new Error(t('error_bad_message'));
    headers['Content-Type'] = `multipart/mixed; boundary=${multipart.boundary}`;
    body = multipart.body;
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: session ? 'include' : 'omit',
      redirect: session ? 'follow' : 'error',
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError')
      throw new Error(session ? t('error_webmail_timeout', service) : t('error_timeout', service), {
        cause: error,
      });
    // A session request redirected to a sign-in host (no host permission there) fails like a network error.
    if (session) throw new AuthError(t('error_session_or_network', service));
    throw new Error(t('error_unreachable', service), {cause: error});
  }
  const signedOut = session && !SESSION_HOSTS.includes(new URL(response.url || url).hostname);
  // Webmail answers too frequent requests with 403/429 (Yandex: «Доступ к сервису временно запрещён»).
  if (session && !signedOut && (response.status === 403 || response.status === 429)) {
    await response.body?.cancel().catch(() => {});
    throw new Error(t('error_rate_limited', service));
  }
  if (signedOut || ((token || session) && (response.status === 401 || response.status === 403))) {
    await response.body?.cancel().catch(() => {});
    throw new AuthError(session ? t('error_sign_in_webmail', service) : undefined);
  }
  return {response, text: await responseText(response)};
}

/**
 * Sends a request and returns its bounded text reply (HTML, XML).
 *
 * @param url The absolute HTTPS URL.
 * @param options Method, session and body.
 * @throws {AuthError} When a session request is signed out.
 * @throws {HTTPError} On other failures.
 */
export async function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  const {response, text} = await send(url, options, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  if (!response.ok)
    throw new HTTPError(
      t('error_http_status', options.service || t('service_server'), response.status),
      response.status,
      null,
    );
  return text;
}

/**
 * Sends a request and parses its bounded JSON reply.
 *
 * Replies are untyped server data: callers validate the fields they use.
 *
 * @param url The absolute HTTPS URL.
 * @param options Method, credentials, session and body.
 * @returns The parsed body, or `null` for an empty reply.
 * @throws {AuthError} On 401 or 403 when a token was sent, or a signed-out session.
 * @throws {HTTPError} On other failures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestJSON<T = any>(url: string, options: RequestOptions = {}): Promise<T> {
  const service = options.service || t('service_server');
  const {response, text} = await send(url, options, 'application/json');
  let value: unknown = null;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new Error(t('error_bad_response', service));
  }
  if (!response.ok) throw new HTTPError(t('error_http_status', service, response.status), response.status, value);
  return value as T;
}
