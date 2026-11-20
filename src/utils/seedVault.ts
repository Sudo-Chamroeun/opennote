import type { FolderItem, NoteItem } from '../types';

export function createSeedWorkspace(): { folders: FolderItem[]; notes: NoteItem[] } {
  const now = Date.now();

  const folders: FolderItem[] = [
    {
      id: 'fld_introduction',
      name: 'Welcome',
      parentId: null,
      color: 'indigo',
      createdAt: now - 3600_000,
      updatedAt: now - 3600_000,
      version: 1,
    },
  ];

  const notes: NoteItem[] = [
    {
      id: 'note_welcome',
      title: 'Welcome Message',
      folderId: 'fld_introduction',
      tags: ['welcome'],
      createdAt: now - 2000_000,
      updatedAt: now - 100_000,
      version: 1,
      exposeToMcp: false,
      content: [
        '# Welcome to opennote',
        '',
        '**opennote** — your private, fast Markdown and Concept Diagram workspace built to keep ideas organized across your devices. Write down your ideas right away before they slip from your head.',
        '',
        'This system is built to run in parallel so everything stays fast and responsive, and your notes stay strictly with your account. All data is encrypted — no admin or third party can review, check, or access your information.',
        '',
        'Whether you are taking daily study notes, sketching system diagrams, writing in Khmer or English, or sharing pages with collaborators, everything is designed to stay clean and distraction-free.',
        '',
        '---',
        '',
        '### Bug Reports & Feature Requests',
        '',
        'Have an improvement idea or spotted a bug? Email to: `senchomroaen.soknara@footprintsschool.edu.kh`',
        '',
        'opennote by calz',
      ].join('\n'),
    },
    {
      id: 'note_howto',
      title: 'How To',
      folderId: 'fld_introduction',
      tags: ['guide'],
      createdAt: now - 1800_000,
      updatedAt: now - 200_000,
      version: 1,
      exposeToMcp: false,
      content: [
        '# How To Use opennote',
        '',
        'Quick guide to the core features:',
        '',
        '- **Office Formatting & Fonts:** Use the top toolbar for Headings, Bold, Italic, <u>Underline</u>, ==Highlight==, Bullet/Numbered/Checklists, Left/Center/Right alignment, and fonts including Arial and Khmer OS fonts.',
        '- **Concept Diagrams:** Click **Add Concept Diagram** in the toolbar to draw shapes, arrows, and labels; double-click any shape or text box inside the studio to edit.',
        '- **Folders, Colors & Rename:** Hover any folder or note in the left sidebar to rename it, pick a color, print to PDF, or delete it.',
        '- **Share Links (HTTPS):** Click **Share** on any note or folder to generate a **Read Only** or **Read & Write** link anyone can open.',
        '- **MCP Connect:** Click **MCP Connect** in the header to generate or rename Bearer tokens for your coding tools.',
      ].join('\n'),
    },
  ];

  return { folders, notes };
}
