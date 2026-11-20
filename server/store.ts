import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  EncryptedEnvelope,
  FolderItem,
  NoteItem,
  PublicSharePayload,
  ShareLinkInfo,
  SharePermission,
} from '../src/types';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  authProvider: 'password' | 'google';
  googleSub: string | null;
  hasPassword: boolean;
  vaultSalt: string;
  createdAt: number;
  lastLoginAt: number;
  lastActiveAt: number;
}

export interface StoredMcpToken {
  id: string;
  userId: string;
  label: string;
  prefix: string;
  tokenHash: string;
  createdAt: number;
  lastUsedAt?: number;
}

export interface McpNoteSnapshot {
  id: string;
  title: string;
  folderPath: string;
  tags: string[];
  content: string;
  updatedAt: number;
}

export interface McpQueuedCreate {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  authProvider: string;
  noteCount: number;
  folderCount: number;
  mcpTokenCount: number;
  createdAt: number;
  lastLoginAt: number;
  lastActiveAt: number;
  active: boolean;
  status: 'active' | 'inactive';
}

export interface AdminReport {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalEncryptedNotes: number;
  totalEncryptedFolders: number;
  totalMcpTokens: number;
  activeWindowDays: number;
  users: AdminUserSummary[];
}

export class VaultStore {
  private db: DatabaseSync;

