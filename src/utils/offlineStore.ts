import type { EditorSettings, FolderItem, NoteItem } from '../types';

const DB_NAME = 'folio_vault_db';
const DB_VERSION = 1;

export interface PendingSyncState {
  dirtyNoteIds: string[];
  dirtyFolderIds: string[];
  lastSyncedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function txGetAll<T>(storeName: string, scopeKey: string): Promise<T[]> {
  return openDatabase()
    .then(
      (db) =>
        new Promise<T[]>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => {
            const all = (req.result as Array<T & { _scope?: string }>) ?? [];
            resolve(all.filter((item) => item._scope === scopeKey));
          };
          req.onerror = () => reject(req.error);
        }),
    )
    .catch(() => {
      try {
        const raw = localStorage.getItem(`${DB_NAME}:${scopeKey}:${storeName}`);
        return raw ? (JSON.parse(raw) as T[]) : [];
      } catch {
        return [];
      }
    });
}

async function txReplaceScope<T extends { id: string }>(
  storeName: string,
  scopeKey: string,
  items: T[],
): Promise<void> {
  try {
    localStorage.setItem(`${DB_NAME}:${scopeKey}:${storeName}`, JSON.stringify(items));
  } catch {
    // ignore storage quota errors on fallback
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const existing = (getAllReq.result as Array<{ id: string; _scope?: string }>) ?? [];
        for (const row of existing) {
          if (row._scope === scopeKey) {
            store.delete(row.id);
          }
        }
        for (const item of items) {
          store.put({ ...item, id: `${scopeKey}::${item.id}`, _rawId: item.id, _scope: scopeKey });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // localStorage fallback already updated
  }
}

export async function loadOfflineVault(scopeKey: string): Promise<{
  notes: NoteItem[];
  folders: FolderItem[];
  pending: PendingSyncState;
}> {
  const [rawNotes, rawFolders] = await Promise.all([
    txGetAll<NoteItem & { _rawId?: string }>('notes', scopeKey),
    txGetAll<FolderItem & { _rawId?: string }>('folders', scopeKey),
  ]);

  const notes = rawNotes.map(({ _rawId, ...rest }) => ({
    ...rest,
    id: _rawId ?? rest.id.replace(`${scopeKey}::`, ''),
  })) as NoteItem[];

  const folders = rawFolders.map(({ _rawId, ...rest }) => ({
    ...rest,
    id: _rawId ?? rest.id.replace(`${scopeKey}::`, ''),
  })) as FolderItem[];

  let pending: PendingSyncState = { dirtyNoteIds: [], dirtyFolderIds: [], lastSyncedAt: 0 };
  try {
    const rawPending = localStorage.getItem(`${DB_NAME}:${scopeKey}:pending`);
    if (rawPending) {
      pending = JSON.parse(rawPending) as PendingSyncState;
    }
  } catch {
    // default empty
  }

  return { notes, folders, pending };
}

export async function saveOfflineVault(
  scopeKey: string,
  notes: NoteItem[],
  folders: FolderItem[],
  pending: PendingSyncState,
): Promise<void> {
  try {
    localStorage.setItem(`${DB_NAME}:${scopeKey}:pending`, JSON.stringify(pending));
  } catch {
    // ignore
  }
  await Promise.all([
    txReplaceScope('notes', scopeKey, notes),
    txReplaceScope('folders', scopeKey, folders),
  ]);
}

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(`${DB_NAME}:settings`);
    if (raw) {
      return JSON.parse(raw) as EditorSettings;
    }
  } catch {
    // ignore
  }
  return {
    fontFamily: 'sans',
    fontSize: 15,
    theme: 'light',
    viewMode: 'split',
  };
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(`${DB_NAME}:settings`, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
