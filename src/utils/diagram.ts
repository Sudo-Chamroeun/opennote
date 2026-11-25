import type {
  ConceptDiagram,
  DiagramEdge,
  DiagramNode,
  EdgeAnchorSide,
  ShapeColor,
  ShapeKind,
} from '../types';

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

export function createEdge(
  fromId?: string,
  toId?: string,
  label = '',
  extras?: Partial<DiagramEdge>,
): DiagramEdge {
  return {
    id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...(fromId ? { fromId } : {}),
    ...(toId ? { toId } : {}),
    label,
    style: 'solid',
    arrowEnd: true,
    arrowStart: false,
    color: 'slate',
    ...extras,
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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getSideAnchorPoint(
  node: DiagramNode,
  side: Exclude<EdgeAnchorSide, 'auto'>,
  offset = 0.5,
): Point {
  const t = clamp(offset, 0.04, 0.96);
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const hw = node.width / 2;
  const hh = node.height / 2;

  if (node.kind === 'circle') {
    if (side === 'top' || side === 'bottom') {
      const x = node.x + node.width * t;
      const nx = clamp((x - cx) / Math.max(1, hw), -0.98, 0.98);
      const dy = hh * Math.sqrt(Math.max(0, 1 - nx * nx));
      return { x, y: side === 'top' ? cy - dy : cy + dy };
    }
    const y = node.y + node.height * t;
    const ny = clamp((y - cy) / Math.max(1, hh), -0.98, 0.98);
    const dx = hw * Math.sqrt(Math.max(0, 1 - ny * ny));
    return { x: side === 'left' ? cx - dx : cx + dx, y };
  }

  if (node.kind === 'diamond') {
    // Anchor around diamond perimeter along requested side
    const u = t - 0.5; // -0.46..0.46
    const factor = 1 - Math.abs(u) * 2;
    switch (side) {
      case 'top':
        return { x: cx + u * node.width, y: cy - hh * factor };
      case 'bottom':
        return { x: cx + u * node.width, y: cy + hh * factor };
      case 'left':
        return { x: cx - hw * factor, y: cy + u * node.height };
      case 'right':
        return { x: cx + hw * factor, y: cy + u * node.height };
    }
  }

  switch (side) {
    case 'top':
      return { x: node.x + node.width * t, y: node.y };
    case 'bottom':
      return { x: node.x + node.width * t, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height * t };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height * t };
  }
}

export interface NodeAnchorHit {
  nodeId: string;
  side: Exclude<EdgeAnchorSide, 'auto'>;
  offset: number;
  point: Point;
  dist: number;
}

export function findNearestNodeAnchor(
  nodes: DiagramNode[],
  point: Point,
  snapRadius = 24,
  excludeNodeId?: string,
): NodeAnchorHit | null {
  let best: NodeAnchorHit | null = null;

  for (const node of nodes) {
    if (excludeNodeId && node.id === excludeNodeId) continue;
    const insideOrNear =
      point.x >= node.x - snapRadius &&
      point.x <= node.x + node.width + snapRadius &&
      point.y >= node.y - snapRadius &&
      point.y <= node.y + node.height + snapRadius;

    if (!insideOrNear) continue;

    const candidates: Array<{ side: Exclude<EdgeAnchorSide, 'auto'>; offset: number }> = [
      { side: 'top', offset: clamp((point.x - node.x) / Math.max(1, node.width), 0.06, 0.94) },
      { side: 'bottom', offset: clamp((point.x - node.x) / Math.max(1, node.width), 0.06, 0.94) },
      { side: 'left', offset: clamp((point.y - node.y) / Math.max(1, node.height), 0.06, 0.94) },
      { side: 'right', offset: clamp((point.y - node.y) / Math.max(1, node.height), 0.06, 0.94) },
    ];

    for (const c of candidates) {
      const anchorPt = getSideAnchorPoint(node, c.side, c.offset);
      const dist = Math.hypot(point.x - anchorPt.x, point.y - anchorPt.y);
      if (!best || dist < best.dist) {
        best = {
          nodeId: node.id,
          side: c.side,
          offset: Number(c.offset.toFixed(3)),
          point: anchorPt,
          dist,
        };
      }
    }
  }

  return best;
}

function inferDominantSide(from: Point, to: Point): Exclude<EdgeAnchorSide, 'auto'> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

function dedupeSequentialPoints(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const pt of pts) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.5) {
      out.push(pt);
    }
  }
  return out;
}

