import type { ConceptDiagram, EditorFontFamily } from '../types';
import { parseConceptJson } from './diagram';

export type TextAlignment = 'left' | 'center' | 'right';

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'concept'; diagram: ConceptDiagram }
  | { type: 'list'; ordered: boolean; items: Array<{ text: string; checked?: boolean; num?: number; lineIndex: number }> }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'aligned'; align: TextAlignment; blocks: MarkdownBlock[] }
  | { type: 'hr' };

export function getEditorFontClass(fontFamily: EditorFontFamily): string {
  switch (fontFamily) {
    case 'serif':
      return 'font-note-serif';
    case 'mono':
      return 'font-note-mono';
    case 'arial':
      return 'font-note-arial';
    case 'khmer_battambang':
      return 'font-note-khmer-battambang';
    case 'khmer_siemreap':
      return 'font-note-khmer-siemreap';
    case 'khmer_muollight':
      return 'font-note-khmer-muollight';
    case 'sans':
    default:
      return 'font-note-sans';
  }
}

export function extractInlineTags(content: string): string[] {
  const withoutCode = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const matches = withoutCode.match(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{1,31})/g) ?? [];
  const set = new Set<string>();
  for (const m of matches) {
    const tag = m.trim().slice(1).toLowerCase();
    if (tag) set.add(tag);
  }
  return Array.from(set);
}

export function extractWikilinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g) ?? [];
  const set = new Set<string>();
  for (const m of matches) {
    const inner = m.slice(2, -2).split('|')[0].trim();
    if (inner) set.add(inner);
  }
  return Array.from(set);
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code or concept block
    const fenceMatch = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1].toLowerCase();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing fence

      const raw = codeLines.join('\n');
      if (lang === 'concept') {
        const parsed = parseConceptJson(raw);
        if (parsed) {
          blocks.push({ type: 'concept', diagram: parsed });
          continue;
        }
      }
      blocks.push({ type: 'code', lang, code: raw });
      continue;
    }

    // Aligned container block: <div align="left|center|right">...</div>
    const singleLineAlign = line.match(
      /^\s*<div\s+align="(left|center|right)"\s*>([\s\S]*?)<\/div>\s*$/i,
    );
    if (singleLineAlign) {
      const align = singleLineAlign[1].toLowerCase() as TextAlignment;
      const inner = singleLineAlign[2].trim();
      blocks.push({
        type: 'aligned',
        align,
        blocks: inner ? parseMarkdownBlocks(inner) : [],
      });
      i += 1;
      continue;
    }

    const openAlign = line.match(/^\s*<div\s+align="(left|center|right)"\s*>\s*$/i);
    if (openAlign) {
      const align = openAlign[1].toLowerCase() as TextAlignment;
      const innerLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*<\/div>\s*$/i.test(lines[i])) {
        innerLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing </div>
      blocks.push({
        type: 'aligned',
        align,
        blocks: parseMarkdownBlocks(innerLines.join('\n')),
      });
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    // Markdown table
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Unordered / Task list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: Array<{ text: string; checked?: boolean; lineIndex: number }> = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const rawItem = lines[i].replace(/^\s*[-*+]\s+/, '');
        const taskMatch = rawItem.match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          items.push({
            checked: taskMatch[1].toLowerCase() === 'x',
            text: taskMatch[2],
            lineIndex: i,
          });
        } else {
          items.push({ text: rawItem, lineIndex: i });
        }
        i += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const items: Array<{ text: string; checked?: boolean; num?: number; lineIndex: number }> = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(\d+)\.\s+(.*)$/);
        if (!m) break;
        const parsedNum = Number.parseInt(m[1], 10);
        items.push({
          text: m[2],
          num: Number.isFinite(parsedNum) ? parsedNum : items.length + 1,
          lineIndex: i,
        });
        i += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Paragraph (consume consecutive non-block lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*<div\s+align="(left|center|right)"\s*>/i.test(lines[i]) &&
      !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
  }

  return blocks;
}

export function toggleChecklistLine(markdown: string, lineIndex: number): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return markdown;
  const line = lines[lineIndex];
  if (/^(\s*[-*+]\s+)\[ \](\s+.*)$/.test(line)) {
    lines[lineIndex] = line.replace(/^(\s*[-*+]\s+)\[ \](\s+.*)$/, '$1[x]$2');
  } else if (/^(\s*[-*+]\s+)\[[xX]\](\s+.*)$/.test(line)) {
    lines[lineIndex] = line.replace(/^(\s*[-*+]\s+)\[[xX]\](\s+.*)$/, '$1[ ]$2');
  }
  return lines.join('\n');
}

export function applyAlignmentToMarkdown(
  markdown: string,
  selStart: number,
  selEnd: number,
  align: TextAlignment,
): { content: string; cursorStart: number; cursorEnd: number } {
  const safeStart = Math.max(0, Math.min(selStart, markdown.length));
  const safeEnd = Math.max(safeStart, Math.min(selEnd, markdown.length));

  const lineStart = markdown.lastIndexOf('\n', Math.max(0, safeStart - 1)) + 1;
  const rawLineEnd = markdown.indexOf('\n', safeEnd);
  const lineEnd = rawLineEnd === -1 ? markdown.length : rawLineEnd;

  const target = (safeEnd > safeStart ? markdown.slice(safeStart, safeEnd) : markdown.slice(lineStart, lineEnd)).trim() || 'Aligned text';
  const replaceFrom = safeEnd > safeStart ? safeStart : lineStart;
  const replaceTo = safeEnd > safeStart ? safeEnd : lineEnd;

  const existingMatch = target.match(
    /^<div\s+align="(left|center|right)"\s*>([\s\S]*?)<\/div>$/i,
  );

  let replacement: string;
  if (existingMatch) {
    const prevAlign = existingMatch[1].toLowerCase();
    const inner = existingMatch[2].trim();
    replacement =
      prevAlign === align ? inner : `<div align="${align}">\n${inner}\n</div>`;
  } else {
    replacement = `<div align="${align}">\n${target}\n</div>`;
  }

  const content = markdown.slice(0, replaceFrom) + replacement + markdown.slice(replaceTo);
  const cursorStart = replaceFrom;
  const cursorEnd = replaceFrom + replacement.length;
  return { content, cursorStart, cursorEnd };
}

export function getNextOrderedListPrefix(markdown: string, cursorStart: number): string {
  const before = markdown.slice(0, Math.max(0, Math.min(cursorStart, markdown.length)));
  const lines = before.replace(/\r\n/g, '\n').split('\n');
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const trimmed = lines[idx].trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\.\s*/);
    if (match) {
      const nextNum = Number.parseInt(match[1], 10) + 1;
      if (Number.isFinite(nextNum) && nextNum > 0) {
        return `${nextNum}. `;
      }
    }
    break;
  }
  return '1. ';
}
