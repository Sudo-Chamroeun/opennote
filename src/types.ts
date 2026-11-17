export type ShapeKind =
  | 'square'
  | 'rounded'
  | 'circle'
  | 'hexagon'
  | 'puzzle'
  | 'diamond'
  | 'triangle'
  | 'cylinder'
  | 'label';

export type ShapeColor =
  | 'slate'
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet';

export interface DiagramNode {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: ShapeColor;
  fontSize?: number;
}

export interface DiagramEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  style: 'solid' | 'dashed';
  arrowEnd: boolean;
  arrowStart?: boolean;
  color?: ShapeColor;
}

export interface ConceptDiagram {
  id: string;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  color?: FolderColor;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  version: number;
  deleted?: boolean;
  exposeToMcp?: boolean;
}

export type FolderColor =
  | 'slate'
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'sky'
  | 'teal';

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  color?: FolderColor;
  createdAt: number;
  updatedAt: number;
  version: number;
  deleted?: boolean;
}

export type EditorFontFamily = 'sans' | 'serif' | 'mono';
export type EditorViewMode = 'edit' | 'split' | 'preview';
export type ThemeMode = 'light' | 'dark';

export interface EditorSettings {
  fontFamily: EditorFontFamily;
  fontSize: number;
  theme: ThemeMode;
  viewMode: EditorViewMode;
}

export interface EncryptedEnvelope {
  id: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
  version: number;
  deleted?: boolean;
}

export interface AuthSession {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    vaultSalt: string;
    authProvider?: string;
    hasPassword?: boolean;
  };
}

export interface McpTokenInfo {
  id: string;
  label: string;
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
}
