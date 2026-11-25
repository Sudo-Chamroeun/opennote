import test from 'node:test';
import assert from 'node:assert/strict';
import type { FolderItem, NoteItem } from '../types';
import {
  createFolderExportJson,
  createNoteExportJson,
  createNoteExportMarkdown,
  createVaultExportJson,
  materializeImportedItems,
  parseImportFiles,
} from './transfer';

const now = 1_700_000_000_000;

const folders: FolderItem[] = [
  { id: 'f_work', name: 'Work', parentId: null, color: 'emerald', createdAt: now, updatedAt: now, version: 2 },
  { id: 'f_api', name: 'API Specs', parentId: 'f_work', color: 'sky', createdAt: now, updatedAt: now, version: 1 },
  { id: 'f_other', name: 'Personal', parentId: null, color: 'rose', createdAt: now, updatedAt: now, version: 1 },
];

const notes: NoteItem[] = [
  {
    id: 'n_1',
    title: 'Gateway Design',
    content: '# Gateway\n\n1. Route traffic\n2. Verify JWT',
    folderId: 'f_api',
    color: 'amber',
    tags: ['architecture', 'gateway'],
    createdAt: now,
    updatedAt: now,
    version: 3,
    exposeToMcp: true,
  },
  {
    id: 'n_2',
    title: 'Work Checklist',
    content: '- [x] Export feature',
    folderId: 'f_work',
    tags: ['todo'],
    createdAt: now,
    updatedAt: now,
    version: 1,
  },
  {
    id: 'n_3',
    title: 'Diary',
    content: 'Private entry',
    folderId: 'f_other',
    tags: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  },
];

test('single note exports cleanly to .opennote.json and .md and round-trips through parse + materialize', () => {
  const jsonExport = createNoteExportJson(notes[0]);
  assert.equal(jsonExport.filename, 'Gateway-Design.opennote.json');
  assert.equal(jsonExport.noteCount, 1);

  const mdExport = createNoteExportMarkdown(notes[0]);
  assert.equal(mdExport.filename, 'Gateway-Design.md');
  assert.match(mdExport.content, /^---\ntitle: "Gateway Design"/);

  const parsedJson = parseImportFiles([{ name: jsonExport.filename, text: jsonExport.content }]);
  assert.equal(parsedJson.warnings.length, 0);
  assert.equal(parsedJson.notes.length, 1);
  assert.equal(parsedJson.notes[0].title, 'Gateway Design');
  assert.equal(parsedJson.notes[0].color, 'amber');
  assert.equal(parsedJson.notes[0].exposeToMcp, false);

  const parsedMd = parseImportFiles([{ name: mdExport.filename, text: mdExport.content }]);
  assert.equal(parsedMd.warnings.length, 0);
  assert.equal(parsedMd.notes.length, 1);
  assert.equal(parsedMd.notes[0].title, 'Gateway Design');
  assert.deepEqual(parsedMd.notes[0].tags, ['architecture', 'gateway']);
  assert.equal(parsedMd.notes[0].color, 'amber');
  assert.equal(parsedMd.notes[0].content, notes[0].content);

  // Plain Markdown without frontmatter uses filename as title
  const plainMd = parseImportFiles([{ name: 'Meeting Notes.md', text: '# Standup\n\nHello' }]);
  assert.equal(plainMd.notes[0].title, 'Meeting Notes');
  assert.equal(plainMd.notes[0].content, '# Standup\n\nHello');
});

test('folder export includes nested subfolders and remaps IDs cleanly on import without collisions', () => {
  const bundle = createFolderExportJson('f_work', folders, notes);
  assert.ok(bundle);
  assert.equal(bundle.filename, 'Work.opennote.json');
  assert.equal(bundle.folderCount, 2);
  assert.equal(bundle.noteCount, 2);

  const parsed = parseImportFiles([{ name: bundle.filename, text: bundle.content }]);
  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.folders.length, 2);
  assert.equal(parsed.notes.length, 2);

  // Importing into another account that already has a "Work" folder under Root
  const existingOtherAccountFolders: FolderItem[] = [
    { id: 'other_f', name: 'Work', parentId: null, color: 'indigo', createdAt: now, updatedAt: now, version: 1 },
  ];
  const materialized = materializeImportedItems(parsed, null, existingOtherAccountFolders, now + 5000);

  assert.equal(materialized.folders.length, 2);
  const importedRoot = materialized.folders.find((f) => f.parentId === null)!;
  const importedSub = materialized.folders.find((f) => f.parentId === importedRoot.id)!;

  assert.ok(importedRoot);
  assert.ok(importedSub);
  assert.notEqual(importedRoot.id, 'f_work');
  assert.notEqual(importedSub.id, 'f_api');
  assert.equal(importedRoot.name, 'Work (Imported)');
  assert.equal(importedSub.name, 'API Specs');

  const gatewayNote = materialized.notes.find((n) => n.title === 'Gateway Design')!;
  const checklistNote = materialized.notes.find((n) => n.title === 'Work Checklist')!;
  assert.equal(gatewayNote.folderId, importedSub.id);
  assert.equal(checklistNote.folderId, importedRoot.id);
  assert.notEqual(gatewayNote.id, 'n_1');
  assert.equal(gatewayNote.exposeToMcp, false);
});

test('vault export captures all active folders and notes and warns on bad import files', () => {
  const vaultFile = createVaultExportJson(folders, notes);
  assert.equal(vaultFile.folderCount, 3);
  assert.equal(vaultFile.noteCount, 3);

  const badImport = parseImportFiles([
    { name: 'broken.json', text: '{not valid json' },
    { name: 'image.png', text: 'binary' },
  ]);
  assert.equal(badImport.notes.length, 0);
  assert.equal(badImport.warnings.length, 2);
});
