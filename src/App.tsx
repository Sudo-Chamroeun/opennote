import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  ClipboardPaste,
  Cloud,
  CloudOff,
  Code,
  Copy,
  Edit3,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  Palette,
  Plug,
  Printer,
  Redo2,
  RefreshCw,
  Shapes,
  Share2,
  Sun,
  Table,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthGate } from './components/AuthGate';
import { ConceptCanvas } from './components/ConceptCanvas';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { MarkdownPreview } from './components/MarkdownPreview';
import { McpModal } from './components/McpModal';
import {
  SegmentedMarkdownEditor,
  type SegmentedMarkdownEditorHandle,
} from './components/SegmentedMarkdownEditor';
import { SharedView } from './components/SharedView';
import { ShareModal } from './components/ShareModal';
import { Sidebar } from './components/Sidebar';
import type {
  AuthSession,
  ConceptDiagram,
  EditorFontFamily,
  EditorSettings,
  EditorViewMode,
  EncryptedEnvelope,
  FolderColor,
  FolderItem,
  NoteItem,
  ShareLinkInfo,
} from './types';
import {
  deriveVaultKey,
  decryptPayload,
  encryptPayload,
  exportVaultKeyJwk,
  importVaultKeyJwk,
} from './utils/crypto';
import {
  createDefaultNode,
  createEdge,
  duplicateConceptDiagram,
  findConceptDiagramAtCursor,
  removeConceptBlockFromMarkdown,
  upsertConceptBlockInMarkdown,
} from './utils/diagram';
import {
  createHistoryStack,
  pushHistorySnapshot,
  redoHistory,
  undoHistory,
  type NoteHistoryStack,
} from './utils/history';
import {
  applyAlignmentToMarkdown,
  getEditorFontClass,
  toggleChecklistLine,
  type TextAlignment,
} from './utils/markdown';
import {
  loadEditorSettings,
  loadOfflineVault,
  saveEditorSettings,
  saveOfflineVault,
  type PendingSyncState,
} from './utils/offlineStore';
import { collectFolderNotesRecursive, printNotes } from './utils/printNotes';
import { createSeedWorkspace } from './utils/seedVault';
import {
  FOLDER_COLORS,
  collectShareSnapshot,
  getAllNoteTags,
  getFolderBreadcrumbs,
  isDescendantFolder,
  mergeVersionedItems,
} from './utils/vault';

interface VaultContextState {
  mode: 'server' | 'offline';
  session: AuthSession | null;
  vaultKey: CryptoKey | null;
  scopeKey: string;
}

interface StoredActiveSession {
  mode: 'server' | 'offline';
  scopeKey: string;
  session?: AuthSession;
  keyJwk?: JsonWebKey;
}

const ACTIVE_SESSION_STORAGE_KEY = 'opennote_active_session_v1';

function getActiveNoteStorageKey(scopeKey: string): string {
  return `opennote_active_note_${scopeKey}`;
}

function getShareTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const qToken = params.get('share');
  if (qToken && qToken.trim()) return qToken.trim();
  const pathMatch = window.location.pathname.match(/^\/share\/([^/]+)/);
  return pathMatch ? decodeURIComponent(pathMatch[1]) : null;
}

