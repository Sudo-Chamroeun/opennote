import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptPayload,
  deriveVaultKey,
  encryptPayload,
  exportVaultKeyJwk,
  generateSaltBase64,
  importVaultKeyJwk,
} from './crypto';

test('AES-256-GCM encryption and PBKDF2 key derivation round-trip cleanly', async () => {
  const salt = generateSaltBase64();
  const key = await deriveVaultKey('correct-horse-battery-staple', salt);
  const original = {
    title: 'Encrypted Architecture',
    content: 'Secret #vault note with ==highlights==',
  };

  const { iv, ciphertext } = await encryptPayload(key, original);
  assert.notEqual(ciphertext, JSON.stringify(original));

  const decrypted = await decryptPayload<typeof original>(key, iv, ciphertext);
  assert.deepEqual(decrypted, original);

  const jwk = await exportVaultKeyJwk(key);
  const restored = await importVaultKeyJwk(jwk);
  const decryptedAfterRestore = await decryptPayload<typeof original>(restored, iv, ciphertext);
  assert.deepEqual(decryptedAfterRestore, original);
});

test('decryption fails with wrong passphrase', async () => {
  const salt = generateSaltBase64();
  const rightKey = await deriveVaultKey('right-passphrase', salt);
  const wrongKey = await deriveVaultKey('wrong-passphrase', salt);

  const { iv, ciphertext } = await encryptPayload(rightKey, { secret: 42 });
  await assert.rejects(() => decryptPayload(wrongKey, iv, ciphertext));
});
