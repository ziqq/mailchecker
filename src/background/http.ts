/**
 * Bounded HTTP requests shared by the mail providers and OAuth flows.
 *
 * Every request omits cookies, refuses redirects and times out, and every
 * body is streamed with a byte limit so an unexpected response cannot
 * exhaust memory.
 *
 * @module background/http
 */

/** Request timeout in milliseconds. */
const TIMEOUT = 25000;

/** Default response limit: 4 MiB is far above a page of message metadata. */
const LIMIT = 4 * 1024 * 1024;

/** An expired or revoked credential; the account needs a new sign-in. */
export class AuthError extends Error {
  readonly reauth = true;

  constructor(message = 'Сессия истекла. Войдите заново.') {
    super(message);
  }
}

/** A non-success HTTP status with its parsed body. */
export class HttpError extends Error {
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
  const tooLarge = 'Сервер вернул слишком большой ответ.';
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
  /** The service name used in error messages. */
  service?: string;
}

/**
 * Sends a request and parses its bounded JSON reply.
 *
 * Replies are untyped server data: callers validate the fields they use.
 *
 * @param url The absolute HTTPS URL.
 * @param options Method, credentials and body.
 * @returns The parsed body, or `null` for an empty reply.
 * @throws {AuthError} On 401 or 403 when a token was sent.
 * @throws {HttpError} On other failures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestJSON<T = any>(
  url: string,
  {method = 'GET', token, json, form, service = 'Сервер'}: RequestOptions = {},
): Promise<T> {
  if (new URL(url).protocol !== 'https:') throw new Error('Разрешены только HTTPS-адреса.');
  const headers: Record<string, string> = {Accept: 'application/json'};
  let body: string | undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (error) {
    throw new Error(
      (error as Error)?.name === 'TimeoutError'
        ? `${service} не ответил вовремя.`
        : `${service} недоступен. Проверьте сеть.`,
      {cause: error},
    );
  }
  if (token && (response.status === 401 || response.status === 403)) {
    await response.body?.cancel().catch(() => {});
    throw new AuthError();
  }
  const text = await responseText(response);
  let value: unknown = null;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new Error(`${service} вернул некорректный ответ.`);
  }
  if (!response.ok) throw new HttpError(`${service}: ошибка ${response.status}.`, response.status, value);
  return value as T;
}
