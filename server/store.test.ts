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

test('MCP token rename and HTTPS folder/note sharing enforce read vs readwrite and two-way sync', () => {
  const store = new VaultStore(undefined, ':memory:');
  const owner = store.createUser({
    email: 'owner@opennote.test',
    name: 'Owner',
    passwordHash: 'hash_owner',
    vaultSalt: 'salt_owner',
  });

  // 1. MCP token rename
  const tok = store.createMcpToken(owner.id, 'Old Key Name', 'mcp_abc', 'tok_hash_abc');
  assert.equal(store.renameMcpToken(owner.id, tok.id, '   '), null);
  const renamed = store.renameMcpToken(owner.id, tok.id, 'Production Antigravity');
  assert.equal(renamed?.label, 'Production Antigravity');
  assert.equal(store.listMcpTokens(owner.id)[0]?.label, 'Production Antigravity');

  // 2. Read-only note share blocks writes
  const note1 = {
    id: 'note_shared_1',
    title: 'Design Spec',
    content: '# Hello World',
    folderId: 'fld_shared',
    tags: ['spec'],
    createdAt: 1000,
    updatedAt: 1000,
    version: 1,
  };
  const noteShare = store.upsertShareLink({
    ownerUserId: owner.id,
    targetType: 'note',
    targetId: note1.id,
    title: note1.title,
    permission: 'read',
    folders: [],
    notes: [note1],
  });
  const readWriteAttemptOnReadOnly = store.upsertPublicShareNote(noteShare.token, {
    ...note1,
    content: '# Tampered',
    version: 2,
  });
  assert.equal(readWriteAttemptOnReadOnly.status, 'forbidden');

  // Upgrade to readwrite and confirm visitor edit syncs back to owner
  const upgraded = store.updateUserShare(owner.id, noteShare.id, { permission: 'readwrite' });
  assert.equal(upgraded?.permission, 'readwrite');
  const visitorEdit = store.upsertPublicShareNote(noteShare.token, {
    ...note1,
    content: '# Updated by Visitor',
    version: 2,
  });
  assert.equal(visitorEdit.status, 'ok');
  assert.equal(visitorEdit.note?.content, '# Updated by Visitor');

  const syncBack = store.syncOwnerShares(owner.id, [
    {
      shareId: noteShare.id,
      title: note1.title,
      folders: [],
      notes: [note1],
    },
  ]);
  assert.equal(syncBack.visitorNotes.length, 1);
  assert.equal(syncBack.visitorNotes[0].content, '# Updated by Visitor');

  // Revoke removes public access
  assert.equal(store.deleteUserShare(owner.id, noteShare.id), true);
  assert.equal(store.getPublicShareByToken(noteShare.token), null);
});
