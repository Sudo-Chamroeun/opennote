import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Lock, Mail, ShieldCheck, WifiOff } from 'lucide-react';
import type { AuthSession } from '../types';
import { deriveVaultKey, generateSaltBase64 } from '../utils/crypto';

interface AuthGateProps {
  pendingGoogleSession?: AuthSession | null;
  initialAuthError?: string | null;
  initialResetToken?: string | null;
  initialResetEmail?: string | null;
  onClearGoogleSession?: () => void;
  onClearResetParams?: () => void;
  onAuthenticated: (params: {
    mode: 'server' | 'offline';
    session?: AuthSession;
    vaultKey?: CryptoKey;
    scopeKey: string;
  }) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  pendingGoogleSession,
  initialAuthError,
  initialResetToken,
  initialResetEmail,
  onClearGoogleSession,
  onClearResetParams,
  onAuthenticated,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [view, setView] = useState<'auth' | 'forgot' | 'reset'>(() =>
    initialResetToken && initialResetEmail ? 'reset' : 'auth',
  );

  const [email, setEmail] = useState(initialResetEmail ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken ?? '');

  const [rememberVaultPassphrase, setRememberVaultPassphrase] = useState(true);
  const [googlePassphrase, setGooglePassphrase] = useState('');
  const [googleConfirmPassphrase, setGoogleConfirmPassphrase] = useState('');

