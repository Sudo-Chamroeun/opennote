import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  FolderClosed,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Shield,
  Sun,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import type { ThemeMode } from '../types';

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  authProvider: string;
  createdAt: number;
  lastActiveAt: number;
  noteCount: number;
  folderCount: number;
  mcpTokenCount: number;
  active?: boolean;
  status?: 'active' | 'inactive';
}

interface AdminReport {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  activeWindowDays: number;
  totalEncryptedNotes: number;
  totalEncryptedFolders: number;
  totalMcpTokens: number;
  users: AdminUserRow[];
}

interface AdminDashboardProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const ADMIN_TOKEN_KEY = 'opennote_admin_token';

function formatRelativeTime(ts: number): string {
  if (!ts) return 'Never';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ theme, onToggleTheme }) => {
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [days, setDays] = useState<number>(7);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const fetchReport = useCallback(
    async (token: string, windowDays: number) => {
      setLoadingReport(true);
      setReportError(null);
      try {
        const res = await fetch(`/api/admin/stats?days=${windowDays}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setAdminToken(null);
          setReport(null);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load admin report');
        }
        setReport(data as AdminReport);
      } catch (err) {
        setReportError(err instanceof Error ? err.message : 'Unable to fetch report');
      } finally {
        setLoadingReport(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (adminToken) {
      fetchReport(adminToken, days);
    }
  }, [adminToken, days, fetchReport]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid super-admin credentials');
      }
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setAdminToken(data.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    setReport(null);
  };

  const filteredUsers = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.users.filter((u) => {
      const isUserActive = u.active ?? u.status === 'active';
      if (filterStatus === 'active' && !isUserActive) return false;
      if (filterStatus === 'inactive' && isUserActive) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.authProvider.toLowerCase().includes(q)
      );
    });
  }, [report, filterStatus, search]);

  if (!adminToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Shield className="w-5 h-5" />
              <span className="text-sm font-semibold">opennote-admin</span>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Super-Admin Console
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Sign in with <code className="font-mono">ADMIN_USERNAME</code> and{' '}
              <code className="font-mono">ADMIN_PASSWORD</code> from your server{' '}
              <code className="font-mono">.env</code> file. Note contents remain zero-knowledge
              encrypted.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-user" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Super-Admin Username
              </label>
              <input
                id="admin-user"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-pass" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Super-Admin Password
              </label>
              <input
                id="admin-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password from .env"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-700 dark:text-rose-300"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              {loggingIn ? 'Verifying...' : 'Open Admin Report'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to opennote
            </a>
            <span className="text-slate-400">SQLite WAL · Zero-knowledge</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="h-14 px-6 2xl:px-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-sm font-bold tracking-tight">opennote Super-Admin Report</h1>
          <span className="hidden sm:inline text-xs text-slate-400">·</span>
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
            Zero-knowledge vault telemetry
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            App
          </a>
          <button
            type="button"
            onClick={() => adminToken && fetchReport(adminToken, days)}
            aria-label="Refresh admin report"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingReport ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out of admin console"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 2xl:px-12 py-8 space-y-6">
        {reportError && (
          <div className="px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-sm text-rose-700 dark:text-rose-300">
            {reportError}
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-400">Active window:</span>
            {[
              { label: '24 hours', val: 1 },
              { label: '7 days', val: 7 },
              { label: '30 days', val: 30 },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setDays(opt.val)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  days === opt.val
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Filter registered users"
                placeholder="Search email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-56"
              />
            </div>

            <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-xs">
              {(['all', 'active', 'inactive'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilterStatus(status)}
                  className={`px-2.5 py-1 rounded-md capitalize font-medium ${
                    filterStatus === status
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <section aria-label="Account summary metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Total Registered Users</span>
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-3xl font-bold tracking-tight tabular-nums" data-testid="kpi-total-users">
              {report?.totalUsers ?? 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Parallel SQLite WAL accounts
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Active Users ({days}d)</span>
              <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums" data-testid="kpi-active-users">
              {report?.activeUsers ?? 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Synced or logged in within {days}d
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Inactive Users ({days}d+)</span>
              <UserMinus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums" data-testid="kpi-inactive-users">
              {report?.inactiveUsers ?? 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No activity in last {days} days
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Encrypted Vault Objects</span>
              <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">
              {report?.totalEncryptedNotes ?? 0}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {report?.totalEncryptedFolders ?? 0} folders · {report?.totalMcpTokens ?? 0} MCP tokens
            </p>
          </div>
        </section>

        {/* Users Table */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Registered User Directory</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Showing {filteredUsers.length} of {report?.users.length ?? 0}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Sign-In Method</th>
                  <th className="px-4 py-3 font-semibold">Activity Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Notes</th>
                  <th className="px-4 py-3 font-semibold text-right">Folders</th>
                  <th className="px-4 py-3 font-semibold text-right">MCP Tokens</th>
                  <th className="px-4 py-3 font-semibold">Last Active</th>
                  <th className="px-5 py-3 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                      No matching accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isUserActive = u.active ?? u.status === 'active';
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                          <div className="text-slate-500 dark:text-slate-400">{u.email}</div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">
                          {u.authProvider === 'google' ? 'Google OAuth' : 'Email + Password'}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {isUserActive ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">Inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{u.noteCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className="inline-flex items-center justify-end gap-1">
                            <FolderClosed className="w-3 h-3 text-slate-400" />
                            {u.folderCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className="inline-flex items-center justify-end gap-1">
                            <KeyRound className="w-3 h-3 text-slate-400" />
                            {u.mcpTokenCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                          {formatRelativeTime(u.lastActiveAt)}
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400 tabular-nums">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};
