import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  KeyRound,
  Pencil,
  Plug,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { AuthSession, FolderItem, McpTokenInfo, NoteItem } from '../types';
import {
  FOLDER_COLORS,
  buildFolderTree,
  getFolderMcpStats,
  type FolderTreeNode,
} from '../utils/vault';

interface McpModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: AuthSession | null;
  folders: FolderItem[];
  notes: NoteItem[];
  onToggleNoteMcp: (noteId: string) => void;
  onBatchSetNotesMcp: (noteIds: string[], expose: boolean) => void;
  onSyncMcpBridge: () => Promise<number>;
}

type McpClientId =
  | 'antigravity'
  | 'opencode'
  | 'lmstudio'
  | 'claude'
  | 'claude-desktop'
  | 'cursor'
  | 'codex'
  | 'hermes'
  | 'stdio';

interface McpPreset {
  id: McpClientId;
  name: string;
  configPath: string;
  note: string;
  buildConfig: (origin: string, token: string) => string;
}

const MCP_PRESETS: McpPreset[] = [
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    configPath: '~/.gemini/antigravity/mcp_config.json',
    note: 'Open Antigravity MCP Store -> Manage MCP Servers -> View raw config and paste this block.',
    buildConfig: (origin, token) =>
      JSON.stringify(
        {
          mcpServers: {
            opennote: {
              serverUrl: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    configPath: 'opencode.json',
    note: 'Add this remote MCP server block to your project or global opencode.json.',
    buildConfig: (origin, token) =>
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            opennote: {
              type: 'remote',
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    configPath: '~/.lmstudio/mcp.json',
    note: 'In LM Studio open Program -> Install -> Edit mcp.json (supports remote Bionic MCP HTTP or local stdio bridge).',
    buildConfig: (origin, token) =>
      JSON.stringify(
        {
          mcpServers: {
            opennote: {
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'claude',
    name: 'Claude Code',
    configPath: '.mcp.json (or CLI)',
    note: 'Run the CLI command or save as .mcp.json in your project root.',
    buildConfig: (origin, token) =>
      `# Option A — Claude Code CLI:\nclaude mcp add --transport http opennote ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${token}"\n\n# Option B — .mcp.json:\n${JSON.stringify(
        {
          mcpServers: {
            opennote: {
              type: 'http',
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      )}`,
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    configPath: 'claude_desktop_config.json',
    note: 'Claude Desktop requires a stdio bridge in claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/ · Windows: %APPDATA%\\Claude\\), or paste the Connector URL below in Settings -> Connectors.',
    buildConfig: (origin, token) =>
      JSON.stringify(
        {
          mcpServers: {
            opennote: {
              command: 'npx',
              args: [
                '-y',
                'mcp-remote',
                `${origin}/api/mcp`,
                '--header',
                `Authorization: Bearer ${token}`,
              ],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configPath: '.cursor/mcp.json',
    note: 'Save in .cursor/mcp.json (workspace) or ~/.cursor/mcp.json (global).',
    buildConfig: (origin, token) =>
      JSON.stringify(
        {
          mcpServers: {
            opennote: {
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    configPath: '~/.codex/config.toml',
    note: 'Add this TOML block to your Codex CLI configuration.',
    buildConfig: (origin, token) =>
      `[mcp_servers.opennote]\nurl = "${origin}/api/mcp"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`,
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    configPath: '~/.hermes/config.yaml',
    note: 'Register opennote under mcp_servers in your Hermes Agent config.yaml.',
    buildConfig: (origin, token) =>
      `mcp_servers:\n  opennote:\n    url: "${origin}/api/mcp"\n    headers:\n      Authorization: "Bearer ${token}"`,
  },
  {
    id: 'stdio',
    name: 'Local Stdio Bridge',
    configPath: 'mcp-server.ts',
    note: 'For any local stdio-only MCP client, launch the bundled mcp-server.ts bridge.',
    buildConfig: (origin, token) =>
      JSON.stringify(
        {
          mcpServers: {
            opennote: {
              command: 'npx',
              args: ['tsx', 'mcp-server.ts'],
              env: {
                FOLIO_URL: origin,
                FOLIO_MCP_TOKEN: token,
              },
            },
          },
        },
        null,
        2,
      ),
  },
];

export const McpModal: React.FC<McpModalProps> = ({
  isOpen,
  onClose,
  session,
  folders,
  notes,
  onToggleNoteMcp,
  onBatchSetNotesMcp,
  onSyncMcpBridge,
}) => {
  const [tokens, setTokens] = useState<McpTokenInfo[]>([]);
  const [label, setLabel] = useState('Antigravity / OpenCode');
  const [selectedClient, setSelectedClient] = useState<McpClientId>('antigravity');
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncingBridge, setSyncingBridge] = useState(false);
  const [renamingTokenId, setRenamingTokenId] = useState<string | null>(null);
  const [renameTokenValue, setRenameTokenValue] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Record<string, boolean>>({});

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://notes.yourdomain.com';
  const activeNotes = useMemo(() => notes.filter((n) => !n.deleted), [notes]);
  const sharedCount = activeNotes.filter((n) => n.exposeToMcp).length;
  const folderTree = useMemo(
    () => buildFolderTree(folders, activeNotes),
    [folders, activeNotes],
  );

  useEffect(() => {
    if (!isOpen || !session) return;
    fetch('/api/mcp-tokens', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => (res.ok ? res.json() : { tokens: [] }))
      .then((data) => setTokens(data.tokens ?? []))
      .catch(() => {});
  }, [isOpen, session]);

  if (!isOpen) return null;

  const createToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const res = await fetch('/api/mcp-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewlyCreatedToken(data.token);
      setTokens((prev) => [...prev, data.info]);
      await onSyncMcpBridge();
    }
  };

  const revokeToken = async (id: string) => {
    if (!session) return;
    const res = await fetch(`/api/mcp-tokens/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const renameToken = async (id: string) => {
    if (!session) return;
    const nextLabel = renameTokenValue.trim();
    if (!nextLabel) {
      setRenamingTokenId(null);
      return;
    }
    const res = await fetch(`/api/mcp-tokens/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ label: nextLabel }),
    });
    if (res.ok) {
      const data = await res.json();
      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, label: data.info?.label ?? nextLabel } : t)),
      );
      setRenamingTokenId(null);
    }
  };

  const handleSyncBridge = async () => {
    setSyncingBridge(true);
    try {
      const count = await onSyncMcpBridge();
      setTestResult(`Synced ${count} MCP-enabled note(s) to the opennote MCP bridge.`);
    } finally {
      setSyncingBridge(false);
    }
  };

  const handleTestConnection = async () => {
    const tokenToTest = newlyCreatedToken;
    if (!tokenToTest) {
      setTestResult(
        'Generate a new MCP token above first so the browser can run a live JSON-RPC check.',
      );
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await onSyncMcpBridge();
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToTest}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      const data = await res.json();
      if (data.result?.tools) {
        const names = (data.result.tools as Array<{ name: string }>).map((t) => t.name).join(', ');
        setTestResult(`MCP endpoint ready · Tools: ${names}`);
      } else {
        setTestResult(data.error?.message || 'Unexpected MCP response');
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'MCP check failed');
    } finally {
      setTesting(false);
    }
  };

  const tokenDisplay = newlyCreatedToken || '<YOUR_MCP_TOKEN>';
  const activePreset = MCP_PRESETS.find((p) => p.id === selectedClient) ?? MCP_PRESETS[0];
  const generatedConfig = activePreset.buildConfig(origin, tokenDisplay);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };

  const normalizedFilter = filterQuery.trim().toLowerCase();

  const matchesTreeNode = (node: FolderTreeNode): boolean => {
    if (!normalizedFilter) return true;
    if (node.folder.name.toLowerCase().includes(normalizedFilter)) return true;
    if (node.notes.some((n) => (n.title || 'Untitled Note').toLowerCase().includes(normalizedFilter))) {
      return true;
    }
    return node.children.some(matchesTreeNode);
  };

  const toggleFolderCollapsed = (id: string) => {
    setCollapsedFolderIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderFolderBranch = (node: FolderTreeNode, depth = 0): React.ReactNode => {
    if (!matchesTreeNode(node)) return null;
    const stats = getFolderMcpStats(node);
    const isCollapsed = normalizedFilter ? false : Boolean(collapsedFolderIds[node.folder.id]);
    const colorMeta = FOLDER_COLORS[node.folder.color ?? 'indigo'] ?? FOLDER_COLORS.indigo;
    const folderMatches =
      !normalizedFilter || node.folder.name.toLowerCase().includes(normalizedFilter);
    const visibleNotes = folderMatches
      ? node.notes
      : node.notes.filter((n) =>
          (n.title || 'Untitled Note').toLowerCase().includes(normalizedFilter),
        );

    const folderIndentClass = ['pl-2.5', 'pl-6', 'pl-10', 'pl-14'][Math.min(depth, 3)];
    const noteIndentClass = ['pl-8', 'pl-12', 'pl-16', 'pl-20'][Math.min(depth, 3)];

    return (
      <div key={node.folder.id}>
        <div
          className={`flex items-center justify-between gap-2 pr-3 py-2 bg-slate-50/80 dark:bg-slate-800/35 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 ${folderIndentClass}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => toggleFolderCollapsed(node.folder.id)}
              aria-label={`Toggle folder ${node.folder.name}`}
              aria-expanded={!isCollapsed}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {isCollapsed ? (
              <Folder className={`w-4 h-4 shrink-0 ${colorMeta.iconClass}`} />
            ) : (
              <FolderOpen className={`w-4 h-4 shrink-0 ${colorMeta.iconClass}`} />
            )}
            <button
              type="button"
              onClick={() => toggleFolderCollapsed(node.folder.id)}
              className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate text-left"
            >
              {node.folder.name}
            </button>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
              {stats.total === 0 ? 'Empty' : `${stats.shared}/${stats.total} included`}
            </span>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer shrink-0">
            <span>{stats.state === 'all' ? 'All Shared' : 'Entire Folder'}</span>
            <input
              type="checkbox"
              disabled={stats.total === 0}
              checked={stats.state === 'all' && stats.total > 0}
              ref={(el) => {
                if (el) el.indeterminate = stats.state === 'some';
              }}
              onChange={() =>
                onBatchSetNotesMcp(stats.noteIds, stats.state !== 'all')
              }
              aria-label={`Share entire folder ${node.folder.name} with MCP`}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
            />
          </label>
        </div>

        {!isCollapsed && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {visibleNotes.map((n) => (
              <label
                key={n.id}
                className={`flex items-center justify-between gap-3 pr-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 ${noteIndentClass}`}
              >
                <span className="inline-flex items-center gap-2 min-w-0 text-slate-700 dark:text-slate-200">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{n.title || 'Untitled Note'}</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(n.exposeToMcp)}
                  onChange={() => onToggleNoteMcp(n.id)}
                  aria-label={`Include note ${n.title || 'Untitled Note'} in MCP`}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
              </label>
            ))}
            {node.children.map((child) => renderFolderBranch(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const visibleRootNotes = folderTree.rootNotes.filter(
    (n) =>
      !normalizedFilter ||
      (n.title || 'Untitled Note').toLowerCase().includes(normalizedFilter),
  );
  const rootNoteIds = folderTree.rootNotes.map((n) => n.id);
  const rootSharedCount = folderTree.rootNotes.filter((n) => Boolean(n.exposeToMcp)).length;
  const rootState: 'all' | 'some' | 'none' =
    folderTree.rootNotes.length === 0 || rootSharedCount === 0
      ? 'none'
      : rootSharedCount === folderTree.rootNotes.length
        ? 'all'
        : 'some';
  const isRootCollapsed = normalizedFilter ? false : Boolean(collapsedFolderIds.__root__);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-modal-title"
        className="w-full max-w-2xl 2xl:max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Plug className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 id="mcp-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
              MCP Connect — Coding Agents
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close MCP Connect dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {!session ? (
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
              You are currently in Offline-Only Local Mode. Sign in to your Docker server account to
              mint an active MCP Bearer token. You can still preview client configs for Google
              Antigravity, OpenCode, LM Studio, Claude Code, Cursor, Codex, and Hermes Agent below.
            </div>
          ) : (
            <>
              {/* 1. Token management (requires signed-in session) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    1. Mint Scoped MCP Token
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {sharedCount} / {activeNotes.length} notes shared with MCP
                  </span>
                </div>

                <form onSubmit={createToken} className="flex items-center gap-2">
                  <input
                    type="text"
                    aria-label="MCP token label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Token label (e.g. Antigravity / OpenCode)"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium whitespace-nowrap"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Generate Token
                  </button>
                </form>

                {newlyCreatedToken && (
                  <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 space-y-1.5">
                    <div className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      Copy your token now (shown once):
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2 py-1 rounded bg-white dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-100 overflow-x-auto">
                        {newlyCreatedToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(newlyCreatedToken, 'token')}
                        aria-label="Copy MCP token"
                        className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium inline-flex items-center gap-1"
                      >
                        {copied === 'token' ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copied === 'token' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {tokens.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                    {tokens.map((t) => {
                      const isRenaming = renamingTokenId === t.id;
                      return (
                        <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                          {isRenaming ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void renameToken(t.id);
                              }}
                              className="flex-1 flex items-center gap-1.5"
                            >
                              <input
                                type="text"
                                autoFocus
                                aria-label={`New name for MCP token ${t.label}`}
                                value={renameTokenValue}
                                onChange={(e) => setRenameTokenValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setRenamingTokenId(null);
                                  }
                                }}
                                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-indigo-400 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                              />
                              <button
                                type="submit"
                                className="px-2 py-1 rounded bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingTokenId(null)}
                                className="px-1.5 py-1 rounded text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="min-w-0 flex items-center flex-wrap gap-1">
                                <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                                  {t.label}
                                </span>
                                <span className="mx-1 text-slate-400">·</span>
                                <code className="text-slate-500 font-mono">{t.prefix}...</code>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingTokenId(t.id);
                                    setRenameTokenValue(t.label);
                                  }}
                                  aria-label={`Rename MCP token ${t.label}`}
                                  title="Rename key"
                                  className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => revokeToken(t.id)}
                                  aria-label={`Revoke MCP token ${t.label}`}
                                  title="Revoke key"
                                  className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 2. Folder & Per-File Access Toggle (always visible so users can select folders & exclude files) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {session ? '2. Choose Folders & Notes Exposed to Agents' : 'Choose Folders & Notes Exposed to Agents'}
                </h3>
                {!session && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {sharedCount} / {activeNotes.length} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onBatchSetNotesMcp(activeNotes.map((n) => n.id), true)}
                  className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => onBatchSetNotesMcp(activeNotes.map((n) => n.id), false)}
                  className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Clear All
                </button>
                {session && (
                  <button
                    type="button"
                    onClick={handleSyncBridge}
                    disabled={syncingBridge}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingBridge ? 'animate-spin' : ''}`} />
                    Sync MCP Bridge
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select an entire folder to share all files inside it, then uncheck any individual
              files you want to exclude from the AI agent. Unchecked notes stay zero-knowledge
              encrypted.
            </p>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Filter MCP folders and notes"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter folders or notes..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {folderTree.roots.map((rootNode) => renderFolderBranch(rootNode, 0))}

              {visibleRootNotes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-50/80 dark:bg-slate-800/35 hover:bg-slate-100/80 dark:hover:bg-slate-800/60">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleFolderCollapsed('__root__')}
                        aria-label="Toggle folder Root Notes"
                        aria-expanded={!isRootCollapsed}
                        className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {isRootCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                      <button
                        type="button"
                        onClick={() => toggleFolderCollapsed('__root__')}
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate"
                      >
                        Root (Unfiled)
                      </button>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                        {rootSharedCount}/{folderTree.rootNotes.length} included
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer shrink-0">
                      <span>{rootState === 'all' ? 'All Shared' : 'Entire Folder'}</span>
                      <input
                        type="checkbox"
                        checked={rootState === 'all'}
                        ref={(el) => {
                          if (el) el.indeterminate = rootState === 'some';
                        }}
                        onChange={() => onBatchSetNotesMcp(rootNoteIds, rootState !== 'all')}
                        aria-label="Share all unfiled root notes with MCP"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>

                  {!isRootCollapsed && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {visibleRootNotes.map((n) => (
                        <label
                          key={n.id}
                          className="flex items-center justify-between gap-3 pl-8 pr-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30"
                        >
                          <span className="inline-flex items-center gap-2 min-w-0 text-slate-700 dark:text-slate-200">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{n.title || 'Untitled Note'}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean(n.exposeToMcp)}
                            onChange={() => onToggleNoteMcp(n.id)}
                            aria-label={`Include note ${n.title || 'Untitled Note'} in MCP`}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeNotes.length === 0 && folders.filter((f) => !f.deleted).length === 0 && (
                <div className="px-3 py-4 text-xs text-center text-slate-400">
                  No notes or folders yet.
                </div>
              )}
            </div>
          </div>

          {/* Multi-Agent MCP Presets */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {session ? '3. Choose Coding Agent Client' : 'Supported Coding Agent Clients'}
              </h3>
              <div className="flex items-center gap-2">
                {session && (
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 whitespace-nowrap"
                  >
                    {testing ? 'Testing...' : 'Test MCP Endpoint'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyText(generatedConfig, 'config')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  {copied === 'config' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied === 'config' ? 'Copied' : 'Copy Config'}
                </button>
              </div>
            </div>

            {/* Client Tabs */}
            <div
              role="tablist"
              aria-label="MCP client presets"
              className="flex flex-wrap gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80"
            >
              {MCP_PRESETS.map((preset) => {
                const active = preset.id === selectedClient;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedClient(preset.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{activePreset.note}</span>
              <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                {activePreset.configPath}
              </code>
            </div>

            <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto border border-slate-800">
              <code>{generatedConfig}</code>
            </pre>

            {selectedClient === 'claude-desktop' && (
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1.5 text-xs">
                <div className="font-medium text-slate-700 dark:text-slate-200">
                  Option B — Claude Desktop Settings -&gt; Connectors (Add custom connector URL, no Node.js needed):
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-200 overflow-x-auto">
                    {`${origin}/api/mcp?token=${tokenDisplay}`}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(`${origin}/api/mcp?token=${tokenDisplay}`, 'desktop-url')
                    }
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium inline-flex items-center gap-1 whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {copied === 'desktop-url' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied === 'desktop-url' ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
              </div>
            )}

            {testResult && (
              <div className="px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-xs text-indigo-800 dark:text-indigo-200">
                {testResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
