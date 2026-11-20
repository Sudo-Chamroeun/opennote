import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Eye,
  Folder,
  FileText,
  Globe,
  Link2,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AuthSession,
  FolderItem,
  NoteItem,
  ShareLinkInfo,
  SharePermission,
} from '../types';
import { collectShareSnapshot } from '../utils/vault';

interface ShareModalProps {
  isOpen: boolean;
  target: { type: 'note' | 'folder'; id: string } | null;
  session: AuthSession | null;
  folders: FolderItem[];
  notes: NoteItem[];
  existingShare: ShareLinkInfo | null;
  onShareSaved: (share: ShareLinkInfo) => void;
  onShareDeleted: (shareId: string) => void;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  target,
  session,
  folders,
  notes,
  existingShare,
  onShareSaved,
  onShareDeleted,
  onClose,
}) => {
  const [permission, setPermission] = useState<SharePermission>(
    existingShare?.permission ?? 'read',
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermission(existingShare?.permission ?? 'read');
    setError(null);
    setCopied(false);
  }, [existingShare?.id, existingShare?.permission, target?.id, target?.type, isOpen]);

  if (!isOpen || !target) return null;

  const snapshot = collectShareSnapshot(target.type, target.id, folders, notes);
  const title = snapshot?.title || (target.type === 'folder' ? 'Folder' : 'Note');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = existingShare ? `${origin}/?share=${existingShare.token}` : '';

  const createOrUpdateShare = async (nextPermission: SharePermission) => {
    if (!session || !snapshot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          targetType: target.type,
          targetId: target.id,
          title: snapshot.title,
          permission: nextPermission,
          folders: snapshot.folders,
          notes: snapshot.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update share link');
      }
      setPermission(nextPermission);
      onShareSaved(data.share as ShareLinkInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to manage share link');
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!session || !existingShare) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shares/${existingShare.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to revoke share link');
      }
      onShareDeleted(existingShare.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke link');
    } finally {
      setBusy(false);
    }
  };

  const copyShareUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            {target.type === 'folder' ? (
              <Folder className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            )}
            <h2
              id="share-modal-title"
              className="text-sm font-semibold text-slate-900 dark:text-white truncate"
            >
              Share {target.type === 'folder' ? 'Folder' : 'Note'}: {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Share dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {!session ? (
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 leading-relaxed">
              Public HTTPS sharing requires signing into your opennote server account. Offline-only
              vaults stay strictly on this browser.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
                  <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Anyone with the HTTPS link</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  {target.type === 'folder'
                    ? `Shares "${title}" and ${snapshot?.notes.length ?? 0} note(s) inside it (including subfolders) with anyone opening this link.`
                    : `Shares "${title}" and any embedded Concept Diagrams over HTTPS.`}
                </p>
              </div>

              {/* Access Permission Toggle */}
              <div className="space-y-2">
                <span className="block font-semibold text-slate-700 dark:text-slate-200">
                  Link Permission
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (existingShare) {
                        void createOrUpdateShare('read');
                      } else {
                        setPermission('read');
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                      permission === 'read'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Read Only</div>
                      <div className="text-[11px] opacity-80">Can view &amp; print</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (existingShare) {
                        void createOrUpdateShare('readwrite');
                      } else {
                        setPermission('readwrite');
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                      permission === 'readwrite'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Edit3 className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Read &amp; Write</div>
                      <div className="text-[11px] opacity-80">Can edit &amp; add notes</div>
                    </div>
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300"
                >
                  {error}
                </div>
              )}

              {!existingShare ? (
                <button
                  type="button"
                  disabled={busy || !snapshot}
                  onClick={() => createOrUpdateShare(permission)}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  {busy ? 'Creating Share Link...' : 'Create Public HTTPS Share Link'}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      aria-label="Public share URL"
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={copyShareUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy Link'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Edits sync between link visitors and your vault.
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={revokeShare}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke Link
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