function loadStoredActiveSession(): StoredActiveSession | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredActiveSession;
    if (!parsed || !parsed.scopeKey) return null;
    if (parsed.mode === 'offline') return parsed;
    if (parsed.mode === 'server' && parsed.session?.token && parsed.keyJwk) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearStoredActiveSession(): void {
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

async function persistActiveSession(ctx: VaultContextState): Promise<void> {
  try {
    if (ctx.mode === 'offline') {
      const payload: StoredActiveSession = { mode: 'offline', scopeKey: ctx.scopeKey };
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(payload));
      return;
    }
    if (ctx.mode === 'server' && ctx.session && ctx.vaultKey) {
      const keyJwk = await exportVaultKeyJwk(ctx.vaultKey);
      const payload: StoredActiveSession = {
        mode: 'server',
        scopeKey: ctx.scopeKey,
        session: ctx.session,
        keyJwk,
      };
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignore storage errors
  }
}


function decodeBase64UrlJson<T>(raw: string): T | null {
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const json = atob(normalized + pad);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export default function App() {
  const isAdminRoute =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/opennote-admin');
  const publicShareToken =
    typeof window !== 'undefined' ? getShareTokenFromLocation() : null;

  const [settings, setSettings] = useState<EditorSettings>(() => loadEditorSettings());
  const [pendingGoogleSession, setPendingGoogleSession] = useState<AuthSession | null>(null);
  const [initialAuthError, setInitialAuthError] = useState<string | null>(null);
  const [resetParams, setResetParams] = useState<{ token: string; email: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    const email = params.get('email');
    return token && email ? { token, email } : null;
  });

  const [vaultCtx, setVaultCtx] = useState<VaultContextState | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return {
          mode: 'offline',
          session: null,
          vaultKey: null,
          scopeKey: 'local_offline_vault',
        };
      }
      if (!isAdminRoute && !publicShareToken && !(params.get('resetToken') && params.get('email'))) {
        const stored = loadStoredActiveSession();
        if (stored?.mode === 'offline') {
          return {
            mode: 'offline',
            session: null,
            vaultKey: null,
            scopeKey: stored.scopeKey,
          };
        }
      }
    }
    return null;
  });
  const [restoringSession, setRestoringSession] = useState<boolean>(() => {
    if (typeof window === 'undefined' || isAdminRoute || publicShareToken) return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' || (params.get('resetToken') && params.get('email'))) {
      return false;
    }
    if (window.location.hash.startsWith('#googleAuth=')) return false;
    const stored = loadStoredActiveSession();
    return Boolean(stored && stored.mode === 'server');
  });

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [pending, setPending] = useState<PendingSyncState>({
    dirtyNoteIds: [],
    dirtyFolderIds: [],
    lastSyncedAt: 0,
  });
  const [vaultReady, setVaultReady] = useState(false);

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'note' | 'folder'; id: string } | null>(null);
  const [userShares, setUserShares] = useState<ShareLinkInfo[]>([]);
  const [editingDiagram, setEditingDiagram] = useState<ConceptDiagram | null>(null);
  const [editingDiagramIsExisting, setEditingDiagramIsExisting] = useState(false);
  const [noteColorPickerOpen, setNoteColorPickerOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title?: string;
    items: ContextMenuItem[];
  } | null>(null);

  const [historyMeta, setHistoryMeta] = useState<{ canUndo: boolean; canRedo: boolean }>({
    canUndo: false,
    canRedo: false,
  });
  const historyMapRef = useRef<Map<string, NoteHistoryStack>>(new Map());

  // Live synchronous refs eliminate race conditions when typing while background sync runs
  const notesRef = useRef<NoteItem[]>(notes);
  notesRef.current = notes;
  const foldersRef = useRef<FolderItem[]>(folders);
  foldersRef.current = folders;
  const pendingRef = useRef<PendingSyncState>(pending);
  pendingRef.current = pending;
  const syncInFlightRef = useRef(false);

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'syncing' | 'synced' | 'offline'>(
    'idle',
  );

  const editorRef = useRef<SegmentedMarkdownEditorHandle | null>(null);
  const pendingInsertOffsetRef = useRef<number | undefined>(undefined);
  const saveTimerRef = useRef<number | null>(null);

  const showNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveEditorSettings(settings);
  }, [settings]);

  // Persist active note selection across browser refreshes
  useEffect(() => {
    if (!vaultReady || !vaultCtx || !activeNoteId) return;
    try {
      window.localStorage.setItem(getActiveNoteStorageKey(vaultCtx.scopeKey), activeNoteId);
    } catch {
      // Ignore storage quota errors
    }
  }, [vaultReady, vaultCtx, activeNoteId]);

  // Handle Google OAuth hash callback
  useEffect(() => {
    if (isAdminRoute || typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash) return;

    if (hash.startsWith('#authError=')) {
      const msg = decodeURIComponent(hash.slice('#authError='.length)).replace(/_/g, ' ');
      setInitialAuthError(`Google sign-in failed (${msg}). Please try again.`);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }

    if (hash.startsWith('#googleAuth=')) {
      const encoded = hash.slice('#googleAuth='.length);
      const session = decodeBase64UrlJson<AuthSession>(encoded);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (!session?.token || !session.user) {
        setInitialAuthError('Invalid Google authentication payload.');
        return;
      }

      const savedPassphrase = window.localStorage.getItem(
        `opennote_passphrase_${session.user.id}`,
      );
      if (savedPassphrase && savedPassphrase.length >= 6) {
        deriveVaultKey(savedPassphrase, session.user.vaultSalt)
          .then((vaultKey) => {
            const ctx: VaultContextState = {
              mode: 'server',
              session,
              vaultKey,
              scopeKey: `user_${session.user.id}`,
            };
            void persistActiveSession(ctx);
            setVaultCtx(ctx);
          })
          .catch(() => setPendingGoogleSession(session));
      } else {
        setPendingGoogleSession(session);
      }
    }
  }, [isAdminRoute]);

  // Restore logged-in server session across browser refreshes (HTTPS or local)
  useEffect(() => {
    if (!restoringSession) return;
    let cancelled = false;
    (async () => {
      const stored = loadStoredActiveSession();
      if (!stored || stored.mode !== 'server' || !stored.session || !stored.keyJwk) {
        if (!cancelled) setRestoringSession(false);
        return;
      }
      try {
        const importedKey = await importVaultKeyJwk(stored.keyJwk);
        let activeSession = stored.session;
        try {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${stored.session.token}` },
          });
          if (meRes.status === 401) {
            clearStoredActiveSession();
            if (!cancelled) {
              setVaultCtx(null);
              setRestoringSession(false);
            }
            return;
          }
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.user) {
              activeSession = { token: stored.session.token, user: meData.user };
            }
          }
        } catch {
          // Offline or temporary network blip: keep encrypted vault accessible with local stored key
        }

        if (!cancelled) {
          setVaultCtx({
            mode: 'server',
            session: activeSession,
            vaultKey: importedKey,
            scopeKey: stored.scopeKey,
          });
        }
      } catch {
        clearStoredActiveSession();
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restoringSession]);

  // Network online/offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load local offline vault when authenticated
  useEffect(() => {
    if (isAdminRoute || !vaultCtx) {
      setVaultReady(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const stored = await loadOfflineVault(vaultCtx.scopeKey);
      if (cancelled) return;

      let savedActiveId: string | null = null;
      try {
        savedActiveId = window.localStorage.getItem(getActiveNoteStorageKey(vaultCtx.scopeKey));
      } catch {
        savedActiveId = null;
      }

      if (stored.notes.length === 0 && stored.folders.length === 0) {
        const seed = createSeedWorkspace();
        foldersRef.current = seed.folders;
        notesRef.current = seed.notes;
        const initialPending: PendingSyncState = {
          dirtyNoteIds: seed.notes.map((n) => n.id),
          dirtyFolderIds: seed.folders.map((f) => f.id),
          lastSyncedAt: 0,
        };
        pendingRef.current = initialPending;
        setFolders(seed.folders);
        setNotes(seed.notes);
        setPending(initialPending);
        const restored = savedActiveId
          ? seed.notes.find((n) => n.id === savedActiveId && !n.deleted)
          : undefined;
        setActiveNoteId((restored ?? seed.notes[0])?.id ?? null);
        await saveOfflineVault(vaultCtx.scopeKey, seed.notes, seed.folders, initialPending);
      } else {
        foldersRef.current = stored.folders;
        notesRef.current = stored.notes;
        pendingRef.current = stored.pending;
        setFolders(stored.folders);
        setNotes(stored.notes);
        setPending(stored.pending);
        const restored = savedActiveId
          ? stored.notes.find((n) => n.id === savedActiveId && !n.deleted)
          : undefined;
        const firstActive = restored ?? stored.notes.find((n) => !n.deleted);
        setActiveNoteId(firstActive?.id ?? null);
      }
      setVaultReady(true);
      setSyncStatus(vaultCtx.mode === 'offline' ? 'offline' : 'synced');
    })();

    return () => {
      cancelled = true;
    };
  }, [vaultCtx, isAdminRoute]);

  const persistLocal = useCallback(
    (nextNotes: NoteItem[], nextFolders: FolderItem[], nextPending: PendingSyncState) => {
      if (!vaultCtx) return;
      setSyncStatus('saving');
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveOfflineVault(vaultCtx.scopeKey, nextNotes, nextFolders, nextPending).then(() => {
          setSyncStatus((prev) =>
            prev === 'syncing' ? prev : vaultCtx.mode === 'offline' || !isOnline ? 'offline' : 'synced',
          );
        });
      }, 180);
    },
    [vaultCtx, isOnline],
  );

  const syncWithServer = useCallback(
    async (overrideNotes?: NoteItem[], overrideFolders?: FolderItem[], overridePending?: PendingSyncState) => {
      if (!vaultCtx || vaultCtx.mode !== 'server' || !vaultCtx.session || !vaultCtx.vaultKey) {
        return;
      }
      if (!navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      if (syncInFlightRef.current) {
        return;
      }

      const snapshotNotes = overrideNotes ?? notesRef.current;
      const snapshotFolders = overrideFolders ?? foldersRef.current;
      const snapshotPending = overridePending ?? pendingRef.current;

      syncInFlightRef.current = true;
      setSyncStatus('syncing');
      try {
        const dirtyNotes = snapshotNotes.filter((n) => snapshotPending.dirtyNoteIds.includes(n.id));
        const dirtyFolders = snapshotFolders.filter((f) =>
          snapshotPending.dirtyFolderIds.includes(f.id),
        );

        const sentNoteVersions = new Map(dirtyNotes.map((n) => [n.id, n.version]));
        const sentFolderVersions = new Map(dirtyFolders.map((f) => [f.id, f.version]));

        const encryptedNotes: EncryptedEnvelope[] = await Promise.all(
          dirtyNotes.map(async (note) => {
            const { iv, ciphertext } = await encryptPayload(vaultCtx.vaultKey!, note);
            return {
              id: note.id,
              iv,
              ciphertext,
              updatedAt: note.updatedAt,
              version: note.version,
              deleted: note.deleted,
            };
          }),
        );

        const encryptedFolders: EncryptedEnvelope[] = await Promise.all(
          dirtyFolders.map(async (folder) => {
            const { iv, ciphertext } = await encryptPayload(vaultCtx.vaultKey!, folder);
            return {
              id: folder.id,
              iv,
              ciphertext,
              updatedAt: folder.updatedAt,
              version: folder.version,
              deleted: folder.deleted,
            };
          }),
        );

        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vaultCtx.session.token}`,
          },
          body: JSON.stringify({
            notes: encryptedNotes,
            folders: encryptedFolders,
          }),
        });

        if (!res.ok) {
          setSyncStatus('offline');
          return;
        }

        const data = (await res.json()) as {
          notes: EncryptedEnvelope[];
          folders: EncryptedEnvelope[];
          mcpInbox: Array<{ id: string; title: string; content: string; tags: string[]; createdAt: number }>;
          syncedAt: number;
        };

        const decryptedNotes: NoteItem[] = [];
        for (const env of data.notes) {
          try {
            const item = await decryptPayload<NoteItem>(vaultCtx.vaultKey!, env.iv, env.ciphertext);
            decryptedNotes.push(item);
          } catch {
            // Skip envelopes encrypted with a different key
          }
        }

        const decryptedFolders: FolderItem[] = [];
        for (const env of data.folders) {
          try {
            const item = await decryptPayload<FolderItem>(vaultCtx.vaultKey!, env.iv, env.ciphertext);
            decryptedFolders.push(item);
          } catch {
            // Skip
          }
        }

        const inboxNotes: NoteItem[] = (data.mcpInbox ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          folderId: null,
          tags: item.tags,
          createdAt: item.createdAt,
          updatedAt: Date.now(),
          version: 1,
          exposeToMcp: true,
        }));

        // Always merge against live refs so keystrokes typed while syncing are NEVER lost
        const liveNotes = notesRef.current;
        const liveFolders = foldersRef.current;
        const livePending = pendingRef.current;

        let mergedNotes = mergeVersionedItems(
          mergeVersionedItems(liveNotes, decryptedNotes),
          inboxNotes,
        );
        let mergedFolders = mergeVersionedItems(liveFolders, decryptedFolders);

        const stillDirtyNoteIds = livePending.dirtyNoteIds.filter((id) => {
          const sentVer = sentNoteVersions.get(id);
          if (sentVer === undefined) return true;
          const liveNote = liveNotes.find((n) => n.id === id);
          return Boolean(liveNote && liveNote.version > sentVer);
        });
        const stillDirtyFolderIds = livePending.dirtyFolderIds.filter((id) => {
          const sentVer = sentFolderVersions.get(id);
          if (sentVer === undefined) return true;
          const liveFolder = liveFolders.find((f) => f.id === id);
          return Boolean(liveFolder && liveFolder.version > sentVer);
        });

        let nextDirtyNoteIds = Array.from(
          new Set([...stillDirtyNoteIds, ...inboxNotes.map((n) => n.id)]),
        );
        let nextDirtyFolderIds = Array.from(new Set(stillDirtyFolderIds));

        // Fetch & two-way sync active public HTTPS shares
        try {
          const sharesListRes = await fetch('/api/shares', {
            headers: { Authorization: `Bearer ${vaultCtx.session.token}` },
          });
          if (sharesListRes.ok) {
            const sharesData = (await sharesListRes.json()) as { shares?: ShareLinkInfo[] };
            const currentShares = sharesData.shares ?? [];
            if (currentShares.length > 0) {
              const snapshots = currentShares
                .map((s) => {
                  const snap = collectShareSnapshot(
                    s.targetType,
                    s.targetId,
                    mergedFolders,
                    mergedNotes,
                  );
                  if (!snap) return null;
                  return {
                    shareId: s.id,
                    title: snap.title,
                    folders: snap.folders,
                    notes: snap.notes,
                  };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);

              const shareSyncRes = await fetch('/api/shares/sync', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${vaultCtx.session.token}`,
                },
                body: JSON.stringify({ snapshots }),
              });
              if (shareSyncRes.ok) {
                const syncedShares = (await shareSyncRes.json()) as {
                  shares?: ShareLinkInfo[];
                  visitorNotes?: NoteItem[];
                  visitorFolders?: FolderItem[];
                };
                setUserShares(syncedShares.shares ?? currentShares);
                if (syncedShares.visitorNotes?.length) {
                  mergedNotes = mergeVersionedItems(mergedNotes, syncedShares.visitorNotes);
                  nextDirtyNoteIds = Array.from(
                    new Set([
                      ...nextDirtyNoteIds,
                      ...syncedShares.visitorNotes.map((n) => n.id),
                    ]),
                  );
                }
                if (syncedShares.visitorFolders?.length) {
                  mergedFolders = mergeVersionedItems(mergedFolders, syncedShares.visitorFolders);
                  nextDirtyFolderIds = Array.from(
                    new Set([
                      ...nextDirtyFolderIds,
                      ...syncedShares.visitorFolders.map((f) => f.id),
                    ]),
                  );
                }
              }
            } else {
              setUserShares([]);
            }
          }
        } catch {
          // Non-fatal share sync failure
        }

        const nextPending: PendingSyncState = {
          dirtyNoteIds: nextDirtyNoteIds,
          dirtyFolderIds: nextDirtyFolderIds,
          lastSyncedAt: data.syncedAt,
        };

        notesRef.current = mergedNotes;
        foldersRef.current = mergedFolders;
        pendingRef.current = nextPending;
        setNotes(mergedNotes);
        setFolders(mergedFolders);
        setPending(nextPending);
        await saveOfflineVault(vaultCtx.scopeKey, mergedNotes, mergedFolders, nextPending);
        setSyncStatus(
          nextDirtyNoteIds.length > 0 || nextDirtyFolderIds.length > 0 ? 'saving' : 'synced',
        );
      } catch {
        setSyncStatus('offline');
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [vaultCtx],
  );

  useEffect(() => {
    if (vaultReady && vaultCtx?.mode === 'server') {
      syncWithServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultReady]);

  useEffect(() => {
    if (!vaultCtx || vaultCtx.mode !== 'server' || !isOnline) return;
    if (pending.dirtyNoteIds.length === 0 && pending.dirtyFolderIds.length === 0) return;

    const timer = window.setTimeout(() => {
      syncWithServer();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [vaultCtx, isOnline, pending, syncWithServer]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId && !n.deleted) ?? null,
    [notes, activeNoteId],
  );

  const breadcrumbs = useMemo(
    () => (activeNote ? getFolderBreadcrumbs(folders, activeNote.folderId) : []),
    [folders, activeNote],
  );



  // Initialize or refresh undo/redo meta when switching active note
  const syncHistoryMeta = useCallback((noteId: string | null) => {
    if (!noteId) {
      setHistoryMeta({ canUndo: false, canRedo: false });
      return;
    }
    const stack = historyMapRef.current.get(noteId);
    setHistoryMeta({
      canUndo: Boolean(stack && stack.past.length > 0),
      canRedo: Boolean(stack && stack.future.length > 0),
    });
  }, []);

  useEffect(() => {
    if (!activeNote) {
      setHistoryMeta({ canUndo: false, canRedo: false });
      return;
    }
    if (!historyMapRef.current.has(activeNote.id)) {
      historyMapRef.current.set(
        activeNote.id,
        createHistoryStack({
          title: activeNote.title,
          content: activeNote.content,
          cursorStart: 0,
          cursorEnd: 0,
          timestamp: Date.now(),
        }),
      );
    }
    syncHistoryMeta(activeNote.id);
  }, [activeNote?.id, syncHistoryMeta]);

  const mutateNote = useCallback(
    (
      noteId: string,
      updater: (prev: NoteItem) => NoteItem,
      options?: { recordHistory?: boolean; forceDiscrete?: boolean; cursorStart?: number; cursorEnd?: number },
    ) => {
      const nextNotes = notesRef.current.map((n) => (n.id === noteId ? updater(n) : n));
      const updatedNote = nextNotes.find((n) => n.id === noteId);

      if (options?.recordHistory && updatedNote) {
        const currentStack =
          historyMapRef.current.get(noteId) ??
          createHistoryStack({
            title: updatedNote.title,
            content: updatedNote.content,
            cursorStart: 0,
            cursorEnd: 0,
            timestamp: Date.now(),
          });
        const currentSel = editorRef.current?.getGlobalSelection();
        const cStart =
          options.cursorStart ?? currentSel?.start ?? updatedNote.content.length;
        const cEnd =
          options.cursorEnd ?? currentSel?.end ?? updatedNote.content.length;
        const nextStack = pushHistorySnapshot(
          currentStack,
          {
            title: updatedNote.title,
            content: updatedNote.content,
            cursorStart: cStart,
            cursorEnd: cEnd,
            timestamp: Date.now(),
          },
          Boolean(options.forceDiscrete),
        );
        historyMapRef.current.set(noteId, nextStack);
        syncHistoryMeta(noteId);
      }

      const nextPending: PendingSyncState = {
        ...pendingRef.current,
        dirtyNoteIds: Array.from(new Set([...pendingRef.current.dirtyNoteIds, noteId])),
      };
      notesRef.current = nextNotes;
      pendingRef.current = nextPending;
      setNotes(nextNotes);
      setPending(nextPending);
      persistLocal(nextNotes, foldersRef.current, nextPending);
    },
    [persistLocal, syncHistoryMeta],
  );

  const handleUndo = useCallback(() => {
    if (!activeNote) return;
    const stack = historyMapRef.current.get(activeNote.id);
    if (!stack) return;
    const { stack: nextStack, restored } = undoHistory(stack);
    if (!restored) return;
    historyMapRef.current.set(activeNote.id, nextStack);
    syncHistoryMeta(activeNote.id);

    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        title: restored.title,
        content: restored.content,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: false },
    );

    editorRef.current?.focusGlobalRange(restored.cursorStart, restored.cursorEnd);
  }, [activeNote, mutateNote, syncHistoryMeta]);

  const handleRedo = useCallback(() => {
    if (!activeNote) return;
    const stack = historyMapRef.current.get(activeNote.id);
    if (!stack) return;
    const { stack: nextStack, restored } = redoHistory(stack);
    if (!restored) return;
    historyMapRef.current.set(activeNote.id, nextStack);
    syncHistoryMeta(activeNote.id);

    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        title: restored.title,
        content: restored.content,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: false },
    );

    editorRef.current?.focusGlobalRange(restored.cursorStart, restored.cursorEnd);
  }, [activeNote, mutateNote, syncHistoryMeta]);

  const handleCreateNote = (folderId: string | null) => {
    const now = Date.now();
    const newNote: NoteItem = {
      id: `note_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: 'Untitled Note',
      content: '# Untitled Note\n\nStart writing Markdown or insert a concept diagram.\n',
      folderId,
      tags: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      exposeToMcp: false,
    };
    const nextNotes = [newNote, ...notesRef.current];
    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyNoteIds: Array.from(new Set([...pendingRef.current.dirtyNoteIds, newNote.id])),
    };
    notesRef.current = nextNotes;
    pendingRef.current = nextPending;
    setNotes(nextNotes);
    setPending(nextPending);
    setActiveNoteId(newNote.id);
    setEditingDiagram(null);
    persistLocal(nextNotes, foldersRef.current, nextPending);
  };

  const handleDeleteNote = (noteId: string) => {
    const now = Date.now();
    const nextNotes = notesRef.current.map((n) =>
      n.id === noteId ? { ...n, deleted: true, updatedAt: now, version: n.version + 1 } : n,
    );
    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyNoteIds: Array.from(new Set([...pendingRef.current.dirtyNoteIds, noteId])),
    };
    notesRef.current = nextNotes;
    pendingRef.current = nextPending;
    setNotes(nextNotes);
    setPending(nextPending);
    if (activeNoteId === noteId) {
      const fallback = nextNotes.find((n) => !n.deleted);
      setActiveNoteId(fallback?.id ?? null);
    }
    persistLocal(nextNotes, foldersRef.current, nextPending);
  };

  const handleCreateFolder = (
    name: string,
    parentId: string | null,
    color: FolderColor = 'indigo',
  ) => {
    const now = Date.now();
    const folder: FolderItem = {
      id: `fld_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      parentId,
      color,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    const nextFolders = [...foldersRef.current, folder];
    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyFolderIds: Array.from(new Set([...pendingRef.current.dirtyFolderIds, folder.id])),
    };
    foldersRef.current = nextFolders;
    pendingRef.current = nextPending;
    setFolders(nextFolders);
    setPending(nextPending);
    persistLocal(notesRef.current, nextFolders, nextPending);
  };

  const handleRenameFolder = (folderId: string, name: string) => {
    const now = Date.now();
    const nextFolders = foldersRef.current.map((f) =>
      f.id === folderId ? { ...f, name, updatedAt: now, version: f.version + 1 } : f,
    );
    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyFolderIds: Array.from(new Set([...pendingRef.current.dirtyFolderIds, folderId])),
    };
    foldersRef.current = nextFolders;
    pendingRef.current = nextPending;
    setFolders(nextFolders);
    setPending(nextPending);
    persistLocal(notesRef.current, nextFolders, nextPending);
  };

  const handleChangeFolderColor = (folderId: string, color: FolderColor) => {
    const now = Date.now();
    const nextFolders = foldersRef.current.map((f) =>
      f.id === folderId ? { ...f, color, updatedAt: now, version: f.version + 1 } : f,
    );
    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyFolderIds: Array.from(new Set([...pendingRef.current.dirtyFolderIds, folderId])),
    };
    foldersRef.current = nextFolders;
    pendingRef.current = nextPending;
    setFolders(nextFolders);
    setPending(nextPending);
    persistLocal(notesRef.current, nextFolders, nextPending);
  };

  const handleChangeNoteColor = (noteId: string, color: FolderColor | undefined) => {
    mutateNote(noteId, (prev) => ({
      ...prev,
      color,
      updatedAt: Date.now(),
      version: prev.version + 1,
    }));
  };

  const handleDeleteFolder = (folderId: string) => {
    const now = Date.now();
    const targetFolder = foldersRef.current.find((f) => f.id === folderId);
    const fallbackParent = targetFolder?.parentId ?? null;

    const nextFolders = foldersRef.current.map((f) => {
      if (f.id === folderId) {
        return { ...f, deleted: true, updatedAt: now, version: f.version + 1 };
      }
      if (f.parentId === folderId) {
        return { ...f, parentId: fallbackParent, updatedAt: now, version: f.version + 1 };
      }
      return f;
    });

    const touchedNoteIds: string[] = [];
    const nextNotes = notesRef.current.map((n) => {
      if (n.folderId === folderId) {
        touchedNoteIds.push(n.id);
        return { ...n, folderId: fallbackParent, updatedAt: now, version: n.version + 1 };
      }
      return n;
    });

    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyFolderIds: Array.from(new Set([...pendingRef.current.dirtyFolderIds, folderId])),
      dirtyNoteIds: Array.from(new Set([...pendingRef.current.dirtyNoteIds, ...touchedNoteIds])),
    };
    foldersRef.current = nextFolders;
    notesRef.current = nextNotes;
    pendingRef.current = nextPending;
    setFolders(nextFolders);
    setNotes(nextNotes);
    setPending(nextPending);
    persistLocal(nextNotes, nextFolders, nextPending);
  };

  const handleMoveNote = (noteId: string, targetFolderId: string | null) => {
    mutateNote(noteId, (prev) => ({
      ...prev,
      folderId: targetFolderId,
      updatedAt: Date.now(),
      version: prev.version + 1,
    }));
  };

  const handleMoveFolder = (folderId: string, targetParentId: string | null) => {
    if (targetParentId && isDescendantFolder(foldersRef.current, targetParentId, folderId)) {
      return;
    }
    const now = Date.now();
    const nextFolders = foldersRef.current.map((f) =>
      f.id === folderId ? { ...f, parentId: targetParentId, updatedAt: now, version: f.version + 1 } : f,
    );
    const nextPending: PendingSyncState = {
      ...pendingRef.current,
      dirtyFolderIds: Array.from(new Set([...pendingRef.current.dirtyFolderIds, folderId])),
    };
    foldersRef.current = nextFolders;
    pendingRef.current = nextPending;
    setFolders(nextFolders);
    setPending(nextPending);
    persistLocal(notesRef.current, nextFolders, nextPending);
  };

  const wrapSelection = (before: string, after = '', placeholder = 'text') => {
    if (!activeNote) return;
    const sel = editorRef.current?.getGlobalSelection();
    const start = Math.min(sel?.start ?? activeNote.content.length, activeNote.content.length);
    const end = Math.min(sel?.end ?? start, activeNote.content.length);
    const selected = activeNote.content.slice(start, end) || placeholder;
    const nextText =
      activeNote.content.slice(0, start) +
      before +
      selected +
      after +
      activeNote.content.slice(end);
    const nextSelStart = start + before.length;
    const nextSelEnd = nextSelStart + selected.length;

    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        content: nextText,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: true, forceDiscrete: true, cursorStart: nextSelStart, cursorEnd: nextSelEnd },
    );

    editorRef.current?.focusGlobalRange(nextSelStart, nextSelEnd);
  };

  const insertListPrefix = (prefix: string, placeholder = 'List item') => {
    if (!activeNote) return;
    const sel = editorRef.current?.getGlobalSelection();
    const start = Math.min(sel?.start ?? activeNote.content.length, activeNote.content.length);
    const end = Math.min(sel?.end ?? start, activeNote.content.length);
    const selected = activeNote.content.slice(start, end) || placeholder;
    const needsNewline = start > 0 && activeNote.content[start - 1] !== '\n';
    const leading = needsNewline ? `\n${prefix}` : prefix;
    const nextText =
      activeNote.content.slice(0, start) + leading + selected + activeNote.content.slice(end);
    const nextSelStart = start + leading.length;
    const nextSelEnd = nextSelStart + selected.length;

    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        content: nextText,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: true, forceDiscrete: true, cursorStart: nextSelStart, cursorEnd: nextSelEnd },
    );

    editorRef.current?.focusGlobalRange(nextSelStart, nextSelEnd);
  };

  const handleAlignSelection = (align: TextAlignment) => {
    if (!activeNote) return;
    const sel = editorRef.current?.getGlobalSelection();
    const start = sel?.start ?? activeNote.content.length;
    const end = sel?.end ?? start;
    const result = applyAlignmentToMarkdown(activeNote.content, start, end, align);
    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        content: result.content,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      {
        recordHistory: true,
        forceDiscrete: true,
        cursorStart: result.cursorStart,
        cursorEnd: result.cursorEnd,
      },
    );
    editorRef.current?.focusGlobalRange(result.cursorStart, result.cursorEnd);
  };

  const handleOpenNewDiagram = () => {
    if (!activeNote) return;
    const sel = editorRef.current?.getGlobalSelection();
    pendingInsertOffsetRef.current = sel ? sel.start : undefined;
    const n1 = createDefaultNode('hexagon', 64, 72, 1);
    const n2 = createDefaultNode('puzzle', 316, 72, 2);
    const edge = createEdge(n1.id, n2.id, 'connects');
    const fresh: ConceptDiagram = {
      id: `diag_${Date.now().toString(36)}`,
      title: 'Concept Map',
      nodes: [n1, n2],
      edges: [edge],
    };
    setEditingDiagram(fresh);
    setEditingDiagramIsExisting(false);
  };

  const handleEditDiagram = (diagram: ConceptDiagram) => {
    pendingInsertOffsetRef.current = undefined;
    setEditingDiagram(structuredClone(diagram));
    setEditingDiagramIsExisting(true);
  };

  const handleApplyDiagramToNote = (diagram: ConceptDiagram) => {
    if (!activeNote) return;
    const insertAt = editingDiagramIsExisting ? undefined : pendingInsertOffsetRef.current;
    pendingInsertOffsetRef.current = undefined;
    const updatedContent = upsertConceptBlockInMarkdown(activeNote.content, diagram, insertAt);
    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        content: updatedContent,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: true, forceDiscrete: true },
    );
    setEditingDiagram(null);
    setEditingDiagramIsExisting(false);
    showNotice('Concept diagram saved to note.');
  };

  const handleDeleteDiagram = (diagramId: string) => {
    if (!activeNote) return;
    const updatedContent = removeConceptBlockFromMarkdown(activeNote.content, diagramId);
    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        content: updatedContent,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: true, forceDiscrete: true },
    );
    if (editingDiagram?.id === diagramId) {
      setEditingDiagram(null);
      setEditingDiagramIsExisting(false);
    }
    showNotice('Concept diagram deleted.');
  };

  const handleDuplicateDiagram = (diagram: ConceptDiagram) => {
    if (!activeNote) return;
    const copy = duplicateConceptDiagram(diagram);
    const updatedContent = upsertConceptBlockInMarkdown(activeNote.content, copy);
    mutateNote(
      activeNote.id,
      (prev) => ({
        ...prev,
        content: updatedContent,
        updatedAt: Date.now(),
        version: prev.version + 1,
      }),
      { recordHistory: true, forceDiscrete: true },
    );
    showNotice(`Duplicated "${diagram.title || 'Concept Diagram'}".`);
  };


  const handleCopyEditorText = async (selected: string) => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected);
      showNotice('Copied selection to clipboard.');
    } catch {
      showNotice('Use Ctrl+C / Cmd+C to copy.');
    }
  };

  const handlePasteAtCursor = async (selStart: number, selEnd: number) => {
    if (!activeNote) return;
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText) {
        showNotice('Clipboard is empty.');
        return;
      }
      const nextText =
        activeNote.content.slice(0, selStart) + clipText + activeNote.content.slice(selEnd);
      const nextCursor = selStart + clipText.length;
      mutateNote(
        activeNote.id,
        (prev) => ({
          ...prev,
          content: nextText,
          updatedAt: Date.now(),
          version: prev.version + 1,
        }),
        { recordHistory: true, forceDiscrete: true, cursorStart: nextCursor, cursorEnd: nextCursor },
      );
      editorRef.current?.focusGlobalRange(nextCursor, nextCursor);
    } catch {
      showNotice('Clipboard access blocked by browser — press Ctrl+V / Cmd+V to paste.');
    }
  };

  const handlePrintActiveNote = () => {
    if (!activeNote) return;
    printNotes(activeNote.title || 'Untitled Note', [activeNote]);
    showNotice(`Opening print dialog for "${activeNote.title || 'Untitled Note'}".`);
  };

  const handlePrintFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId && !f.deleted);
    if (!folder) return;
    const folderNotes = collectFolderNotesRecursive(folderId, folders, notes);
    if (folderNotes.length === 0) {
      showNotice(`Folder "${folder.name}" has no notes to print.`);
      return;
    }
    printNotes(folder.name, folderNotes);
    showNotice(`Opening print dialog for "${folder.name}" (${folderNotes.length} notes).`);
  };

  const handleEditorContextMenu = (
    e: React.MouseEvent<HTMLTextAreaElement>,
    selStart: number,
    selEnd: number,
  ) => {
    if (!activeNote) return;
    e.preventDefault();
    const selectedText = activeNote.content.slice(selStart, selEnd);
    const cursorDiagram = findConceptDiagramAtCursor(activeNote.content, selStart);

    const items: ContextMenuItem[] = [
      {
        id: 'ctx-copy',
        label: 'Copy',
        shortcut: 'Ctrl+C',
        disabled: selectedText.length === 0,
        icon: <Copy className="w-3.5 h-3.5" />,
        onSelect: () => handleCopyEditorText(selectedText),
      },
      {
        id: 'ctx-paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        icon: <ClipboardPaste className="w-3.5 h-3.5" />,
        onSelect: () => handlePasteAtCursor(selStart, selEnd),
      },
      {
        id: 'ctx-highlight',
        label: 'Highlight Selection',
        shortcut: '==text==',
        dividerBefore: true,
        icon: <Highlighter className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
        onSelect: () => wrapSelection('==', '==', 'highlighted'),
      },
      {
        id: 'ctx-bold',
        label: 'Bold',
        shortcut: '**text**',
        icon: <Bold className="w-3.5 h-3.5" />,
        onSelect: () => wrapSelection('**', '**', 'bold'),
      },
      {
        id: 'ctx-italic',
        label: 'Italic',
        shortcut: '*text*',
        icon: <Italic className="w-3.5 h-3.5" />,
        onSelect: () => wrapSelection('*', '*', 'italic'),
      },
      {
        id: 'ctx-underline',
        label: 'Underline',
        shortcut: '<u>text</u>',
        icon: <Underline className="w-3.5 h-3.5" />,
        onSelect: () => wrapSelection('<u>', '</u>', 'underlined'),
      },
      {
        id: 'ctx-add-diagram',
        label: 'Add Concept Diagram',
        dividerBefore: true,
        icon: <Shapes className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
        onSelect: handleOpenNewDiagram,
      },
    ];

    if (cursorDiagram) {
      items.push(
        {
          id: 'ctx-edit-diagram',
          label: `Edit "${cursorDiagram.title || 'Concept Diagram'}"`,
          icon: <Edit3 className="w-3.5 h-3.5" />,
          onSelect: () => handleEditDiagram(cursorDiagram),
        },
        {
          id: 'ctx-delete-diagram',
          label: `Delete "${cursorDiagram.title || 'Concept Diagram'}"`,
          danger: true,
          icon: <Trash2 className="w-3.5 h-3.5" />,
          onSelect: () => handleDeleteDiagram(cursorDiagram.id),
        },
      );
    }

    items.push(
      {
        id: 'ctx-undo',
        label: 'Undo',
        shortcut: 'Ctrl+Z',
        dividerBefore: true,
        disabled: !historyMeta.canUndo,
        icon: <Undo2 className="w-3.5 h-3.5" />,
        onSelect: handleUndo,
      },
      {
        id: 'ctx-redo',
        label: 'Redo',
        shortcut: 'Ctrl+Y',
        disabled: !historyMeta.canRedo,
        icon: <Redo2 className="w-3.5 h-3.5" />,
        onSelect: handleRedo,
      },
      {
        id: 'ctx-share-note',
        label: 'Share Note',
        dividerBefore: true,
        icon: <Share2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
        onSelect: () => setShareTarget({ type: 'note', id: activeNote.id }),
      },
      {
        id: 'ctx-print-note',
        label: 'Print Note',
        icon: <Printer className="w-3.5 h-3.5" />,
        onSelect: handlePrintActiveNote,
      },
    );

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: 'Editor Actions',
      items,
    });
  };

  const handleDiagramContextMenu = (e: React.MouseEvent, diagram: ConceptDiagram) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: diagram.title || 'Concept Diagram',
      items: [
        {
          id: 'diag-edit',
          label: 'Edit Concept Diagram',
          icon: <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
          onSelect: () => handleEditDiagram(diagram),
        },
        {
          id: 'diag-duplicate',
          label: 'Duplicate Diagram',
          icon: <Copy className="w-3.5 h-3.5" />,
          onSelect: () => handleDuplicateDiagram(diagram),
        },
        {
          id: 'diag-add-new',
          label: 'Add New Concept Diagram',
          icon: <Shapes className="w-3.5 h-3.5" />,
          onSelect: handleOpenNewDiagram,
        },
        {
          id: 'diag-delete',
          label: 'Delete Diagram',
          danger: true,
          dividerBefore: true,
          icon: <Trash2 className="w-3.5 h-3.5" />,
          onSelect: () => handleDeleteDiagram(diagram.id),
        },
      ],
    });
  };

  const handlePreviewContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeNote) return;
    e.preventDefault();
    const selectionText = window.getSelection()?.toString() ?? '';
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: 'Note Actions',
      items: [
        {
          id: 'pv-copy',
          label: 'Copy Selection',
          shortcut: 'Ctrl+C',
          disabled: selectionText.length === 0,
          icon: <Copy className="w-3.5 h-3.5" />,
          onSelect: () => handleCopyEditorText(selectionText),
        },
        {
          id: 'pv-add-diag',
          label: 'Add Concept Diagram',
          dividerBefore: true,
          icon: <Shapes className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
          onSelect: handleOpenNewDiagram,
        },
        {
          id: 'pv-undo',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          disabled: !historyMeta.canUndo,
          icon: <Undo2 className="w-3.5 h-3.5" />,
          onSelect: handleUndo,
        },
        {
          id: 'pv-redo',
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          disabled: !historyMeta.canRedo,
          icon: <Redo2 className="w-3.5 h-3.5" />,
          onSelect: handleRedo,
        },
        {
          id: 'pv-print-note',
          label: 'Print Note',
          dividerBefore: true,
          icon: <Printer className="w-3.5 h-3.5" />,
          onSelect: handlePrintActiveNote,
        },
      ],
    });
  };

  const handleSyncMcpBridge = async (): Promise<number> => {
    if (!vaultCtx?.session) return 0;
    const folderMap = new Map(folders.filter((f) => !f.deleted).map((f) => [f.id, f]));
    const buildPath = (folderId: string | null) => {
      const chain = getFolderBreadcrumbs(Array.from(folderMap.values()), folderId);
      return chain.map((c) => c.name).join('/') || '/';
    };

    const shared = notes
      .filter((n) => !n.deleted && n.exposeToMcp)
      .map((n) => ({
        id: n.id,
        title: n.title,
        folderPath: buildPath(n.folderId),
        tags: getAllNoteTags(n),
        content: n.content,
        updatedAt: n.updatedAt,
      }));

    await fetch('/api/mcp-bridge/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vaultCtx.session.token}`,
      },
      body: JSON.stringify({ notes: shared }),
    });
    return shared.length;
  };

  const handleClickWikilink = (targetTitle: string) => {
    const normalized = targetTitle.trim().toLowerCase();
    const match = notes.find(
      (n) => !n.deleted && n.title.trim().toLowerCase() === normalized,
    );
    if (match) {
      setActiveNoteId(match.id);
      setEditingDiagram(null);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNote) return;
    const clean = newTagInput.trim().replace(/^#/, '').toLowerCase();
    if (!clean) return;
    if (!activeNote.tags.includes(clean)) {
      mutateNote(activeNote.id, (prev) => ({
        ...prev,
        tags: [...prev.tags, clean],
        updatedAt: Date.now(),
        version: prev.version + 1,
      }));
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeNote) return;
    mutateNote(activeNote.id, (prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
      updatedAt: Date.now(),
      version: prev.version + 1,
    }));
  };

  if (publicShareToken) {
    return (
      <SharedView
        token={publicShareToken}
        theme={settings.theme}
        onToggleTheme={() =>
          setSettings((prev) => ({
            ...prev,
            theme: prev.theme === 'dark' ? 'light' : 'dark',
          }))
        }
      />
    );
  }

  if (isAdminRoute) {
    return (
      <AdminDashboard
        theme={settings.theme}
        onToggleTheme={() =>
          setSettings((prev) => ({
            ...prev,
            theme: prev.theme === 'dark' ? 'light' : 'dark',
          }))
        }
      />
    );
  }

  if (restoringSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm">
        Restoring encrypted session...
      </div>
    );
  }

  if (!vaultCtx) {
    return (
      <AuthGate
        pendingGoogleSession={pendingGoogleSession}
        initialAuthError={initialAuthError}
        initialResetToken={resetParams?.token ?? null}
        initialResetEmail={resetParams?.email ?? null}
        onClearGoogleSession={() => setPendingGoogleSession(null)}
        onClearResetParams={() => {
          setResetParams(null);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }}
        onAuthenticated={({ mode, session, vaultKey, scopeKey }) => {
          setPendingGoogleSession(null);
          const nextCtx: VaultContextState = {
            mode,
            session: session ?? null,
            vaultKey: vaultKey ?? null,
            scopeKey,
          };
          void persistActiveSession(nextCtx);
          setVaultCtx(nextCtx);
        }}
      />
    );
  }

  if (!vaultReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm">
        Unlocking vault...
      </div>
    );
  }

  const editorFontClass = getEditorFontClass(settings.fontFamily);

  const wordCount = activeNote
    ? activeNote.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="h-screen flex bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        folders={folders}
        notes={notes}
        activeNoteId={activeNoteId}
        searchQuery={searchQuery}
        activeTag={activeTag}
        onSearchChange={setSearchQuery}
        onSelectTag={setActiveTag}
        onSelectNote={(id) => {
          setActiveNoteId(id);
          setEditingDiagram(null);
          setNoteColorPickerOpen(false);
        }}
        onCreateNote={handleCreateNote}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onChangeFolderColor={handleChangeFolderColor}
        onDeleteFolder={handleDeleteFolder}
        onPrintFolder={handlePrintFolder}
        onShareFolder={(folderId) => setShareTarget({ type: 'folder', id: folderId })}
        onShareNote={(noteId) => setShareTarget({ type: 'note', id: noteId })}
        onChangeNoteColor={handleChangeNoteColor}
        onDeleteNote={handleDeleteNote}
        onMoveNote={handleMoveNote}
        onMoveFolder={handleMoveFolder}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Bar */}
        <header className="h-14 px-4 2xl:px-8 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-white dark:bg-slate-950 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open file navigation sidebar"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0 truncate">
              <span className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                opennote
              </span>
              {breadcrumbs.map((folder) => {
                const colorSpec = FOLDER_COLORS[folder.color ?? 'indigo'] ?? FOLDER_COLORS.indigo;
                return (
                  <React.Fragment key={folder.id}>
                    <span aria-hidden="true">/</span>
                    <span className={`truncate max-w-[140px] 2xl:max-w-[200px] font-medium ${colorSpec.iconClass}`}>
                      {folder.name}
                    </span>
                  </React.Fragment>
                );
              })}
              {activeNote && (
                <>
                  <span aria-hidden="true">/</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate">
                    {activeNote.title || 'Untitled Note'}
                  </span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => syncWithServer()}
              disabled={vaultCtx.mode === 'offline'}
              aria-label="Sync vault"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {syncStatus === 'offline' || vaultCtx.mode === 'offline' ? (
                <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              ) : syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="hidden sm:inline">
                {vaultCtx.mode === 'offline'
                  ? 'Offline Vault'
                  : syncStatus === 'saving'
                    ? 'Saving...'
                    : syncStatus === 'syncing'
                      ? 'Syncing...'
                      : syncStatus === 'offline'
                        ? 'Offline Queued'
                        : 'Note Synced'}
              </span>
            </button>

            {activeNote && (
              <>
                <button
                  type="button"
                  onClick={() => setShareTarget({ type: 'note', id: activeNote.id })}
                  aria-label="Share note"
                  title="Share note over HTTPS"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <Share2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden sm:inline">Share</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintActiveNote}
                  aria-label="Print note"
                  title="Print note"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="hidden sm:inline">Print</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setMcpModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plug className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>MCP Connect</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  theme: prev.theme === 'dark' ? 'light' : 'dark',
                }))
              }
              aria-label={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
              title={settings.theme === 'dark' ? 'Light mode' : 'Night mode'}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                clearStoredActiveSession();
                setUserShares([]);
                setVaultCtx(null);
              }}
              aria-label="Lock vault"
              title="Lock vault"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {!activeNote ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              No note selected
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
              Pick a note from the sidebar or create a new Markdown document with concept
              diagrams.
            </p>
            <button
              type="button"
              onClick={() => handleCreateNote(null)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              Create New Note
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Formatting, Undo/Redo, Office Tools & View Toolbar */}
            <div className="px-4 2xl:px-8 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-900/50 shrink-0">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!historyMeta.canUndo}
                  aria-label="Undo edit"
                  title="Undo (Ctrl+Z)"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!historyMeta.canRedo}
                  aria-label="Redo edit"
                  title="Redo (Ctrl+Y)"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none"
                >
                  <Redo2 className="w-4 h-4" />
                </button>

                <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

                <button
                  type="button"
                  onClick={() => wrapSelection('# ', '', 'Heading')}
                  aria-label="Heading 1"
                  title="Heading 1"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Heading1 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('## ', '', 'Section')}
                  aria-label="Heading 2"
                  title="Heading 2"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Heading2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('**', '**', 'bold')}
                  aria-label="Bold"
                  title="Bold"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('*', '*', 'italic')}
                  aria-label="Italic"
                  title="Italic"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('<u>', '</u>', 'underlined')}
                  aria-label="Underline"
                  title="Underline"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('==', '==', 'highlighted')}
                  aria-label="Highlight text"
                  title="Highlight text"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-100/80 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 hover:bg-amber-200/80 dark:hover:bg-amber-900/60"
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Highlight</span>
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('`', '`', 'code')}
                  aria-label="Inline code"
                  title="Inline code"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Code className="w-4 h-4" />
                </button>

                <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

                <button
                  type="button"
                  onClick={() => insertListPrefix('- ', 'List item')}
                  aria-label="Bullet list"
                  title="Bullet list"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => insertListPrefix('1. ', 'List item')}
                  aria-label="Numbered list"
                  title="Numbered list"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => insertListPrefix('- [ ] ', 'Task item')}
                  aria-label="Insert checklist"
                  title="Checklist"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <CheckSquare className="w-4 h-4" />
                </button>

                <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

                <button
                  type="button"
                  onClick={() => handleAlignSelection('left')}
                  aria-label="Align left"
                  title="Align left"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <AlignLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAlignSelection('center')}
                  aria-label="Align center"
                  title="Align center"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <AlignCenter className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAlignSelection('right')}
                  aria-label="Align right"
                  title="Align right"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <AlignRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    wrapSelection(
                      '\n| Column A | Column B |\n| --- | --- |\n| Value 1 | Value 2 |\n',
                      '',
                      '',
                    )
                  }
                  aria-label="Insert table"
                  title="Insert table"
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  <Table className="w-4 h-4" />
                </button>

                <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleOpenNewDiagram}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-xs font-medium whitespace-nowrap shrink-0"
                >
                  <Shapes className="w-3.5 h-3.5" />
                  Add Concept Diagram
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Editor font family"
                  value={settings.fontFamily}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fontFamily: e.target.value as EditorFontFamily,
                    }))
                  }
                  className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  <option value="sans">Sans (Jakarta)</option>
                  <option value="arial">Arial</option>
                  <option value="serif">Serif (Source)</option>
                  <option value="mono">Mono (JetBrains)</option>
                  <option value="khmer_battambang">Khmer OS Battambang</option>
                  <option value="khmer_siemreap">Khmer OS Siemreap</option>
                  <option value="khmer_muollight">Khmer OS Muol Light</option>
                </select>

                <select
                  aria-label="Editor font size"
                  value={settings.fontSize}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fontSize: Number(e.target.value),
                    }))
                  }
                  className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 tabular-nums"
                >
                  <option value={13}>13px</option>
                  <option value={15}>15px</option>
                  <option value={17}>17px</option>
                  <option value={19}>19px</option>
                </select>

                <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
                  {(['edit', 'split', 'preview'] as EditorViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, viewMode: mode }))}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                        settings.viewMode === mode
                          ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Note Title, File Color, Folder Assignment & Tags Header */}
            <div className="px-6 2xl:px-8 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-950 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                  {activeNote.color && (
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: FOLDER_COLORS[activeNote.color]?.swatch }}
                      aria-hidden="true"
                    />
                  )}
                  <input
                    type="text"
                    aria-label="Note title"
                    value={activeNote.title}
                    onChange={(e) =>
                      mutateNote(
                        activeNote.id,
                        (prev) => ({
                          ...prev,
                          title: e.target.value,
                          updatedAt: Date.now(),
                          version: prev.version + 1,
                        }),
                        { recordHistory: true },
                      )
                    }
                    placeholder="Untitled Note"
                    className="flex-1 min-w-[160px] text-xl font-bold tracking-tight bg-transparent text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setNoteColorPickerOpen((prev) => !prev)}
                      aria-label="Customize active file color"
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
                    >
                      <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>File Color</span>
                      {activeNote.color && (
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: FOLDER_COLORS[activeNote.color]?.swatch }}
                        />
                      )}
                    </button>

                    {noteColorPickerOpen && (
                      <div
                        role="group"
                        aria-label="Active file color swatches"
                        className="absolute right-0 mt-1.5 z-30 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex items-center gap-1.5"
                      >
                        <button
                          type="button"
                          title="Default"
                          aria-label="Set active file color to Default"
                          onClick={() => {
                            handleChangeNoteColor(activeNote.id, undefined);
                            setNoteColorPickerOpen(false);
                          }}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] text-slate-500 ${
                            !activeNote.color
                              ? 'border-slate-900 dark:border-white scale-110'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          ×
                        </button>
                        {(Object.keys(FOLDER_COLORS) as FolderColor[]).map((colorKey) => {
                          const spec = FOLDER_COLORS[colorKey];
                          return (
                            <button
                              key={colorKey}
                              type="button"
                              title={spec.label}
                              aria-label={`Set active file color to ${spec.label}`}
                              onClick={() => {
                                handleChangeNoteColor(activeNote.id, colorKey);
                                setNoteColorPickerOpen(false);
                              }}
                              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                                activeNote.color === colorKey
                                  ? 'border-slate-900 dark:border-white scale-110'
                                  : 'border-transparent hover:scale-110'
                              }`}
                              style={{ backgroundColor: spec.swatch }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <select
                    aria-label="Move note to folder"
                    value={activeNote.folderId ?? ''}
                    onChange={(e) =>
                      handleMoveNote(activeNote.id, e.target.value || null)
                    }
                    className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs"
                  >
                    <option value="">Folder: Root</option>
                    {folders
                      .filter((f) => !f.deleted)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          Folder: {f.name}
                        </option>
                      ))}
                  </select>

                  {activeNote.folderId && (
                    <button
                      type="button"
                      onClick={() => handlePrintFolder(activeNote.folderId!)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Printer className="w-3 h-3" />
                      Print Folder
                    </button>
                  )}

                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={Boolean(activeNote.exposeToMcp)}
                      onChange={() =>
                        mutateNote(activeNote.id, (prev) => ({
                          ...prev,
                          exposeToMcp: !prev.exposeToMcp,
                          updatedAt: Date.now(),
                          version: prev.version + 1,
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                    />
                    <span>Expose to MCP</span>
                  </label>

                  <span className="tabular-nums whitespace-nowrap">{wordCount} words</span>
                </div>
              </div>

              {/* Tag Editor */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Tags:</span>
                {activeNote.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <form onSubmit={handleAddTag} className="inline-flex items-center">
                  <input
                    type="text"
                    aria-label="Add tag"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="+ add tag"
                    className="w-24 px-1.5 py-0.5 text-xs bg-transparent border-b border-transparent focus:border-indigo-400 text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"
                  />
                </form>
                {statusNotice && (
                  <span className="ml-auto text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    {statusNotice}
                  </span>
                )}
              </div>
            </div>

            {/* Main Split / Edit / Preview Area */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
              {(settings.viewMode === 'edit' || settings.viewMode === 'split') && (
                <SegmentedMarkdownEditor
                  ref={editorRef}
                  content={activeNote.content}
                  viewMode={settings.viewMode}
                  editorFontClass={editorFontClass}
                  fontSize={settings.fontSize}
                  onChangeContent={(nextContent, cursorStart, cursorEnd) => {
                    mutateNote(
                      activeNote.id,
                      (prev) => ({
                        ...prev,
                        content: nextContent,
                        updatedAt: Date.now(),
                        version: prev.version + 1,
                      }),
                      { recordHistory: true, cursorStart, cursorEnd },
                    );
                  }}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onContextMenuAt={handleEditorContextMenu}
                  onEditDiagram={handleEditDiagram}
                  onDeleteDiagram={handleDeleteDiagram}
                  onCopyText={(_txt, notice) => showNotice(notice)}
                />
              )}

              {(settings.viewMode === 'preview' || settings.viewMode === 'split') && (
                <div
                  onContextMenu={handlePreviewContextMenu}
                  className="flex-1 min-w-0 h-full overflow-y-auto p-6 2xl:px-10 bg-white dark:bg-slate-950"
                >
                  <div
                    className={`mx-auto ${
                      settings.viewMode === 'preview' ? 'max-w-4xl' : 'max-w-3xl 2xl:max-w-4xl'
                    }`}
                  >
                    <MarkdownPreview
                      content={activeNote.content}
                      fontFamily={settings.fontFamily}
                      fontSize={settings.fontSize}
                      theme={settings.theme}
                      onToggleChecklist={(lineIdx) =>
                        mutateNote(
                          activeNote.id,
                          (prev) => ({
                            ...prev,
                            content: toggleChecklistLine(prev.content, lineIdx),
                            updatedAt: Date.now(),
                            version: prev.version + 1,
                          }),
                          { recordHistory: true, forceDiscrete: true },
                        )
                      }
                      onClickWikilink={handleClickWikilink}
                      onClickTag={(tag) => setActiveTag(tag)}
                      onEditConceptDiagram={handleEditDiagram}
                      onDeleteConceptDiagram={handleDeleteDiagram}
                      onContextMenuDiagram={handleDiagramContextMenu}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="px-4 2xl:px-8 py-1.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950 flex items-center justify-end shrink-0">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            opennote by calz
          </span>
        </footer>
      </div>

      {/* Dedicated Concept Diagram Studio Modal */}
      {editingDiagram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="diagram-studio-title"
            className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Shapes className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 id="diagram-studio-title" className="text-sm font-semibold text-slate-900 dark:text-white">
                  Concept Diagram Studio
                </h2>
                <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
                  · Double-click any shape or Label to type directly inside
                </span>
              </div>
              <div className="flex items-center gap-2">
                {editingDiagramIsExisting && (
                  <button
                    type="button"
                    onClick={() => handleDeleteDiagram(editingDiagram.id)}
                    aria-label="Delete diagram from note"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Diagram
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingDiagram(null);
                    setEditingDiagramIsExisting(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDiagramToNote(editingDiagram)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Save to Note
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto">
              <ConceptCanvas
                diagram={editingDiagram}
                theme={settings.theme}
                height={480}
                onChange={setEditingDiagram}
              />
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <McpModal
        isOpen={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        session={vaultCtx.session}
        notes={notes}
        onToggleNoteMcp={(noteId) =>
          mutateNote(noteId, (prev) => ({
            ...prev,
            exposeToMcp: !prev.exposeToMcp,
            updatedAt: Date.now(),
            version: prev.version + 1,
          }))
        }
        onSyncMcpBridge={handleSyncMcpBridge}
      />

      <ShareModal
        isOpen={Boolean(shareTarget)}
        target={shareTarget}
        session={vaultCtx.session}
        folders={folders}
        notes={notes}
        existingShare={
          shareTarget
            ? userShares.find(
                (s) => s.targetType === shareTarget.type && s.targetId === shareTarget.id,
              ) ?? null
            : null
        }
        onShareSaved={(saved) => {
          setUserShares((prev) => {
            const exists = prev.some((s) => s.id === saved.id);
            return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev];
          });
        }}
        onShareDeleted={(shareId) => {
          setUserShares((prev) => prev.filter((s) => s.id !== shareId));
        }}
        onClose={() => setShareTarget(null)}
      />
    </div>
  );
}
