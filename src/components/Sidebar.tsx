import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Palette,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { FolderColor, FolderItem, NoteItem } from '../types';
import {
  FOLDER_COLORS,
  buildFolderTree,
  collectVaultTags,
  filterNotes,
  type FolderTreeNode,
} from '../utils/vault';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  folders: FolderItem[];
  notes: NoteItem[];
  activeNoteId: string | null;
  searchQuery: string;
  activeTag: string | null;
  onSearchChange: (q: string) => void;
  onSelectTag: (tag: string | null) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null, color?: FolderColor) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onChangeFolderColor: (folderId: string, color: FolderColor) => void;
  onDeleteFolder: (folderId: string) => void;
  onPrintFolder: (folderId: string) => void;
  onChangeNoteColor: (noteId: string, color: FolderColor | undefined) => void;
  onDeleteNote: (noteId: string) => void;
  onMoveNote: (noteId: string, targetFolderId: string | null) => void;
  onMoveFolder: (folderId: string, targetParentId: string | null) => void;
}

const FOLDER_COLOR_KEYS = Object.keys(FOLDER_COLORS) as FolderColor[];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onCloseMobile,
  folders,
  notes,
  activeNoteId,
  searchQuery,
  activeTag,
  onSearchChange,
  onSelectTag,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onRenameFolder,
  onChangeFolderColor,
  onDeleteFolder,
  onPrintFolder,
  onChangeNoteColor,
  onDeleteNote,
  onMoveNote,
  onMoveFolder,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    fld_architecture: true,
    fld_backend: true,
    fld_projects: true,
  });
  const [creatingFolderParent, setCreatingFolderParent] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>('indigo');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null);
  const [colorPickerNoteId, setColorPickerNoteId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const tree = useMemo(() => buildFolderTree(folders, notes), [folders, notes]);
  const allTags = useMemo(() => collectVaultTags(notes), [notes]);
  const isFiltering = Boolean(searchQuery.trim() || activeTag);
  const filteredNotes = useMemo(
    () => (isFiltering ? filterNotes(notes, searchQuery, activeTag) : []),
    [isFiltering, notes, searchQuery, activeTag],
  );

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !(prev[folderId] ?? true) }));
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed, creatingFolderParent ?? null, newFolderColor);
    if (creatingFolderParent) {
      setExpandedFolders((prev) => ({ ...prev, [creatingFolderParent]: true }));
    }
    setNewFolderName('');
    setNewFolderColor('indigo');
    setCreatingFolderParent(undefined);
  };

  const handleDragStartNote = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('application/x-folio-type', 'note');
    e.dataTransfer.setData('application/x-folio-id', noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragStartFolder = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-folio-type', 'folder');
    e.dataTransfer.setData('application/x-folio-id', folderId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const kind = e.dataTransfer.getData('application/x-folio-type');
    const id = e.dataTransfer.getData('application/x-folio-id');
    if (!kind || !id) return;
    if (kind === 'note') {
      onMoveNote(id, targetFolderId);
    } else if (kind === 'folder') {
      onMoveFolder(id, targetFolderId);
    }
    if (targetFolderId) {
      setExpandedFolders((prev) => ({ ...prev, [targetFolderId]: true }));
    }
  };

  const renderNoteRow = (note: NoteItem, depth: number) => {
    const isActive = note.id === activeNoteId;
    const noteColorSpec = note.color ? FOLDER_COLORS[note.color] : null;
    const showNoteColorPicker = colorPickerNoteId === note.id;

    return (
      <div key={note.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStartNote(e, note.id)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center justify-between gap-1 pr-2 py-1.5 rounded-lg text-sm transition-colors ${
            isActive
              ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-medium'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onSelectNote(note.id);
              onCloseMobile();
            }}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            <FileText
              className={`w-3.5 h-3.5 shrink-0 ${
                noteColorSpec ? noteColorSpec.iconClass : 'opacity-70'
              }`}
            />
            <span className="truncate">{note.title || 'Untitled Note'}</span>
            {noteColorSpec && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: noteColorSpec.swatch }}
                aria-hidden="true"
              />
            )}
          </button>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label={`Customize color for file '${note.title || 'Untitled Note'}'`}
              title="File color"
              onClick={(e) => {
                e.stopPropagation();
                setColorPickerNoteId((prev) => (prev === note.id ? null : note.id));
              }}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete note '${note.title || 'Untitled Note'}'`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note.id);
              }}
              className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showNoteColorPicker && (
          <div
            style={{ paddingLeft: `${depth * 14 + 26}px` }}
            className="flex items-center gap-1.5 py-1.5 pr-2"
            role="group"
            aria-label={`File color options for ${note.title || 'Untitled Note'}`}
          >
            <button
              type="button"
              aria-label={`Reset file '${note.title || 'Untitled Note'}' color to Default`}
              title="Default"
              onClick={() => {
                onChangeNoteColor(note.id, undefined);
                setColorPickerNoteId(null);
              }}
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] text-slate-500 ${
                !note.color
                  ? 'border-slate-900 dark:border-white scale-110'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              ×
            </button>
            {FOLDER_COLOR_KEYS.map((colorKey) => {
              const spec = FOLDER_COLORS[colorKey];
              const isCurrent = note.color === colorKey;
              return (
                <button
                  key={colorKey}
                  type="button"
                  aria-label={`Set file '${note.title || 'Untitled Note'}' color to ${spec.label}`}
                  title={spec.label}
                  onClick={() => {
                    onChangeNoteColor(note.id, colorKey);
                    setColorPickerNoteId(null);
                  }}
                  className={`w-4 h-4 rounded-full border-2 transition-transform ${
                    isCurrent
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
    );
  };

  const renderFolderBranch = (branch: FolderTreeNode, depth = 0) => {
    const isExpanded = expandedFolders[branch.folder.id] ?? true;
    const isDropOver = dragOverTarget === branch.folder.id;
    const folderColorKey: FolderColor = branch.folder.color ?? 'indigo';
    const folderColorSpec = FOLDER_COLORS[folderColorKey] ?? FOLDER_COLORS.indigo;
    const showColorPicker = colorPickerFolderId === branch.folder.id;

    return (
      <div key={branch.folder.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStartFolder(e, branch.folder.id)}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverTarget(branch.folder.id);
          }}
          onDragLeave={() => setDragOverTarget(null)}
          onDrop={(e) => handleDropOnFolder(e, branch.folder.id)}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group flex items-center justify-between gap-1 pr-2 py-1.5 rounded-lg text-sm transition-colors ${
            isDropOver
              ? 'bg-indigo-100 dark:bg-indigo-900/50 ring-1 ring-indigo-500'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          {renamingFolderId === branch.folder.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (renameText.trim()) {
                  onRenameFolder(branch.folder.id, renameText.trim());
                }
                setRenamingFolderId(null);
              }}
              className="flex-1 flex items-center gap-1"
            >
              <input
                type="text"
                autoFocus
                aria-label="Rename folder"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => setRenamingFolderId(null)}
                className="w-full px-1.5 py-0.5 text-xs rounded border border-indigo-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => toggleFolder(branch.folder.id)}
              onDoubleClick={() => {
                setRenamingFolderId(branch.folder.id);
                setRenameText(branch.folder.name);
              }}
              aria-expanded={isExpanded}
              className="flex items-center gap-1.5 min-w-0 flex-1 text-left font-medium"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              )}
              {isExpanded ? (
                <FolderOpen className={`w-4 h-4 shrink-0 ${folderColorSpec.iconClass}`} />
              ) : (
                <Folder className={`w-4 h-4 shrink-0 ${folderColorSpec.iconClass}`} />
              )}
              <span className="truncate">{branch.folder.name}</span>
            </button>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label={`Customize color for ${branch.folder.name}`}
              title="Folder color"
              onClick={(e) => {
                e.stopPropagation();
                setColorPickerFolderId((prev) =>
                  prev === branch.folder.id ? null : branch.folder.id,
                );
              }}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={`New note in ${branch.folder.name}`}
              title="New note in folder"
              onClick={() => {
                setExpandedFolders((prev) => ({ ...prev, [branch.folder.id]: true }));
                onCreateNote(branch.folder.id);
              }}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={`New subfolder in ${branch.folder.name}`}
              title="New subfolder"
              onClick={() => {
                setCreatingFolderParent(branch.folder.id);
                setNewFolderName('');
              }}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Print folder '${branch.folder.name}'`}
              title="Print folder"
              onClick={(e) => {
                e.stopPropagation();
                onPrintFolder(branch.folder.id);
              }}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete folder '${branch.folder.name}'`}
              title="Delete folder"
              onClick={() => onDeleteFolder(branch.folder.id)}
              className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showColorPicker && (
          <div
            style={{ paddingLeft: `${depth * 14 + 26}px` }}
            className="flex items-center gap-1.5 py-1.5 pr-2"
            role="group"
            aria-label={`Color options for ${branch.folder.name}`}
          >
            {FOLDER_COLOR_KEYS.map((colorKey) => {
              const spec = FOLDER_COLORS[colorKey];
              const isCurrent = folderColorKey === colorKey;
              return (
                <button
                  key={colorKey}
                  type="button"
                  aria-label={`Set folder '${branch.folder.name}' color to ${spec.label}`}
                  title={spec.label}
                  onClick={() => {
                    onChangeFolderColor(branch.folder.id, colorKey);
                    setColorPickerFolderId(null);
                  }}
                  className={`w-4 h-4 rounded-full border-2 transition-transform ${
                    isCurrent
                      ? 'border-slate-900 dark:border-white scale-110'
                      : 'border-transparent hover:scale-110'
                  }`}
                  style={{ backgroundColor: spec.swatch }}
                />
              );
            })}
          </div>
        )}

        {isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {branch.children.map((child) => renderFolderBranch(child, depth + 1))}
            {branch.notes.map((note) => renderNoteRow(note, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const content = (
    <aside
      aria-label="Vault navigation"
      className="h-full w-72 2xl:w-80 flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 select-none"
    >
      {/* Sidebar Header + Search */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            opennote
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCreateNote(null)}
              aria-label="Create new note"
              title="New Note"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingFolderParent(null);
                setNewFolderName('');
              }}
              aria-label="Create new folder"
              title="New Folder"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Search notes, tags, and diagrams"
            placeholder="Search notes, tags, shapes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        {creatingFolderParent !== undefined && (
          <form onSubmit={handleCreateFolderSubmit} className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                aria-label="New folder name"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-indigo-400 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                className="px-2 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setCreatingFolderParent(undefined)}
                className="px-1.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="New folder color">
              {FOLDER_COLOR_KEYS.map((colorKey) => {
                const spec = FOLDER_COLORS[colorKey];
                return (
                  <button
                    key={colorKey}
                    type="button"
                    aria-label={`New folder color ${spec.label}`}
                    onClick={() => setNewFolderColor(colorKey)}
                    className={`w-4 h-4 rounded-full border-2 transition-transform ${
                      newFolderColor === colorKey
                        ? 'border-slate-900 dark:border-white scale-110'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: spec.swatch }}
                  />
                );
              })}
            </div>
          </form>
        )}
      </div>

      {/* File Tree or Filtered Results */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverTarget('__root__');
        }}
        onDragLeave={() => setDragOverTarget(null)}
        onDrop={(e) => handleDropOnFolder(e, null)}
      >
        {isFiltering ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {filteredNotes.length} {filteredNotes.length === 1 ? 'match' : 'matches'}
                {activeTag ? ` for #${activeTag}` : ''}
              </span>
              {activeTag && (
                <button
                  type="button"
                  onClick={() => onSelectTag(null)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Clear tag
                </button>
              )}
            </div>
            {filteredNotes.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-slate-400">
                No matching notes found.
              </div>
            ) : (
              filteredNotes.map((note) => renderNoteRow(note, 0))
            )}
          </div>
        ) : (
          <>
            {tree.roots.map((branch) => renderFolderBranch(branch, 0))}
            {tree.rootNotes.map((note) => renderNoteRow(note, 0))}
            {tree.roots.length === 0 && tree.rootNotes.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <p>Your vault is empty.</p>
                <button
                  type="button"
                  onClick={() => onCreateNote(null)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                >
                  Create First Note
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tags Filter Footer */}
      {allTags.length > 0 && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Tags
            </span>
            {activeTag && (
              <button
                type="button"
                onClick={() => onSelectTag(null)}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Show all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(({ tag, count }) => {
              const selected = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(selected ? null : tag)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700'
                  }`}
                >
                  <Hash className="w-3 h-3 opacity-70" />
                  <span>{tag}</span>
                  <span className="opacity-65 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block h-full shrink-0">{content}</div>

      {/* Mobile slide-over drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
