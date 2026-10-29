/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Signed OpenID account-selection boundaries using real cryptography and bounded HTTP.
 *
 * @module tests/google-identity
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createContext, runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {googleKey, googleToken} from './helpers/google.mjs';

/** Real validator and HTTP layer, compiled once and isolated for each test. */
const bundle = (
  await build({
    absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
    entryPoints: ['src/background/oauth/google-identity.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'subject',
    write: false,
  })
).outputFiles[0].text;

/** Loads the validator with an observable key server and a controllable clock. */
function validator({jwks = {keys: [googleKey]}, afterFetch = () => {}, now = Date.now()} = {}) {
  const calls = [];
  const clock = {now};
  const context = createContext({
    crypto,
    atob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
    Date: class extends Date {
      static now() {
        return clock.now;
      }
    },
    async fetch(input, init) {
      calls.push(input);
      assert.equal(input, 'https://www.googleapis.com/oauth2/v3/certs');
      assert.equal(init.credentials, 'omit');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, undefined);
      afterFetch(clock);
      return new Response(JSON.stringify(jwks));
    },
  });
  runInContext(bundle, context);
  return {read: value => context.subject.googleSubject(value, 'test-selection-id', 'test-nonce'), calls};
}

test('Google selection accepts only a correctly signed identity for this audience and nonce', async () => {
  for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
    const v = validator();
    assert.equal(await v.read(await googleToken({claims: {iss, azp: 'test-selection-id'}})), 'google-account');
    assert.equal(v.calls.length, 1);
  }
});

test('Google selection rejects malformed or oversized tokens before fetching keys', async () => {
  const valid = await googleToken();
  const [, payload, signature] = valid.split('.');
  const encode = value => Buffer.from(value).toString('base64url');
  const invalid = [
    '',
    'x'.repeat(16385),
    'one.two',
    `${valid}.extra`,
    `${valid}=`,
    `${encode('[]')}.${payload}.${signature}`,
    `${encode('null')}.${payload}.${signature}`,
    `${encode('{')}.${payload}.${signature}`,
    `${Buffer.from([0xff]).toString('base64url')}.${payload}.${signature}`,
    `${valid.split('.')[0]}.${encode('false')}.${signature}`,
  ];
  for (const value of invalid) {
    const v = validator();
    await assert.rejects(v.read(value));
    assert.equal(v.calls.length, 0);
  }
});

test('Google selection rejects signed but invalid algorithm, issuer, audience, nonce and time claims', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    {header: {alg: 'none'}},
    {header: {alg: 'HS256'}},
    {header: {kid: ''}},
    {header: {kid: 'x'.repeat(129)}},
    {header: {crit: ['custom']}},
    ...[
      {iss: 'https://accounts.google.com.evil.test'},
      {aud: 'another-client'},
      {aud: ['test-selection-id']},
      {azp: 'another-client'},
      {nonce: 'another-transaction'},
      {nonce: undefined},
      {exp: now - 1},
      {exp: String(now + 3600)},
      {exp: now + 100.5},
      {iat: now + 120},
      {iat: 0},
      {iat: String(now)},
      {iat: now + 20, exp: now + 10},
      {sub: ''},
      {sub: 123},
      {sub: 'x'.repeat(256)},
      {sub: 'account/path'},
    ].map(claims => ({claims})),
  ];
  for (const options of cases) {
    const v = validator();
    await assert.rejects(v.read(await googleToken(options)), JSON.stringify(options));
    assert.equal(v.calls.length, 0);
  }
});

test('Google selection verifies the signature instead of trusting decoded claims', async () => {
  const parts = (await googleToken()).split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  parts[1] = Buffer.from(JSON.stringify({...claims, sub: 'substituted-account'})).toString('base64url');
  const v = validator();
  await assert.rejects(v.read(parts.join('.')));
  assert.equal(v.calls.length, 1);
});

test('Google selection never follows token-supplied key URLs', async () => {
  const v = validator();
  assert.equal(
    await v.read(await googleToken({header: {jku: 'https://evil.test/keys', x5u: 'https://evil.test/cert'}})),
    'google-account',
  );
  assert.deepEqual(v.calls, ['https://www.googleapis.com/oauth2/v3/certs']);
});

test('Google selection rejects missing, ambiguous, excessive or unusable signing keys', async () => {
  const value = await googleToken();
  const cases = [
    null,
    {},
    {keys: {}},
    {keys: []},
    {keys: Array(11).fill(googleKey)},
    {keys: [googleKey, googleKey]},
    ...[
      {kid: 'unrecognized'},
      {kty: 'EC'},
      {alg: 'HS256'},
      {use: 'enc'},
      {n: ''},
      {n: 'x'.repeat(1025)},
      {e: 'x'.repeat(9)},
      {e: '!'},
      {n: 'AA', e: 'AQAB'},
    ].map(key => ({keys: [{...googleKey, ...key}]})),
  ];
  for (const jwks of cases) await assert.rejects(validator({jwks}).read(value));
});

test('Google selection rechecks expiry after awaiting the key server', async () => {
  const now = Date.now();
  const iat = Math.floor(now / 1000);
  const value = await googleToken({claims: {iat, exp: iat + 10}});
  const v = validator({now, afterFetch: clock => (clock.now += 20000)});
  await assert.rejects(v.read(value));
  assert.equal(v.calls.length, 1);
});
