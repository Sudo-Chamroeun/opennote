import type { FolderColor, FolderItem, NoteItem } from '../types';
import { extractConceptBlocksFromMarkdown } from './diagram';
import { extractInlineTags } from './markdown';

export const FOLDER_COLORS: Record<
  FolderColor,
  { label: string; swatch: string; iconClass: string }
> = {
  indigo: {
    label: 'Indigo',
    swatch: '#6366f1',
    iconClass: 'text-indigo-500 dark:text-indigo-400',
  },
  sky: {
    label: 'Sky',
    swatch: '#0ea5e9',
    iconClass: 'text-sky-500 dark:text-sky-400',
  },
  teal: {
    label: 'Teal',
    swatch: '#14b8a6',
    iconClass: 'text-teal-500 dark:text-teal-400',
  },
  emerald: {
    label: 'Emerald',
    swatch: '#10b981',
    iconClass: 'text-emerald-500 dark:text-emerald-400',
  },
  amber: {
    label: 'Amber',
    swatch: '#f59e0b',
    iconClass: 'text-amber-500 dark:text-amber-400',
  },
  rose: {
    label: 'Rose',
    swatch: '#f43f5e',
    iconClass: 'text-rose-500 dark:text-rose-400',
  },
  violet: {
    label: 'Violet',
    swatch: '#8b5cf6',
    iconClass: 'text-violet-500 dark:text-violet-400',
  },
  slate: {
    label: 'Slate',
    swatch: '#64748b',
    iconClass: 'text-slate-500 dark:text-slate-400',
  },
};

export interface FolderTreeNode {
  folder: FolderItem;
  children: FolderTreeNode[];
  notes: NoteItem[];
}

export function buildFolderTree(
  folders: FolderItem[],
  notes: NoteItem[],
): { roots: FolderTreeNode[]; rootNotes: NoteItem[] } {
  const activeFolders = folders.filter((f) => !f.deleted);
  const activeNotes = notes.filter((n) => !n.deleted);

  const nodeMap = new Map<string, FolderTreeNode>();
  for (const folder of activeFolders) {
    nodeMap.set(folder.id, { folder, children: [], notes: [] });
  }

  const roots: FolderTreeNode[] = [];
  for (const folder of activeFolders) {
    const node = nodeMap.get(folder.id)!;
    if (folder.parentId && nodeMap.has(folder.parentId) && folder.parentId !== folder.id) {
      nodeMap.get(folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const rootNotes: NoteItem[] = [];
  for (const note of activeNotes) {
    if (note.folderId && nodeMap.has(note.folderId)) {
      nodeMap.get(note.folderId)!.notes.push(note);
    } else {
      rootNotes.push(note);
    }
  }

  const sortTree = (list: FolderTreeNode[]) => {
    list.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    for (const item of list) {
      item.notes.sort((a, b) => b.updatedAt - a.updatedAt);
      sortTree(item.children);
    }
  };

  sortTree(roots);
  rootNotes.sort((a, b) => b.updatedAt - a.updatedAt);

  return { roots, rootNotes };
}

export function isDescendantFolder(
  folders: FolderItem[],
  candidateDescendantId: string,
  ancestorId: string,
): boolean {
  if (candidateDescendantId === ancestorId) return true;
  const map = new Map(folders.map((f) => [f.id, f]));
  let current = map.get(candidateDescendantId);
  const visited = new Set<string>();
  while (current && current.parentId && !visited.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    visited.add(current.id);
    current = map.get(current.parentId);
  }
  return false;
}

export function getFolderBreadcrumbs(folders: FolderItem[], folderId: string | null): FolderItem[] {
  if (!folderId) return [];
  const map = new Map(folders.filter((f) => !f.deleted).map((f) => [f.id, f]));
  const chain: FolderItem[] = [];
  const visited = new Set<string>();
  let curr = map.get(folderId);
  while (curr && !visited.has(curr.id)) {
    chain.unshift(curr);
    visited.add(curr.id);
    curr = curr.parentId ? map.get(curr.parentId) : undefined;
  }
  return chain;
}

export function getAllNoteTags(note: NoteItem): string[] {
  const merged = new Set<string>(note.tags.map((t) => t.toLowerCase()));
  for (const inlineTag of extractInlineTags(note.content)) {
    merged.add(inlineTag);
  }
  return Array.from(merged).sort();
}

export function collectVaultTags(notes: NoteItem[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.deleted) continue;
    for (const tag of getAllNoteTags(note)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function filterNotes(
  notes: NoteItem[],
  query: string,
  activeTag: string | null,
): NoteItem[] {
  const q = query.trim().toLowerCase();
  const tagFilter = activeTag?.toLowerCase() ?? null;

  return notes
    .filter((note) => {
      if (note.deleted) return false;
      const tags = getAllNoteTags(note);
      if (tagFilter && !tags.includes(tagFilter)) return false;
      if (!q) return true;

      if (note.title.toLowerCase().includes(q)) return true;
      if (note.content.toLowerCase().includes(q)) return true;
      if (tags.some((t) => t.includes(q))) return true;

      const diagrams = extractConceptBlocksFromMarkdown(note.content);
      return diagrams.some(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.nodes.some((n) => n.label.toLowerCase().includes(q)) ||
          d.edges.some((e) => (e.label ?? '').toLowerCase().includes(q)),
      );
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mergeVersionedItems<T extends { id: string; updatedAt: number; version: number }>(
  localItems: T[],
  remoteItems: T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of localItems) {
    map.set(item.id, item);
  }
  for (const remote of remoteItems) {
    const existing = map.get(remote.id);
    if (
      !existing ||
      remote.version > existing.version ||
      (remote.version === existing.version && remote.updatedAt > existing.updatedAt)
    ) {
      map.set(remote.id, remote);
    }
  }
  return Array.from(map.values());
}
