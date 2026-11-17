import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Circle,
  Copy,
  Database,
  Diamond,
  Grid,
  Hexagon,
  MousePointer2,
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
  ShapeColor,
  ShapeKind,
  ThemeMode,
} from '../types';
import {
  SHAPE_CATALOG,
  SHAPE_COLORS,
  createDefaultNode,
  createEdge,
  getAnchorPoint,
  getNodeCenter,
  getShapePath,
  getShapeTextBounds,
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

  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize';
    nodeId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    active: boolean;
  } | null>(null);

  const selectedNode = useMemo(
    () => diagram.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [diagram.nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => diagram.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [diagram.edges, selectedEdgeId],
  );

  const viewBounds = useMemo(() => {
    if (diagram.nodes.length === 0) {
      return { minX: 0, minY: 0, width: 720, height: 380 };
    }
    if (readOnly) {
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
      const pad = 28;
      return {
        minX: Math.max(0, minX - pad),
        minY: Math.max(0, minY - pad),
        width: Math.max(320, maxX - Math.max(0, minX - pad) + pad),
        height: Math.max(180, maxY - Math.max(0, minY - pad) + pad),
      };
    }
    let maxX = 660;
    let maxY = 420;
    for (const node of diagram.nodes) {
      maxX = Math.max(maxX, node.x + node.width + 64);
      maxY = Math.max(maxY, node.y + node.height + 64);
    }
    return { minX: 0, minY: 0, width: maxX, height: maxY };
  }, [diagram.nodes, readOnly]);

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

  useEffect(() => {
    if (!dragState || !onChange) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rawDx = e.clientX - dragState.startClientX;
      const rawDy = e.clientY - dragState.startClientY;

      if (!dragState.active && Math.hypot(rawDx, rawDy) < 4) {
        return;
      }

      if (!dragState.active) {
        setDragState((prev) => (prev ? { ...prev, active: true } : null));
      }

      const dx = rawDx / zoom;
      const dy = rawDy / zoom;
      const snap = (val: number) => (snapToGrid ? Math.round(val / 12) * 12 : Math.round(val));

      const nextNodes = diagram.nodes.map((node) => {
        if (node.id !== dragState.nodeId) return node;
        if (dragState.mode === 'move') {
          return {
            ...node,
            x: Math.max(12, snap(dragState.origX + dx)),
            y: Math.max(16, snap(dragState.origY + dy)),
          };
        }
        return {
          ...node,
          width: Math.max(72, snap(dragState.origW + dx)),
          height: Math.max(40, snap(dragState.origH + dy)),
        };
      });
      onChange({ ...diagram, nodes: nextNodes });
    };

    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, diagram, onChange, snapToGrid, zoom]);

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

  const nodeMap = useMemo(
    () => new Map(diagram.nodes.map((node) => [node.id, node])),
    [diagram.nodes],
  );

  const markerSuffix = diagram.id.replace(/[^a-zA-Z0-9_-]/g, '');

  const svgCanvas = (
    <div
      className="relative flex-1 min-w-0 overflow-auto bg-slate-50/60 dark:bg-slate-950/70"
      style={readOnly ? undefined : { height }}
      onClick={() => {
        if (!readOnly) {
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

        {/* Edges / Arrows */}
        {diagram.edges.map((edge) => {
          const fromNode = nodeMap.get(edge.fromId);
          const toNode = nodeMap.get(edge.toId);
          if (!fromNode || !toNode) return null;

          const startCenter = getNodeCenter(fromNode);
          const endCenter = getNodeCenter(toNode);
          const p1 = getAnchorPoint(fromNode, endCenter);
          const p2 = getAnchorPoint(toNode, startCenter);

          const edgeColorKey: ShapeColor = edge.color ?? 'slate';
          const palette = SHAPE_COLORS[edgeColorKey] ?? SHAPE_COLORS.slate;
          const stroke =
            selectedEdgeId === edge.id
              ? '#4f46e5'
              : theme === 'dark'
                ? palette.strokeDark
                : palette.strokeLight;

          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
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
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="transparent"
                strokeWidth={16}
              />
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={stroke}
                strokeWidth={selectedEdgeId === edge.id ? 2.6 : 1.9}
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

        {/* Shapes & Labels */}
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
                then click two shapes to link them.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
