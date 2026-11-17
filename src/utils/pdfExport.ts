import type { ConceptDiagram, FolderItem, NoteItem } from '../types';
import { SHAPE_COLORS, getAnchorPoint, getNodeCenter, getShapePath } from './diagram';
import { parseMarkdownBlocks } from './markdown';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInlineHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="wikilink">$1</span>');
  return html;
}

function renderConceptSvgHtml(diagram: ConceptDiagram): string {
  if (diagram.nodes.length === 0) return '';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of diagram.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = 28;
  const vx = Math.max(0, minX - pad);
  const vy = Math.max(0, minY - pad);
  const vw = Math.max(320, maxX - vx + pad);
  const vh = Math.max(180, maxY - vy + pad);
  const nodeMap = new Map(diagram.nodes.map((n) => [n.id, n]));
  const markerId = `pdf-arrow-${diagram.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const edgesSvg = diagram.edges
    .map((edge) => {
      const fromNode = nodeMap.get(edge.fromId);
      const toNode = nodeMap.get(edge.toId);
      if (!fromNode || !toNode) return '';
      const p1 = getAnchorPoint(fromNode, getNodeCenter(toNode));
      const p2 = getAnchorPoint(toNode, getNodeCenter(fromNode));
      const palette = SHAPE_COLORS[edge.color ?? 'slate'] ?? SHAPE_COLORS.slate;
      const stroke = palette.strokeLight;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dash = edge.style === 'dashed' ? 'stroke-dasharray="6 4"' : '';
      const labelSvg = edge.label
        ? `<g transform="translate(${midX}, ${midY})">
             <rect x="${-Math.max(24, edge.label.length * 3.6 + 8)}" y="-11" width="${Math.max(48, edge.label.length * 7.2 + 16)}" height="22" rx="6" fill="#ffffff" stroke="${stroke}" stroke-width="1" />
             <text text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="500" fill="#1e293b">${escapeHtml(edge.label)}</text>
           </g>`
        : '';
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="1.8" ${dash} ${
        edge.arrowEnd ? `marker-end="url(#${markerId})"` : ''
      } />${labelSvg}`;
    })
    .join('');

  const nodesSvg = diagram.nodes
    .map((node) => {
      const palette = SHAPE_COLORS[node.color] ?? SHAPE_COLORS.slate;
      let shapeEl = '';
      if (node.kind === 'label') {
        shapeEl = `<rect x="0" y="0" width="${node.width}" height="${node.height}" fill="transparent" />`;
      } else if (node.kind === 'square' || node.kind === 'rounded') {
        const rx = node.kind === 'rounded' ? 16 : 4;
        shapeEl = `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="${rx}" fill="${palette.fillLight}" stroke="${palette.strokeLight}" stroke-width="1.75" />`;
      } else if (node.kind === 'circle') {
        shapeEl = `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" fill="${palette.fillLight}" stroke="${palette.strokeLight}" stroke-width="1.75" />`;
      } else {
        const path = getShapePath(node.kind, node.width, node.height);
        shapeEl = `<path d="${path}" fill="${palette.fillLight}" stroke="${palette.strokeLight}" stroke-width="1.75" stroke-linejoin="round" />`;
      }
      return `<g transform="translate(${node.x}, ${node.y})">
        ${shapeEl}
        <text x="${node.width / 2}" y="${node.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${
          node.fontSize ?? 13
        }" font-weight="500" fill="${palette.textLight}">${escapeHtml(node.label)}</text>
      </g>`;
    })
    .join('');

  return `<div class="diagram-card">
    <div class="diagram-title">${escapeHtml(diagram.title || 'Concept Diagram')}</div>
    <svg viewBox="${vx} ${vy} ${vw} ${vh}" width="100%" style="max-height:360px;display:block;">
      <defs>
        <marker id="${markerId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#475569" />
        </marker>
      </defs>
      ${edgesSvg}
      ${nodesSvg}
    </svg>
  </div>`;
}