  constructor(dataDir?: string, explicitDbPath?: string) {
    if (explicitDbPath === ':memory:') {
      this.db = new DatabaseSync(':memory:');
    } else {
      const dir = path.resolve(dataDir || process.env.DATA_DIR || './data');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const dbPath = explicitDbPath || path.join(dir, 'opennote.db');
      this.db = new DatabaseSync(dbPath);
    }

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        auth_provider TEXT NOT NULL DEFAULT 'password',
        google_sub TEXT,
        has_password INTEGER NOT NULL DEFAULT 1,
        vault_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

      CREATE TABLE IF NOT EXISTS encrypted_notes (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS encrypted_folders (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mcp_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        label TEXT NOT NULL,
        prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mcp_notes (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mcp_inbox (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS shared_links (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        title TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'read',
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_links_owner_target
        ON shared_links(owner_user_id, target_type, target_id);
    `);

    // Safe additive migration for existing SQLite databases
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN has_password INTEGER NOT NULL DEFAULT 1;');
    } catch {
      // Column already exists
    }
  }

  private mapUserRow(row: Record<string, unknown> | undefined): StoredUser | undefined {
    if (!row) return undefined;
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      passwordHash: String(row.password_hash),
      authProvider: row.auth_provider === 'google' ? 'google' : 'password',
      googleSub: row.google_sub ? String(row.google_sub) : null,
      hasPassword: row.has_password === undefined ? true : Boolean(row.has_password),
      vaultSalt: String(row.vault_salt),
      createdAt: Number(row.created_at),
      lastLoginAt: Number(row.last_login_at),
      lastActiveAt: Number(row.last_active_at),
    };
  }

  findUserByEmail(email: string): StoredUser | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
    return this.mapUserRow(row);
  }

  findUserById(id: string): StoredUser | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .get(id) as Record<string, unknown> | undefined;
    return this.mapUserRow(row);
  }

  findUserByGoogleSub(googleSub: string): StoredUser | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE google_sub = ? LIMIT 1')
      .get(googleSub) as Record<string, unknown> | undefined;
    return this.mapUserRow(row);
  }

  createUser(params: {
    email: string;
    name: string;
    passwordHash: string;
    vaultSalt: string;
    authProvider?: StoredUser['authProvider'];
    googleSub?: string | null;
    hasPassword?: boolean;
  }): StoredUser {
    const now = Date.now();
    const id = `usr_${crypto.randomUUID().slice(0, 12)}`;
    const email = params.email.trim().toLowerCase();
    const name = params.name.trim() || email.split('@')[0];
    const provider = params.authProvider ?? 'password';
    const googleSub = params.googleSub ?? null;
    const hasPassword = params.hasPassword ?? provider !== 'google';

    this.db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, auth_provider, google_sub, has_password, vault_salt, created_at, last_login_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        email,
        name,
        params.passwordHash,
        provider,
        googleSub,
        hasPassword ? 1 : 0,
        params.vaultSalt,
        now,
        now,
        now,
      );

    return {
      id,
      email,
      name,
      passwordHash: params.passwordHash,
      authProvider: provider,
      googleSub,
      hasPassword,
      vaultSalt: params.vaultSalt,
      createdAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
    };
  }

  touchUserLogin(userId: string): void {
    const now = Date.now();
    this.db
      .prepare('UPDATE users SET last_login_at = ?, last_active_at = ? WHERE id = ?')
      .run(now, now, userId);
  }

  touchUserActive(userId: string): void {
    this.db
      .prepare('UPDATE users SET last_active_at = ? WHERE id = ?')
      .run(Date.now(), userId);
  }

  linkGoogleSub(userId: string, googleSub: string): void {
    this.db
      .prepare('UPDATE users SET google_sub = ? WHERE id = ?')
      .run(googleSub, userId);
  }

  updateUserPassword(userId: string, passwordHash: string): void {
    this.db
      .prepare('UPDATE users SET password_hash = ?, has_password = 1 WHERE id = ?')
      .run(passwordHash, userId);
  }

  syncVault(
    userId: string,
    incomingNotes: EncryptedEnvelope[],
    incomingFolders: EncryptedEnvelope[],
  ): { notes: EncryptedEnvelope[]; folders: EncryptedEnvelope[] } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const selectNote = this.db.prepare(
        'SELECT version, updated_at FROM encrypted_notes WHERE user_id = ? AND id = ?',
      );
      const upsertNote = this.db.prepare(`
        INSERT INTO encrypted_notes (user_id, id, iv, ciphertext, updated_at, version, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          iv = excluded.iv,
          ciphertext = excluded.ciphertext,
          updated_at = excluded.updated_at,
          version = excluded.version,
          deleted = excluded.deleted
      `);

      for (const item of incomingNotes) {
        const prev = selectNote.get(userId, item.id) as
          | { version: number; updated_at: number }
          | undefined;
        if (
          !prev ||
          item.version > prev.version ||
          (item.version === prev.version && item.updatedAt >= prev.updated_at)
        ) {
          upsertNote.run(
            userId,
            item.id,
            item.iv,
            item.ciphertext,
            item.updatedAt,
            item.version,
            item.deleted ? 1 : 0,
          );
        }
      }

      const selectFolder = this.db.prepare(
        'SELECT version, updated_at FROM encrypted_folders WHERE user_id = ? AND id = ?',
      );
      const upsertFolder = this.db.prepare(`
        INSERT INTO encrypted_folders (user_id, id, iv, ciphertext, updated_at, version, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          iv = excluded.iv,
          ciphertext = excluded.ciphertext,
          updated_at = excluded.updated_at,
          version = excluded.version,
          deleted = excluded.deleted
      `);

      for (const item of incomingFolders) {
        const prev = selectFolder.get(userId, item.id) as
          | { version: number; updated_at: number }
          | undefined;
        if (
          !prev ||
          item.version > prev.version ||
          (item.version === prev.version && item.updatedAt >= prev.updated_at)
        ) {
          upsertFolder.run(
            userId,
            item.id,
            item.iv,
            item.ciphertext,
            item.updatedAt,
            item.version,
            item.deleted ? 1 : 0,
          );
        }
      }

      this.db
        .prepare('UPDATE users SET last_active_at = ? WHERE id = ?')
        .run(Date.now(), userId);

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const notesRows = this.db
      .prepare('SELECT id, iv, ciphertext, updated_at, version, deleted FROM encrypted_notes WHERE user_id = ?')
      .all(userId) as Array<Record<string, unknown>>;

    const foldersRows = this.db
      .prepare('SELECT id, iv, ciphertext, updated_at, version, deleted FROM encrypted_folders WHERE user_id = ?')
      .all(userId) as Array<Record<string, unknown>>;

    return {
      notes: notesRows.map((r) => ({
        id: String(r.id),
        iv: String(r.iv),
        ciphertext: String(r.ciphertext),
        updatedAt: Number(r.updated_at),
        version: Number(r.version),
        deleted: Boolean(r.deleted),
      })),
      folders: foldersRows.map((r) => ({
        id: String(r.id),
        iv: String(r.iv),
        ciphertext: String(r.ciphertext),
        updatedAt: Number(r.updated_at),
        version: Number(r.version),
        deleted: Boolean(r.deleted),
      })),
    };
  }

  createMcpToken(userId: string, label: string, prefix: string, tokenHash: string): StoredMcpToken {
    const now = Date.now();
    const id = `tok_${crypto.randomUUID().slice(0, 10)}`;
    const cleanLabel = label.trim() || 'Agent Workspace';
    this.db
      .prepare(
        `INSERT INTO mcp_tokens (id, user_id, label, prefix, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, userId, cleanLabel, prefix, tokenHash, now);

    return {
      id,
      userId,
      label: cleanLabel,
      prefix,
      tokenHash,
      createdAt: now,
    };
  }

  listMcpTokens(userId: string): StoredMcpToken[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_tokens WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      label: String(r.label),
      prefix: String(r.prefix),
      tokenHash: String(r.token_hash),
      createdAt: Number(r.created_at),
      lastUsedAt: r.last_used_at ? Number(r.last_used_at) : undefined,
    }));
  }

  renameMcpToken(userId: string, tokenId: string, label: string): StoredMcpToken | null {
    const cleanLabel = label.trim();
    if (!cleanLabel) return null;
    const result = this.db
      .prepare('UPDATE mcp_tokens SET label = ? WHERE user_id = ? AND id = ?')
      .run(cleanLabel, userId, tokenId);
    if (Number(result.changes) === 0) return null;
    const row = this.db
      .prepare('SELECT * FROM mcp_tokens WHERE user_id = ? AND id = ? LIMIT 1')
      .get(userId, tokenId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      label: String(row.label),
      prefix: String(row.prefix),
      tokenHash: String(row.token_hash),
      createdAt: Number(row.created_at),
      lastUsedAt: row.last_used_at ? Number(row.last_used_at) : undefined,
    };
  }

  deleteMcpToken(userId: string, tokenId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM mcp_tokens WHERE user_id = ? AND id = ?')
      .run(userId, tokenId);
    return Number(result.changes) > 0;
  }

  authenticateMcpToken(tokenHash: string): StoredMcpToken | null {
    const row = this.db
      .prepare('SELECT * FROM mcp_tokens WHERE token_hash = ? LIMIT 1')
      .get(tokenHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    const now = Date.now();
    this.db.prepare('UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?').run(now, String(row.id));
    this.touchUserActive(String(row.user_id));
    return {
      id: String(row.id),
      userId: String(row.user_id),
      label: String(row.label),
      prefix: String(row.prefix),
      tokenHash: String(row.token_hash),
      createdAt: Number(row.created_at),
      lastUsedAt: now,
    };
  }

  setMcpNotes(userId: string, snapshots: McpNoteSnapshot[]): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM mcp_notes WHERE user_id = ?').run(userId);
      const insert = this.db.prepare(
        `INSERT INTO mcp_notes (user_id, id, title, folder_path, tags_json, content, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of snapshots) {
        insert.run(
          userId,
          s.id,
          s.title,
          s.folderPath,
          JSON.stringify(s.tags),
          s.content,
          s.updatedAt,
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getMcpNotes(userId: string): McpNoteSnapshot[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_notes WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      folderPath: String(r.folder_path),
      tags: JSON.parse(String(r.tags_json || '[]')) as string[],
      content: String(r.content),
      updatedAt: Number(r.updated_at),
    }));
  }

  enqueueMcpCreate(userId: string, note: Omit<McpQueuedCreate, 'id' | 'createdAt'>): McpQueuedCreate {
    const item: McpQueuedCreate = {
      id: `note_mcp_${crypto.randomUUID().slice(0, 10)}`,
      title: note.title,
      content: note.content,
      tags: note.tags,
      createdAt: Date.now(),
    };
    this.db
      .prepare(
        `INSERT INTO mcp_inbox (id, user_id, title, content, tags_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(item.id, userId, item.title, item.content, JSON.stringify(item.tags), item.createdAt);
    return item;
  }

  drainMcpInbox(userId: string): McpQueuedCreate[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_inbox WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as Array<Record<string, unknown>>;
    if (rows.length > 0) {
      this.db.prepare('DELETE FROM mcp_inbox WHERE user_id = ?').run(userId);
    }
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      content: String(r.content),
      tags: JSON.parse(String(r.tags_json || '[]')) as string[],
      createdAt: Number(r.created_at),
    }));
  }

  createPasswordResetToken(
    userId: string,
    email: string,
    tokenHash: string,
    ttlMs = 30 * 60 * 1000,
  ): void {
    const expiresAt = Date.now() + ttlMs;
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    this.db
      .prepare(
        `INSERT INTO password_resets (token_hash, user_id, email, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(tokenHash, userId, email.trim().toLowerCase(), expiresAt);
  }

  consumePasswordResetToken(email: string, tokenHash: string): string | null {
    const row = this.db
      .prepare(
        'SELECT user_id, email, expires_at FROM password_resets WHERE token_hash = ? LIMIT 1',
      )
      .get(tokenHash) as { user_id: string; email: string; expires_at: number } | undefined;
    if (!row) return null;
    this.db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(tokenHash);
    if (row.expires_at < Date.now()) return null;
    if (row.email.toLowerCase() !== email.trim().toLowerCase()) return null;
    return row.user_id;
  }

  private parseSharePayload(raw: string): { folders: FolderItem[]; notes: NoteItem[] } {
    try {
      const parsed = JSON.parse(raw) as { folders?: FolderItem[]; notes?: NoteItem[] };
      return {
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };
    } catch {
      return { folders: [], notes: [] };
    }
  }

  private mapShareInfo(row: Record<string, unknown>): ShareLinkInfo {
    return {
      id: String(row.id),
      token: String(row.token),
      targetType: row.target_type === 'folder' ? 'folder' : 'note',
      targetId: String(row.target_id),
      title: String(row.title),
      permission: row.permission === 'readwrite' ? 'readwrite' : 'read',
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  upsertShareLink(params: {
    ownerUserId: string;
    targetType: 'note' | 'folder';
    targetId: string;
    title: string;
    permission: SharePermission;
    folders: FolderItem[];
    notes: NoteItem[];
  }): ShareLinkInfo {
    const now = Date.now();
    const cleanTitle = params.title.trim() || (params.targetType === 'folder' ? 'Shared Folder' : 'Untitled Note');
    const payloadJson = JSON.stringify({
      folders: params.folders,
      notes: params.notes,
    });

    const existing = this.db
      .prepare(
        'SELECT * FROM shared_links WHERE owner_user_id = ? AND target_type = ? AND target_id = ? LIMIT 1',
      )
      .get(params.ownerUserId, params.targetType, params.targetId) as
      | Record<string, unknown>
      | undefined;

    if (existing) {
      this.db
        .prepare(
          'UPDATE shared_links SET title = ?, permission = ?, payload_json = ?, updated_at = ? WHERE id = ?',
        )
        .run(cleanTitle, params.permission, payloadJson, now, String(existing.id));
      return {
        id: String(existing.id),
        token: String(existing.token),
        targetType: params.targetType,
        targetId: params.targetId,
        title: cleanTitle,
        permission: params.permission,
        createdAt: Number(existing.created_at),
        updatedAt: now,
      };
    }

    const id = `shr_${crypto.randomUUID().slice(0, 12)}`;
    const token = `share_${crypto.randomBytes(18).toString('base64url')}`;
    this.db
      .prepare(
        `INSERT INTO shared_links (id, owner_user_id, token, target_type, target_id, title, permission, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.ownerUserId,
        token,
        params.targetType,
        params.targetId,
        cleanTitle,
        params.permission,
        payloadJson,
        now,
        now,
      );

    return {
      id,
      token,
      targetType: params.targetType,
      targetId: params.targetId,
      title: cleanTitle,
      permission: params.permission,
      createdAt: now,
      updatedAt: now,
    };
  }

  listUserShares(ownerUserId: string): ShareLinkInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM shared_links WHERE owner_user_id = ? ORDER BY created_at DESC')
      .all(ownerUserId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapShareInfo(r));
  }

  updateUserShare(
    ownerUserId: string,
    shareId: string,
    updates: {
      permission?: SharePermission;
      title?: string;
      folders?: FolderItem[];
      notes?: NoteItem[];
    },
  ): ShareLinkInfo | null {
    const existing = this.db
      .prepare('SELECT * FROM shared_links WHERE owner_user_id = ? AND id = ? LIMIT 1')
      .get(ownerUserId, shareId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const now = Date.now();
    const nextPermission: SharePermission =
      updates.permission ?? (existing.permission === 'readwrite' ? 'readwrite' : 'read');
    const nextTitle = updates.title?.trim() || String(existing.title);
    const currentPayload = this.parseSharePayload(String(existing.payload_json));
    const nextPayload = JSON.stringify({
      folders: updates.folders ?? currentPayload.folders,
      notes: updates.notes ?? currentPayload.notes,
    });

    this.db
      .prepare(
        'UPDATE shared_links SET permission = ?, title = ?, payload_json = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?',
      )
      .run(nextPermission, nextTitle, nextPayload, now, shareId, ownerUserId);

    return {
      id: String(existing.id),
      token: String(existing.token),
      targetType: existing.target_type === 'folder' ? 'folder' : 'note',
      targetId: String(existing.target_id),
      title: nextTitle,
      permission: nextPermission,
      createdAt: Number(existing.created_at),
      updatedAt: now,
    };
  }

  deleteUserShare(ownerUserId: string, shareId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM shared_links WHERE owner_user_id = ? AND id = ?')
      .run(ownerUserId, shareId);
    return Number(result.changes) > 0;
  }

  getPublicShareByToken(token: string): PublicSharePayload | null {
    const row = this.db
      .prepare('SELECT * FROM shared_links WHERE token = ? LIMIT 1')
      .get(token.trim()) as Record<string, unknown> | undefined;
    if (!row) return null;
    const payload = this.parseSharePayload(String(row.payload_json));
    return {
      id: String(row.id),
      token: String(row.token),
      targetType: row.target_type === 'folder' ? 'folder' : 'note',
      targetId: String(row.target_id),
      title: String(row.title),
      permission: row.permission === 'readwrite' ? 'readwrite' : 'read',
      folders: payload.folders,
      notes: payload.notes,
      updatedAt: Number(row.updated_at),
    };
  }

  upsertPublicShareNote(
    token: string,
    incomingNote: NoteItem,
  ): { status: 'ok' | 'not_found' | 'forbidden'; share?: PublicSharePayload; note?: NoteItem } {
    const row = this.db
      .prepare('SELECT * FROM shared_links WHERE token = ? LIMIT 1')
      .get(token.trim()) as Record<string, unknown> | undefined;
    if (!row) return { status: 'not_found' };
    if (row.permission !== 'readwrite') return { status: 'forbidden' };

    const targetType = row.target_type === 'folder' ? 'folder' : 'note';
    const targetId = String(row.target_id);
    if (targetType === 'note' && incomingNote.id !== targetId) {
      return { status: 'forbidden' };
    }

    const payload = this.parseSharePayload(String(row.payload_json));
    const allowedFolderIds = new Set(payload.folders.map((f) => f.id));
    const sanitizedFolderId =
      targetType === 'folder'
        ? incomingNote.folderId && allowedFolderIds.has(incomingNote.folderId)
          ? incomingNote.folderId
          : targetId
        : null;

    const now = Date.now();
    const idx = payload.notes.findIndex((n) => n.id === incomingNote.id);
    const existing = idx >= 0 ? payload.notes[idx] : undefined;
    const nextVersion = Math.max(
      existing ? existing.version + 1 : 1,
      typeof incomingNote.version === 'number' ? incomingNote.version : 1,
    );

    const savedNote: NoteItem = {
      id: incomingNote.id,
      title: typeof incomingNote.title === 'string' ? incomingNote.title : 'Untitled Note',
      content: typeof incomingNote.content === 'string' ? incomingNote.content : '',
      folderId: targetType === 'note' ? existing?.folderId ?? null : sanitizedFolderId,
      color: incomingNote.color ?? existing?.color,
      tags: Array.isArray(incomingNote.tags) ? incomingNote.tags : existing?.tags ?? [],
      createdAt: existing?.createdAt ?? incomingNote.createdAt ?? now,
      updatedAt: now,
      version: nextVersion,
      deleted: Boolean(incomingNote.deleted),
      exposeToMcp: existing?.exposeToMcp,
    };

    const nextNotes =
      idx >= 0
        ? payload.notes.map((n, i) => (i === idx ? savedNote : n))
        : [savedNote, ...payload.notes];
    const nextTitle =
      targetType === 'note' ? savedNote.title || 'Untitled Note' : String(row.title);

    this.db
      .prepare('UPDATE shared_links SET title = ?, payload_json = ?, updated_at = ? WHERE id = ?')
      .run(
        nextTitle,
        JSON.stringify({ folders: payload.folders, notes: nextNotes }),
        now,
        String(row.id),
      );

    return {
      status: 'ok',
      note: savedNote,
      share: {
        id: String(row.id),
        token: String(row.token),
        targetType,
        targetId,
        title: nextTitle,
        permission: 'readwrite',
        folders: payload.folders,
        notes: nextNotes,
        updatedAt: now,
      },
    };
  }

  createPublicShareFolder(
    token: string,
    folder: FolderItem,
  ): { status: 'ok' | 'not_found' | 'forbidden'; share?: PublicSharePayload } {
    const row = this.db
      .prepare('SELECT * FROM shared_links WHERE token = ? LIMIT 1')
      .get(token.trim()) as Record<string, unknown> | undefined;
    if (!row) return { status: 'not_found' };
    if (row.permission !== 'readwrite' || row.target_type !== 'folder') {
      return { status: 'forbidden' };
    }

    const payload = this.parseSharePayload(String(row.payload_json));
    const allowedIds = new Set(payload.folders.map((f) => f.id));
    const parentId =
      folder.parentId && allowedIds.has(folder.parentId) ? folder.parentId : String(row.target_id);
    const now = Date.now();
    const savedFolder: FolderItem = {
      ...folder,
      parentId,
      createdAt: folder.createdAt || now,
      updatedAt: now,
      version: Math.max(1, folder.version || 1),
    };
    const nextFolders = [...payload.folders.filter((f) => f.id !== savedFolder.id), savedFolder];

    this.db
      .prepare('UPDATE shared_links SET payload_json = ?, updated_at = ? WHERE id = ?')
      .run(
        JSON.stringify({ folders: nextFolders, notes: payload.notes }),
        now,
        String(row.id),
      );

    return {
      status: 'ok',
      share: {
        id: String(row.id),
        token: String(row.token),
        targetType: 'folder',
        targetId: String(row.target_id),
        title: String(row.title),
        permission: 'readwrite',
        folders: nextFolders,
        notes: payload.notes,
        updatedAt: now,
      },
    };
  }

  syncOwnerShares(
    ownerUserId: string,
    snapshots: Array<{
      shareId: string;
      title: string;
      folders: FolderItem[];
      notes: NoteItem[];
    }>,
  ): {
    shares: ShareLinkInfo[];
    visitorNotes: NoteItem[];
    visitorFolders: FolderItem[];
  } {
    const snapshotMap = new Map(snapshots.map((s) => [s.shareId, s]));
    const rows = this.db
      .prepare('SELECT * FROM shared_links WHERE owner_user_id = ?')
      .all(ownerUserId) as Array<Record<string, unknown>>;

    const visitorNotes: NoteItem[] = [];
    const visitorFolders: FolderItem[] = [];
    const now = Date.now();

    for (const row of rows) {
      const shareId = String(row.id);
      const snap = snapshotMap.get(shareId);
      const serverPayload = this.parseSharePayload(String(row.payload_json));
      if (!snap) continue;

      const ownerNoteMap = new Map(snap.notes.map((n) => [n.id, n]));
      const mergedNoteMap = new Map<string, NoteItem>();

      for (const ownerNote of snap.notes) {
        mergedNoteMap.set(ownerNote.id, ownerNote);
      }
      for (const serverNote of serverPayload.notes) {
        const ownerNote = ownerNoteMap.get(serverNote.id);
        if (
          !ownerNote ||
          serverNote.version > ownerNote.version ||
          (serverNote.version === ownerNote.version && serverNote.updatedAt > ownerNote.updatedAt)
        ) {
          mergedNoteMap.set(serverNote.id, serverNote);
          visitorNotes.push(serverNote);
        }
      }

      const ownerFolderMap = new Map(snap.folders.map((f) => [f.id, f]));
      const mergedFolderMap = new Map<string, FolderItem>();
      for (const ownerFolder of snap.folders) {
        mergedFolderMap.set(ownerFolder.id, ownerFolder);
      }
      for (const serverFolder of serverPayload.folders) {
        const ownerFolder = ownerFolderMap.get(serverFolder.id);
        if (
          !ownerFolder ||
          serverFolder.version > ownerFolder.version ||
          (serverFolder.version === ownerFolder.version && serverFolder.updatedAt > ownerFolder.updatedAt)
        ) {
          mergedFolderMap.set(serverFolder.id, serverFolder);
          visitorFolders.push(serverFolder);
        }
      }

      const nextTitle = snap.title.trim() || String(row.title);
      this.db
        .prepare('UPDATE shared_links SET title = ?, payload_json = ?, updated_at = ? WHERE id = ?')
        .run(
          nextTitle,
          JSON.stringify({
            folders: Array.from(mergedFolderMap.values()),
            notes: Array.from(mergedNoteMap.values()),
          }),
          now,
          shareId,
        );
    }

    return {
      shares: this.listUserShares(ownerUserId),
      visitorNotes,
      visitorFolders,
    };
  }

  getAdminReport(activeWindowDays = 7): AdminReport {
    const cutoff = Date.now() - activeWindowDays * 24 * 60 * 60 * 1000;
    const userRows = this.db
      .prepare(
        `SELECT
           u.id,
           u.email,
           u.name,
           u.auth_provider,
           u.created_at,
           u.last_login_at,
           u.last_active_at,
           (SELECT COUNT(*) FROM encrypted_notes n WHERE n.user_id = u.id AND n.deleted = 0) AS note_count,
           (SELECT COUNT(*) FROM encrypted_folders f WHERE f.user_id = u.id AND f.deleted = 0) AS folder_count,
           (SELECT COUNT(*) FROM mcp_tokens t WHERE t.user_id = u.id) AS mcp_token_count
         FROM users u
         ORDER BY u.last_active_at DESC`,
      )
      .all() as Array<Record<string, unknown>>;

    const tokenCountRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM mcp_tokens')
      .get() as { cnt: number };

    let activeUsers = 0;
    let totalEncryptedNotes = 0;
    let totalEncryptedFolders = 0;

    const users: AdminUserSummary[] = userRows.map((r) => {
      const lastActiveAt = Number(r.last_active_at);
      const isActive = lastActiveAt >= cutoff;
      if (isActive) activeUsers += 1;
      const noteCount = Number(r.note_count);
      const folderCount = Number(r.folder_count);
      const mcpTokenCount = Number(r.mcp_token_count);
      totalEncryptedNotes += noteCount;
      totalEncryptedFolders += folderCount;

      return {
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        authProvider: String(r.auth_provider),
        noteCount,
        folderCount,
        mcpTokenCount,
        createdAt: Number(r.created_at),
        lastLoginAt: Number(r.last_login_at),
        lastActiveAt,
        active: isActive,
        status: isActive ? 'active' : 'inactive',
      };
    });

    return {
      totalUsers: users.length,
      activeUsers,
      inactiveUsers: users.length - activeUsers,
      totalEncryptedNotes,
      totalEncryptedFolders,
      totalMcpTokens: Number(tokenCountRow.cnt),
      activeWindowDays,
      users,
    };
  }
}
