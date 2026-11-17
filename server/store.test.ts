import test from 'node:test';
import assert from 'node:assert/strict';
import { VaultStore } from './store';

test('SQLite WAL VaultStore isolates 100+ parallel user syncs and tracks admin stats cleanly', () => {
  const store = new VaultStore(undefined, ':memory:');

  const createdUsers = Array.from({ length: 105 }, (_, i) =>
    store.createUser({
      email: `user${i}@opennote.test`,
      name: `User ${i}`,
      passwordHash: `hash_${i}`,
      vaultSalt: `salt_${i}`,
      authProvider: i % 2 === 0 ? 'google' : 'password',
    }),
  );

  // Parallel-style sync across all 105 users
  for (let i = 0; i < createdUsers.length; i += 1) {
    const u = createdUsers[i];
    const synced = store.syncVault(
      u.id,
      [
        {
          id: `note_${i}`,
          iv: 'iv123',
          ciphertext: `cipher_${i}`,
          updatedAt: Date.now(),
          version: 1,
        },
      ],
      [
        {
          id: `fld_${i}`,
          iv: 'iv456',
          ciphertext: `fcipher_${i}`,
          updatedAt: Date.now(),
          version: 1,
        },
      ],
    );
    assert.equal(synced.notes.length, 1);
    assert.equal(synced.notes[0].ciphertext, `cipher_${i}`);
  }

  store.createMcpToken(createdUsers[0].id, 'LM Studio', 'mcp_lm1', 'hash_tok_0');

  // Password reset token single-use verification
  store.createPasswordResetToken(createdUsers[0].id, createdUsers[0].email, 'reset_hash_abc');
  assert.equal(store.consumePasswordResetToken('wrong@opennote.test', 'reset_hash_abc'), null);
  store.createPasswordResetToken(createdUsers[0].id, createdUsers[0].email, 'reset_hash_def');
  assert.equal(
    store.consumePasswordResetToken(createdUsers[0].email, 'reset_hash_def'),
    createdUsers[0].id,
  );
  // Single-use: second consume returns null
  assert.equal(store.consumePasswordResetToken(createdUsers[0].email, 'reset_hash_def'), null);

  const report = store.getAdminReport(7);
  assert.equal(report.totalUsers, 105);
  assert.equal(report.activeUsers, 105);
  assert.equal(report.inactiveUsers, 0);
  assert.equal(report.totalEncryptedNotes, 105);
  assert.equal(report.totalEncryptedFolders, 105);
  assert.equal(report.totalMcpTokens, 1);
  assert.equal(report.users.every((u) => u.active === true && u.status === 'active'), true);
  const firstUserSummary = report.users.find((u) => u.id === createdUsers[0].id);
  assert.equal(firstUserSummary?.mcpTokenCount, 1);
});
