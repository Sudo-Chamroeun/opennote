import type { FolderColor, FolderItem, NoteItem } from '../types';
import { FOLDER_COLORS, collectShareSnapshot } from './vault';

export interface OpenNoteArchiveV1 {
  format: 'opennote-archive';
  version: 1;
  kind: 'note' | 'folder' | 'vault';
  exportedAt: number;
  title: string;
  folders: FolderItem[];
  notes: NoteItem[];
}

export interface ExportPayloadFile {
  filename: string;
  content: string;
  mimeType: string;
  folderCount: number;
  noteCount: number;
}

export interface ParsedImportBundle {
  folders: FolderItem[];
  notes: NoteItem[];
  warnings: string[];
  fileNames: string[];
}

const VALID_COLORS = new Set<string>(Object.keys(FOLDER_COLORS));

function normalizeColor(raw: unknown): FolderColor | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().toLowerCase();
  return VALID_COLORS.has(trimmed) ? (trimmed as FolderColor) : undefined;
}

function generateId(prefix: 'fld' | 'note'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

export function sanitizeFileName(raw: string, fallback = 'opennote-export'): string {
  const cleaned = raw
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export function createNoteExportJson(note: NoteItem): ExportPayloadFile {
  const archive: OpenNoteArchiveV1 = {
    format: 'opennote-archive',
    version: 1,
    kind: 'note',
    exportedAt: Date.now(),
    title: note.title || 'Untitled Note',
    folders: [],
    notes: [
      {
        ...note,
        folderId: null,
        exposeToMcp: false,
        deleted: undefined,
      },
    ],
  };
  return {
    filename: `${sanitizeFileName(note.title || 'note', 'note')}.opennote.json`,
    content: JSON.stringify(archive, null, 2),
    mimeType: 'application/json;charset=utf-8',
    folderCount: 0,
    noteCount: 1,
  };
}

export function createNoteExportMarkdown(note: NoteItem): ExportPayloadFile {
  const title = (note.title || 'Untitled Note').trim();
  const frontmatterLines: string[] = [
    '---',
    `title: ${JSON.stringify(title)}`,
  ];
  if (note.tags.length > 0) {
    frontmatterLines.push(`tags: [${note.tags.map((t) => JSON.stringify(t)).join(', ')}]`);
  }
  if (note.color) {
    frontmatterLines.push(`color: ${note.color}`);
  }
  frontmatterLines.push('---', '');

  const body = note.content.replace(/^\uFEFF/, '');
  const content = `${frontmatterLines.join('\n')}${body}`;

  return {
    filename: `${sanitizeFileName(title, 'note')}.md`,
    content,
    mimeType: 'text/markdown;charset=utf-8',
    folderCount: 0,
    noteCount: 1,
  };
}

export function createFolderExportJson(
  folderId: string,
  folders: FolderItem[],
  notes: NoteItem[],
): ExportPayloadFile | null {
  const snap = collectShareSnapshot('folder', folderId, folders, notes);
  if (!snap) return null;

  const archive: OpenNoteArchiveV1 = {
    format: 'opennote-archive',
    version: 1,
    kind: 'folder',
    exportedAt: Date.now(),
    title: snap.title,
    folders: snap.folders.map((f) => ({
      ...f,
      // Keep internal parent references inside the exported tree; detach the root from external parents
      parentId: snap.folders.some((cand) => cand.id === f.parentId) ? f.parentId : null,
      deleted: undefined,
    })),
    notes: snap.notes.map((n) => ({
      ...n,
      exposeToMcp: false,
      deleted: undefined,
    })),
  };

  return {
    filename: `${sanitizeFileName(snap.title, 'folder')}.opennote.json`,
    content: JSON.stringify(archive, null, 2),
    mimeType: 'application/json;charset=utf-8',
    folderCount: archive.folders.length,
    noteCount: archive.notes.length,
  };
}

export function createVaultExportJson(
  folders: FolderItem[],
  notes: NoteItem[],
): ExportPayloadFile {
  const activeFolders = folders.filter((f) => !f.deleted);
  const activeNotes = notes.filter((n) => !n.deleted);

  const archive: OpenNoteArchiveV1 = {
    format: 'opennote-archive',
    version: 1,
    kind: 'vault',
    exportedAt: Date.now(),
    title: 'opennote Vault Backup',
    folders: activeFolders.map((f) => ({ ...f, deleted: undefined })),
    notes: activeNotes.map((n) => ({ ...n, exposeToMcp: false, deleted: undefined })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `opennote-vault-${stamp}.opennote.json`,
    content: JSON.stringify(archive, null, 2),
    mimeType: 'application/json;charset=utf-8',
    folderCount: archive.folders.length,
    noteCount: archive.notes.length,
  };
}

function parseMarkdownFrontmatter(raw: string): {
  title?: string;
  tags: string[];
  color?: FolderColor;
  body: string;
} {
  const normalized = raw.replace(/\r\n/g, '\n');
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { tags: [], body: normalized };
  }

  const header = fmMatch[1];
  const body = fmMatch[2] ?? '';
  let title: string | undefined;
  let tags: string[] = [];
  let color: FolderColor | undefined;

  for (const line of header.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!val) continue;

    if (key === 'title') {
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'string') title = parsed.trim();
      } catch {
        title = val.replace(/^['"]|['"]$/g, '').trim();
      }
    } else if (key === 'tags') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          tags = parsed.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
          continue;
        }
      } catch {
        // Fallback comma-separated / bracket list parsing
      }
      const inner = val.replace(/^\[|\]$/g, '');
      tags = inner
        .split(',')
        .map((t) => t.replace(/^['"]|['"]$/g, '').trim().toLowerCase())
        .filter(Boolean);
    } else if (key === 'color') {
      color = normalizeColor(val.replace(/^['"]|['"]$/g, ''));
    }
  }

  return { title, tags: Array.from(new Set(tags)), color, body };
}

function coerceFolderItem(raw: unknown, now: number): FolderItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : generateId('fld');
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported Folder';
  const parentId = typeof obj.parentId === 'string' && obj.parentId.trim() ? obj.parentId.trim() : null;
  return {
    id,
    name,
    parentId,
    color: normalizeColor(obj.color) ?? 'indigo',
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : now,
    version: 1,
  };
}

function coerceNoteItem(raw: unknown, now: number): NoteItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.content !== 'string' && typeof obj.title !== 'string') return null;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : generateId('note');
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Imported Note';
  const content = typeof obj.content === 'string' ? obj.content : '';
  const folderId = typeof obj.folderId === 'string' && obj.folderId.trim() ? obj.folderId.trim() : null;
  const tags = Array.isArray(obj.tags)
    ? Array.from(new Set(obj.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)))
    : [];
  return {
    id,
    title,
    content,
    folderId,
    color: normalizeColor(obj.color),
    tags,
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : now,
    version: 1,
    exposeToMcp: false,
  };
}