export function buildAutoOrthogonalPoints(
  p1: Point,
  p2: Point,
  fromSide: Exclude<EdgeAnchorSide, 'auto'>,
  toSide: Exclude<EdgeAnchorSide, 'auto'>,
): Point[] {
  if (fromSide === 'left' && toSide === 'left') {
    const laneX = Math.min(p1.x, p2.x) - 36;
    return dedupeSequentialPoints([p1, { x: laneX, y: p1.y }, { x: laneX, y: p2.y }, p2]);
  }
  if (fromSide === 'right' && toSide === 'right') {
    const laneX = Math.max(p1.x, p2.x) + 36;
    return dedupeSequentialPoints([p1, { x: laneX, y: p1.y }, { x: laneX, y: p2.y }, p2]);
  }
  if (fromSide === 'top' && toSide === 'top') {
    const laneY = Math.min(p1.y, p2.y) - 32;
    return dedupeSequentialPoints([p1, { x: p1.x, y: laneY }, { x: p2.x, y: laneY }, p2]);
  }
  if (fromSide === 'bottom' && toSide === 'bottom') {
    const laneY = Math.max(p1.y, p2.y) + 32;
    return dedupeSequentialPoints([p1, { x: p1.x, y: laneY }, { x: p2.x, y: laneY }, p2]);
  }

  const fromHoriz = fromSide === 'left' || fromSide === 'right';
  const toHoriz = toSide === 'left' || toSide === 'right';

  if (fromHoriz && toHoriz) {
    const midX = (p1.x + p2.x) / 2;
    return dedupeSequentialPoints([p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2]);
  }
  if (!fromHoriz && !toHoriz) {
    const midY = (p1.y + p2.y) / 2;
    return dedupeSequentialPoints([p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2]);
  }
  if (fromHoriz && !toHoriz) {
    return dedupeSequentialPoints([p1, { x: p2.x, y: p1.y }, p2]);
  }
  return dedupeSequentialPoints([p1, { x: p1.x, y: p2.y }, p2]);
}

function getSideNormal(side: Exclude<EdgeAnchorSide, 'auto'>): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

function computePolylineMidpoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    total += len;
  }
  if (total < 0.001) return pts[0];
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= half) {
      const ratio = segLens[i] > 0 ? (half - acc) / segLens[i] : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * ratio,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * ratio,
      };
    }
    acc += segLens[i];
  }
  return pts[pts.length - 1];
}

export interface ResolvedEdgeGeometry {
  p1: Point;
  p2: Point;
  fromSide: Exclude<EdgeAnchorSide, 'auto'>;
  toSide: Exclude<EdgeAnchorSide, 'auto'>;
  polylinePoints: Point[];
  controlPoints: Point[];
  svgPath: string;
  labelPoint: Point;
  segmentMidpoints: Array<{ index: number; point: Point }>;
}

