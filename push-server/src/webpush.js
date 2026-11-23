const TEXT_ENCODER = new TextEncoder();
const HKDF_ONE = new Uint8Array([0x01]);
const RECORD_DELIMITER_FINAL = new Uint8Array([0x02]);
const DEFAULT_RECORD_SIZE = 4096;
const VAPID_EXPIRY_SECONDS = 12 * 60 * 60;

export function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input) {
  const normalized = String(input || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function concatBytes(...arrays) {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.byteLength;
  }
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    output.set(arr, offset);
    offset += arr.byteLength;
  }
  return output;
}

function padBytesLeft(bytes, length) {
  if (bytes.length === length) return bytes;
  if (bytes.length > length) {
    throw new Error(`Expected at most ${length} bytes, received ${bytes.length}`);
  }
  const padded = new Uint8Array(length);
  padded.set(bytes, length - bytes.length);
  return padded;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

function normalizeVapidSubject(subject) {
  const raw = String(subject || 'mailto:admin@hydrotrack.app').trim();
  if (raw.startsWith('mailto:') || raw.startsWith('https://')) {
    return raw;
  }
  if (raw.includes('@')) {
    return `mailto:${raw}`;
  }
  return 'mailto:admin@hydrotrack.app';
}

async function importVapidPrivateKey(publicKeyB64, privateKeyB64) {
  const pubBytes = base64UrlDecode(publicKeyB64);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Invalid VAPID public key: expected 65-byte uncompressed P-256 point.');
  }

  const privBytes = padBytesLeft(base64UrlDecode(privateKeyB64), 32);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(pubBytes.subarray(1, 33)),
    y: base64UrlEncode(pubBytes.subarray(33, 65)),
    d: base64UrlEncode(privBytes),
    ext: true
  };

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

export async function createVapidAuthHeader(endpoint, vapidConfig, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!vapidConfig?.publicKey || !vapidConfig?.privateKey) {
    throw new Error('VAPID publicKey and privateKey are required.');
  }

  const publicKey = String(vapidConfig.publicKey).trim().replace(/=+$/, '');
  const privateKey = String(vapidConfig.privateKey).trim().replace(/=+$/, '');
  const audience = new URL(endpoint).origin;
  const subject = normalizeVapidSubject(vapidConfig.subject);

  const headerB64 = base64UrlEncode(TEXT_ENCODER.encode(JSON.stringify({
    typ: 'JWT',
    alg: 'ES256'
  })));

  const payloadB64 = base64UrlEncode(TEXT_ENCODER.encode(JSON.stringify({
    aud: audience,
    exp: nowSeconds + VAPID_EXPIRY_SECONDS,
    sub: subject
  })));

  const signingInput = `${headerB64}.${payloadB64}`;
  const signingKey = await importVapidPrivateKey(publicKey, privateKey);

  // Web Crypto ECDSA returns IEEE P1363 raw r||s (64 bytes for P-256), matching JWS ES256 directly.
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    TEXT_ENCODER.encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signatureBuffer))}`;
  return {
    jwt,
    publicKey,
    authorization: `vapid t=${jwt}, k=${publicKey}`
  };
}

export async function encryptWebPushPayload(subscription, payload, options = {}) {
  if (!subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Subscription keys.p256dh and keys.auth are required.');
  }

  const uaPublic = base64UrlDecode(subscription.keys.p256dh);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('Invalid subscriber p256dh key.');
  }

  const authSecret = base64UrlDecode(subscription.keys.auth);
  if (authSecret.length !== 16) {
    throw new Error('Invalid subscriber auth secret.');
  }

  const plaintextBytes = typeof payload === 'string'
    ? TEXT_ENCODER.encode(payload)
    : payload instanceof Uint8Array
      ? payload
      : TEXT_ENCODER.encode(JSON.stringify(payload));

  const recordSize = options.recordSize ?? DEFAULT_RECORD_SIZE;
  const paddedPlaintext = concatBytes(plaintextBytes, RECORD_DELIMITER_FINAL);
  if (paddedPlaintext.length + 16 > recordSize) {
    throw new Error('Web Push payload exceeds single aes128gcm record limit.');
  }

  const asKeyPair = options.asKeyPair || await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256
    )
  );

  const salt = options.salt
    ? new Uint8Array(options.salt)
    : crypto.getRandomValues(new Uint8Array(16));

  if (salt.length !== 16) {
    throw new Error('Salt must be exactly 16 bytes.');
  }

  // RFC 8291 Section 3.3: combine ECDH secret with subscriber auth secret.
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(TEXT_ENCODER.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hmacSha256(prkKey, concatBytes(keyInfo, HKDF_ONE));

  // RFC 8291 Section 3.4 / RFC 8188: derive content encryption key and nonce.
  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(
    prk,
    concatBytes(TEXT_ENCODER.encode('Content-Encoding: aes128gcm\0'), HKDF_ONE)
  )).slice(0, 16);
  const nonce = (await hmacSha256(
    prk,
    concatBytes(TEXT_ENCODER.encode('Content-Encoding: nonce\0'), HKDF_ONE)
  )).slice(0, 12);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      aesKey,
      paddedPlaintext
    )
  );

  // RFC 8188 header: salt (16B) || rs (4B uint32 BE) || idlen (1B = 65) || as_public (65B).
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concatBytes(header, ciphertext);
}

export async function sendWebPush(subscription, payloadObj, vapidConfig, options = {}) {
  if (!subscription?.endpoint) {
    return { ok: false, status: 400, expired: false, errorText: 'Missing subscription endpoint.' };
  }

  try {
    const [{ authorization }, encryptedBody] = await Promise.all([
      createVapidAuthHeader(subscription.endpoint, vapidConfig),
      encryptWebPushPayload(subscription, payloadObj)
    ]);

    const ttl = Number.isFinite(options.ttl) ? Math.max(0, Math.round(options.ttl)) : 300;
    const urgency = options.urgency || 'high';
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': String(ttl),
      'Urgency': urgency,
      'Authorization': authorization
    };

    if (options.topic) {
      headers['Topic'] = String(options.topic).slice(0, 32);
    }

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: encryptedBody
    });

    const expired = response.status === 404 || response.status === 410;
    let errorText = '';
    if (!response.ok) {
      errorText = (await response.text().catch(() => '')).trim().slice(0, 300);
    }

    return {
      ok: response.ok,
      status: response.status,
      expired,
      errorText
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      expired: false,
      errorText: err instanceof Error ? err.message : String(err)
    };
  }
}
