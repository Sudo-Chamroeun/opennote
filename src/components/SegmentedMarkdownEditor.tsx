import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronRight,
  Code2,
  Copy,
  Edit3,
  Shapes,
  Trash2,
} from 'lucide-react';
import type { ConceptDiagram, EditorViewMode } from '../types';
import {
  applyTextSegmentEdit,
  mapGlobalOffsetToSegment,
  splitMarkdownIntoEditorSegments,
  type EditorTextSegment,
} from '../utils/diagram';

export interface SegmentedMarkdownEditorHandle {
  focusGlobalRange: (globalStart: number, globalEnd?: number) => void;
  getGlobalSelection: () => { start: number; end: number };
}

interface SegmentedMarkdownEditorProps {
  content: string;
  viewMode: EditorViewMode;
  editorFontClass: string;
  fontSize: number;
  onChangeContent: (
    nextContent: string,
    cursorStart: number,
    cursorEnd: number,
  ) => void;
  onSelectionChange?: (globalStart: number, globalEnd: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onContextMenuAt: (
    e: React.MouseEvent<HTMLTextAreaElement>,
    globalSelStart: number,
    globalSelEnd: number,
  ) => void;
  onEditDiagram: (diagram: ConceptDiagram) => void;
  onDeleteDiagram: (diagramId: string) => void;
  onCopyText?: (text: string, notice: string) => void;
}

export const SegmentedMarkdownEditor = forwardRef<
  SegmentedMarkdownEditorHandle,
  SegmentedMarkdownEditorProps
>(
  (
    {
      content,
      viewMode,
      editorFontClass,
      fontSize,
      onChangeContent,
      onSelectionChange,
      onUndo,
      onRedo,
      onContextMenuAt,
      onEditDiagram,
      onDeleteDiagram,
      onCopyText,
    },
    ref,
  ) => {
    const segments = useMemo(
      () => splitMarkdownIntoEditorSegments(content),
      [content],
    );
    const hasDiagrams = useMemo(
      () => segments.some((s) => s.type === 'diagram'),
      [segments],
    );

    const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
    const lastSelectionRef = useRef<{ start: number; end: number }>({
      start: 0,
      end: 0,
    });
    const segmentsRef = useRef(segments);
    segmentsRef.current = segments;

    const [expandedDiagramKeys, setExpandedDiagramKeys] = useState<Set<string>>(
      () => new Set(),
    );

    const resizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
    }, []);

    useEffect(() => {
      if (!hasDiagrams) return;
      textareaRefs.current.forEach((el) => resizeTextarea(el));
    }, [content, fontSize, editorFontClass, viewMode, hasDiagrams, resizeTextarea]);

    useImperativeHandle(
      ref,
      () => ({
        focusGlobalRange: (globalStart: number, globalEnd: number = globalStart) => {
          lastSelectionRef.current = { start: globalStart, end: globalEnd };
          const target = mapGlobalOffsetToSegment(
            segmentsRef.current,
            globalStart,
            globalEnd,
          );
          if (!target) return;
          requestAnimationFrame(() => {
            const el = textareaRefs.current.get(target.segmentKey);
            if (el) {
              el.focus();
              el.setSelectionRange(target.localStart, target.localEnd);
              resizeTextarea(el);
            }
          });
        },
        getGlobalSelection: () => lastSelectionRef.current,
      }),
      [resizeTextarea],
    );

    const reportSegmentSelection = (
      seg: EditorTextSegment,
      el: HTMLTextAreaElement,
    ) => {
      const localStart = el.selectionStart ?? 0;
      const localEnd = el.selectionEnd ?? localStart;
      const globalStart = seg.displayStart + localStart;
      const globalEnd = seg.displayStart + localEnd;
      lastSelectionRef.current = { start: globalStart, end: globalEnd };
      onSelectionChange?.(globalStart, globalEnd);
    };