export function resolveEdgeGeometry(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
): ResolvedEdgeGeometry | null {
  const fromNode = edge.fromId ? nodeMap.get(edge.fromId) : undefined;
  const toNode = edge.toId ? nodeMap.get(edge.toId) : undefined;
  const waypoints = edge.waypoints ?? [];

  if (edge.fromId && !fromNode && !edge.fromPoint) return null;
  if (edge.toId && !toNode && !edge.toPoint) return null;

  const fallbackFrom = edge.fromPoint ?? (fromNode ? getNodeCenter(fromNode) : { x: 80, y: 80 });
  const fallbackTo = edge.toPoint ?? (toNode ? getNodeCenter(toNode) : { x: 240, y: 80 });

  const targetForFrom = waypoints[0] ?? fallbackTo;
  const targetForTo = waypoints[waypoints.length - 1] ?? fallbackFrom;

  const p1 =
    fromNode && edge.fromAnchor && edge.fromAnchor !== 'auto'
      ? getSideAnchorPoint(fromNode, edge.fromAnchor, edge.fromOffset ?? 0.5)
      : fromNode
        ? getAnchorPoint(fromNode, targetForFrom)
        : fallbackFrom;

  const p2 =
    toNode && edge.toAnchor && edge.toAnchor !== 'auto'
      ? getSideAnchorPoint(toNode, edge.toAnchor, edge.toOffset ?? 0.5)
      : toNode
        ? getAnchorPoint(toNode, targetForTo)
        : fallbackTo;

  const fromSide: Exclude<EdgeAnchorSide, 'auto'> =
    edge.fromAnchor && edge.fromAnchor !== 'auto'
      ? edge.fromAnchor
      : inferDominantSide(p1, targetForFrom);
  const toSide: Exclude<EdgeAnchorSide, 'auto'> =
    edge.toAnchor && edge.toAnchor !== 'auto'
      ? edge.toAnchor
      : inferDominantSide(p2, targetForTo);

  const routeStyle = edge.routeStyle ?? 'straight';

  if (routeStyle === 'curved') {
    if (waypoints.length === 0) {
      const dist = Math.max(36, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.42);
      const n1 = getSideNormal(fromSide);
      const n2 = getSideNormal(toSide);
      const c1 = { x: p1.x + n1.x * dist, y: p1.y + n1.y * dist };
      const c2 = { x: p2.x + n2.x * dist, y: p2.y + n2.y * dist };
      const svgPath = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
      const labelPoint = {
        x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
        y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
      };
      return {
        p1,
        p2,
        fromSide,
        toSide,
        polylinePoints: [p1, c1, c2, p2],
        controlPoints: [],
        svgPath,
        labelPoint,
        segmentMidpoints: [{ index: 0, point: labelPoint }],
      };
    }

    if (waypoints.length === 1) {
      const w = waypoints[0];
      const cx = 2 * w.x - 0.5 * (p1.x + p2.x);
      const cy = 2 * w.y - 0.5 * (p1.y + p2.y);
      const svgPath = `M ${p1.x} ${p1.y} Q ${cx} ${cy}, ${p2.x} ${p2.y}`;
      const segMids = [
        {
          index: 0,
          point: {
            x: 0.25 * p1.x + 0.5 * cx + 0.25 * w.x,
            y: 0.25 * p1.y + 0.5 * cy + 0.25 * w.y,
          },
        },
        {
          index: 1,
          point: {
            x: 0.25 * w.x + 0.5 * cx + 0.25 * p2.x,
            y: 0.25 * w.y + 0.5 * cy + 0.25 * p2.y,
          },
        },
      ];
      return {
        p1,
        p2,
        fromSide,
        toSide,
        polylinePoints: [p1, w, p2],
        controlPoints: [w],
        svgPath,
        labelPoint: w,
        segmentMidpoints: segMids,
      };
    }

    const pts = [p1, ...waypoints, p2];
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${mx} ${my}`;
    }
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    d += ` Q ${prev.x} ${prev.y}, ${last.x} ${last.y}`;
    const segMids = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segMids.push({
        index: i,
        point: { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 },
      });
    }
    return {
      p1,
      p2,
      fromSide,
      toSide,
      polylinePoints: pts,
      controlPoints: waypoints,
      svgPath: d,
      labelPoint: computePolylineMidpoint(pts),
      segmentMidpoints: segMids,
    };
  }

  let polylinePoints: Point[];
  let controlPoints: Point[] = waypoints;

  if (routeStyle === 'orthogonal') {
    if (waypoints.length === 0) {
      polylinePoints = buildAutoOrthogonalPoints(p1, p2, fromSide, toSide);
    } else if (waypoints.length === 1) {
      const w = waypoints[0];
      const fromHoriz = fromSide === 'left' || fromSide === 'right';
      const toHoriz = toSide === 'left' || toSide === 'right';
      if (fromHoriz && toHoriz) {
        polylinePoints = dedupeSequentialPoints([p1, { x: w.x, y: p1.y }, { x: w.x, y: p2.y }, p2]);
        controlPoints = [{ x: w.x, y: (p1.y + p2.y) / 2 }];
      } else if (!fromHoriz && !toHoriz) {
        polylinePoints = dedupeSequentialPoints([p1, { x: p1.x, y: w.y }, { x: p2.x, y: w.y }, p2]);
        controlPoints = [{ x: (p1.x + p2.x) / 2, y: w.y }];
      } else if (fromHoriz) {
        polylinePoints = dedupeSequentialPoints([p1, { x: w.x, y: p1.y }, w, { x: p2.x, y: w.y }, p2]);
      } else {
        polylinePoints = dedupeSequentialPoints([p1, { x: p1.x, y: w.y }, w, { x: w.x, y: p2.y }, p2]);
      }
    } else {
      polylinePoints = dedupeSequentialPoints([p1, ...waypoints, p2]);
    }
  } else {
    polylinePoints = dedupeSequentialPoints([p1, ...waypoints, p2]);
  }

  const svgPath = polylinePoints
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
    .join(' ');
  const labelPoint = computePolylineMidpoint(polylinePoints);

  const segmentMidpoints: Array<{ index: number; point: Point }> = [];
  if (waypoints.length === 0 && routeStyle === 'orthogonal') {
    // Allow dragging the middle lane directly as a single bend handle
    segmentMidpoints.push({ index: 0, point: labelPoint });
  } else if (routeStyle === 'orthogonal' && waypoints.length === 1) {
    // Single lane handle already exists in controlPoints; allow adding extra bends on outer stubs if needed
    const secondPt = polylinePoints[1] ?? p2;
    segmentMidpoints.push({
      index: 0,
      point: { x: (p1.x + secondPt.x) / 2, y: (p1.y + secondPt.y) / 2 },
    });
  } else {
    const rawPts = [p1, ...waypoints, p2];
    for (let i = 0; i < rawPts.length - 1; i++) {
      segmentMidpoints.push({
        index: i,
        point: {
          x: (rawPts[i].x + rawPts[i + 1].x) / 2,
          y: (rawPts[i].y + rawPts[i + 1].y) / 2,
        },
      });
    }
  }

  return {
    p1,
    p2,
    fromSide,
    toSide,
    polylinePoints,
    controlPoints,
    svgPath,
    labelPoint,
    segmentMidpoints,
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


