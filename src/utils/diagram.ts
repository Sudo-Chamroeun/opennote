import type { ConceptDiagram, DiagramEdge, DiagramNode, ShapeColor, ShapeKind } from '../types';

export interface Point {
  x: number;
  y: number;
}

export interface ShapePaletteToken {
  fillLight: string;
  strokeLight: string;
  textLight: string;
  fillDark: string;
  strokeDark: string;
  textDark: string;
  swatch: string;
  label: string;
}

export const SHAPE_COLORS: Record<ShapeColor, ShapePaletteToken> = {
  slate: {
    fillLight: '#f8fafc',
    strokeLight: '#475569',
    textLight: '#0f172a',
    fillDark: '#1e293b',
    strokeDark: '#94a3b8',
    textDark: '#f1f5f9',
    swatch: '#64748b',
    label: 'Slate',
  },
  indigo: {
    fillLight: '#eef2ff',
    strokeLight: '#4f46e5',
    textLight: '#1e1b4b',
    fillDark: '#1e1b4b',
    strokeDark: '#818cf8',
    textDark: '#e0e7ff',
    swatch: '#4f46e5',
    label: 'Indigo',
  },
  emerald: {
    fillLight: '#ecfdf5',
    strokeLight: '#059669',
    textLight: '#064e3b',
    fillDark: '#064e3b',
    strokeDark: '#34d399',
    textDark: '#d1fae5',
    swatch: '#059669',
    label: 'Emerald',
  },
  amber: {
    fillLight: '#fffbeb',
    strokeLight: '#d97706',
    textLight: '#78350f',
    fillDark: '#451a03',
    strokeDark: '#fbbf24',
    textDark: '#fef3c7',
    swatch: '#d97706',
    label: 'Amber',
  },
  rose: {
    fillLight: '#fff1f2',
    strokeLight: '#e11d48',
    textLight: '#881337',
    fillDark: '#4c0519',
    strokeDark: '#fb7185',
    textDark: '#ffe4e6',
    swatch: '#e11d48',
    label: 'Rose',
  },
  violet: {
    fillLight: '#f5f3ff',
    strokeLight: '#7c3aed',
    textLight: '#4c1d95',
    fillDark: '#2e1065',
    strokeDark: '#a78bfa',
    textDark: '#ede9fe',
    swatch: '#7c3aed',
    label: 'Violet',
  },
};

export const SHAPE_CATALOG: Array<{ kind: ShapeKind; label: string; defaultW: number; defaultH: number }> = [
  { kind: 'square', label: 'Square', defaultW: 140, defaultH: 74 },
  { kind: 'rounded', label: 'Rounded', defaultW: 150, defaultH: 74 },
  { kind: 'circle', label: 'Circle', defaultW: 108, defaultH: 108 },
  { kind: 'hexagon', label: 'Hexagon', defaultW: 152, defaultH: 86 },
  { kind: 'puzzle', label: 'Puzzle', defaultW: 152, defaultH: 92 },
  { kind: 'diamond', label: 'Diamond', defaultW: 136, defaultH: 92 },
  { kind: 'triangle', label: 'Triangle', defaultW: 132, defaultH: 96 },
  { kind: 'cylinder', label: 'Database', defaultW: 126, defaultH: 96 },
  { kind: 'label', label: 'Label', defaultW: 140, defaultH: 44 },
];

