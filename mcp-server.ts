#!/usr/bin/env node
/**
 * Optional local stdio MCP bridge for OpenCode.
 * Reads newline-delimited JSON-RPC from stdin and forwards to FOLIO_URL/api/mcp.
 *
 * Usage in opencode.json:
 * {
 *   "mcp": {
 *     "folio-notes": {
 *       "type": "local",
 *       "command": ["npx", "tsx", "mcp-server.ts"],
 *       "environment": {
 *         "FOLIO_URL": "https://notes.yourdomain.com",
 *         "FOLIO_MCP_TOKEN": "mcp_..."
 *       }
 *     }
 *   }
 * }
 */
import readline from 'node:readline';

const baseUrl = (process.env.FOLIO_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.FOLIO_MCP_TOKEN || '';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const response = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: trimmed,
    });
    if (response.status === 204) return;
    const text = await response.text();
    if (text) {
      process.stdout.write(`${text}\n`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bridge request failed';
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message },
      })}\n`,
    );
  }
});
