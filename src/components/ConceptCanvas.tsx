import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Circle,
  Copy,
  Database,
  Diamond,
  Grid,
  Hexagon,
  MousePointer2,
  MoveUpRight,
  Puzzle,
  RotateCcw,
  Square,
  Trash2,
  Triangle,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ConceptDiagram,
  DiagramEdge,
  DiagramNode,
  EdgeAnchorSide,
  EdgeRouteStyle,
  ShapeColor,
  ShapeKind,
  ThemeMode,
} from '../types';
import {
  SHAPE_CATALOG,
  SHAPE_COLORS,
  createDefaultNode,
  createEdge,
  findNearestNodeAnchor,
  getNodeCenter,
  getShapePath,
  getShapeTextBounds,
  resolveEdgeGeometry,
  type Point,
} from '../utils/diagram';

interface ConceptCanvasProps {
  diagram: ConceptDiagram;
  theme: ThemeMode;
  readOnly?: boolean;
  height?: number;
  onChange?: (next: ConceptDiagram) => void;
  onRequestEdit?: () => void;
  onRequestDelete?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const SHAPE_ICONS: Record<ShapeKind, React.ComponentType<{ className?: string }>> = {
  square: Square,
  rounded: Square,
  circle: Circle,
  hexagon: Hexagon,
  puzzle: Puzzle,
  diamond: Diamond,
  triangle: Triangle,
  cylinder: Database,
  label: Type,
};

function renderShapeSvg(
  node: DiagramNode,
  theme: ThemeMode,
  isSelected: boolean,
  isConnectSource: boolean,
  readOnly: boolean,
) {
  const palette = SHAPE_COLORS[node.color] ?? SHAPE_COLORS.slate;
  const fill = theme === 'dark' ? palette.fillDark : palette.fillLight;
  const stroke = isConnectSource
    ? '#0ea5e9'
    : isSelected
      ? '#4f46e5'
      : theme === 'dark'
        ? palette.strokeDark
        : palette.strokeLight;
  const strokeWidth = isSelected || isConnectSource ? 2.5 : 1.75;

  if (node.kind === 'label') {
    const labelBg =
      isSelected
        ? theme === 'dark'
          ? 'rgba(30,41,59,0.88)'
          : 'rgba(238,242,255,0.92)'
        : readOnly
          ? 'transparent'
          : theme === 'dark'
            ? 'rgba(15,23,42,0.5)'
            : 'rgba(248,250,252,0.85)';
    const labelStroke = isSelected
      ? stroke
      : readOnly
        ? 'transparent'
        : theme === 'dark'
          ? 'rgba(148,163,184,0.4)'
          : 'rgba(100,116,139,0.4)';
    return (
      <rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        rx={8}
        fill={labelBg}
        stroke={labelStroke}
        strokeDasharray={isSelected ? undefined : '4 3'}
        strokeWidth={isSelected ? 2 : 1.25}
      />
    );
  }

  if (node.kind === 'square') {
    return (
      <rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (node.kind === 'rounded') {
    return (
      <rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        rx={16}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (node.kind === 'circle') {
    return (
      <ellipse
        cx={node.width / 2}
        cy={node.height / 2}
        rx={node.width / 2}
        ry={node.height / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (node.kind === 'cylinder') {
    const ry = Math.min(14, node.height * 0.18);
    const path = getShapePath('cylinder', node.width, node.height);
    return (
      <g>
        <path d={path} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <ellipse
          cx={node.width / 2}
          cy={ry}
          rx={node.width / 2}
          ry={ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </g>
    );
  }

  const path = getShapePath(node.kind, node.width, node.height);
  return (
    <path
      d={path}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  );
}

export const ConceptCanvas: React.FC<ConceptCanvasProps> = ({
  diagram,
  theme,
  readOnly = false,
  height = 460,
  onChange,
  onRequestEdit,
  onRequestDelete,
  onContextMenu,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inlineNodeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const inlineEdgeInputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextCanvasClickRef = useRef(false);
  const frozenDragBoundsRef = useRef<{ minX: number; minY: number; width: number; height: number } | null>(null);

  const [tool, setTool] = useState<'select' | 'connect'>('select');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeDraft, setEditingNodeDraft] = useState('');
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingEdgeDraft, setEditingEdgeDraft] = useState('');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoom, setZoom] = useState(1);

  const [dragState, setDragState] = useState<
    | {
        mode: 'move' | 'resize';
        nodeId: string;
        startClientX: number;
        startClientY: number;
        origX: number;
        origY: number;
        origW: number;
        origH: number;
        active: boolean;
      }
    | {
        mode: 'edge-end';
        edgeId: string;
        end: 'from' | 'to';
      }
    | {
        mode: 'edge-waypoint';
        edgeId: string;
        waypointIndex: number;
      }
    | {
        mode: 'draw-arrow';
        startClientX: number;
        startClientY: number;
        startPoint: Point;
        currentPoint: Point;
        startNodeId?: string;
        active: boolean;
      }
    | null
  >(null);

  const selectedNode = useMemo(
    () => diagram.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [diagram.nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => diagram.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [diagram.edges, selectedEdgeId],
  );

  const nodeMap = useMemo(
    () => new Map(diagram.nodes.map((node) => [node.id, node])),
    [diagram.nodes],
  );

  const resolvedEdges = useMemo(
    () =>
      diagram.edges
        .map((edge) => ({ edge, geom: resolveEdgeGeometry(edge, nodeMap) }))
        .filter(
          (entry): entry is { edge: DiagramEdge; geom: NonNullable<ReturnType<typeof resolveEdgeGeometry>> } =>
            entry.geom !== null,
        ),
    [diagram.edges, nodeMap],
  );

  const rawViewBounds = useMemo(() => {
    if (diagram.nodes.length === 0 && resolvedEdges.length === 0) {
      return { minX: 0, minY: 0, width: 720, height: 380 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of diagram.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    for (const { edge, geom } of resolvedEdges) {
      for (const pt of geom.polylinePoints) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
      if (edge.label) {
        const halfLabelW = Math.max(24, edge.label.length * 3.6 + 12);
        minX = Math.min(minX, geom.labelPoint.x - halfLabelW);
        maxX = Math.max(maxX, geom.labelPoint.x + halfLabelW);
        minY = Math.min(minY, geom.labelPoint.y - 14);
        maxY = Math.max(maxY, geom.labelPoint.y + 14);
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 660;
      maxY = 420;
    }

    if (readOnly) {
      const pad = 28;
      const vx = Math.floor(minX - pad);
      const vy = Math.floor(minY - pad);
      return {
        minX: vx,
        minY: vy,
        width: Math.max(320, Math.ceil(maxX - vx + pad)),
        height: Math.max(180, Math.ceil(maxY - vy + pad)),
      };
    }

    const vx = Math.min(0, Math.floor(minX - 36));
    const vy = Math.min(0, Math.floor(minY - 36));
    return {
      minX: vx,
      minY: vy,
      width: Math.max(660 - vx, Math.ceil(maxX - vx + 64)),
      height: Math.max(420 - vy, Math.ceil(maxY - vy + 64)),
    };
  }, [diagram.nodes, resolvedEdges, readOnly]);

  if (!dragState) {
    frozenDragBoundsRef.current = null;
  } else if (!frozenDragBoundsRef.current) {
    frozenDragBoundsRef.current = rawViewBounds;
  }
  const viewBounds = dragState && frozenDragBoundsRef.current ? frozenDragBoundsRef.current : rawViewBounds;

  const clientToCanvasPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: Math.round((clientX - rect.left) / zoom + viewBounds.minX),
        y: Math.round((clientY - rect.top) / zoom + viewBounds.minY),
      };
    },
    [zoom, viewBounds.minX, viewBounds.minY],
  );

  useEffect(() => {
    if (editingNodeId) {
      requestAnimationFrame(() => {
        const el = inlineNodeInputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
    }
  }, [editingNodeId]);

  useEffect(() => {
    if (editingEdgeId) {
      requestAnimationFrame(() => {
        const el = inlineEdgeInputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
    }
  }, [editingEdgeId]);

  const diagramRef = useRef(diagram);
  diagramRef.current = diagram;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const clientToCanvasPointRef = useRef(clientToCanvasPoint);
  clientToCanvasPointRef.current = clientToCanvasPoint;
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const isDragging = Boolean(dragState);

  useEffect(() => {
    if (!isDragging || !onChangeRef.current) return;

    const snap = (val: number) => (snapToGrid ? Math.round(val / 12) * 12 : Math.round(val));

    const handlePointerMove = (e: PointerEvent) => {
      const activeDrag = dragStateRef.current;
      const currentDiagram = diagramRef.current;
      const emitChange = onChangeRef.current;
      if (!activeDrag || !emitChange) return;

      if (activeDrag.mode === 'move' || activeDrag.mode === 'resize') {
        const rawDx = e.clientX - activeDrag.startClientX;
        const rawDy = e.clientY - activeDrag.startClientY;

        if (!activeDrag.active && Math.hypot(rawDx, rawDy) < 4) {
          return;
        }

        if (!activeDrag.active) {
          setDragState((prev) => (prev && (prev.mode === 'move' || prev.mode === 'resize') ? { ...prev, active: true } : prev));
        }

        const dx = rawDx / zoom;
        const dy = rawDy / zoom;

        let changed = false;
        const nextNodes = currentDiagram.nodes.map((node) => {
          if (node.id !== activeDrag.nodeId) return node;
          if (activeDrag.mode === 'move') {
            const nx = Math.max(12, snap(activeDrag.origX + dx));
            const ny = Math.max(16, snap(activeDrag.origY + dy));
            if (nx === node.x && ny === node.y) return node;
            changed = true;
            return { ...node, x: nx, y: ny };
          }
          const nw = Math.max(72, snap(activeDrag.origW + dx));
          const nh = Math.max(40, snap(activeDrag.origH + dy));
          if (nw === node.width && nh === node.height) return node;
          changed = true;
          return { ...node, width: nw, height: nh };
        });
        if (changed) {
          emitChange({ ...currentDiagram, nodes: nextNodes });
        }
        return;
      }

      const pt = clientToCanvasPointRef.current(e.clientX, e.clientY);

      if (activeDrag.mode === 'draw-arrow') {
        const dist = Math.hypot(e.clientX - activeDrag.startClientX, e.clientY - activeDrag.startClientY);
        setDragState((prev) =>
          prev && prev.mode === 'draw-arrow'
            ? { ...prev, currentPoint: pt, active: prev.active || dist >= 6 }
            : prev,
        );
        return;
      }

      if (activeDrag.mode === 'edge-end') {
        suppressNextCanvasClickRef.current = true;
        const hit = e.altKey ? null : findNearestNodeAnchor(currentDiagram.nodes, pt, 24);
        let changed = false;
        const nextEdges = currentDiagram.edges.map((edge) => {
          if (edge.id !== activeDrag.edgeId) return edge;
          if (activeDrag.end === 'from') {
            if (hit) {
              if (
                edge.fromId === hit.nodeId &&
                edge.fromAnchor === hit.side &&
                edge.fromOffset === hit.offset &&
                !edge.fromPoint
              ) {
                return edge;
              }
              changed = true;
              return {
                ...edge,
                fromId: hit.nodeId,
                fromAnchor: hit.side,
                fromOffset: hit.offset,
                fromPoint: undefined,
              };
            }
            const nx = snap(pt.x);
            const ny = snap(pt.y);
            if (!edge.fromId && edge.fromPoint?.x === nx && edge.fromPoint?.y === ny) {
              return edge;
            }
            changed = true;
            return {
              ...edge,
              fromId: undefined,
              fromAnchor: undefined,
              fromOffset: undefined,
              fromPoint: { x: nx, y: ny },
            };
          }
          if (hit) {
            if (
              edge.toId === hit.nodeId &&
              edge.toAnchor === hit.side &&
              edge.toOffset === hit.offset &&
              !edge.toPoint
            ) {
              return edge;
            }
            changed = true;
            return {
              ...edge,
              toId: hit.nodeId,
              toAnchor: hit.side,
              toOffset: hit.offset,
              toPoint: undefined,
            };
          }
          const nx = snap(pt.x);
          const ny = snap(pt.y);
          if (!edge.toId && edge.toPoint?.x === nx && edge.toPoint?.y === ny) {
            return edge;
          }
          changed = true;
          return {
            ...edge,
            toId: undefined,
            toAnchor: undefined,
            toOffset: undefined,
            toPoint: { x: nx, y: ny },
          };
        });
        if (changed) {
          emitChange({ ...currentDiagram, edges: nextEdges });
        }
        return;
      }

      if (activeDrag.mode === 'edge-waypoint') {
        suppressNextCanvasClickRef.current = true;
        const snappedPt = { x: snap(pt.x), y: snap(pt.y) };
        let changed = false;
        const nextEdges = currentDiagram.edges.map((edge) => {
          if (edge.id !== activeDrag.edgeId) return edge;
          const prevWps = edge.waypoints ?? [];
          const prevTarget = prevWps[activeDrag.waypointIndex];
          if (prevTarget && prevTarget.x === snappedPt.x && prevTarget.y === snappedPt.y) {
            return edge;
          }
          changed = true;
          const nextWaypoints = [...prevWps];
          while (nextWaypoints.length <= activeDrag.waypointIndex) {
            nextWaypoints.push(snappedPt);
          }
          nextWaypoints[activeDrag.waypointIndex] = snappedPt;
          return { ...edge, waypoints: nextWaypoints };
        });
        if (changed) {
          emitChange({ ...currentDiagram, edges: nextEdges });
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const activeDrag = dragStateRef.current;
      const currentDiagram = diagramRef.current;
      const emitChange = onChangeRef.current;
      if (
        activeDrag &&
        (activeDrag.mode === 'edge-end' ||
          activeDrag.mode === 'edge-waypoint' ||
          ((activeDrag.mode === 'move' || activeDrag.mode === 'resize') && activeDrag.active))
      ) {
        suppressNextCanvasClickRef.current = true;
      }
      if (activeDrag?.mode === 'draw-arrow' && emitChange) {
        const endPt = clientToCanvasPointRef.current(e.clientX, e.clientY);
        const dist = Math.hypot(e.clientX - activeDrag.startClientX, e.clientY - activeDrag.startClientY);
        if (activeDrag.active && dist >= 8) {
          suppressNextCanvasClickRef.current = true;
          const fromHit = findNearestNodeAnchor(currentDiagram.nodes, activeDrag.startPoint, 24);
          const toHit = findNearestNodeAnchor(currentDiagram.nodes, endPt, 24);
          const fresh = createEdge(fromHit?.nodeId, toHit?.nodeId, '', {
            ...(fromHit
              ? { fromAnchor: fromHit.side, fromOffset: fromHit.offset }
              : { fromPoint: { x: snap(activeDrag.startPoint.x), y: snap(activeDrag.startPoint.y) } }),
            ...(toHit
              ? { toAnchor: toHit.side, toOffset: toHit.offset }
              : { toPoint: { x: snap(endPt.x), y: snap(endPt.y) } }),
          });
          emitChange({ ...currentDiagram, edges: [...currentDiagram.edges, fresh] });
          setSelectedEdgeId(fresh.id);
          setSelectedNodeId(null);
          setConnectFromId(null);
          setTool('select');
        }
      }
      frozenDragBoundsRef.current = null;
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, snapToGrid, zoom]);

  const updateNode = (id: string, patch: Partial<DiagramNode>) => {
    if (!onChange) return;
    onChange({
      ...diagram,
      nodes: diagram.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    });
  };

  const updateEdge = (id: string, patch: Partial<DiagramEdge>) => {
    if (!onChange) return;
    onChange({
      ...diagram,
      edges: diagram.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
    });
  };

  const commitInlineNodeEdit = () => {
    if (!editingNodeId) return;
    updateNode(editingNodeId, { label: editingNodeDraft });
    setEditingNodeId(null);
  };

  const commitInlineEdgeEdit = () => {
    if (!editingEdgeId) return;
    updateEdge(editingEdgeId, { label: editingEdgeDraft });
    setEditingEdgeId(null);
  };

  const addShape = (kind: ShapeKind) => {
    if (!onChange) return;
    const col = diagram.nodes.length % 3;
    const row = Math.floor(diagram.nodes.length / 3) % 3;
    const node = createDefaultNode(kind, 44 + col * 192, 48 + row * 124, diagram.nodes.length + 1);
    onChange({ ...diagram, nodes: [...diagram.nodes, node] });
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setEditingEdgeId(null);
    setTool('select');
    if (kind === 'label') {
      setEditingNodeId(node.id);
      setEditingNodeDraft(node.label);
    } else {
      setEditingNodeId(null);
    }
  };

  const addFreeArrow = () => {
    if (!onChange) return;
    const maxBottom = diagram.nodes.reduce(
      (max, n) => Math.max(max, n.y + n.height),
      84,
    );
    const offset = (diagram.edges.length % 4) * 24;
    const startY = Math.round(maxBottom + 36 + offset);
    const arrow = createEdge(undefined, undefined, '', {
      fromPoint: { x: 84 + offset, y: startY },
      toPoint: { x: 264 + offset, y: startY },
    });
    onChange({ ...diagram, edges: [...diagram.edges, arrow] });
    setSelectedEdgeId(arrow.id);
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setEditingEdgeId(null);
    setTool('select');
  };

  const duplicateSelectedNode = () => {
    if (!onChange || !selectedNode) return;
    const clone: DiagramNode = {
      ...selectedNode,
      id: `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      x: selectedNode.x + 24,
      y: selectedNode.y + 24,
      label: selectedNode.label,
    };
    onChange({ ...diagram, nodes: [...diagram.nodes, clone] });
    setSelectedNodeId(clone.id);
  };

  const deleteSelection = () => {
    if (!onChange) return;
    if (selectedNodeId) {
      onChange({
        ...diagram,
        nodes: diagram.nodes.filter((n) => n.id !== selectedNodeId),
        edges: diagram.edges.filter(
          (e) => e.fromId !== selectedNodeId && e.toId !== selectedNodeId,
        ),
      });
      setSelectedNodeId(null);
      setEditingNodeId(null);
    } else if (selectedEdgeId) {
      onChange({
        ...diagram,
        edges: diagram.edges.filter((e) => e.id !== selectedEdgeId),
      });
      setSelectedEdgeId(null);
      setEditingEdgeId(null);
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: DiagramNode) => {
    if (readOnly) return;
    if (editingNodeId === node.id) return;
    e.stopPropagation();

    if (tool === 'connect') {
      const pt = clientToCanvasPoint(e.clientX, e.clientY);
      setDragState({
        mode: 'draw-arrow',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPoint: pt,
        currentPoint: pt,
        startNodeId: node.id,
        active: false,
      });

      if (!connectFromId) {
        setConnectFromId(node.id);
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
        return;
      }
      if (connectFromId !== node.id && onChange) {
        const edge = createEdge(connectFromId, node.id, 'flow');
        onChange({ ...diagram, edges: [...diagram.edges, edge] });
        setSelectedEdgeId(edge.id);
        setSelectedNodeId(null);
      }
      setConnectFromId(null);
      setTool('select');
      setDragState(null);
      return;
    }

    setEditingNodeId(null);
    setEditingEdgeId(null);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setDragState({
      mode: 'move',
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: node.x,
      origY: node.y,
      origW: node.width,
      origH: node.height,
      active: false,
    });
  };

  const markerSuffix = diagram.id.replace(/[^a-zA-Z0-9_-]/g, '');

  const svgCanvas = (
    <div
      className="relative flex-1 min-w-0 overflow-auto bg-slate-50/60 dark:bg-slate-950/70"
      style={readOnly ? undefined : { height }}
      onPointerDown={(e) => {
        if (readOnly || tool !== 'connect') return;
        const pt = clientToCanvasPoint(e.clientX, e.clientY);
        setDragState({
          mode: 'draw-arrow',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPoint: pt,
          currentPoint: pt,
          active: false,
        });
      }}
      onClick={() => {
        if (suppressNextCanvasClickRef.current) {
          suppressNextCanvasClickRef.current = false;
          return;
        }
        if (!readOnly && tool !== 'connect') {
          commitInlineNodeEdit();
          commitInlineEdgeEdit();
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }
      }}
    >
      <svg
        ref={svgRef}
        width={readOnly ? '100%' : Math.round(viewBounds.width * zoom)}
        height={readOnly ? undefined : Math.round(viewBounds.height * zoom)}
        viewBox={`${viewBounds.minX} ${viewBounds.minY} ${viewBounds.width} ${viewBounds.height}`}
        className={readOnly ? 'w-full h-auto block select-none' : 'block select-none'}
      >
        <defs>
          <pattern
            id={`grid-${markerSuffix}`}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="1"
              cy="1"
              r="1"
              fill={theme === 'dark' ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.2)'}
            />
          </pattern>
          {Object.keys(SHAPE_COLORS).map((colorKey) => {
            const c = SHAPE_COLORS[colorKey as ShapeColor];
            const stroke = theme === 'dark' ? c.strokeDark : c.strokeLight;
            return (
              <marker
                key={colorKey}
                id={`arrow-${markerSuffix}-${colorKey}`}
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={stroke} />
              </marker>
            );
          })}
        </defs>

        <rect
          x={viewBounds.minX}
          y={viewBounds.minY}
          width={viewBounds.width}
          height={viewBounds.height}
          fill={`url(#grid-${markerSuffix})`}
        />

        {/* Shapes & Labels (rendered beneath arrows so free & container-nested arrows stay visible) */}
        {diagram.nodes.map((node) => {
          const palette = SHAPE_COLORS[node.color] ?? SHAPE_COLORS.slate;
          const textColor = theme === 'dark' ? palette.textDark : palette.textLight;
          const isSelected = selectedNodeId === node.id;
          const isSource = connectFromId === node.id;
          const isEditingThis = !readOnly && editingNodeId === node.id;
          const box = getShapeTextBounds(node.kind, node.width, node.height);

          return (
            <g
              key={node.id}
              data-testid={`diagram-node-${node.kind}`}
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(e) => handleNodePointerDown(e, node)}
              onClick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
              }}
              onDoubleClick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
                setEditingNodeId(node.id);
                setEditingNodeDraft(node.label);
              }}
              className={
                readOnly
                  ? ''
                  : isEditingThis
                    ? 'cursor-text'
                    : 'cursor-grab active:cursor-grabbing'
              }
            >
              {renderShapeSvg(node, theme, isSelected, isSource, readOnly)}
              <foreignObject x={box.x} y={box.y} width={box.width} height={box.height}>
                {isEditingThis ? (
                  <textarea
                    ref={inlineNodeInputRef}
                    aria-label="Edit shape text inline"
                    value={editingNodeDraft}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setEditingNodeDraft(e.target.value);
                      updateNode(node.id, { label: e.target.value });
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        commitInlineNodeEdit();
                      } else if (e.key === 'Escape') {
                        setEditingNodeId(null);
                      }
                    }}
                    onBlur={commitInlineNodeEdit}
                    className="w-full h-full p-0.5 resize-none bg-transparent text-center leading-tight font-medium outline-none rounded border border-indigo-400/70"
                    style={{
                      color: textColor,
                      fontSize: `${node.fontSize ?? 13}px`,
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-center leading-tight font-medium break-words overflow-hidden pointer-events-none whitespace-pre-wrap"
                    style={{
                      color: textColor,
                      fontSize: `${node.fontSize ?? 13}px`,
                    }}
                  >
                    {node.label || (node.kind === 'label' ? 'Double-click to type' : '')}
                  </div>
                )}
              </foreignObject>

              {!readOnly && isSelected && !isEditingThis && (
                <rect
                  x={node.width - 6}
                  y={node.height - 6}
                  width={10}
                  height={10}
                  rx={2}
                  fill="#4f46e5"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  className="cursor-nwse-resize"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragState({
                      mode: 'resize',
                      nodeId: node.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      origX: node.x,
                      origY: node.y,
                      origW: node.width,
                      origH: node.height,
                      active: true,
                    });
                  }}
                />
              )}
            </g>
          );
        })}

        {/* Edges / Arrows */}
        {resolvedEdges.map(({ edge, geom }) => {
          const edgeColorKey: ShapeColor = edge.color ?? 'slate';
          const palette = SHAPE_COLORS[edgeColorKey] ?? SHAPE_COLORS.slate;
          const isSelected = selectedEdgeId === edge.id;
          const stroke = isSelected
            ? '#4f46e5'
            : theme === 'dark'
              ? palette.strokeDark
              : palette.strokeLight;

          const midX = geom.labelPoint.x;
          const midY = geom.labelPoint.y;
          const isEditingEdge = !readOnly && editingEdgeId === edge.id;

          return (
            <g
              key={edge.id}
              onClick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                commitInlineNodeEdit();
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onDoubleClick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
                setEditingEdgeId(edge.id);
                setEditingEdgeDraft(edge.label ?? '');
              }}
              className={readOnly ? '' : 'cursor-pointer'}
            >
              <path
                d={geom.svgPath}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                strokeLinejoin="round"
              />
              <path
                d={geom.svgPath}
                fill="none"
                stroke={stroke}
                strokeWidth={isSelected ? 2.6 : 1.9}
                strokeLinejoin="round"
                strokeDasharray={edge.style === 'dashed' ? '6 4' : undefined}
                markerEnd={edge.arrowEnd ? `url(#arrow-${markerSuffix}-${edgeColorKey})` : undefined}
                markerStart={edge.arrowStart ? `url(#arrow-${markerSuffix}-${edgeColorKey})` : undefined}
              />
              {isEditingEdge ? (
                <foreignObject x={midX - 64} y={midY - 14} width={128} height={28}>
                  <input
                    ref={inlineEdgeInputRef}
                    type="text"
                    aria-label="Edit arrow label inline"
                    value={editingEdgeDraft}
                    onChange={(e) => {
                      setEditingEdgeDraft(e.target.value);
                      updateEdge(edge.id, { label: e.target.value });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        commitInlineEdgeEdit();
                      }
                    }}
                    onBlur={commitInlineEdgeEdit}
                    className="w-full h-full px-2 text-center text-[11px] font-medium rounded border border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none shadow-sm"
                  />
                </foreignObject>
              ) : (
                edge.label && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-Math.max(24, edge.label.length * 3.6 + 8)}
                      y={-11}
                      width={Math.max(48, edge.label.length * 7.2 + 16)}
                      height={22}
                      rx={6}
                      fill={theme === 'dark' ? '#0f172a' : '#ffffff'}
                      stroke={stroke}
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={11}
                      fontWeight={500}
                      fill={theme === 'dark' ? '#e2e8f0' : '#1e293b'}
                    >
                      {edge.label}
                    </text>
                  </g>
                )
              )}
            </g>
          );
        })}

        {/* Selected arrow interactive handles on top of everything */}
        {!readOnly &&
          resolvedEdges
            .filter(({ edge }) => edge.id === selectedEdgeId)
            .map(({ edge, geom }) => (
              <g key={`handles-${edge.id}`}>
                {geom.segmentMidpoints.map((mid, mIdx) => (
                  <circle
                    key={`mid-${mIdx}`}
                    cx={mid.point.x}
                    cy={mid.point.y}
                    r={5}
                    fill="#ffffff"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    className="cursor-move opacity-85 hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const currentWps = [...(edge.waypoints ?? [])];
                      const insertAt = Math.min(mid.index, currentWps.length);
                      currentWps.splice(insertAt, 0, {
                        x: Math.round(mid.point.x),
                        y: Math.round(mid.point.y),
                      });
                      updateEdge(edge.id, { waypoints: currentWps });
                      setDragState({
                        mode: 'edge-waypoint',
                        edgeId: edge.id,
                        waypointIndex: insertAt,
                      });
                    }}
                  >
                    <title>Drag to bend or route arrow</title>
                  </circle>
                ))}

                {geom.controlPoints.map((wp, wpIdx) => (
                  <rect
                    key={`wp-${wpIdx}`}
                    x={wp.x - 5}
                    y={wp.y - 5}
                    width={10}
                    height={10}
                    rx={2}
                    transform={`rotate(45 ${wp.x} ${wp.y})`}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    className="cursor-move"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const nextWps = (edge.waypoints ?? []).filter((_, i) => i !== wpIdx);
                      updateEdge(edge.id, { waypoints: nextWps });
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        mode: 'edge-waypoint',
                        edgeId: edge.id,
                        waypointIndex: wpIdx,
                      });
                    }}
                  >
                    <title>Drag to move bend (double-click to remove)</title>
                  </rect>
                ))}

                <circle
                  cx={geom.p1.x}
                  cy={geom.p1.y}
                  r={6.5}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="cursor-grab active:cursor-grabbing"
                  aria-label="Drag arrow start endpoint"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragState({ mode: 'edge-end', edgeId: edge.id, end: 'from' });
                  }}
                >
                  <title>Drag to move arrow start (snaps to any shape side or floats freely)</title>
                </circle>