export function createDefaultNode(kind: ShapeKind, x: number, y: number, index = 1): DiagramNode {
  const spec = SHAPE_CATALOG.find((item) => item.kind === kind) ?? SHAPE_CATALOG[0];
  const colorByKind: Record<ShapeKind, ShapeColor> = {
    square: 'slate',
    rounded: 'indigo',
    circle: 'emerald',
    hexagon: 'violet',
    puzzle: 'amber',
    diamond: 'rose',
    triangle: 'amber',
    cylinder: 'indigo',
    label: 'slate',
  };
  return {
    id: `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    x: Math.round(x),
    y: Math.round(y),
    width: spec.defaultW,
    height: spec.defaultH,
    label: kind === 'label' ? 'Concept Note' : `${spec.label} ${index}`,
    color: colorByKind[kind],
    fontSize: 13,
  };
}

export function createEdge(fromId: string, toId: string, label = ''): DiagramEdge {
  return {
    id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    fromId,
    toId,
    label,
    style: 'solid',
    arrowEnd: true,
    arrowStart: false,
    color: 'slate',
  };
}

export function getShapePath(kind: ShapeKind, w: number, h: number): string {
  switch (kind) {
    case 'hexagon': {
      const inset = Math.min(w * 0.2, 26);
      return [
        `M ${inset} 0`,
        `L ${w - inset} 0`,
        `L ${w} ${h / 2}`,
        `L ${w - inset} ${h}`,
        `L ${inset} ${h}`,
        `L 0 ${h / 2}`,
        'Z',
      ].join(' ');
    }
    case 'diamond': {
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    }
    case 'triangle': {
      return `M ${w / 2} 2 L ${w - 2} ${h - 2} L 2 ${h - 2} Z`;
    }
    case 'puzzle': {
      // Interlocking puzzle piece with top outward tab and right outward tab, left & bottom inward sockets
      const tab = Math.min(w, h) * 0.16;
      const mx = w / 2;
      const my = h / 2;
      const r = 8;
      return [
        `M ${r} 0`,
        `L ${mx - tab} 0`,
        `C ${mx - tab} ${-tab * 1.15}, ${mx + tab} ${-tab * 1.15}, ${mx + tab} 0`,
        `L ${w - r} 0`,
        `Q ${w} 0 ${w} ${r}`,
        `L ${w} ${my - tab}`,
        `C ${w + tab * 1.15} ${my - tab}, ${w + tab * 1.15} ${my + tab}, ${w} ${my + tab}`,
        `L ${w} ${h - r}`,
        `Q ${w} ${h} ${w - r} ${h}`,
        `L ${mx + tab} ${h}`,
        `C ${mx + tab} ${h - tab * 0.95}, ${mx - tab} ${h - tab * 0.95}, ${mx - tab} ${h}`,
        `L ${r} ${h}`,
        `Q 0 ${h} 0 ${h - r}`,
        `L 0 ${my + tab}`,
        `C ${tab * 0.95} ${my + tab}, ${tab * 0.95} ${my - tab}, 0 ${my - tab}`,
        `L 0 ${r}`,
        `Q 0 0 ${r} 0`,
        'Z',
      ].join(' ');
    }
    case 'cylinder': {
      const ry = Math.min(14, h * 0.18);
      return [
        `M 0 ${ry}`,
        `A ${w / 2} ${ry} 0 0 1 ${w} ${ry}`,
        `L ${w} ${h - ry}`,
        `A ${w / 2} ${ry} 0 0 1 0 ${h - ry}`,
        'Z',
      ].join(' ');
    }
    default:
      return `M 0 0 H ${w} V ${h} H 0 Z`;
  }
}

export function getShapeTextBounds(
  kind: ShapeKind,
  w: number,
  h: number,
): { x: number; y: number; width: number; height: number } {
  switch (kind) {
    case 'puzzle': {
      const padX = Math.max(18, Math.round(w * 0.16));
      const padY = Math.max(12, Math.round(h * 0.16));
      return {
        x: padX,
        y: padY,
        width: Math.max(36, w - padX * 2),
        height: Math.max(24, h - padY * 2),
      };
    }
    case 'triangle':
      return {
        x: Math.round(w * 0.2),
        y: Math.round(h * 0.36),
        width: Math.max(32, Math.round(w * 0.6)),
        height: Math.max(24, Math.round(h * 0.52)),
      };
    case 'diamond':
      return {
        x: Math.round(w * 0.18),
        y: Math.round(h * 0.2),
        width: Math.max(32, Math.round(w * 0.64)),
        height: Math.max(24, Math.round(h * 0.6)),
      };
    case 'hexagon':
      return {
        x: Math.round(Math.min(w * 0.2, 26) + 4),
        y: 6,
        width: Math.max(36, Math.round(w - Math.min(w * 0.2, 26) * 2 - 8)),
        height: Math.max(24, h - 12),
      };
    case 'cylinder':
      return {
        x: 10,
        y: Math.round(Math.min(14, h * 0.18) + 8),
        width: Math.max(36, w - 20),
        height: Math.max(24, Math.round(h - Math.min(14, h * 0.18) - 16)),
      };
    default:
      return {
        x: 8,
        y: 4,
        width: Math.max(32, w - 16),
        height: Math.max(20, h - 8),
      };
  }
}

export function getNodeCenter(node: DiagramNode): Point {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

/**
 * Computes the boundary intersection point along the ray from `node` center toward `target`
 * so arrows stop cleanly at the perimeter of shapes instead of overlapping labels.
 */
export function getAnchorPoint(node: DiagramNode, target: Point): Point {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy };
  }

  const hw = node.width / 2;
  const hh = node.height / 2;

  if (node.kind === 'circle') {
    const angle = Math.atan2(dy, dx);
    return {
      x: cx + Math.cos(angle) * hw,
      y: cy + Math.sin(angle) * hh,
    };
  }

  if (node.kind === 'diamond') {
    const denom = Math.abs(dx) / hw + Math.abs(dy) / hh;
    const t = denom > 0 ? 1 / denom : 1;
    return {
      x: cx + dx * t,
      y: cy + dy * t,
    };
  }

  // Axis-aligned bounding box ray intersection for square, rounded, hexagon, puzzle, label, cylinder, triangle
  const tx = Math.abs(dx) > 0.0001 ? hw / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0.0001 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return {
    x: cx + dx * t,
    y: cy + dy * t,
  };
}

export function serializeConceptBlock(diagram: ConceptDiagram): string {
  return `\n\`\`\`concept\n${JSON.stringify(diagram, null, 2)}\n\`\`\`\n`;
}

export function parseConceptJson(raw: string): ConceptDiagram | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ConceptDiagram>;
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return {
      id: typeof parsed.id === 'string' ? parsed.id : `diag_${Date.now().toString(36)}`,
      title: typeof parsed.title === 'string' ? parsed.title : 'Concept Diagram',
      nodes: parsed.nodes,
      edges: parsed.edges,
    };
  } catch {
    return null;
  }
}

