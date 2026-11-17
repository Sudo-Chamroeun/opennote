import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWordAtPosition,
  findSpellingIssues,
  getSpellingSuggestions,
  isSpellcheckSuppressedForNote,
  isWordValid,
  replaceWordInText,
} from './spellcheck';

test('spellcheck detects misspelled prose words while ignoring code blocks and ignored words', () => {
  const md = [
    '# System Documnt',
    'Connect to `myCustomVar` or ```js\nconst xyzzy = 1;\n```',
    'Review the datbase config.',
  ].join('\n');

  const ignored = new Set<string>();
  const issues = findSpellingIssues(md, ignored);
  assert.ok(issues.some((i) => i.word === 'Documnt'));
  assert.ok(issues.some((i) => i.word === 'datbase'));
  assert.equal(issues.some((i) => i.word === 'xyzzy'), false);

  // Active cursor inside "Documnt" prevents mid-typing flicker
  const typingCursorIdx = md.indexOf('Documnt') + 4;
  const whileTyping = findSpellingIssues(md, ignored, 25, typingCursorIdx);
  assert.equal(whileTyping.some((i) => i.word === 'Documnt'), false);
  assert.equal(whileTyping.some((i) => i.word === 'datbase'), true);

  ignored.add('documnt');
  const afterIgnore = findSpellingIssues(md, ignored);
  assert.equal(afterIgnore.some((i) => i.word === 'Documnt'), false);
  assert.equal(isWordValid('Documnt', ignored), true);
});

test('isSpellcheckSuppressedForNote respects entire page and nested folder ignores', () => {
  const folders = [
    { id: 'f_parent', parentId: null },
    { id: 'f_child', parentId: 'f_parent' },
  ];
  assert.equal(
    isSpellcheckSuppressedForNote('n1', 'f_child', folders, new Set(['n1']), new Set()).reason,
    'page',
  );
  assert.equal(
    isSpellcheckSuppressedForNote('n2', 'f_child', folders, new Set(), new Set(['f_parent'])).reason,
    'folder',
  );
  assert.equal(
    isSpellcheckSuppressedForNote('n2', null, folders, new Set(), new Set(['f_parent'])).suppressed,
    false,
  );
});

test('getSpellingSuggestions and replaceWordInText correct misspellings cleanly', () => {
  const suggestions = getSpellingSuggestions('datbase');
  assert.ok(suggestions.includes('database'));

  const text = 'Check the datbase connection';
  const word = extractWordAtPosition(text, 12);
  assert.equal(word?.word, 'datbase');
  if (word) {
    assert.equal(
      replaceWordInText(text, word.start, word.end, 'database'),
      'Check the database connection',
    );
  }
});