    const toggleDiagramDropdown = (key: string) => {
      setExpandedDiagramKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    };

    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const textSegs = segments.filter(
        (s): s is EditorTextSegment => s.type === 'text',
      );
      const lastSeg = textSegs[textSegs.length - 1];
      if (!lastSeg) return;
      const el = textareaRefs.current.get(lastSeg.key);
      el?.focus();
    };

    return (
      <div
        onClick={handleContainerClick}
        className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto bg-white dark:bg-slate-950 ${
          viewMode === 'split'
            ? 'border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800'
            : ''
        }`}
      >
        <div
          onClick={handleContainerClick}
          className={`flex-1 flex flex-col w-full mx-auto p-6 2xl:px-10 ${
            viewMode === 'edit' ? 'max-w-4xl' : 'max-w-3xl 2xl:max-w-4xl'
          }`}
        >
          {segments.map((seg, idx) => {
            if (seg.type === 'diagram') {
              const isExpanded = expandedDiagramKeys.has(seg.key);
              const title = seg.diagram.title || 'Concept Diagram';
              const shapeCount = seg.diagram.nodes.length;
              const edgeCount = seg.diagram.edges.length;

              return (
                <div
                  key={seg.key}
                  data-testid={`editor-diagram-dropdown-${seg.diagramIndex}`}
                  className="my-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80 overflow-hidden shrink-0"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleDiagramDropdown(seg.key)}
                      aria-expanded={isExpanded}
                      aria-label={`Toggle Diagram ${seg.diagramIndex} (${title}) code`}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left text-xs font-medium text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${
                          isExpanded ? 'rotate-90 text-indigo-600 dark:text-indigo-400' : ''
                        }`}
                      />
                      <Shapes className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span className="font-semibold whitespace-nowrap shrink-0">
                        Diagram {seg.diagramIndex}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <span className="truncate text-slate-600 dark:text-slate-300">
                        {title}
                      </span>
                      <span className="hidden sm:inline text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                        ({shapeCount} shapes · {edgeCount} arrows)
                      </span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditDiagram(seg.diagram)}
                        aria-label={`Edit Diagram ${seg.diagramIndex} in studio`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDiagram(seg.diagram.id)}
                        aria-label={`Delete Diagram ${seg.diagramIndex}`}
                        title="Delete diagram"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                          Stored Markdown Diagram Block (readable by MCP agents)
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(seg.rawBlock);
                              onCopyText?.(
                                seg.rawBlock,
                                `Copied Diagram ${seg.diagramIndex} JSON block.`,
                              );
                            } catch {
                              // Clipboard blocked
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                        >
                          <Copy className="w-3 h-3" />
                          Copy Code
                        </button>
                      </div>
                      <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto max-h-72">
                        <code>{seg.rawBlock}</code>
                      </pre>
                    </div>
                  )}
                </div>
              );
            }

            const isOnlySegment = !hasDiagrams;
            const isLastSegment = idx === segments.length - 1;

            return (
              <textarea
                key={seg.key}
                ref={(el) => {
                  if (el) {
                    textareaRefs.current.set(seg.key, el);
                    if (!isOnlySegment) {
                      resizeTextarea(el);
                    }
                  } else {
                    textareaRefs.current.delete(seg.key);
                  }
                }}
                aria-label={
                  isOnlySegment
                    ? 'Markdown editor'
                    : isLastSegment
                      ? 'Continue writing Markdown below diagram'
                      : `Markdown prose section ${idx + 1}`
                }
                spellCheck={false}
                rows={isOnlySegment ? undefined : isLastSegment ? 4 : 1}
                value={seg.text}
                onFocus={(e) => reportSegmentSelection(seg, e.currentTarget)}
                onClick={(e) => reportSegmentSelection(seg, e.currentTarget)}
                onSelect={(e) => reportSegmentSelection(seg, e.currentTarget)}
                onContextMenu={(e) => {
                  const el = e.currentTarget;
                  const localStart = el.selectionStart ?? 0;
                  const localEnd = el.selectionEnd ?? localStart;
                  const globalStart = seg.displayStart + localStart;
                  const globalEnd = seg.displayStart + localEnd;
                  lastSelectionRef.current = { start: globalStart, end: globalEnd };
                  onContextMenuAt(e, globalStart, globalEnd);
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const key = e.key.toLowerCase();
                    if (key === 'z' && !e.shiftKey) {
                      e.preventDefault();
                      onUndo();
                    } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
                      e.preventDefault();
                      onRedo();
                    }
                  }
                }}
                onChange={(e) => {
                  const el = e.currentTarget;
                  const nextText = el.value;
                  const localSelStart = el.selectionStart ?? nextText.length;
                  const localSelEnd = el.selectionEnd ?? localSelStart;
                  const result = applyTextSegmentEdit(
                    content,
                    seg,
                    nextText,
                    localSelStart,
                    localSelEnd,
                  );
                  lastSelectionRef.current = {
                    start: result.globalSelStart,
                    end: result.globalSelEnd,
                  };
                  if (!isOnlySegment) {
                    resizeTextarea(el);
                  }
                  onChangeContent(
                    result.content,
                    result.globalSelStart,
                    result.globalSelEnd,
                  );
                }}
                placeholder={
                  isOnlySegment
                    ? 'Write Markdown here... Right-click for copy, paste, spelling & diagram actions.'
                    : isLastSegment
                      ? 'Continue text here...'
                      : 'Write Markdown here...'
                }
                className={`w-full resize-none bg-transparent text-slate-800 dark:text-slate-200 leading-[1.7] outline-none ${
                  isOnlySegment
                    ? 'flex-1 h-full min-h-[360px]'
                    : isLastSegment
                      ? 'flex-1 min-h-[140px] overflow-hidden'
                      : 'overflow-hidden'
                } ${editorFontClass}`}
                style={{ fontSize: `${fontSize}px` }}
              />
            );
          })}
        </div>
      </div>
    );
  },
);

SegmentedMarkdownEditor.displayName = 'SegmentedMarkdownEditor';
