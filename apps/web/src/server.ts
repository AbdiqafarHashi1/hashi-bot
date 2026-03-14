import { createServer } from 'node:http';

import { getApiRoutePayload, getPagePayload } from './index.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';

function readRequestBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }

      const bodyText = Buffer.concat(chunks).toString('utf8').trim();
      if (bodyText.length === 0) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(bodyText));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  try {
    const body = method === 'POST' ? await readRequestBody(req) : undefined;
    const payload = path.startsWith('/api/')
      ? await getApiRoutePayload(path, method, body)
      : await getPagePayload(path);

    const statusCode = payload && typeof payload === 'object' && 'error' in payload ? 400 : 200;
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error';
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'request_failed', message }));
  }
});

server.listen(port, host, () => {
  console.log(`@hashi-bot/web listening on http://localhost:${port}`);
});
