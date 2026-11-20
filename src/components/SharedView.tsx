import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Menu,
  Moon,
  Printer,
  RefreshCw,
  Shapes,
  Sun,
  X,
} from 'lucide-react';
import type {
  ConceptDiagram,
  EditorViewMode,
  FolderItem,
  NoteItem,
  PublicSharePayload,
  ThemeMode,
} from '../types';
import {
  createDefaultNode,
  createEdge,
  removeConceptBlockFromMarkdown,
  upsertConceptBlockInMarkdown,
} from '../utils/diagram';
import { toggleChecklistLine } from '../utils/markdown';
import { printNotes } from '../utils/printNotes';
import { buildFolderTree, FOLDER_COLORS, type FolderTreeNode } from '../utils/vault';
import { ConceptCanvas } from './ConceptCanvas';
import { MarkdownPreview } from './MarkdownPreview';
import {
  SegmentedMarkdownEditor,
  type SegmentedMarkdownEditorHandle,
} from './SegmentedMarkdownEditor';

interface SharedViewProps {
  token: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const SharedView: React.FC<SharedViewProps> = ({ token, theme, onToggleTheme }) => {
  const [share, setShare] = useState<PublicSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState<string>('');
  const [editingDiagram, setEditingDiagram] = useState<ConceptDiagram | null>(null);
  const [editingDiagramIsExisting, setEditingDiagramIsExisting] = useState(false);

  const editorRef = useRef<SegmentedMarkdownEditorHandle | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const fetchShare = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/share/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Shared link not found or revoked');
      }
      const nextShare = data.share as PublicSharePayload;
      setShare(nextShare);
      setError(null);
      setExpandedFolders((prev) => {
        const next = { ...prev };
        for (const f of nextShare.folders) {
          if (next[f.id] === undefined) next[f.id] = true;
        }
        return next;
      });
      setActiveNoteId((prev) => {
        const visibleNotes = nextShare.notes.filter((n) => !n.deleted);
        if (prev && visibleNotes.some((n) => n.id === prev)) return prev;
        return visibleNotes[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load shared link');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchShare();
  }, [fetchShare]);

  const activeNotes = useMemo(
    () => (share?.notes ?? []).filter((n) => !n.deleted),
    [share?.notes],
  );
  const activeNote = useMemo(
    () => activeNotes.find((n) => n.id === activeNoteId) ?? null,
    [activeNotes, activeNoteId],
  );

  const tree = useMemo(
    () => buildFolderTree(share?.folders ?? [], share?.notes ?? []),
    [share?.folders, share?.notes],
  );

  const persistRemoteNote = useCallback(
    async (noteToSave: NoteItem) => {
      if (!share || share.permission !== 'readwrite') return;
      setSaving(true);
      setSaveLabel('Saving...');
      try {
        const res = await fetch(
          `/api/public/share/${encodeURIComponent(token)}/notes/${encodeURIComponent(noteToSave.id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: noteToSave }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Could not save shared note');
        }
        setSaveLabel('Saved');
      } catch (err) {
        setSaveLabel(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [share, token],
  );

  const updateSharedNote = (noteId: string, updater: (prev: NoteItem) => NoteItem) => {
    if (!share || share.permission !== 'readwrite') return;
    let updatedNote: NoteItem | null = null;
    const nextNotes = share.notes.map((n) => {
      if (n.id === noteId) {
        updatedNote = updater(n);
        return updatedNote;
      }
      return n;
    });
    setShare({ ...share, notes: nextNotes });
    if (updatedNote) {
      const target = updatedNote;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setSaveLabel('Unsaved changes...');
      saveTimerRef.current = window.setTimeout(() => {
        void persistRemoteNote(target);
      }, 450);
    }
  };

  const handleCreateNoteInFolder = async (folderId: string | null) => {
    if (!share || share.permission !== 'readwrite' || share.targetType !== 'folder') return;
    const now = Date.now();
    const freshNote: NoteItem = {
      id: `note_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: 'Untitled Note',
      content: '# Untitled Note\n\nCollaborating in shared opennote folder.\n',
      folderId: folderId ?? share.targetId,
      tags: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    setShare({ ...share, notes: [freshNote, ...share.notes] });
    setActiveNoteId(freshNote.id);
    await persistRemoteNote(freshNote);
  };

  const handleOpenNewDiagram = () => {
    if (!activeNote || share?.permission !== 'readwrite') return;
    const n1 = createDefaultNode('hexagon', 64, 72, 1);
    const n2 = createDefaultNode('puzzle', 316, 72, 2);
    const edge = createEdge(n1.id, n2.id, 'connects');
    setEditingDiagram({
      id: `diag_${Date.now().toString(36)}`,
      title: 'Concept Map',
      nodes: [n1, n2],
      edges: [edge],
    });
    setEditingDiagramIsExisting(false);
  };

  const handleApplyDiagram = (diagram: ConceptDiagram) => {
    if (!activeNote || share?.permission !== 'readwrite') return;
    const updatedContent = upsertConceptBlockInMarkdown(activeNote.content, diagram);
    updateSharedNote(activeNote.id, (prev) => ({
      ...prev,
      content: updatedContent,
      updatedAt: Date.now(),
      version: prev.version + 1,
    }));
    setEditingDiagram(null);
    setEditingDiagramIsExisting(false);
  };

  const handleDeleteDiagram = (diagramId: string) => {
    if (!activeNote || share?.permission !== 'readwrite') return;
    const updatedContent = removeConceptBlockFromMarkdown(activeNote.content, diagramId);
    updateSharedNote(activeNote.id, (prev) => ({
      ...prev,
      content: updatedContent,
      updatedAt: Date.now(),
      version: prev.version + 1,
    }));
    if (editingDiagram?.id === diagramId) {
      setEditingDiagram(null);
      setEditingDiagramIsExisting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm">
        Loading shared opennote workspace...
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Shared link unavailable
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {error || 'This link may have been revoked by the owner.'}
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
          >
            Go to opennote
          </a>
        </div>
      </div>
    );
  }

  const isWritable = share.permission === 'readwrite';

  const renderSharedBranch = (branch: FolderTreeNode, depth = 0) => {
    const isExpanded = expandedFolders[branch.folder.id] ?? true;
    const spec = FOLDER_COLORS[branch.folder.color ?? 'indigo'] ?? FOLDER_COLORS.indigo;
    return (
      <div key={branch.folder.id}>
        <button
          type="button"
          onClick={() =>
            setExpandedFolders((prev) => ({ ...prev, [branch.folder.id]: !isExpanded }))
          }
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className="w-full flex items-center gap-1.5 pr-2 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          )}
          {isExpanded ? (
            <FolderOpen className={`w-4 h-4 shrink-0 ${spec.iconClass}`} />
          ) : (
            <Folder className={`w-4 h-4 shrink-0 ${spec.iconClass}`} />
          )}
          <span className="truncate">{branch.folder.name}</span>
        </button>

        {isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {branch.children.map((child) => renderSharedBranch(child, depth + 1))}
            {branch.notes.map((n) => {
              const active = n.id === activeNoteId;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setActiveNoteId(n.id);
                    setSidebarOpen(false);
                  }}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 12}px` }}
                  className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-sm text-left transition-colors ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{n.title || 'Untitled Note'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const folderSidebar =
    share.targetType === 'folder' ? (
      <aside className="h-full w-64 flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
            {share.title}
          </span>
          {isWritable && (
            <button
              type="button"
              onClick={() => void handleCreateNoteInFolder(share.targetId)}
              aria-label="New note in shared folder"
              title="New Note"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tree.roots.map((branch) => renderSharedBranch(branch, 0))}
          {tree.rootNotes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNoteId(n.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left ${
                n.id === activeNoteId
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate">{n.title || 'Untitled Note'}</span>
            </button>
          ))}
        </div>
      </aside>
    ) : null;

  return (
    <div className="h-screen flex bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {folderSidebar && <div className="hidden lg:block h-full shrink-0">{folderSidebar}</div>}

      {folderSidebar && sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{folderSidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <header className="h-14 px-4 2xl:px-8 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {folderSidebar && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open shared folder navigation"
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <a
              href="/"
              className="text-sm font-bold tracking-tight text-indigo-600 dark:text-indigo-400 shrink-0"
            >
              opennote
            </a>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
              {share.title}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${
                isWritable
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {isWritable ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {isWritable ? 'Read & Write' : 'Read Only'}
            </span>
            {saveLabel && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                {saveLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isWritable && activeNote && (
              <>
                <button
                  type="button"
                  onClick={handleOpenNewDiagram}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/70"
                >
                  <Shapes className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Diagram</span>
                </button>
                <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  {(['edit', 'split', 'preview'] as EditorViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`px-2 py-1 text-xs font-medium rounded-md capitalize ${
                        viewMode === mode
                          ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => void fetchShare()}
              aria-label="Refresh shared content"
              title="Refresh"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            </button>

            {activeNotes.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  printNotes(
                    share.title,
                    share.targetType === 'folder'
                      ? activeNotes
                      : activeNote
                        ? [activeNote]
                        : activeNotes,
                  )
                }
                aria-label="Print shared notes"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Print</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {!activeNote ? (
          <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500">
            No notes inside this shared link yet.
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-6 2xl:px-8 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
              {isWritable ? (
                <input
                  type="text"
                  aria-label="Shared note title"
                  value={activeNote.title}
                  onChange={(e) =>
                    updateSharedNote(activeNote.id, (prev) => ({
                      ...prev,
                      title: e.target.value,
                      updatedAt: Date.now(),
                      version: prev.version + 1,
                    }))
                  }
                  placeholder="Untitled Note"
                  className="w-full text-xl font-bold tracking-tight bg-transparent text-slate-900 dark:text-white outline-none"
                />
              ) : (
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {activeNote.title || 'Untitled Note'}
                </h1>
              )}
            </div>

            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
              {isWritable && (viewMode === 'edit' || viewMode === 'split') && (
                <SegmentedMarkdownEditor
                  ref={editorRef}
                  content={activeNote.content}
                  viewMode={viewMode}
                  editorFontClass="font-note-sans"
                  fontSize={15}
                  onChangeContent={(nextContent) =>
                    updateSharedNote(activeNote.id, (prev) => ({
                      ...prev,
                      content: nextContent,
                      updatedAt: Date.now(),
                      version: prev.version + 1,
                    }))
                  }
                  onUndo={() => {}}
                  onRedo={() => {}}
                  onContextMenuAt={(e) => e.stopPropagation()}
                  onEditDiagram={(diagram) => {
                    setEditingDiagram(structuredClone(diagram));
                    setEditingDiagramIsExisting(true);
                  }}
                  onDeleteDiagram={handleDeleteDiagram}
                  onCopyText={() => {}}
                />
              )}

              {(!isWritable || viewMode === 'preview' || viewMode === 'split') && (
                <div className="flex-1 min-w-0 h-full overflow-y-auto p-6 2xl:px-10 bg-white dark:bg-slate-950">
                  <div className="mx-auto max-w-4xl">
                    <MarkdownPreview
                      content={activeNote.content}
                      fontFamily="sans"
                      fontSize={15}
                      theme={theme}
                      onToggleChecklist={(lineIdx) => {
                        if (!isWritable) return;
                        updateSharedNote(activeNote.id, (prev) => ({
                          ...prev,
                          content: toggleChecklistLine(prev.content, lineIdx),
                          updatedAt: Date.now(),
                          version: prev.version + 1,
                        }));
                      }}
                      onClickWikilink={(title) => {
                        const match = activeNotes.find(
                          (n) => n.title.trim().toLowerCase() === title.trim().toLowerCase(),
                        );
                        if (match) setActiveNoteId(match.id);
                      }}
                      onClickTag={() => {}}
                      onEditConceptDiagram={
                        isWritable
                          ? (diagram) => {
                              setEditingDiagram(structuredClone(diagram));
                              setEditingDiagramIsExisting(true);
                            }
                          : undefined
                      }
                      onDeleteConceptDiagram={isWritable ? handleDeleteDiagram : undefined}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="px-4 2xl:px-8 py-1.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950 flex items-center justify-end shrink-0">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">opennote by calz</span>
        </footer>
      </div>

      {editingDiagram && isWritable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shared-diagram-title"
            className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Shapes className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2
                  id="shared-diagram-title"
                  className="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Concept Diagram Studio
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {editingDiagramIsExisting && (
                  <button
                    type="button"
                    onClick={() => handleDeleteDiagram(editingDiagram.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300"
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingDiagram(null);
                    setEditingDiagramIsExisting(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Close diagram editor"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDiagram(editingDiagram)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Save to Note
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              <ConceptCanvas
                diagram={editingDiagram}
                theme={theme}
                height={460}
                onChange={setEditingDiagram}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
