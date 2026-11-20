import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInlineTags,
  extractWikilinks,
  parseMarkdownBlocks,
  toggleChecklistLine,
} from './markdown';

test('extractInlineTags ignores code blocks and extracts unique lowercase tags', () => {
  const md = [
    '# Title',
    'Working on #Architecture and #api-design today.',
    '```ts',
    'const ignored = "#notATag";',
    '```',
    'Repeat #architecture and `#inlineCodeTag`.',
  ].join('\n');

  assert.deepEqual(extractInlineTags(md), ['architecture', 'api-design']);
});

test('extractWikilinks extracts note references with optional aliases', () => {
  const md = 'See [[Auth Flow]] and [[Sync Engine|Sync Spec]] for details.';
  assert.deepEqual(extractWikilinks(md), ['Auth Flow', 'Sync Engine']);
});

test('parseMarkdownBlocks parses headings, checklists, tables, and concept blocks', () => {
  const md = [
    '# Main Heading',
    '',
    '- [ ] Draft schema',
    '- [x] Setup Docker',
    '',
    '| Service | Port |',
    '| --- | --- |',
    '| Web | 3000 |',
    '',
    '```concept',
    '{"id":"d1","title":"API","nodes":[],"edges":[]}',
    '```',
  ].join('\n');

  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'list');
  if (blocks[1].type === 'list') {
    assert.equal(blocks[1].items[0].checked, false);
    assert.equal(blocks[1].items[1].checked, true);
  }
  assert.equal(blocks[2].type, 'table');
  assert.equal(blocks[3].type, 'concept');
});

test('toggleChecklistLine flips checkbox state on target line', () => {
  const md = '- [ ] First\n- [x] Second';
  const toggled = toggleChecklistLine(md, 0);
  assert.equal(toggled, '- [x] First\n- [x] Second');
  assert.equal(toggleChecklistLine(toggled, 1), '- [x] First\n- [ ] Second');
});

test('parseMarkdownBlocks and applyAlignmentToMarkdown support aligned blocks and Khmer/Arial font classes', async () => {
  const { applyAlignmentToMarkdown, getEditorFontClass } = await import('./markdown');
  assert.equal(getEditorFontClass('arial'), 'font-note-arial');
  assert.equal(getEditorFontClass('khmer_battambang'), 'font-note-khmer-battambang');
  assert.equal(getEditorFontClass('khmer_siemreap'), 'font-note-khmer-siemreap');
  assert.equal(getEditorFontClass('khmer_muollight'), 'font-note-khmer-muollight');

  const aligned = applyAlignmentToMarkdown('Hello World', 0, 11, 'center');
  assert.equal(aligned.content, '<div align="center">\nHello World\n</div>');
  const blocks = parseMarkdownBlocks(aligned.content);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'aligned');
  if (blocks[0].type === 'aligned') {
    assert.equal(blocks[0].align, 'center');
    assert.equal(blocks[0].blocks[0].type, 'paragraph');
  }

  // Toggling same alignment unwraps cleanly
  const unwrapped = applyAlignmentToMarkdown(aligned.content, 0, aligned.content.length, 'center');
  assert.equal(unwrapped.content, 'Hello World');
});
