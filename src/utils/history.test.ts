import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryStack,
  pushHistorySnapshot,
  redoHistory,
  undoHistory,
} from './history';

test('undoHistory and redoHistory restore previous content and cursor cleanly', () => {
  let stack = createHistoryStack({
    title: 'Spec',
    content: 'Hello',
    cursorStart: 5,
    cursorEnd: 5,
    timestamp: 1000,
  });

  stack = pushHistorySnapshot(
    stack,
    {
      title: 'Spec',
      content: 'Hello World',
      cursorStart: 11,
      cursorEnd: 11,
      timestamp: 2000,
    },
    true,
  );

  stack = pushHistorySnapshot(
    stack,
    {
      title: 'Spec',
      content: 'Hello **World**',
      cursorStart: 15,
      cursorEnd: 15,
      timestamp: 2100,
    },
    true,
  );

  const u1 = undoHistory(stack);
  assert.equal(u1.restored?.content, 'Hello World');
  const u2 = undoHistory(u1.stack);
  assert.equal(u2.restored?.content, 'Hello');

  const r1 = redoHistory(u2.stack);
  assert.equal(r1.restored?.content, 'Hello World');
});

test('rapid single-char typing coalesces into one undo step after initial snapshot', () => {
  let stack = createHistoryStack({
    title: 'Note',
    content: '',
    cursorStart: 0,
    cursorEnd: 0,
    timestamp: 1000,
  });

  stack = pushHistorySnapshot(stack, {
    title: 'Note',
    content: 'a',
    cursorStart: 1,
    cursorEnd: 1,
    timestamp: 2000,
  });
  stack = pushHistorySnapshot(stack, {
    title: 'Note',
    content: 'ab',
    cursorStart: 2,
    cursorEnd: 2,
    timestamp: 2100,
  });
  stack = pushHistorySnapshot(stack, {
    title: 'Note',
    content: 'abc',
    cursorStart: 3,
    cursorEnd: 3,
    timestamp: 2200,
  });

  const undone = undoHistory(stack);
  assert.equal(undone.restored?.content, '');
});
