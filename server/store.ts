import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { EncryptedEnvelope } from '../src/types';

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
