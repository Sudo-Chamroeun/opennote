import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  icon?: React.ReactNode;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  title,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const maxWidth = 268;
  const estHeight = Math.min(460, items.length * 34 + (title ? 32 : 12));
  const clampedX =
    typeof window !== 'undefined' ? Math.max(8, Math.min(x, window.innerWidth - maxWidth - 12)) : x;
  const clampedY =
    typeof window !== 'undefined' ? Math.max(8, Math.min(y, window.innerHeight - estHeight - 12)) : y;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={title || 'Context actions'}
      style={{ left: clampedX, top: clampedY, width: maxWidth }}
      className="fixed z-50 max-h-[78vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1.5 text-xs select-none"
    >
      {title && (
        <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1 truncate">
          {title}
        </div>
      )}
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && (
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          )}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none ${
              item.danger
                ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              {item.icon && <span className="shrink-0 opacity-75">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </span>
            {item.shortcut && (
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {item.shortcut}
              </span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