export function parseImportFiles(
  files: Array<{ name: string; text: string }>,
): ParsedImportBundle {
  const folders: FolderItem[] = [];
  const notes: NoteItem[] = [];
  const warnings: string[] = [];
  const fileNames: string[] = [];
  const now = Date.now();

  for (const file of files) {
    const lower = file.name.toLowerCase();
    fileNames.push(file.name);

    if (lower.endsWith('.json')) {
      try {
        const parsed = JSON.parse(file.text) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
          warnings.push(`"${file.name}" does not contain a valid JSON object.`);
          continue;
        }

        if (Array.isArray(parsed.folders) || Array.isArray(parsed.notes)) {
          const parsedFolders = Array.isArray(parsed.folders)
            ? parsed.folders.map((f) => coerceFolderItem(f, now)).filter((f): f is FolderItem => f !== null)
            : [];
          const parsedNotes = Array.isArray(parsed.notes)
            ? parsed.notes.map((n) => coerceNoteItem(n, now)).filter((n): n is NoteItem => n !== null)
            : [];
          if (parsedFolders.length === 0 && parsedNotes.length === 0) {
            warnings.push(`"${file.name}" contained no folders or notes.`);
            continue;
          }
          folders.push(...parsedFolders);
          notes.push(...parsedNotes);
          continue;
        }

        const singleNote = coerceNoteItem(parsed, now);
        if (singleNote) {
          notes.push(singleNote);
          continue;
        }

        warnings.push(`"${file.name}" is not a recognized opennote export bundle.`);
      } catch {
        warnings.push(`"${file.name}" contains invalid JSON.`);
      }
      continue;
    }

    if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) {
      const { title: fmTitle, tags, color, body } = parseMarkdownFrontmatter(file.text);
      const baseName = file.name.replace(/\.(md|markdown|txt)$/i, '').trim() || 'Imported Note';
      const title = fmTitle || baseName;
      notes.push({
        id: generateId('note'),
        title,
        content: body,
        folderId: null,
        color,
        tags,
        createdAt: now,
        updatedAt: now,
        version: 1,
        exposeToMcp: false,
      });
      continue;
    }

    warnings.push(`Unsupported file type "${file.name}". Use .opennote.json or .md files.`);
  }

  return { folders, notes, warnings, fileNames };
}

