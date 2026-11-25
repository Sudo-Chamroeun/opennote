import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  hashApiToken,
  hashPassword,
  requireAdmin,
  requireAuth,
  signAdminToken,
  signSessionToken,
  verifyPassword,
  verifySuperAdminCredentials,
  type AuthenticatedRequest,
} from './server/auth';
import { isSmtpConfigured, sendPasswordResetEmail } from './server/email';
import { createMcpRouterHandlers } from './server/mcp';
import { VaultStore, type McpNoteSnapshot } from './server/store';
import type { EncryptedEnvelope, FolderItem, NoteItem, SharePermission } from './src/types';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getAppBaseUrl(req: express.Request): string {
  const configured = process.env.HTTPS_URL || process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function startServer() {
  const app = express();
  const store = new VaultStore(process.env.DATA_DIR);

  app.use(express.json({ limit: '12mb' }));

  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || process.env.HTTPS_URL || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      appUrl: process.env.HTTPS_URL || process.env.APP_URL || `http://localhost:${PORT}`,
      timestamp: Date.now(),
    });
  });

  app.get('/api/auth/providers', (_req, res) => {
    res.json({
      googleEnabled: isGoogleOAuthConfigured(),
      smtpEnabled: isSmtpConfigured(),
    });
  });

  // Google OAuth 2.0 Sign-In / Sign-Up (free self-hosted OAuth Web Client)
  app.get('/api/auth/google/start', (req, res) => {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({
        error: 'Google Sign-In is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.',
      });
      return;
    }
    const redirectUri = `${getAppBaseUrl(req)}/api/auth/google/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || !isGoogleOAuthConfigured()) {
      res.redirect('/#authError=google_auth_failed');
      return;
    }
    try {
      const redirectUri = `${getAppBaseUrl(req)}/api/auth/google/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        res.redirect('/#authError=google_token_exchange_failed');
        return;
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = (await profileRes.json()) as {
        sub?: string;
        email?: string;
        name?: string;
      };
      if (!profile.email || !profile.sub) {
        res.redirect('/#authError=google_profile_missing');
        return;
      }

      let user = store.findUserByGoogleSub(profile.sub) ?? store.findUserByEmail(profile.email);
      if (!user) {
        user = store.createUser({
          email: profile.email,
          name: profile.name || profile.email.split('@')[0],
          passwordHash: await hashPassword(crypto.randomBytes(24).toString('hex')),
          vaultSalt: crypto.randomBytes(16).toString('base64'),
          authProvider: 'google',
          googleSub: profile.sub,
          hasPassword: false,
        });
      } else {
        if (!user.googleSub) {
          store.linkGoogleSub(user.id, profile.sub);
        }
        store.touchUserLogin(user.id);
      }

      const sessionToken = signSessionToken(user.id, user.email);
      const payload = Buffer.from(
        JSON.stringify({
          token: sessionToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            vaultSalt: user.vaultSalt,
            authProvider: 'google',
            hasPassword: user.hasPassword,
          },
        }),
      ).toString('base64url');
      res.redirect(`/#googleAuth=${payload}`);
    } catch {
      res.redirect('/#authError=google_callback_error');
    }
  });

  // Set account password (used after Google OAuth sign-up so user can also log in with Email + Password)
  app.post('/api/auth/set-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long' });
      return;
    }
    const user = req.userId ? store.findUserById(req.userId) : undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    store.updateUserPassword(user.id, await hashPassword(password));
    res.json({ ok: true, hasPassword: true });
  });

  // Regular Email Password Reset Link (.env SMTP_USER + SMTP_PASS)
  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required' });
      return;
    }
    if (!isSmtpConfigured()) {
      res.status(503).json({
        error: 'Email SMTP is not configured in .env (set SMTP_USER and SMTP_PASS).',
      });
      return;
    }

    const user = store.findUserByEmail(email);
    if (!user) {
      // Do not leak registered email existence
      res.json({
        ok: true,
        message: 'If an account matches this email, a password reset link has been sent.',
      });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    store.createPasswordResetToken(user.id, user.email, hashApiToken(rawToken));
    const resetUrl = `${getAppBaseUrl(req)}/?resetToken=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`;

    try {
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
      if (!result.delivered) {
        res.status(503).json({ error: result.error });
        return;
      }
      res.json({
        ok: true,
        message: 'If an account matches this email, a password reset link has been sent.',
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to send password reset email',
      });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!email || !token || newPassword.length < 6) {
      res.status(400).json({
        error: 'Valid email, reset token, and new password (min 6 characters) are required',
      });
      return;
    }

    const userId = store.consumePasswordResetToken(email, hashApiToken(token));
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired password reset link' });
      return;
    }

    store.updateUserPassword(userId, await hashPassword(newPassword));
    res.json({ ok: true, message: 'Password updated successfully. You can now log in.' });
  });

  // Standard Email + Passphrase Auth routes
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, vaultSalt } = req.body ?? {};
    if (
      typeof email !== 'string' ||
      !email.includes('@') ||
      typeof password !== 'string' ||
      password.length < 6
    ) {
      res.status(400).json({ error: 'Valid email and password (min 6 characters) are required' });
      return;
    }
    if (store.findUserByEmail(email)) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    const passwordHash = await hashPassword(password);
    const salt =
      typeof vaultSalt === 'string' && vaultSalt ? vaultSalt : crypto.randomBytes(16).toString('base64');
    const user = store.createUser({
      email,
      name: typeof name === 'string' ? name : email.split('@')[0],
      passwordHash,
      vaultSalt: salt,
      authProvider: 'password',
    });
    const token = signSessionToken(user.id, user.email);
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        vaultSalt: user.vaultSalt,
        authProvider: user.authProvider,
      },
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const user = store.findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    store.touchUserLogin(user.id);
    const token = signSessionToken(user.id, user.email);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        vaultSalt: user.vaultSalt,
        authProvider: user.authProvider,
      },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.userId ? store.findUserById(req.userId) : undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    store.touchUserActive(user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        vaultSalt: user.vaultSalt,
        authProvider: user.authProvider,
      },
    });
  });

  // Super-Admin Routes (/opennote-admin) backed by .env credentials
  app.post('/api/admin/login', (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!verifySuperAdminCredentials(username, password)) {
      res.status(401).json({ error: 'Invalid super-admin credentials' });
      return;
    }
    const token = signAdminToken(username);
    res.json({ token, username });
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const daysParam = Number(req.query.days);
    const activeDays = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 7;
    res.json(store.getAdminReport(activeDays));
  });

  // Encrypted multi-device parallel sync
  app.post('/api/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.userId!;
    const notes = Array.isArray(req.body?.notes) ? (req.body.notes as EncryptedEnvelope[]) : [];
    const folders = Array.isArray(req.body?.folders)
      ? (req.body.folders as EncryptedEnvelope[])
      : [];
    const merged = store.syncVault(userId, notes, folders);
    const mcpInbox = store.drainMcpInbox(userId);
    res.json({
      notes: merged.notes,
      folders: merged.folders,
      mcpInbox,
      syncedAt: Date.now(),
    });
  });

  // MCP Token management & Bridge sync
  app.get('/api/mcp-tokens', requireAuth, (req: AuthenticatedRequest, res) => {
    const tokens = store.listMcpTokens(req.userId!).map((t) => ({
      id: t.id,
      label: t.label,
      prefix: t.prefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
    }));
    res.json({ tokens });
  });

  app.post('/api/mcp-tokens', requireAuth, (req: AuthenticatedRequest, res) => {
    const label = typeof req.body?.label === 'string' ? req.body.label : 'Agent Workspace';
    const rawToken = `mcp_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = rawToken.slice(0, 12);
    const record = store.createMcpToken(req.userId!, label, prefix, hashApiToken(rawToken));
    res.status(201).json({
      token: rawToken,
      info: {
        id: record.id,
        label: record.label,
        prefix: record.prefix,
        createdAt: record.createdAt,
      },
    });
  });

  app.patch('/api/mcp-tokens/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const tokenId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!label) {
      res.status(400).json({ error: 'Token label is required' });
      return;
    }
    const updated = store.renameMcpToken(req.userId!, tokenId, label);
    if (!updated) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    res.json({
      info: {
        id: updated.id,
        label: updated.label,
        prefix: updated.prefix,
        createdAt: updated.createdAt,
        lastUsedAt: updated.lastUsedAt,
      },
    });
  });

  app.delete('/api/mcp-tokens/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const tokenId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const removed = store.deleteMcpToken(req.userId!, tokenId);
    if (!removed) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/mcp-bridge/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    const notes = Array.isArray(req.body?.notes) ? (req.body.notes as McpNoteSnapshot[]) : [];
    store.setMcpNotes(req.userId!, notes);
    res.json({ ok: true, count: notes.length });
  });

  // HTTPS Note & Folder Sharing (owner management)
  app.get('/api/shares', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ shares: store.listUserShares(req.userId!) });
  });

  app.post('/api/shares', requireAuth, (req: AuthenticatedRequest, res) => {
    const targetType = req.body?.targetType === 'folder' ? 'folder' : req.body?.targetType === 'note' ? 'note' : null;
    const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim() : '';
    const permission: SharePermission = req.body?.permission === 'readwrite' ? 'readwrite' : 'read';
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    const folders = Array.isArray(req.body?.folders) ? (req.body.folders as FolderItem[]) : [];
    const notes = Array.isArray(req.body?.notes) ? (req.body.notes as NoteItem[]) : [];

    if (!targetType || !targetId) {
      res.status(400).json({ error: 'targetType and targetId are required' });
      return;
    }

    const share = store.upsertShareLink({
      ownerUserId: req.userId!,
      targetType,
      targetId,
      title,
      permission,
      folders,
      notes,
    });
    res.status(201).json({ share });
  });

  app.patch('/api/shares/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const shareId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const permission: SharePermission | undefined =
      req.body?.permission === 'readwrite'
        ? 'readwrite'
        : req.body?.permission === 'read'
          ? 'read'
          : undefined;
    const updated = store.updateUserShare(req.userId!, shareId, {
      permission,
      title: typeof req.body?.title === 'string' ? req.body.title : undefined,
      folders: Array.isArray(req.body?.folders) ? (req.body.folders as FolderItem[]) : undefined,
      notes: Array.isArray(req.body?.notes) ? (req.body.notes as NoteItem[]) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Share link not found' });
      return;
    }
    res.json({ share: updated });
  });

  app.delete('/api/shares/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const shareId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const removed = store.deleteUserShare(req.userId!, shareId);
    if (!removed) {
      res.status(404).json({ error: 'Share link not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/shares/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    const snapshots = Array.isArray(req.body?.snapshots) ? req.body.snapshots : [];
    const result = store.syncOwnerShares(req.userId!, snapshots);
    res.json(result);
  });

  // Public HTTPS Shared Link access (anyone with the link)
  app.get('/api/public/share/:token', (req, res) => {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const share = store.getPublicShareByToken(token);
    if (!share) {
      res.status(404).json({ error: 'Shared link not found or revoked' });
      return;
    }
    res.json({ share });
  });

  app.put('/api/public/share/:token/notes/:noteId', (req, res) => {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;
    const note = req.body?.note as NoteItem | undefined;
    if (!note || note.id !== noteId) {
      res.status(400).json({ error: 'Valid note payload is required' });
      return;
    }
    const result = store.upsertPublicShareNote(token, note);
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Shared link not found or revoked' });
      return;
    }
    if (result.status === 'forbidden') {
      res.status(403).json({ error: 'This shared link is read-only' });
      return;
    }
    res.json({ note: result.note, share: result.share });
  });

  app.post('/api/public/share/:token/folders', (req, res) => {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const folder = req.body?.folder as FolderItem | undefined;
    if (!folder || !folder.id) {
      res.status(400).json({ error: 'Valid folder payload is required' });
      return;
    }
    const result = store.createPublicShareFolder(token, folder);
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Shared link not found or revoked' });
      return;
    }
    if (result.status === 'forbidden') {
      res.status(403).json({ error: 'Folder creation is not allowed on this link' });
      return;
    }
    res.status(201).json({ share: result.share });
  });

  // Coding Agent MCP endpoint
  const mcpHandlers = createMcpRouterHandlers(store);
  app.get('/api/mcp', mcpHandlers.handleGet);
  app.post('/api/mcp', mcpHandlers.handlePost);
  app.delete('/api/mcp', mcpHandlers.handleDelete);

  // Frontend serving
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`opennote server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
