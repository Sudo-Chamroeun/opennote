import React from 'react';
import type { ConceptDiagram, EditorFontFamily, ThemeMode } from '../types';
import { getEditorFontClass, parseMarkdownBlocks, type MarkdownBlock } from '../utils/markdown';
import { ConceptCanvas } from './ConceptCanvas';

interface MarkdownPreviewProps {
  content: string;
  fontFamily: EditorFontFamily;
  fontSize: number;
  theme: ThemeMode;
  onToggleChecklist: (lineIndex: number) => void;
  onClickWikilink: (title: string) => void;
  onClickTag: (tag: string) => void;
  onEditConceptDiagram?: (diagram: ConceptDiagram) => void;
  onDeleteConceptDiagram?: (diagramId: string) => void;
  onContextMenuDiagram?: (e: React.MouseEvent, diagram: ConceptDiagram) => void;
}

function renderInline(
  text: string,
  onClickWikilink: (title: string) => void,
  onClickTag: (tag: string) => void,
): React.ReactNode[] {
  // Tokenize ==highlight==, **bold**, *italic*, ~~strike~~, <u>underline</u>, `code`, [[wikilink]], [label](url), #tag
  const pattern =
    /(==[^=]+==|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|<u>[\s\S]*?<\/u>|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|(?:^|\s)#[a-zA-Z][a-zA-Z0-9_-]{1,31})/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    keyIdx += 1;

    if (token.startsWith('==') && token.endsWith('==')) {
      nodes.push(
        <mark
          key={`hl-${keyIdx}`}
          className="px-1 py-0.5 rounded bg-amber-200/80 dark:bg-amber-400/25 text-slate-900 dark:text-amber-100"
        >
          {token.slice(2, -2)}
        </mark>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`b-${keyIdx}`} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`i-${keyIdx}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <del key={`s-${keyIdx}`} className="line-through text-slate-400">
          {token.slice(2, -2)}
        </del>,
      );
    } else if (/^<u>[\s\S]*<\/u>$/i.test(token)) {
      nodes.push(
        <u key={`u-${keyIdx}`} className="underline underline-offset-2 decoration-2">
          {token.slice(3, -4)}
        </u>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`c-${keyIdx}`}
          className="px-1.5 py-0.5 rounded text-[0.88em] bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-slate-200/80 dark:border-slate-700"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[[') && token.endsWith(']]')) {
      const inner = token.slice(2, -2);
      const [target, alias] = inner.split('|').map((s) => s.trim());
      nodes.push(
        <button
          key={`wl-${keyIdx}`}
          type="button"
          onClick={() => onClickWikilink(target)}
          className="inline text-indigo-600 dark:text-indigo-400 underline decoration-indigo-300 dark:decoration-indigo-600 underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
        >
          {alias || target}
        </button>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={`lnk-${keyIdx}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      // Inline #tag with optional leading space
      const leadingSpace = token.startsWith(' ') ? ' ' : '';
      const tagWord = token.trim();
      const tagName = tagWord.slice(1).toLowerCase();
      if (leadingSpace) nodes.push(leadingSpace);
      nodes.push(
        <button
          key={`tg-${keyIdx}`}
          type="button"
          onClick={() => onClickTag(tagName)}
          className="inline text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
        >
          {tagWord}
        </button>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  fontFamily,
  fontSize,
  theme,
  onToggleChecklist,
  onClickWikilink,
  onClickTag,
  onEditConceptDiagram,
  onDeleteConceptDiagram,
  onContextMenuDiagram,
}) => {
  const blocks = parseMarkdownBlocks(content);
  const fontClass = getEditorFontClass(fontFamily);

  if (blocks.length === 0) {
    return (
      <div className="py-12 text-sm text-slate-400 dark:text-slate-500">
        Start writing Markdown or add a Concept Diagram from the toolbar.
      </div>
    );
  }

  const renderBlock = (block: MarkdownBlock, index: number): React.ReactNode => {
    switch (block.type) {
          case 'heading': {
            const sizeClass =
              block.level === 1
                ? 'text-[1.7em] font-bold tracking-tight text-slate-900 dark:text-white pt-1'
                : block.level === 2
                  ? 'text-[1.35em] font-semibold tracking-tight text-slate-900 dark:text-white pt-2'
                  : block.level === 3
                    ? 'text-[1.12em] font-semibold text-slate-800 dark:text-slate-100 pt-1'
                    : 'text-[1em] font-semibold text-slate-700 dark:text-slate-200';
            return (
              <div key={index} className={sizeClass}>
                {renderInline(block.text, onClickWikilink, onClickTag)}
              </div>
            );
          }

          case 'paragraph':
            return (
              <p key={index} className="leading-[1.7] text-slate-700 dark:text-slate-300">
                {renderInline(block.text, onClickWikilink, onClickTag)}
              </p>
            );

          case 'blockquote':
            return (
              <blockquote
                key={index}
                className="px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300"
              >
                {block.lines.map((l, idx) => (
                  <p key={idx}>{renderInline(l, onClickWikilink, onClickTag)}</p>
                ))}
              </blockquote>
            );

          case 'code':
            return (
              <div
                key={index}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 overflow-x-auto"
              >
                {block.lang && (
                  <div className="px-3 py-1.5 text-[11px] font-mono text-slate-400 border-b border-slate-800">
                    {block.lang}
                  </div>
                )}
                <pre className="p-3 text-[13px] leading-relaxed font-mono">
                  <code>{block.code}</code>
                </pre>
              </div>
            );

          case 'concept':
            return (
              <div key={index} className="my-4">
                <ConceptCanvas
                  diagram={block.diagram}
                  theme={theme}
                  readOnly
                  height={340}
                  onRequestEdit={
                    onEditConceptDiagram ? () => onEditConceptDiagram(block.diagram) : undefined
                  }
                  onRequestDelete={
                    onDeleteConceptDiagram
                      ? () => onDeleteConceptDiagram(block.diagram.id)
                      : undefined
                  }
                  onContextMenu={
                    onContextMenuDiagram
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onContextMenuDiagram(e, block.diagram);
                        }
                      : undefined
                  }
                />
              </div>
            );

          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag
                key={index}
                className={`space-y-1.5 ${
                  block.ordered ? 'list-decimal pl-6' : 'pl-2'
                }`}
              >
                {block.items.map((item, itemIdx) => {
                  if (typeof item.checked === 'boolean') {
                    return (
                      <li key={itemIdx} className="flex items-start gap-2.5 list-none">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => onToggleChecklist(item.lineIndex)}
                          aria-label={`Toggle task: ${item.text}`}
                          className="mt-1.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span
                          className={
                            item.checked
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : ''
                          }
                        >
                          {renderInline(item.text, onClickWikilink, onClickTag)}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={itemIdx}
                      className={block.ordered ? '' : 'list-disc ml-5'}
                    >
                      {renderInline(item.text, onClickWikilink, onClickTag)}
                    </li>
                  );
                })}
              </ListTag>
            );
          }

          case 'table':
            return (
              <div
                key={index}
                className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
              >
                <table className="w-full text-left border-collapse text-[0.92em]">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      {block.headers.map((header, hIdx) => (
                        <th key={hIdx} className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                          {renderInline(header, onClickWikilink, onClickTag)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                            {renderInline(cell, onClickWikilink, onClickTag)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'aligned': {
            const alignClass =
              block.align === 'center'
                ? 'text-center'
                : block.align === 'right'
                  ? 'text-right'
                  : 'text-left';
            return (
              <div key={index} className={`${alignClass} space-y-3`}>
                {block.blocks.map((child, cIdx) => renderBlock(child, cIdx))}
              </div>
            );
          }

          case 'hr':
            return <hr key={index} className="border-slate-200 dark:border-slate-800 my-4" />;
    }
  };

  return (
    <div
      className={`${fontClass} leading-relaxed text-slate-800 dark:text-slate-200 space-y-4`}
      style={{ fontSize: `${fontSize}px` }}
    >
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
};