export function materializeImportedItems(
  parsed: Pick<ParsedImportBundle, 'folders' | 'notes'>,
  targetParentFolderId: string | null,
  existingFolders: FolderItem[],
  now: number = Date.now(),
): { folders: FolderItem[]; notes: NoteItem[] } {
  const folderIdMap = new Map<string, string>();
  for (const folder of parsed.folders) {
    if (!folderIdMap.has(folder.id)) {
      folderIdMap.set(folder.id, generateId('fld'));
    }
  }

  const siblingNames = new Set(
    existingFolders
      .filter((f) => !f.deleted && (f.parentId ?? null) === targetParentFolderId)
      .map((f) => f.name.trim().toLowerCase()),
  );

  const materializedFolders: FolderItem[] = parsed.folders.map((folder) => {
    const newId = folderIdMap.get(folder.id)!;
    const mappedParent =
      folder.parentId && folderIdMap.has(folder.parentId)
        ? folderIdMap.get(folder.parentId)!
        : targetParentFolderId;

    let finalName = folder.name.trim() || 'Imported Folder';
    if (mappedParent === targetParentFolderId && siblingNames.has(finalName.toLowerCase())) {
      let candidate = `${finalName} (Imported)`;
      let counter = 2;
      while (siblingNames.has(candidate.toLowerCase())) {
        candidate = `${finalName} (Imported ${counter})`;
        counter += 1;
      }
      finalName = candidate;
      siblingNames.add(finalName.toLowerCase());
    } else if (mappedParent === targetParentFolderId) {
      siblingNames.add(finalName.toLowerCase());
    }

    return {
      id: newId,
      name: finalName,
      parentId: mappedParent,
      color: folder.color ?? 'indigo',
      createdAt: folder.createdAt || now,
      updatedAt: now,
      version: 1,
    };
  });

  const materializedNotes: NoteItem[] = parsed.notes.map((note) => {
    const mappedFolderId =
      note.folderId && folderIdMap.has(note.folderId)
        ? folderIdMap.get(note.folderId)!
        : targetParentFolderId;

    return {
      id: generateId('note'),
      title: note.title || 'Imported Note',
      content: note.content,
      folderId: mappedFolderId,
      color: note.color,
      tags: [...note.tags],
      createdAt: note.createdAt || now,
      updatedAt: now,
      version: 1,
      exposeToMcp: false,
    };
  });

  return { folders: materializedFolders, notes: materializedNotes };
}