export function extractConceptBlocksFromMarkdown(markdown: string): ConceptDiagram[] {
  const regex = /```concept\s*\n([\s\S]*?)\n```/g;
  const results: ConceptDiagram[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const parsed = parseConceptJson(match[1]);
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
}

export function upsertConceptBlockInMarkdown(
  markdown: string,
  diagram: ConceptDiagram,
  insertAtOffset?: number,
): string {
  const regex = /```concept\s*\n([\s\S]*?)\n```/g;
  let replaced = false;
  const next = markdown.replace(regex, (full, body) => {
    const parsed = parseConceptJson(body);
    if (parsed && parsed.id === diagram.id) {
      replaced = true;
      return `\`\`\`concept\n${JSON.stringify(diagram, null, 2)}\n\`\`\``;
    }
    return full;
  });
  if (replaced) {
    return next;
  }

  const blockText = `\`\`\`concept\n${JSON.stringify(diagram, null, 2)}\n\`\`\``;
  if (
    typeof insertAtOffset === 'number' &&
    insertAtOffset >= 0 &&
    insertAtOffset < markdown.length
  ) {
    // Snap insertion to the nearest line end so we don't split inside a line or word
    const lineEnd = markdown.indexOf('\n', insertAtOffset);
    const splitPos = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const before = markdown.slice(0, splitPos).replace(/\n+$/, '');
    const after = markdown.slice(splitPos).replace(/^\n+/, '');
    const parts: string[] = [];
    if (before) parts.push(before);
    parts.push(blockText);
    if (after) parts.push(after);
    return `${parts.join('\n\n')}\n`;
  }

  const trimmed = markdown.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? '\n\n' : ''}${blockText}\n`;
}

export function removeConceptBlockFromMarkdown(markdown: string, diagramId: string): string {
  const regex = /\n*```concept\s*\n([\s\S]*?)\n```\n*/g;
  const next = markdown.replace(regex, (full, body) => {
    const parsed = parseConceptJson(body);
    if (parsed && parsed.id === diagramId) {
      return '\n\n';
    }
    return full;
  });
  return next.replace(/\n{3,}/g, '\n\n').trim() + (next.trim() ? '\n' : '');
}

export function findConceptDiagramAtCursor(
  markdown: string,
  cursorIndex: number,
): ConceptDiagram | null {
  const regex = /```concept\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    if (cursorIndex >= start && cursorIndex <= end) {
      return parseConceptJson(match[1]);
    }
  }
  return null;
}

