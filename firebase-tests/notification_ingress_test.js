'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const file = relative => fs.readFileSync(path.join(root, relative), 'utf8');
// The production TSX boundary contains portable JS; import its exact shipped bytes.
const production = file('notification-server/floot/helpers/usspacePushIngress.tsx');
const boundary = import('data:text/javascript;base64,' + Buffer.from(production).toString('base64')).then(module => module.usspacePushIngress);
const bearer = 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJ1c3NwYWNlLWM4NTllIn0.signature';
const valid = JSON.stringify({coupleId: 'our-space', eventId: 'event-1'});
function request(text = valid, options = {}) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const chunks = options.chunks || [bytes];
  let reads = 0, cancelled = false, released = false, requested = false;
  const headers = new Map([['authorization', options.authorization === undefined ? bearer : options.authorization]]);
  if (options.length !== undefined) headers.set('content-length', options.length);
  const reader = {async read() {if (options.fail) throw new Error('PRIVATE_STREAM_SECRET'); return reads < chunks.length ? {done: false, value: chunks[reads++]} : (reads++, {done: true});},
    cancel() {cancelled = true; return options.pendingCancel ? new Promise(() => {}) : Promise.resolve();}, releaseLock() {released = true;}};
  const value = {method: options.method || 'POST', headers: {get: name => headers.get(name) ?? null},
    get body() {requested = true; if (options.forbidBody) throw new Error('Body must not be touched'); return {getReader: () => reader};}};
  return {value, reads: () => reads, cancelled: () => cancelled, released: () => released, requested: () => requested};
}
test('ingress rejects missing or malformed authorization before reading any body', async () => {
  const ingress = await boundary;
  for (const authorization of [null, '', 'Basic abc', 'Bearer abc', 'Bearer a.b', 'Bearer a.b.c.d', 'Bearer a.b.c ', 'Bearer a.b.c, Bearer d.e.f', 'Bearer ' + 'a'.repeat(16384)]) {
    const r = request(valid, {authorization, forbidBody: true, length: '99999999999999'});
    assert.equal((await ingress.read(r.value)).status, 401, String(authorization).slice(0, 35));
    assert.equal(r.requested(), false); assert.equal(r.reads(), 0);
  }
});
test('ingress accepts only POST and never reads bodies for an unsupported method', async () => {
  const ingress = await boundary;
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const r = request(valid, {method, forbidBody: true});
    assert.equal((await ingress.read(r.value)).status, 405); assert.equal(r.requested(), false);
  }
});
test('valid bounded requests preserve the exact auth header and pair/event IDs for full token verification', async () => {
  const ingress = await boundary, r = request();
  const result = await ingress.read(r.value);
  assert.equal(result.status, 200); assert.equal(result.authorization, bearer);
  assert.deepEqual(result.body, {coupleId: 'our-space', eventId: 'event-1'}); assert.equal(r.released(), true);
});
test('content-length is only an early bound and cannot bypass the streamed byte limit', async () => {
  const ingress = await boundary;
  for (const length of ['2049', '9999999999999999999999999']) {
    const r = request(valid, {length, forbidBody: true});
    assert.equal((await ingress.read(r.value)).status, 413); assert.equal(r.requested(), false);
  }
  for (const length of ['', '-1', '1e3', '2048.0', 'not-a-number']) {
    const r = request(valid, {length, forbidBody: true});
    assert.equal((await ingress.read(r.value)).status, 400); assert.equal(r.requested(), false);
  }
  const dishonest = request(valid + ' '.repeat(2049), {length: '1'});
  assert.equal((await ingress.read(dishonest.value)).status, 413); assert.equal(dishonest.cancelled(), true);
});
test('2048 actual bytes are allowed and 2049 bytes stop consumption and cancel the stream', async () => {
  const ingress = await boundary;
  const exact = request(valid + ' '.repeat(2048 - Buffer.byteLength(valid)));
  assert.equal((await ingress.read(exact.value)).status, 200);
  assert.equal(exact.cancelled(), false); assert.equal(exact.released(), true);
  const chunks = [new Uint8Array(1024), new Uint8Array(1024), new Uint8Array(1), new Uint8Array(10000)];
  const oversized = request('', {chunks, pendingCancel: true});
  assert.equal((await ingress.read(oversized.value)).status, 413);
  assert.equal(oversized.reads(), 3); assert.equal(oversized.cancelled(), true); assert.equal(oversized.released(), true);
});
test('the bound counts UTF-8 bytes rather than JavaScript characters', async () => {
  const ingress = await boundary, text = JSON.stringify({coupleId: 's', eventId: 'é'.repeat(1020)});
  assert.ok(text.length < 2048); assert.ok(Buffer.byteLength(text) > 2048);
  assert.equal((await ingress.read(request(text).value)).status, 413);
});
test('stream errors, malformed UTF-8, invalid JSON and private/arbitrary request fields fail with fixed errors', async () => {
  const ingress = await boundary;
  const samples = ['', 'not json', 'null', '[]', JSON.stringify({coupleId: '../secret', eventId: 'event-1'}),
    JSON.stringify({coupleId: 's', eventId: 'x'.repeat(141)}), JSON.stringify({coupleId: 's', eventId: 'e', body: 'PRIVATE_SECRET'}),
    Uint8Array.from([0xc3, 0x28])];
  for (const sample of samples) assert.deepEqual(await ingress.read(request(sample).value), {status: 400, body: {error: 'invalid-request'}});
  const r = request(valid, {fail: true});
  assert.deepEqual(await ingress.read(r.value), {status: 400, body: {error: 'invalid-request'}});
  assert.equal(r.released(), true);
});
test('all three disabled legacy build endpoints always return 410 without reading a request', async () => {
  for (const name of ['build-private_POST.ts', 'build-private-url_POST.ts', 'build-upload_POST.ts']) {
    const source = file('notification-server/floot/endpoints/' + name);
    // These production files contain only JS and no imports, secret/environment,
    // filesystem, storage, signing, or other helper dependencies.
    assert.doesNotMatch(source, /\b(?:import|process|require|fetch)\b/);
    const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const response = await module.handle(new Proxy({}, {get() {throw new Error('Request must not be read');}}));
    assert.equal(response.status, 410); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {error: 'endpoint-disabled'});
  }
});
test('the service gates expensive capability work on bounded authenticated ingress and preserves verified relay auth', () => {
  const source = file('notification-server/floot/helpers/usspacePushService.tsx');
  const body = source.slice(source.indexOf('async function handle(request: Request)'));
  assert.ok(body.indexOf('usspacePushIngress.read(request)') < body.indexOf('await capabilities()'));
  assert.ok(body.indexOf('if (ingress.status !== 200) return ingress') < body.indexOf('await capabilities()'));
  assert.match(body, /authorization: ingress\.authorization, body: ingress\.body/);
  assert.doesNotMatch(body, /request\.(?:text|json|arrayBuffer)\(/);
  const relay = file('notification-server/floot/helpers/usspacePushRelayCore.tsx');
  assert.match(relay, /auth\.verifyIdToken\(token, true\)/);
  assert.match(relay, /decoded\.aud !== projectId/); assert.match(relay, /decoded\.iss !==/);
});