function renderNoteHtml(note: NoteItem): string {
  const blocks = parseMarkdownBlocks(note.content);
  const bodyHtml = blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}>${renderInlineHtml(block.text)}</h${block.level}>`;
        case 'paragraph':
          return `<p>${renderInlineHtml(block.text)}</p>`;
        case 'blockquote':
          return `<blockquote>${block.lines.map((l) => `<p>${renderInlineHtml(l)}</p>`).join('')}</blockquote>`;
        case 'code':
          return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
        case 'concept':
          return renderConceptSvgHtml(block.diagram);
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = block.items
            .map((it) =>
              typeof it.checked === 'boolean'
                ? `<li class="task">${it.checked ? '&#9745;' : '&#9744;'} ${renderInlineHtml(it.text)}</li>`
                : `<li>${renderInlineHtml(it.text)}</li>`,
            )
            .join('');
          return `<${tag}>${items}</${tag}>`;
        }
        case 'table': {
          const ths = block.headers.map((h) => `<th>${renderInlineHtml(h)}</th>`).join('');
          const trs = block.rows
            .map((row) => `<tr>${row.map((c) => `<td>${renderInlineHtml(c)}</td>`).join('')}</tr>`)
            .join('');
          return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
        }
        case 'hr':
          return '<hr />';
      }
    })
    .join('\n');

  const tagsLine = note.tags.length
    ? `<div class="note-meta">Tags: ${note.tags.map((t) => `#${escapeHtml(t)}`).join(' · ')}</div>`
    : '';

  return `<article class="note-section">
    <h1 class="note-doc-title">${escapeHtml(note.title || 'Untitled Note')}</h1>
    ${tagsLine}
    ${bodyHtml}
  </article>`;
}

export function buildPrintablePdfHtml(title: string, notesToExport: NoteItem[]): string {
  const articles = notesToExport
    .map((n, idx) => `${idx > 0 ? '<div class="page-break"></div>' : ''}${renderNoteHtml(n)}`)
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — opennote PDF Export</title>
  <style>
    @page { margin: 18mm; }
    body {
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.65;
      font-size: 13.5px;
      max-width: 820px;
      margin: 0 auto;
    }
    .export-banner {
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 8px;
      margin-bottom: 20px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    .note-doc-title { font-size: 24px; margin: 0 0 6px; color: #0f172a; }
    .note-meta { font-size: 11.5px; color: #4f46e5; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 18px 0 8px; }
    h2 { font-size: 16px; margin: 16px 0 6px; }
    h3 { font-size: 14px; margin: 14px 0 4px; }
    p { margin: 8px 0; }
    mark { background: #fef08a; padding: 1px 4px; border-radius: 3px; }
    code { font-family: "JetBrains Mono", monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; font-size: 12px; }
    pre { background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
    pre code { background: transparent; color: inherit; padding: 0; }
    blockquote { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12.5px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    li.task { list-style: none; margin-left: -16px; }
    .wikilink { color: #4f46e5; text-decoration: underline; }
    .diagram-card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; margin: 14px 0; page-break-inside: avoid; }
    .diagram-title { font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <div class="export-banner">
    <span>opennote · ${escapeHtml(title)}</span>
    <span>Exported ${new Date().toLocaleDateString()}</span>
  </div>
  ${articles}
</body>
</html>`;
}

export function collectFolderNotesRecursive(
  folderId: string,
  folders: FolderItem[],
  notes: NoteItem[],
): NoteItem[] {
  const activeFolders = folders.filter((f) => !f.deleted);
  const folderIds = new Set<string>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of activeFolders) {
      if (f.parentId && folderIds.has(f.parentId) && !folderIds.has(f.id)) {
        folderIds.add(f.id);
        added = true;
      }
    }
  }
  return notes.filter((n) => !n.deleted && n.folderId && folderIds.has(n.folderId));
}

export function exportNotesToPdf(title: string, notesToExport: NoteItem[]): void {
  if (notesToExport.length === 0) return;
  const html = buildPrintablePdfHtml(title, notesToExport);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };

  iframe.srcdoc = html;
}