  const [providers, setProviders] = useState<{ googleEnabled: boolean; smtpEnabled: boolean }>({
    googleEnabled: false,
    smtpEnabled: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialAuthError ?? null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setProviders({
            googleEnabled: Boolean(data.googleEnabled),
            smtpEnabled: Boolean(data.smtpEnabled),
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (tab === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = tab === 'register' ? '/api/auth/register' : '/api/auth/login';
      const bodyPayload =
        tab === 'register'
          ? { email, password, name, vaultSalt: generateSaltBase64() }
          : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      const session = data as AuthSession;
      const vaultKey = await deriveVaultKey(password, session.user.vaultSalt);
      onAuthenticated({
        mode: 'server',
        session,
        vaultKey,
        scopeKey: `user_${session.user.id}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Enter the email address for your account.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not send password reset email');
      }
      setInfoMessage(
        data.message || 'If an account matches this email, a password reset link has been sent.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          token: resetToken.trim(),
          newPassword: password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to reset password');
      }
      onClearResetParams?.();
      setResetToken('');
      setPassword('');
      setConfirmPassword('');
      setView('auth');
      setTab('login');
      setInfoMessage('Password updated. You can now log in with your new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    setError(null);
    if (!providers.googleEnabled) {
      setError(
        'Google Sign-In is not configured on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, or use Email & Password / Offline Mode.',
      );
      return;
    }
    window.location.href = '/api/auth/google/start';
  };

  const handleUnlockGoogleVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleSession) return;
    setError(null);
    const needsPassword = pendingGoogleSession.user.hasPassword === false;
    const passphrase = googlePassphrase.trim();
    if (passphrase.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (needsPassword && passphrase !== googleConfirmPassphrase.trim()) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (needsPassword) {
        const res = await fetch('/api/auth/set-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pendingGoogleSession.token}`,
          },
          body: JSON.stringify({ password: passphrase }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Could not save account password');
        }
      }

      if (rememberVaultPassphrase) {
        window.localStorage.setItem(
          `opennote_passphrase_${pendingGoogleSession.user.id}`,
          passphrase,
        );
      }

      const vaultKey = await deriveVaultKey(passphrase, pendingGoogleSession.user.vaultSalt);
      onAuthenticated({
        mode: 'server',
        session: {
          ...pendingGoogleSession,
          user: { ...pendingGoogleSession.user, hasPassword: true },
        },
        vaultKey,
        scopeKey: `user_${pendingGoogleSession.user.id}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock vault');
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineWorkspace = () => {
    onAuthenticated({
      mode: 'offline',
      scopeKey: 'local_offline_vault',
    });
  };

  if (pendingGoogleSession) {
    const needsPassword = pendingGoogleSession.user.hasPassword === false;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <KeyRound className="w-5 h-5" />
              <span className="text-sm font-semibold">opennote · Google Account Connected</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {needsPassword ? 'Set your account password' : 'Unlock your encrypted vault'}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Signed up as{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {pendingGoogleSession.user.email}
              </strong>
              .{' '}
              {needsPassword
                ? 'Set a password for future logins and local AES-256-GCM vault encryption.'
                : 'Enter your account password to decrypt and sync your notes across devices.'}
            </p>
          </div>

          <form onSubmit={handleUnlockGoogleVault} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="google-vault-passphrase"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {needsPassword ? 'Create Account & Vault Password' : 'Account / Vault Password'}
              </label>
              <input
                id="google-vault-passphrase"
                type="password"
                required
                minLength={6}
                autoFocus
                value={googlePassphrase}
                onChange={(e) => setGooglePassphrase(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            {needsPassword && (
              <div className="space-y-1.5">
                <label
                  htmlFor="google-vault-passphrase-confirm"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Confirm Password
                </label>
                <input
                  id="google-vault-passphrase-confirm"
                  type="password"
                  required
                  minLength={6}
                  value={googleConfirmPassphrase}
                  onChange={(e) => setGoogleConfirmPassphrase(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberVaultPassphrase}
                onChange={(e) => setRememberVaultPassphrase(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Remember vault unlock key on this browser
            </label>

            {error && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading
                ? 'Saving & Unlocking...'
                : needsPassword
                  ? 'Save Password & Open Vault'
                  : 'Unlock & Sync Vault'}
            </button>
          </form>

          {onClearGoogleSession && (
            <button
              type="button"
              onClick={onClearGoogleSession}
              className="w-full text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Use a different account
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === 'forgot') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Mail className="w-5 h-5" />
              <span className="text-sm font-semibold">opennote</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Reset your password
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Enter your account email and we will send a password reset link using the server&apos;s
              configured SMTP credentials in <code className="font-mono">.env</code>.
            </p>
          </div>

          <form onSubmit={handleRequestResetLink} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-request-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Account Email Address
              </label>
              <input
                id="reset-request-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              {!providers.smtpEnabled && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  SMTP is not enabled yet. Set SMTP_USER and SMTP_PASS (Gmail App Password) in .env.
                </p>
              )}
            </div>

            {infoMessage && (
              <div className="px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
                {infoMessage}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setInfoMessage(null);
              setView('auth');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reset') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <KeyRound className="w-5 h-5" />
              <span className="text-sm font-semibold">opennote</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Choose a new password
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Setting a new login password for <strong className="text-slate-800 dark:text-slate-200">{email}</strong>.
            </p>
          </div>

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-new-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                New Password
              </label>
              <input
                id="reset-new-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Confirm New Password
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-700 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              onClearResetParams?.();
              setError(null);
              setView('auth');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Cancel &amp; Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Lock className="w-5 h-5" />
            <span className="text-sm font-semibold">opennote</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {tab === 'login' ? 'Log in to your vault' : 'Sign up for opennote'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Client-side AES-256-GCM encryption for Markdown notes and concept diagrams across your
            devices.
          </p>
        </div>

        {/* Clean 2-tab switch: Login & Sign Up */}
        <div className="flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'register'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div className="space-y-1.5">
              <label
                htmlFor="auth-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Display Name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Password / Vault Passphrase
              </label>
              {tab === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setInfoMessage(null);
                    setView('forgot');
                  }}
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {tab === 'register' && (
            <div className="space-y-1.5">
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Confirm Password
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          )}

          {infoMessage && (
            <div className="px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
              {infoMessage}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {loading
              ? 'Unlocking Vault...'
              : tab === 'login'
                ? 'Login & Unlock Vault'
                : 'Sign Up & Create Vault'}
          </button>
        </form>

        {/* Sign up / login with Google (requires password setup on new accounts) */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span>or</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium transition-colors inline-flex items-center justify-center gap-2.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{tab === 'register' ? 'Sign up with Google (Gmail)' : 'Login with Google'}</span>
          </button>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={handleOfflineWorkspace}
            className="w-full py-2 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            <WifiOff className="w-3.5 h-3.5" />
            Continue in Offline-First Local Mode
          </button>
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
            Offline mode stores notes and concept diagrams directly in browser IndexedDB.
          </p>
          <footer className="pt-1 text-center">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              opennote by calz
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
};
