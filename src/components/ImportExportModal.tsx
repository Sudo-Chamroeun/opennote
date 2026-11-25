import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  Folder,
  FolderArchive,
  Upload,
  X,
} from 'lucide-react';
import type { FolderItem, NoteItem } from '../types';
import {
  createFolderExportJson,
  createNoteExportJson,
  createNoteExportMarkdown,
  createVaultExportJson,
  parseImportFiles,
  type ExportPayloadFile,
  type ParsedImportBundle,
} from '../utils/transfer';

export type ImportExportInitialState =
  | { tab: 'import'; targetFolderId?: string | null }
  | { tab: 'export'; scope: 'note' | 'folder' | 'vault'; targetId?: string | null };

interface ImportExportModalProps {
  isOpen: boolean;
  initialState: ImportExportInitialState | null;
  folders: FolderItem[];
  notes: NoteItem[];
  activeNoteId: string | null;
  onImportBundle: (
    bundle: ParsedImportBundle,
    targetParentFolderId: string | null,
  ) => void;
  onExportSuccess?: (message: string) => void;
  onClose: () => void;
}

function triggerBrowserDownload(file: ExportPayloadFile): void {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  initialState,
  folders,
  notes,
  activeNoteId,
  onImportBundle,
  onExportSuccess,
  onClose,
}) => {
  const activeFolders = useMemo(
    () =>
      folders
        .filter((f) => !f.deleted)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  );
  const activeNotes = useMemo(
    () =>
      notes
        .filter((n) => !n.deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes],
  );

  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportScope, setExportScope] = useState<'note' | 'folder' | 'vault'>('note');
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [noteFormat, setNoteFormat] = useState<'opennote' | 'markdown'>('opennote');
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const [importTargetFolderId, setImportTargetFolderId] = useState<string>('');
  const [parsedBundle, setParsedBundle] = useState<ParsedImportBundle | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setExportFeedback(null);
    setParsedBundle(null);

    if (initialState?.tab === 'import') {
      setTab('import');
      setImportTargetFolderId(initialState.targetFolderId ?? '');
    } else if (initialState?.tab === 'export') {
      setTab('export');
      setExportScope(initialState.scope);
      if (initialState.scope === 'note') {
        setSelectedNoteId(
          initialState.targetId || activeNoteId || activeNotes[0]?.id || '',
        );
      } else if (initialState.scope === 'folder') {
        setSelectedFolderId(initialState.targetId || activeFolders[0]?.id || '');
      }
    } else {
      setTab('export');
      setExportScope(activeNoteId ? 'note' : activeFolders.length > 0 ? 'folder' : 'vault');
      setSelectedNoteId(activeNoteId || activeNotes[0]?.id || '');
      setSelectedFolderId(activeFolders[0]?.id || '');
    }
  }, [isOpen, initialState, activeNoteId, activeNotes, activeFolders]);

  const exportPreview = useMemo<{
    file: ExportPayloadFile | null;
    summary: string;
  }>(() => {
    if (exportScope === 'note') {
      const targetNote = activeNotes.find((n) => n.id === selectedNoteId) ?? activeNotes[0];
      if (!targetNote) {
        return { file: null, summary: 'Select a note to export.' };
      }
      const file =
        noteFormat === 'markdown'
          ? createNoteExportMarkdown(targetNote)
          : createNoteExportJson(targetNote);
      return {
        file,
        summary: `Exports "${targetNote.title || 'Untitled Note'}" as ${file.filename}.`,
      };
    }

    if (exportScope === 'folder') {
      const targetFolder =
        activeFolders.find((f) => f.id === selectedFolderId) ?? activeFolders[0];
      if (!targetFolder) {
        return { file: null, summary: 'No folders available to export.' };
      }
      const file = createFolderExportJson(targetFolder.id, folders, notes);
      if (!file) {
        return { file: null, summary: 'Unable to read folder contents.' };
      }
      return {
        file,
        summary: `Includes ${file.folderCount} ${
          file.folderCount === 1 ? 'folder' : 'folders'
        } and ${file.noteCount} ${file.noteCount === 1 ? 'note' : 'notes'} as ${file.filename}.`,
      };
    }

    const file = createVaultExportJson(folders, notes);
    return {
      file,
      summary: `Exports your full vault (${file.folderCount} folders, ${file.noteCount} notes) as ${file.filename}.`,
    };
  }, [
    exportScope,
    selectedNoteId,
    selectedFolderId,
    noteFormat,
    activeNotes,
    activeFolders,
    folders,
    notes,
  ]);

  if (!isOpen) return null;

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setReadingFiles(true);
    try {
      const loaded = await Promise.all(
        Array.from(fileList).map(async (f) => ({
          name: f.name,
          text: await f.text(),
        })),
      );
      const bundle = parseImportFiles(loaded);
      setParsedBundle(bundle);
    } finally {
      setReadingFiles(false);
    }
  };

  const handleDownloadExport = () => {
    if (!exportPreview.file) return;
    triggerBrowserDownload(exportPreview.file);
    const msg = `Exported ${exportPreview.file.filename}`;
    setExportFeedback(msg);
    onExportSuccess?.(msg);
  };

  const handleConfirmImport = () => {
    if (!parsedBundle || (parsedBundle.folders.length === 0 && parsedBundle.notes.length === 0)) {
      return;
    }
    onImportBundle(parsedBundle, importTargetFolderId || null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-export-modal-title"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FolderArchive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2
              id="import-export-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Import &amp; Export Notes and Folders
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Import and Export dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div
            role="tablist"
            aria-label="Import or export mode"
            className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'export'}
              onClick={() => setTab('export')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'export'
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'import'}
              onClick={() => setTab('import')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'import'
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {tab === 'export' ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Download a single note, an entire folder (with nested subfolders and diagrams), or a full vault backup so you can move content to another account offline without creating a share link.
              </p>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExportScope('note');
                    if (!selectedNoteId && activeNotes[0]) setSelectedNoteId(activeNotes[0].id);
                  }}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors ${
                    exportScope === 'note'
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold">Single Note</span>
                  <span className="text-[11px] opacity-75">.opennote.json or .md</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportScope('folder');
                    if (!selectedFolderId && activeFolders[0]) setSelectedFolderId(activeFolders[0].id);
                  }}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors ${
                    exportScope === 'folder'
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Folder className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold">Folder Tree</span>
                  <span className="text-[11px] opacity-75">Subfolders &amp; notes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('vault')}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors ${
                    exportScope === 'vault'
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <FolderArchive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold">Entire Vault</span>
                  <span className="text-[11px] opacity-75">Full account backup</span>
                </button>
              </div>

              {exportScope === 'note' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="export-note-select"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Choose Note
                    </label>
                    <select
                      id="export-note-select"
                      value={selectedNoteId}
                      onChange={(e) => setSelectedNoteId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      {activeNotes.length === 0 ? (
                        <option value="">No notes available</option>
                      ) : (
                        activeNotes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title || 'Untitled Note'}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Export Format
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs ${
                          noteFormat === 'opennote'
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="export-note-format"
                          checked={noteFormat === 'opennote'}
                          onChange={() => setNoteFormat('opennote')}
                          className="mt-0.5 text-indigo-600"
                        />
                        <span>
                          <strong className="block text-slate-900 dark:text-white">
                            opennote Bundle (.opennote.json)
                          </strong>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Best for transferring between accounts with full metadata
                          </span>
                        </span>
                      </label>

                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs ${
                          noteFormat === 'markdown'
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="export-note-format"
                          checked={noteFormat === 'markdown'}
                          onChange={() => setNoteFormat('markdown')}
                          className="mt-0.5 text-indigo-600"
                        />
                        <span>
                          <strong className="block text-slate-900 dark:text-white">
                            Markdown File (.md)
                          </strong>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Readable anywhere; preserves Concept Diagrams
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {exportScope === 'folder' && (
                <div className="space-y-1">
                  <label
                    htmlFor="export-folder-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Choose Folder
                  </label>
                  <select
                    id="export-folder-select"
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {activeFolders.length === 0 ? (
                      <option value="">No folders available</option>
                    ) : (
                      activeFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 min-w-0">
                  <FileCode2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">{exportPreview.summary}</span>
                </div>
                <button
                  type="button"
                  disabled={!exportPreview.file}
                  onClick={handleDownloadExport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-semibold shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Export
                </button>
              </div>

              {exportFeedback && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{exportFeedback}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Import <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">.opennote.json</code> folder or note bundles exported from another account, or import standard <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">.md</code> / <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">.txt</code> Markdown files directly into your vault.
              </p>

              <div className="space-y-1">
                <label
                  htmlFor="import-destination-folder"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Import Destination Folder
                </label>
                <select
                  id="import-destination-folder"
                  value={importTargetFolderId}
                  onChange={(e) => setImportTargetFolderId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Vault Root (Top Level)</option>
                  {activeFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      Folder: {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFilesSelected(e.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".json,.opennote.json,.md,.markdown,.txt"
                  aria-label="Choose export or Markdown files to import"
                  onChange={(e) => void handleFilesSelected(e.target.files)}
                  className="hidden"
                />
                <Upload className="w-6 h-6 mx-auto text-indigo-600 dark:text-indigo-400 mb-2" />
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {readingFiles
                    ? 'Reading selected files...'
                    : 'Drop .opennote.json or .md files here, or browse from disk'}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Choose Files...
                </button>
              </div>

              {parsedBundle && (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-100">
                      <span>
                        Ready to import: {parsedBundle.folders.length}{' '}
                        {parsedBundle.folders.length === 1 ? 'folder' : 'folders'},{' '}
                        {parsedBundle.notes.length}{' '}
                        {parsedBundle.notes.length === 1 ? 'note' : 'notes'}
                      </span>
                      <span className="text-[11px] font-normal text-slate-500">
                        {parsedBundle.fileNames.length}{' '}
                        {parsedBundle.fileNames.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                    {parsedBundle.notes.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Notes: {parsedBundle.notes.slice(0, 5).map((n) => n.title).join(', ')}
                        {parsedBundle.notes.length > 5
                          ? ` (+${parsedBundle.notes.length - 5} more)`
                          : ''}
                      </div>
                    )}
                  </div>

                  {parsedBundle.warnings.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                      {parsedBundle.warnings.map((w, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={
                        parsedBundle.folders.length === 0 && parsedBundle.notes.length === 0
                      }
                      onClick={handleConfirmImport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-semibold"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import into Vault
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
