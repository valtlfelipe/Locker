import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { indexFile, deindexFile, search, getStoreCount, closeAll } from './store-manager.js';

const PORT = parseInt(process.env.QMD_PORT || '9600', 10);

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'GET' && url === '/health') {
    json(res, 200, { status: 'ok', workspaces: getStoreCount() });
    return;
  }

  if (method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (url === '/index') {
    const { workspaceId, fileId, fileName, mimeType, content } = body as {
      workspaceId: string;
      fileId: string;
      fileName: string;
      mimeType: string;
      content: string;
    };

    if (!workspaceId || !fileId || !fileName || !content) {
      json(res, 400, { error: 'Missing required fields: workspaceId, fileId, fileName, content' });
      return;
    }

    try {
      await indexFile({ workspaceId, fileId, fileName, mimeType: mimeType || 'text/plain', content });
      json(res, 200, { success: true });
    } catch (err) {
      console.error('[qmd] Index error:', err);
      json(res, 500, { error: 'Indexing failed' });
    }
    return;
  }

  if (url === '/search') {
    const { workspaceId, query, limit } = body as {
      workspaceId: string;
      query: string;
      limit?: number;
    };

    if (!workspaceId || !query) {
      json(res, 400, { error: 'Missing required fields: workspaceId, query' });
      return;
    }

    try {
      const results = await search({ workspaceId, query, limit });
      json(res, 200, { results });
    } catch (err) {
      console.error('[qmd] Search error:', err);
      json(res, 200, { results: [] });
    }
    return;
  }

  if (url === '/deindex') {
    const { workspaceId, fileId } = body as {
      workspaceId: string;
      fileId: string;
    };

    if (!workspaceId || !fileId) {
      json(res, 400, { error: 'Missing required fields: workspaceId, fileId' });
      return;
    }

    try {
      await deindexFile({ workspaceId, fileId });
      json(res, 200, { success: true });
    } catch (err) {
      console.error('[qmd] Deindex error:', err);
      json(res, 500, { error: 'De-indexing failed' });
    }
    return;
  }

  json(res, 404, { error: 'Not found' });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[qmd] Unhandled error:', err);
    if (!res.headersSent) {
      json(res, 500, { error: 'Internal server error' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[qmd] Service listening on port ${PORT}`);
  console.log(`[qmd] Data directory: ${process.env.QMD_DATA_DIR || './data/qmd'}`);
});

process.on('SIGTERM', () => {
  console.log('[qmd] Shutting down...');
  closeAll();
  server.close();
});

process.on('SIGINT', () => {
  console.log('[qmd] Shutting down...');
  closeAll();
  server.close();
});
