import type { Request, Response } from 'express';
import { hashApiToken } from './auth';
import type { VaultStore } from './store';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const MCP_TOOLS = [
  {
    name: 'list_notes',
    description:
      'List all notes shared with the opennote MCP bridge, including titles, folder paths, tags, and IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Optional folder path filter (case-insensitive substring match)',
        },
        tag: {
          type: 'string',
          description: 'Optional tag filter without leading #',
        },
      },
    },
  },
  {
    name: 'read_note',
    description:
      'Read the full Markdown content and embedded concept diagram structures of a specific note by ID or title.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Note ID' },
        title: { type: 'string', description: 'Note title (exact or partial match)' },
      },
    },
  },
  {
    name: 'search_notes',
    description:
      'Full-text search across note titles, Markdown content, tags, and concept diagram labels.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_note',
    description:
      'Create a new Markdown note in the user vault inbox so it syncs into their encrypted workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the new note' },
        content: { type: 'string', description: 'Markdown body content' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags',
        },
      },
      required: ['title', 'content'],
    },
  },
];

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

export function createMcpRouterHandlers(store: VaultStore) {
  const handleGet = (req: Request, res: Response) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({
        error: 'Missing MCP Bearer token. Generate one in Folio Notes -> OpenCode MCP.',
      });
      return;
    }
    const record = store.authenticateMcpToken(hashApiToken(token));
    if (!record) {
      res.status(403).json({ error: 'Invalid MCP token' });
      return;
    }
    res.json({
      name: 'opennote-mcp',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      transport: 'http-jsonrpc',
      tools: MCP_TOOLS.map((t) => t.name),
      sharedNotesCount: store.getMcpNotes(record.userId).length,
    });
  };

  const handlePost = (req: Request, res: Response) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Missing Authorization Bearer MCP token' },
      });
      return;
    }

    const tokenRecord = store.authenticateMcpToken(hashApiToken(token));
    if (!tokenRecord) {
      res.status(403).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32002, message: 'Invalid or revoked MCP token' },
      });
      return;
    }

    const rpc = req.body as JsonRpcRequest;
    const id = rpc?.id ?? null;

    if (!rpc || typeof rpc.method !== 'string') {
      res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid JSON-RPC request' },
      });
      return;
    }

    const notes = store.getMcpNotes(tokenRecord.userId);

    switch (rpc.method) {
      case 'initialize': {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: {
              name: 'opennote-mcp',
              version: '1.0.0',
            },
          },
        });
        return;
      }

      case 'notifications/initialized': {
        res.status(204).end();
        return;
      }

      case 'ping': {
        res.json({ jsonrpc: '2.0', id, result: {} });
        return;
      }

      case 'tools/list': {
        res.json({
          jsonrpc: '2.0',
          id,
          result: { tools: MCP_TOOLS },
        });
        return;
      }

      case 'resources/list': {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            resources: notes.map((n) => ({
              uri: `note://${n.id}`,
              name: n.title,
              description: `${n.folderPath || 'Root'} (${n.tags.map((t) => `#${t}`).join(', ') || 'untagged'})`,
              mimeType: 'text/markdown',
            })),
          },
        });
        return;
      }

      case 'resources/read': {
        const uri = typeof rpc.params?.uri === 'string' ? rpc.params.uri : '';
        const targetId = uri.replace(/^note:\/\//, '');
        const found = notes.find((n) => n.id === targetId);
        if (!found) {
          res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32004, message: `Note resource not found: ${uri}` },
          });
          return;
        }
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: `# ${found.title}\nFolder: ${found.folderPath || '/'}\nTags: ${found.tags.join(', ')}\n\n${found.content}`,
              },
            ],
          },
        });
        return;
      }

      case 'tools/call': {
        const toolName = typeof rpc.params?.name === 'string' ? rpc.params.name : '';
        const args = (rpc.params?.arguments as Record<string, unknown>) ?? {};

        if (toolName === 'list_notes') {
          const folderFilter =
            typeof args.folder === 'string' ? args.folder.toLowerCase().trim() : '';
          const tagFilter =
            typeof args.tag === 'string' ? args.tag.toLowerCase().replace(/^#/, '').trim() : '';

          const filtered = notes.filter((n) => {
            if (folderFilter && !n.folderPath.toLowerCase().includes(folderFilter)) return false;
            if (tagFilter && !n.tags.some((t) => t.toLowerCase() === tagFilter)) return false;
            return true;
          });

          const summary = filtered.map((n) => ({
            id: n.id,
            title: n.title,
            folderPath: n.folderPath || '/',
            tags: n.tags,
            updatedAt: new Date(n.updatedAt).toISOString(),
          }));

          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
            },
          });
          return;
        }

        if (toolName === 'read_note') {
          const noteId = typeof args.id === 'string' ? args.id.trim() : '';
          const titleQuery = typeof args.title === 'string' ? args.title.toLowerCase().trim() : '';

          const found =
            notes.find((n) => noteId && n.id === noteId) ||
            notes.find((n) => titleQuery && n.title.toLowerCase() === titleQuery) ||
            notes.find((n) => titleQuery && n.title.toLowerCase().includes(titleQuery));

          if (!found) {
            res.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: 'Note not found in MCP-shared notes.' }],
              },
            });
            return;
          }

          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `# ${found.title}\nFolder: ${found.folderPath || '/'}\nTags: ${found.tags.join(', ')}\n\n${found.content}`,
                },
              ],
            },
          });
          return;
        }

        if (toolName === 'search_notes') {
          const query = typeof args.query === 'string' ? args.query.toLowerCase().trim() : '';
          const matches = notes.filter(
            (n) =>
              n.title.toLowerCase().includes(query) ||
              n.content.toLowerCase().includes(query) ||
              n.tags.some((t) => t.toLowerCase().includes(query)),
          );
          const payload = matches.map((n) => ({
            id: n.id,
            title: n.title,
            folderPath: n.folderPath || '/',
            tags: n.tags,
            excerpt: n.content.slice(0, 260),
          }));
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            },
          });
          return;
        }

        if (toolName === 'create_note') {
          const title = typeof args.title === 'string' ? args.title.trim() : 'Untitled MCP Note';
          const content = typeof args.content === 'string' ? args.content : '';
          const tags = Array.isArray(args.tags)
            ? args.tags.filter((t): t is string => typeof t === 'string')
            : ['opencode'];

          const queued = store.enqueueMcpCreate(tokenRecord.userId, { title, content, tags });
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Queued note "${queued.title}" (${queued.id}) for encrypted vault sync.`,
                },
              ],
            },
          });
          return;
        }

        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
        return;
      }

      default: {
        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${rpc.method}` },
        });
      }
    }
  };

  return { handleGet, handlePost };
}
