import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTextSegmentEdit,
  createDefaultNode,
  createEdge,
  extractConceptBlocksFromMarkdown,
  findConceptDiagramAtCursor,
  getAnchorPoint,
  getShapePath,
  getShapeTextBounds,
  mapGlobalOffsetToSegment,
  removeConceptBlockFromMarkdown,
  splitMarkdownIntoEditorSegments,
  upsertConceptBlockInMarkdown,
  type EditorTextSegment,
} from './diagram';
import type { ConceptDiagram } from '../types';

test('shape paths generate valid SVG commands for hexagon and puzzle', () => {
  const hex = getShapePath('hexagon', 150, 80);
  assert.ok(hex.startsWith('M '));
  assert.ok(hex.endsWith('Z'));

  const puzzle = getShapePath('puzzle', 150, 90);
  assert.ok(puzzle.includes('C '));
  assert.ok(puzzle.endsWith('Z'));
});

test('anchor point lands on shape perimeter toward target', () => {
  const box = createDefaultNode('square', 100, 100, 1); // width 140, height 74 -> center (170, 137)
  const rightAnchor = getAnchorPoint(box, { x: 400, y: 137 });
  assert.equal(Math.round(rightAnchor.x), 240);
  assert.equal(Math.round(rightAnchor.y), 137);

  const circle = createDefaultNode('circle', 0, 0, 2); // width 108, height 108 -> center (54, 54), r=54
  const bottomAnchor = getAnchorPoint(circle, { x: 54, y: 300 });
  assert.equal(Math.round(bottomAnchor.x), 54);
  assert.equal(Math.round(bottomAnchor.y), 108);
});

test('upsertConceptBlockInMarkdown inserts, detects at cursor, updates, and removes concept blocks cleanly', () => {
  const nodeA = createDefaultNode('hexagon', 20, 20, 1);
  const nodeB = createDefaultNode('puzzle', 240, 20, 2);
  const edge = createEdge(nodeA.id, nodeB.id, 'syncs');
  const diagram: ConceptDiagram = {
    id: 'diag_arch_1',
    title: 'Sync Flow',
    nodes: [nodeA, nodeB],
    edges: [edge],
  };

  const md1 = upsertConceptBlockInMarkdown('# Notes\n\nOverview text.', diagram);
  const extracted1 = extractConceptBlocksFromMarkdown(md1);
  assert.equal(extracted1.length, 1);
  assert.equal(extracted1[0].title, 'Sync Flow');
  assert.equal(extracted1[0].nodes.length, 2);

  const idxInside = md1.indexOf('diag_arch_1');
  const foundAtCursor = findConceptDiagramAtCursor(md1, idxInside);
  assert.equal(foundAtCursor?.id, 'diag_arch_1');

  const updatedDiagram: ConceptDiagram = { ...diagram, title: 'Updated Sync Flow' };
  const md2 = upsertConceptBlockInMarkdown(md1, updatedDiagram);
  const extracted2 = extractConceptBlocksFromMarkdown(md2);
  assert.equal(extracted2.length, 1);
  assert.equal(extracted2[0].title, 'Updated Sync Flow');

  const mdRemoved = removeConceptBlockFromMarkdown(md2, 'diag_arch_1');
  assert.equal(extractConceptBlocksFromMarkdown(mdRemoved).length, 0);
  assert.ok(mdRemoved.includes('Overview text.'));

  const puzzleBounds = getShapeTextBounds('puzzle', 152, 92);
  assert.ok(puzzleBounds.x >= 18);
  assert.ok(puzzleBounds.width > 60 && puzzleBounds.height > 40);
  const labelBounds = getShapeTextBounds('label', 140, 44);
  assert.ok(labelBounds.width > 100);
});

test('splitMarkdownIntoEditorSegments collapses concept blocks cleanly and preserves round-trip prose edits', () => {
  const n1 = createDefaultNode('hexagon', 20, 20, 1);
  const d1: ConceptDiagram = { id: 'diag_1', title: 'Flow One', nodes: [n1], edges: [] };
  const d2: ConceptDiagram = { id: 'diag_2', title: 'Flow Two', nodes: [n1], edges: [] };

  let md = 'Intro paragraph.';
  md = upsertConceptBlockInMarkdown(md, d1);
  md = `${md}\nMiddle notes.\n`;
  md = upsertConceptBlockInMarkdown(md, d2);
  md = `${md}\nContinue text.....`;

  const segments = splitMarkdownIntoEditorSegments(md);
  assert.equal(segments.length, 5);
  assert.equal(segments[0].type, 'text');
  assert.equal((segments[0] as EditorTextSegment).text, 'Intro paragraph.');
  assert.equal(segments[1].type, 'diagram');
  if (segments[1].type === 'diagram') {
    assert.equal(segments[1].diagramIndex, 1);
    assert.equal(segments[1].diagram.title, 'Flow One');
  }
  assert.equal(segments[2].type, 'text');
  assert.equal((segments[2] as EditorTextSegment).text, 'Middle notes.');
  assert.equal(segments[3].type, 'diagram');
  if (segments[3].type === 'diagram') {
    assert.equal(segments[3].diagramIndex, 2);
  }
  assert.equal(segments[4].type, 'text');
  assert.equal((segments[4] as EditorTextSegment).text, 'Continue text.....');

  // Edit middle prose segment cleanly without corrupting surrounding diagrams
  const midSeg = segments[2] as EditorTextSegment;
  const edited = applyTextSegmentEdit(md, midSeg, 'Updated middle.', 15, 15);
  assert.equal(extractConceptBlocksFromMarkdown(edited.content).length, 2);
  assert.ok(edited.content.includes('Updated middle.'));

  const mapped = mapGlobalOffsetToSegment(
    splitMarkdownIntoEditorSegments(edited.content),
    edited.globalSelStart,
  );
  assert.equal(mapped?.segmentKey, 'text-1');
  assert.equal(mapped?.localStart, 15);

  // Cursor-aware insert places new diagram between paragraphs cleanly
  const d3: ConceptDiagram = { id: 'diag_3', title: 'Inserted Mid', nodes: [n1], edges: [] };
  const base = 'First line.\nSecond line.\n';
  const inserted = upsertConceptBlockInMarkdown(base, d3, 4);
  assert.ok(inserted.indexOf('First line.') < inserted.indexOf('diag_3'));
  assert.ok(inserted.indexOf('diag_3') < inserted.indexOf('Second line.'));
});
