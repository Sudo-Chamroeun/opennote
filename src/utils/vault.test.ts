import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLDER_COLORS,
  buildFolderTree,
  collectVaultTags,
  filterNotes,
  getFolderBreadcrumbs,
  isDescendantFolder,
  mergeVersionedItems,
} from './vault';
import type { FolderItem, NoteItem } from '../types';

const now = 1_700_000_000_000;

const folders: FolderItem[] = [
  { id: 'f1', name: 'Backend', parentId: null, color: 'emerald', createdAt: now, updatedAt: now, version: 1 },
  { id: 'f2', name: 'Auth', parentId: 'f1', color: 'rose', createdAt: now, updatedAt: now, version: 1 },
];

const notes: NoteItem[] = [
  {
    id: 'n1',
    title: 'JWT Spec',
    content: 'Use ==HMAC-SHA256== tokens #security',
    folderId: 'f2',
    tags: ['auth'],
    createdAt: now,
    updatedAt: now + 10,
    version: 1,
  },
  {
    id: 'n2',
    title: 'Root Ideas',
    content: '```concept\n{"id":"c1","title":"Puzzle Map","nodes":[{"id":"1","kind":"puzzle","x":0,"y":0,"width":120,"height":80,"label":"OpenCode MCP","color":"indigo"}],"edges":[]}\n```',
    folderId: null,
    tags: ['mcp'],
    createdAt: now,
    updatedAt: now + 20,
    version: 1,
  },
];

test('buildFolderTree builds nested folders, preserves colors, and separates root notes', () => {
  const tree = buildFolderTree(folders, notes);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].folder.name, 'Backend');
  assert.equal(tree.roots[0].folder.color, 'emerald');
  assert.ok(FOLDER_COLORS.emerald.swatch.startsWith('#'));
  assert.equal(tree.roots[0].children[0].folder.name, 'Auth');
  assert.equal(tree.roots[0].children[0].folder.color, 'rose');
  assert.equal(tree.roots[0].children[0].notes[0].title, 'JWT Spec');
  assert.equal(tree.rootNotes.length, 1);
  assert.equal(tree.rootNotes[0].title, 'Root Ideas');
});

test('isDescendantFolder prevents circular nesting', () => {
  assert.equal(isDescendantFolder(folders, 'f2', 'f1'), true);
  assert.equal(isDescendantFolder(folders, 'f1', 'f2'), false);
  assert.equal(isDescendantFolder(folders, 'f1', 'f1'), true);
});

test('getFolderBreadcrumbs returns ordered ancestor chain', () => {
  const crumbs = getFolderBreadcrumbs(folders, 'f2');
  assert.deepEqual(crumbs.map((c) => c.name), ['Backend', 'Auth']);
});

test('collectVaultTags and filterNotes search inside text, tags, and diagram labels', () => {
  const tags = collectVaultTags(notes);
  assert.ok(tags.some((t) => t.tag === 'security' && t.count === 1));
  assert.ok(tags.some((t) => t.tag === 'auth' && t.count === 1));

  const diagramSearch = filterNotes(notes, 'opencode mcp', null);
  assert.equal(diagramSearch.length, 1);
  assert.equal(diagramSearch[0].id, 'n2');

  const tagSearch = filterNotes(notes, '', 'security');
  assert.equal(tagSearch.length, 1);
  assert.equal(tagSearch[0].id, 'n1');
});

test('mergeVersionedItems prefers higher version and newer timestamp', () => {
  const local = [{ id: 'a', updatedAt: 100, version: 1, title: 'Old' }];
  const remote = [{ id: 'a', updatedAt: 90, version: 2, title: 'Newer Version' }];
  const merged = mergeVersionedItems(local, remote);
  assert.equal(merged[0].title, 'Newer Version');
});