                <circle
                  cx={geom.p2.x}
                  cy={geom.p2.y}
                  r={6.5}
                  fill="#4f46e5"
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="cursor-grab active:cursor-grabbing"
                  aria-label="Drag arrow end endpoint"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragState({ mode: 'edge-end', edgeId: edge.id, end: 'to' });
                  }}
                >
                  <title>Drag to move arrow end (snaps to any shape side or floats freely)</title>
                </circle>
              </g>
            ))}

        {/* Live arrow drawing preview when dragging in Connect Arrow mode */}
        {!readOnly && dragState?.mode === 'draw-arrow' && dragState.active && (
          <line
            x1={dragState.startPoint.x}
            y1={dragState.startPoint.y}
            x2={dragState.currentPoint.x}
            y2={dragState.currentPoint.y}
            stroke="#0ea5e9"
            strokeWidth={2}
            strokeDasharray="5 4"
            markerEnd={`url(#arrow-${markerSuffix}-indigo)`}
          />
        )}
      </svg>
    </div>
  );

  if (readOnly) {
    return (
      <div
        data-testid="concept-canvas-container"
        onContextMenu={onContextMenu}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
              {diagram.title || 'Concept Diagram'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
              {diagram.nodes.length} shapes · {diagram.edges.length} arrows
            </span>
          </div>
          {(onRequestEdit || onRequestDelete) && (
            <div className="flex items-center gap-1.5 shrink-0">
              {onRequestEdit && (
                <button
                  type="button"
                  onClick={onRequestEdit}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                >
                  Edit Diagram
                </button>
              )}
              {onRequestDelete && (
                <button
                  type="button"
                  onClick={onRequestDelete}
                  aria-label={`Delete diagram ${diagram.title || 'Concept Diagram'}`}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
        {svgCanvas}
      </div>
    );
  }

  return (
    <div
      data-testid="concept-canvas-container"
      onContextMenu={onContextMenu}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
    >
      {/* Clean Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <label htmlFor="diagram-title-input" className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Title
          </label>
          <input
            id="diagram-title-input"
            type="text"
            aria-label="Diagram title"
            value={diagram.title}
            onChange={(e) => onChange?.({ ...diagram, title: e.target.value })}
            className="text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 rounded-md px-2 py-1 text-slate-800 dark:text-slate-100 outline-none w-48 sm:w-56"
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
            {diagram.nodes.length} shapes · {diagram.edges.length} arrows
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSnapToGrid((prev) => !prev)}
            aria-label="Toggle snap to grid"
            title="Snap to grid"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              snapToGrid
                ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800'
                : 'text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>

          <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
              aria-label="Zoom out diagram"
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-l-md"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
              aria-label="Zoom in diagram"
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset zoom"
              title="Reset zoom"
              className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-700 rounded-r-md"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 3-Zone Studio Body: Left Shape Library | Center Canvas | Right Properties Inspector */}
      <div className="flex flex-col md:flex-row min-h-0">
        {/* Left Shape Palette Rail */}
        <aside
          aria-label="Diagram tools and shapes"
          className="md:w-44 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-2.5 space-y-3"
        >
          <div className="space-y-1">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Tools
            </div>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setTool('select');
                  setConnectFromId(null);
                }}
                aria-label="Select and move shapes"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tool === 'select'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
                <span>Select / Move</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTool(tool === 'connect' ? 'select' : 'connect');
                  setConnectFromId(null);
                }}
                aria-label="Draw arrow between shapes"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tool === 'connect'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                <span>{connectFromId ? 'Pick Target' : 'Connect Arrow'}</span>
              </button>
              <button
                type="button"
                onClick={addFreeArrow}
                aria-label="Add free movable arrow"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
              >
                <MoveUpRight className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>Free Arrow</span>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Add Shape
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-1 gap-1">
              {SHAPE_CATALOG.map((item) => {
                const Icon = SHAPE_ICONS[item.kind];
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addShape(item.kind)}
                    aria-label={`Add ${item.label} shape`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors text-left"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center SVG Canvas */}
        {svgCanvas}

        {/* Right Docked Properties Inspector (prevents canvas jumping) */}
        <aside
          aria-label="Element inspector"
          className="md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-3.5 flex flex-col gap-3 text-xs"
        >
          {selectedNode ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">
                  {selectedNode.kind === 'label' ? 'Text Label' : `${selectedNode.kind} Shape`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={duplicateSelectedNode}
                    aria-label="Duplicate selected shape"
                    title="Duplicate shape"
                    className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelection}
                    aria-label="Delete selected diagram element"
                    title="Delete shape"
                    className="p-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="inspector-node-label"
                  className="block font-medium text-slate-600 dark:text-slate-300"
                >
                  Text inside {selectedNode.kind === 'label' ? 'Label' : 'Shape'}
                </label>
                <textarea
                  id="inspector-node-label"
                  rows={2}
                  aria-label="Selected shape label"
                  value={selectedNode.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                  placeholder="Type text..."
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="inspector-node-kind"
                    className="block font-medium text-slate-600 dark:text-slate-300"
                  >
                    Shape Type
                  </label>
                  <select
                    id="inspector-node-kind"
                    aria-label="Selected shape type"
                    value={selectedNode.kind}
                    onChange={(e) =>
                      updateNode(selectedNode.id, { kind: e.target.value as ShapeKind })
                    }
                    className="w-full px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {SHAPE_CATALOG.map((item) => (
                      <option key={item.kind} value={item.kind}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="inspector-node-fontsize"
                    className="block font-medium text-slate-600 dark:text-slate-300"
                  >
                    Text Size
                  </label>
                  <select
                    id="inspector-node-fontsize"
                    aria-label="Selected shape text size"
                    value={selectedNode.fontSize ?? 13}
                    onChange={(e) =>
                      updateNode(selectedNode.id, { fontSize: Number(e.target.value) })
                    }
                    className="w-full px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 tabular-nums"
                  >
                    {[11, 12, 13, 14, 16, 18, 20].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}px
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block font-medium text-slate-600 dark:text-slate-300">
                  Color
                </span>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Shape color">
                  {(Object.keys(SHAPE_COLORS) as ShapeColor[]).map((colorKey) => (
                    <button
                      key={colorKey}
                      type="button"
                      aria-label={`Color ${SHAPE_COLORS[colorKey].label}`}
                      title={SHAPE_COLORS[colorKey].label}
                      onClick={() => updateNode(selectedNode.id, { color: colorKey })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        selectedNode.color === colorKey
                          ? 'border-slate-900 dark:border-white scale-110'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: SHAPE_COLORS[colorKey].swatch }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-slate-600 dark:text-slate-300">
                  <span className="block font-medium">Width</span>
                  <input
                    type="number"
                    min={72}
                    max={480}
                    value={selectedNode.width}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        width: Math.max(72, Number(e.target.value) || 72),
                      })
                    }
                    className="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </label>
                <label className="space-y-1 text-slate-600 dark:text-slate-300">
                  <span className="block font-medium">Height</span>
                  <input
                    type="number"
                    min={40}
                    max={360}
                    value={selectedNode.height}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        height: Math.max(40, Number(e.target.value) || 40),
                      })
                    }
                    className="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </label>
              </div>
            </>
          ) : selectedEdge ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  Connector Arrow
                </span>
                <button
                  type="button"
                  onClick={deleteSelection}
                  aria-label="Delete selected diagram element"
                  className="p-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="inspector-edge-label"
                  className="block font-medium text-slate-600 dark:text-slate-300"
                >
                  Arrow Label
                </label>
                <input
                  id="inspector-edge-label"
                  type="text"
                  aria-label="Selected arrow label"
                  value={selectedEdge.label ?? ''}
                  onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value })}
                  placeholder="Label..."
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <span className="block font-medium text-slate-600 dark:text-slate-300">
                  Route Shape
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'straight', label: 'Straight' },
                      { id: 'orthogonal', label: 'Side / Elbow' },
                      { id: 'curved', label: 'Curved' },
                    ] as Array<{ id: EdgeRouteStyle; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateEdge(selectedEdge.id, { routeStyle: opt.id })}
                      className={`px-1.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                        (selectedEdge.routeStyle ?? 'straight') === opt.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-200'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="block font-medium text-slate-600 dark:text-slate-300">
                  Quick Side Detour
                </span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const fromNode = selectedEdge.fromId ? nodeMap.get(selectedEdge.fromId) : undefined;
                      const toNode = selectedEdge.toId ? nodeMap.get(selectedEdge.toId) : undefined;
                      const geom = resolveEdgeGeometry(selectedEdge, nodeMap);
                      const fromLeft = fromNode ? fromNode.x : (geom?.p1.x ?? 80);
                      const toLeft = toNode ? toNode.x : (geom?.p2.x ?? 80);
                      const minLeft = Math.min(fromLeft, toLeft);
                      const midY = geom ? Math.round((geom.p1.y + geom.p2.y) / 2) : 160;
                      updateEdge(selectedEdge.id, {
                        fromAnchor: 'left',
                        toAnchor: 'left',
                        routeStyle: 'orthogonal',
                        waypoints: [{ x: Math.round(minLeft - 42), y: midY }],
                      });
                    }}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Left Side Loop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fromNode = selectedEdge.fromId ? nodeMap.get(selectedEdge.fromId) : undefined;
                      const toNode = selectedEdge.toId ? nodeMap.get(selectedEdge.toId) : undefined;
                      const geom = resolveEdgeGeometry(selectedEdge, nodeMap);
                      const fromRight = fromNode ? fromNode.x + fromNode.width : (geom?.p1.x ?? 240);
                      const toRight = toNode ? toNode.x + toNode.width : (geom?.p2.x ?? 240);
                      const maxRight = Math.max(fromRight, toRight);
                      const midY = geom ? Math.round((geom.p1.y + geom.p2.y) / 2) : 160;
                      updateEdge(selectedEdge.id, {
                        fromAnchor: 'right',
                        toAnchor: 'right',
                        routeStyle: 'orthogonal',
                        waypoints: [{ x: Math.round(maxRight + 42), y: midY }],
                      });
                    }}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Right Side Loop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fromNode = selectedEdge.fromId ? nodeMap.get(selectedEdge.fromId) : undefined;
                      const toNode = selectedEdge.toId ? nodeMap.get(selectedEdge.toId) : undefined;
                      const geom = resolveEdgeGeometry(selectedEdge, nodeMap);
                      const fromTop = fromNode ? fromNode.y : (geom?.p1.y ?? 80);
                      const toTop = toNode ? toNode.y : (geom?.p2.y ?? 80);
                      const minTop = Math.min(fromTop, toTop);
                      const midX = geom ? Math.round((geom.p1.x + geom.p2.x) / 2) : 160;
                      updateEdge(selectedEdge.id, {
                        fromAnchor: 'top',
                        toAnchor: 'top',
                        routeStyle: 'orthogonal',
                        waypoints: [{ x: midX, y: Math.round(minTop - 36) }],
                      });
                    }}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Top Loop
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateEdge(selectedEdge.id, {
                        fromAnchor: 'auto',
                        toAnchor: 'auto',
                        fromOffset: undefined,
                        toOffset: undefined,
                        waypoints: [],
                      })
                    }
                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Reset Bends
                  </button>
                </div>
              </div>

              {(selectedEdge.fromId || selectedEdge.toId) && (
                <div className="grid grid-cols-2 gap-2">
                  {selectedEdge.fromId && (
                    <div className="space-y-1">
                      <label
                        htmlFor="inspector-edge-from-side"
                        className="block font-medium text-slate-600 dark:text-slate-300"
                      >
                        Start Side
                      </label>
                      <select
                        id="inspector-edge-from-side"
                        value={selectedEdge.fromAnchor ?? 'auto'}
                        onChange={(e) =>
                          updateEdge(selectedEdge.id, {
                            fromAnchor: e.target.value as EdgeAnchorSide,
                          })
                        }
                        className="w-full px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        <option value="auto">Auto</option>
                        <option value="top">Top</option>
                        <option value="right">Right</option>
                        <option value="bottom">Bottom</option>
                        <option value="left">Left</option>
                      </select>
                    </div>
                  )}
                  {selectedEdge.toId && (
                    <div className="space-y-1">
                      <label
                        htmlFor="inspector-edge-to-side"
                        className="block font-medium text-slate-600 dark:text-slate-300"
                      >
                        End Side
                      </label>
                      <select
                        id="inspector-edge-to-side"
                        value={selectedEdge.toAnchor ?? 'auto'}
                        onChange={(e) =>
                          updateEdge(selectedEdge.id, {
                            toAnchor: e.target.value as EdgeAnchorSide,
                          })
                        }
                        className="w-full px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        <option value="auto">Auto</option>
                        <option value="top">Top</option>
                        <option value="right">Right</option>
                        <option value="bottom">Bottom</option>
                        <option value="left">Left</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label
                  htmlFor="inspector-edge-style"
                  className="block font-medium text-slate-600 dark:text-slate-300"
                >
                  Line Style
                </label>
                <select
                  id="inspector-edge-style"
                  aria-label="Arrow line style"
                  value={selectedEdge.style}
                  onChange={(e) =>
                    updateEdge(selectedEdge.id, { style: e.target.value as 'solid' | 'dashed' })
                  }
                  className="w-full px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="solid">Solid Line</option>
                  <option value="dashed">Dashed Line</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => updateEdge(selectedEdge.id, { arrowStart: !selectedEdge.arrowStart })}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-medium text-left ${
                  selectedEdge.arrowStart
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-200'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {selectedEdge.arrowStart ? 'Bi-directional Arrows (On)' : 'One-way Arrow (Click to toggle)'}
              </button>

              <div className="space-y-1.5">
                <span className="block font-medium text-slate-600 dark:text-slate-300">
                  Arrow Color
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(Object.keys(SHAPE_COLORS) as ShapeColor[]).map((colorKey) => (
                    <button
                      key={colorKey}
                      type="button"
                      aria-label={`Arrow color ${SHAPE_COLORS[colorKey].label}`}
                      onClick={() => updateEdge(selectedEdge.id, { color: colorKey })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        (selectedEdge.color ?? 'slate') === colorKey
                          ? 'border-slate-900 dark:border-white scale-110'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: SHAPE_COLORS[colorKey].swatch }}
                    />
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                Drag the green/blue ends to snap onto any edge of a shape (or float freely), and drag amber/white handles to route around boxes.
              </p>
            </>
          ) : (
            <div className="space-y-2.5 text-slate-500 dark:text-slate-400 leading-relaxed">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Properties Inspector
              </p>
              <p>Click any shape, Puzzle, Label, or arrow on the canvas to edit its properties here.</p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Double-click</strong> inside
                any shape or Text Label to type text directly inside it.
              </p>
              <p>
                Use <strong className="text-slate-700 dark:text-slate-200">Connect Arrow</strong>{' '}
                (click two shapes or drag anywhere) or <strong className="text-slate-700 dark:text-slate-200">Free Arrow</strong>, then drag ends or bend handles freely.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