export function duplicateConceptDiagram(diagram: ConceptDiagram): ConceptDiagram {
  const newId = `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  return {
    ...structuredClone(diagram),
    id: newId,
    title: `${diagram.title || 'Concept Diagram'} (Copy)`,
  };
}

export interface EditorTextSegment {
  type: 'text';
  key: string;
  rawStart: number;
  rawEnd: number;
  displayStart: number;
  displayEnd: number;
  text: string;
  hasPrevDiagram: boolean;
  hasNextDiagram: boolean;
}

export interface EditorDiagramSegment {
  type: 'diagram';
  key: string;
  rawStart: number;
  rawEnd: number;
  diagramIndex: number;
  rawBlock: string;
  rawJson: string;
  diagram: ConceptDiagram;
}

export type EditorSegment = EditorTextSegment | EditorDiagramSegment;

function computeDisplayBounds(
  markdown: string,
  rawStart: number,
  rawEnd: number,
  hasPrevDiagram: boolean,
  hasNextDiagram: boolean,
): { displayStart: number; displayEnd: number; text: string } {
  let displayStart = rawStart;
  let displayEnd = rawEnd;

  if (hasPrevDiagram) {
    let stripped = 0;
    while (displayStart < displayEnd && markdown[displayStart] === '\n' && stripped < 2) {
      displayStart += 1;
      stripped += 1;
    }
  }

  if (hasNextDiagram) {
    let stripped = 0;
    while (displayEnd > displayStart && markdown[displayEnd - 1] === '\n' && stripped < 2) {
      displayEnd -= 1;
      stripped += 1;
    }
  }

  return {
    displayStart,
    displayEnd,
    text: markdown.slice(displayStart, displayEnd),
  };
}

/**
 * Splits a Markdown note into prose segments and valid ```concept diagram blocks
 * so the editor can render diagrams as clean collapsible dropdowns while keeping
 * exact character offsets into the underlying Markdown string.
 */
export function splitMarkdownIntoEditorSegments(markdown: string): EditorSegment[] {
  const regex = /```concept\s*\n([\s\S]*?)\n```/g;
  const diagramMatches: Array<{
    start: number;
    end: number;
    rawBlock: string;
    rawJson: string;
    diagram: ConceptDiagram;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const parsed = parseConceptJson(match[1]);
    if (parsed) {
      diagramMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        rawBlock: match[0],
        rawJson: match[1],
        diagram: parsed,
      });
    }
  }

  if (diagramMatches.length === 0) {
    return [
      {
        type: 'text',
        key: 'text-0',
        rawStart: 0,
        rawEnd: markdown.length,
        displayStart: 0,
        displayEnd: markdown.length,
        text: markdown,
        hasPrevDiagram: false,
        hasNextDiagram: false,
      },
    ];
  }

  const segments: EditorSegment[] = [];
  let cursor = 0;

  diagramMatches.forEach((dm, idx) => {
    const hasPrev = idx > 0;
    const rawStart = cursor;
    const rawEnd = dm.start;
    const bounds = computeDisplayBounds(markdown, rawStart, rawEnd, hasPrev, true);

    // Emit text segment before the diagram (always emit between diagrams or if non-empty before first)
    if (idx === 0 || bounds.text.length > 0 || rawEnd > rawStart) {
      segments.push({
        type: 'text',
        key: `text-${idx}`,
        rawStart,
        rawEnd,
        displayStart: bounds.displayStart,
        displayEnd: bounds.displayEnd,
        text: bounds.text,
        hasPrevDiagram: hasPrev,
        hasNextDiagram: true,
      });
    }

    segments.push({
      type: 'diagram',
      key: `diag-${dm.diagram.id}-${idx}`,
      rawStart: dm.start,
      rawEnd: dm.end,
      diagramIndex: idx + 1,
      rawBlock: dm.rawBlock,
      rawJson: dm.rawJson,
      diagram: dm.diagram,
    });

    cursor = dm.end;
  });

  // Always emit a trailing prose segment so users can click below the final diagram and type
  const tailBounds = computeDisplayBounds(markdown, cursor, markdown.length, true, false);
  segments.push({
    type: 'text',
    key: `text-${diagramMatches.length}`,
    rawStart: cursor,
    rawEnd: markdown.length,
    displayStart: tailBounds.displayStart,
    displayEnd: tailBounds.displayEnd,
    text: tailBounds.text,
    hasPrevDiagram: true,
    hasNextDiagram: false,
  });

  return segments;
}

