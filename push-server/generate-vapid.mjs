import { generateKeyPairSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function padCoordinate32(bytes) {
  if (bytes.length === 32) return bytes;
  if (bytes.length > 32) {
    throw new Error(`Invalid P-256 coordinate length: ${bytes.length}`);
  }
  const padded = Buffer.alloc(32);
  bytes.copy(padded, 32 - bytes.length);
  return padded;
}

export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });

  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  const x = padCoordinate32(Buffer.from(pubJwk.x, 'base64url'));
  const y = padCoordinate32(Buffer.from(pubJwk.y, 'base64url'));
  const d = padCoordinate32(Buffer.from(privJwk.d, 'base64url'));

  // RFC 8292 / X9.62 uncompressed EC point: 0x04 || X (32B) || Y (32B).
  const uncompressedPublic = Buffer.concat([Buffer.from([0x04]), x, y]);

  return {
    publicKey: uncompressedPublic.toString('base64url'),
    privateKey: d.toString('base64url')
  };
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const keys = generateVapidKeys();

  console.log('\nHydroTrack VAPID Keys (ECDSA P-256)\n');
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}\n`);
  console.log('Simpan kedua kunci ini sebagai secret di Cloudflare Workers:');
  console.log('  cd push-server');
  console.log('  npx wrangler secret put VAPID_PUBLIC_KEY');
  console.log('  npx wrangler secret put VAPID_PRIVATE_KEY\n');
  console.log('Catatan keamanan: jangan pernah membagikan atau meng-commit VAPID_PRIVATE_KEY ke Git.\n');
}
