import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const ADMIN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSecret(): string {
  return process.env.JWT_SECRET || 'opennote-dev-secret-change-in-docker-env';
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, keyHex] = stored.split(':');
    if (!salt || !keyHex) {
      resolve(false);
      return;
    }
    const keyBuf = Buffer.from(keyHex, 'hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(keyBuf, derivedKey));
    });
  });
}

export interface SessionClaims {
  sub: string;
  email: string;
  role?: 'user' | 'superadmin';
  exp: number;
}

function signPayload(payload: SessionClaims): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyTokenRaw(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionClaims;
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function signSessionToken(userId: string, email: string): string {
  return signPayload({
    sub: userId,
    email,
    role: 'user',
    exp: Date.now() + SESSION_TTL_MS,
  });
}

export function verifySessionToken(token: string): SessionClaims | null {
  const claims = verifyTokenRaw(token);
  if (!claims || claims.role === 'superadmin') return null;
  return claims;
}

export function signAdminToken(username: string): string {
  return signPayload({
    sub: `admin:${username}`,
    email: username,
    role: 'superadmin',
    exp: Date.now() + ADMIN_TTL_MS,
  });
}

export function verifyAdminToken(token: string): SessionClaims | null {
  const claims = verifyTokenRaw(token);
  if (!claims || claims.role !== 'superadmin') return null;
  return claims;
}

export function verifySuperAdminCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'opennote-admin-change-me';

  const uA = Buffer.from(username);
  const uB = Buffer.from(expectedUser);
  const pA = Buffer.from(password);
  const pB = Buffer.from(expectedPass);

  const userMatch = uA.length === uB.length && crypto.timingSafeEqual(uA, uB);
  const passMatch = pA.length === pB.length && crypto.timingSafeEqual(pA, pB);
  return userMatch && passMatch;
}

export function hashApiToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const claims = verifySessionToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }
  req.userId = claims.sub;
  req.userEmail = claims.email;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Super-admin authentication required' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const claims = verifyAdminToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Invalid or expired super-admin session' });
    return;
  }
  req.userId = claims.sub;
  req.userEmail = claims.email;
  next();
}