/**
 * Reconstructs the full Markdown string after editing a single prose segment,
 * preserving clean blank-line separation around adjacent ```concept blocks.
 */
export function applyTextSegmentEdit(
  markdown: string,
  segment: EditorTextSegment,
  nextSegmentText: string,
  localSelStart: number,
  localSelEnd: number,
): { content: string; globalSelStart: number; globalSelEnd: number } {
  let prefix = markdown.slice(0, segment.displayStart);
  if (segment.hasPrevDiagram && nextSegmentText.length > 0) {
    const gap = markdown.slice(segment.rawStart, segment.displayStart);
    if (gap.length === 0) {
      prefix += '\n\n';
    } else if (gap.length === 1) {
      prefix += '\n';
    }
  }

  let suffix = markdown.slice(segment.displayEnd);
  if (segment.hasNextDiagram && nextSegmentText.length > 0) {
    const gap = markdown.slice(segment.displayEnd, segment.rawEnd);
    if (gap.length === 0) {
      suffix = `\n\n${suffix}`;
    } else if (gap.length === 1) {
      suffix = `\n${suffix}`;
    }
  }

  const content = prefix + nextSegmentText + suffix;
  return {
    content,
    globalSelStart: prefix.length + localSelStart,
    globalSelEnd: prefix.length + localSelEnd,
  };
}

export function mapGlobalOffsetToSegment(
  segments: EditorSegment[],
  globalStart: number,
  globalEnd: number = globalStart,
): { segmentKey: string; localStart: number; localEnd: number } | null {
  const textSegments = segments.filter((s): s is EditorTextSegment => s.type === 'text');
  if (textSegments.length === 0) return null;

  for (const seg of textSegments) {
    if (globalStart >= seg.rawStart && globalStart <= seg.rawEnd) {
      const clampedStart = Math.max(0, Math.min(seg.text.length, globalStart - seg.displayStart));
      const clampedEnd = Math.max(clampedStart, Math.min(seg.text.length, globalEnd - seg.displayStart));
      return {
        segmentKey: seg.key,
        localStart: clampedStart,
        localEnd: clampedEnd,
      };
    }
  }

  const last = textSegments[textSegments.length - 1];
  return {
    segmentKey: last.key,
    localStart: last.text.length,
    localEnd: last.text.length,
  };
}


