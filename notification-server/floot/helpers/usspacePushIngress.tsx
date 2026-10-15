// @ts-nocheck
// This boundary deliberately contains portable JavaScript so its real stream handling
// is exercised without Firebase credentials, network access, or a deployed endpoint.
export const usspacePushIngress = (() => {
  const MAX_BODY_BYTES = 2048;
  const failure = (status, error) => ({status, body: {error}});
  async function read(request) {
    if (request.method !== 'POST') return failure(405, 'method-not-allowed');
    const authorization = request.headers.get('authorization');
    // Firebase ID tokens are three unpadded base64url segments. The relay still verifies
    // the signature, revocation, issuer and audience; syntax alone grants no access.
    if (typeof authorization !== 'string' || authorization.length > 16384
      || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))
      return failure(401, 'authentication-required');
    const declared = request.headers.get('content-length');
    if (declared !== null) {
      if (!/^\d+$/.test(declared)) return failure(400, 'invalid-request');
      if (Number(declared) > MAX_BODY_BYTES) return failure(413, 'request-too-large');
    }
    if (!request.body || typeof request.body.getReader !== 'function') return failure(400, 'invalid-request');
    let reader;
    try {
      reader = request.body.getReader();
      const chunks = []; let length = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) return failure(400, 'invalid-request');
        length += value.byteLength;
        if (length > MAX_BODY_BYTES) {
          // Do not read the rest or await an untrusted producer's cancellation hook.
          try {Promise.resolve(reader.cancel()).catch(() => {});} catch (_) { }
          return failure(413, 'request-too-large');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
      const body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
      const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
        || !Object.hasOwn(body, 'coupleId') || !Object.hasOwn(body, 'eventId')
        || !id(body.coupleId) || !id(body.eventId) || body.eventId.length > 140) return failure(400, 'invalid-request');
      return {status: 200, authorization, body};
    } catch (_) {return failure(400, 'invalid-request');}
    finally {try {reader?.releaseLock();} catch (_) { }}
  }
  return {read, MAX_BODY_BYTES};
})();
