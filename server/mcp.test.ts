import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { VaultStore } from './store';
import { hashApiToken } from './auth';
import { createMcpRouterHandlers } from './mcp';

function createMockRes() {
  const result = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    ended: false,
  };
  const res = {
    status(code: number) {
      result.statusCode = code;
      return res;
    },
    set(key: string, val: string) {
      result.headers[key.toLowerCase()] = val;
      return res;
    },
    json(payload: unknown) {
      result.body = payload;
      return res;
    },
    end() {
      result.ended = true;
      return res;
    },
  } as unknown as Response;
  return { res, result };
}

test('MCP router supports Claude Desktop Streamable HTTP negotiation, SSE 405 probe, notifications, and ?token= auth', () => {
  const store = new VaultStore(undefined, ':memory:');
  const user = store.createUser({
    email: 'desktop@example.com',
    name: 'Desktop User',
    passwordHash: 'hash',
    vaultSalt: 'salt',
    authProvider: 'password',
  });
  const rawToken = `mcp_${crypto.randomBytes(8).toString('hex')}`;
  store.createMcpToken(user.id, 'Claude Desktop', rawToken.slice(0, 8), hashApiToken(rawToken));
  store.setMcpNotes(user.id, [
    {
      id: 'n1',
      title: 'Architecture Notes',
      folderPath: 'Backend',
      tags: ['arch'],
      content: 'System design details',
      updatedAt: Date.now(),
    },
  ]);

  const handlers = createMcpRouterHandlers(store);

  // 1. GET with Accept: text/event-stream (Streamable HTTP client probe) returns 405 Allow: POST
  const getSse = createMockRes();
  handlers.handleGet(
    {
      headers: { accept: 'text/event-stream', authorization: `Bearer ${rawToken}` },
      query: {},
    } as unknown as Request,
    getSse.res,
  );
  assert.equal(getSse.result.statusCode, 405);
  assert.equal(getSse.result.headers.allow, 'POST');

  // 2. POST initialize via ?token= query param (Claude Desktop Custom Connector URL style)
  const initCall = createMockRes();
  handlers.handlePost(
    {
      headers: {},
      query: { token: rawToken },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
      },
    } as unknown as Request,
    initCall.res,
  );
  assert.equal(initCall.result.statusCode, 200);
  const initBody = initCall.result.body as { result: { protocolVersion: string } };
  assert.equal(initBody.result.protocolVersion, '2025-03-26');

  // 3. Notifications return 204 without JSON-RPC error
  const notifCall = createMockRes();
  handlers.handlePost(
    {
      headers: { authorization: `Bearer ${rawToken}` },
      query: {},
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
    } as unknown as Request,
    notifCall.res,
  );
  assert.equal(notifCall.result.statusCode, 204);

  // 4. prompts/list returns empty prompts list cleanly
  const promptsCall = createMockRes();
  handlers.handlePost(
    {
      headers: { authorization: `Bearer ${rawToken}` },
      query: {},
      body: { jsonrpc: '2.0', id: 2, method: 'prompts/list' },
    } as unknown as Request,
    promptsCall.res,
  );
  assert.deepEqual((promptsCall.result.body as { result: { prompts: unknown[] } }).result.prompts, []);

  // 5. DELETE closes cleanly with 204
  const delCall = createMockRes();
  handlers.handleDelete({} as Request, delCall.res);
  assert.equal(delCall.result.statusCode, 204);
});
