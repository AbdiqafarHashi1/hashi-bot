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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderJsonBlock(data: unknown): string {
  return `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}

function renderNavigation(currentPath: string): string {
  const links = [
    { href: '/', label: 'Overview' },
    { href: '/replay', label: 'Replay' },
    { href: '/backtest', label: 'Backtest' },
    { href: '/live', label: 'Live' },
    { href: '/settings', label: 'Settings' },
  ];

  return links
    .map((link) => {
      const active = currentPath === link.href ? 'active' : '';
      return `<a class="nav-link ${active}" href="${link.href}">${link.label}</a>`;
    })
    .join('');
}

function renderPagePayload(path: string, payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('title' in payload) || !('sections' in payload)) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hashi Bot Console</title>
    <style>body { font-family: ui-sans-serif, system-ui; margin: 2rem; background: #0b1020; color: #f8fafc; } a { color: #93c5fd; }</style>
  </head>
  <body>
    <h1>Page unavailable</h1>
    <p>The requested path could not be rendered.</p>
    ${renderJsonBlock(payload)}
  </body>
</html>`;
  }

  const page = payload as {
    path: string;
    title: string;
    subtitle: string;
    readiness: string;
    sections: Array<{ key: string; title: string; description: string; data: unknown }>;
  };

  const sections = page.sections
    .map(
      (section) => `
      <section class="card" id="${escapeHtml(section.key)}">
        <h2>${escapeHtml(section.title)}</h2>
        <p class="description">${escapeHtml(section.description)}</p>
        ${renderJsonBlock(section.data)}
      </section>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0;
        background: radial-gradient(circle at top right, #16213b, #0a1020 55%);
        color: #e2e8f0;
      }
      .container { max-width: 1120px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
      header { margin-bottom: 1.25rem; }
      h1 { margin: 0; font-size: 1.9rem; color: #f8fafc; }
      .subtitle { margin-top: .5rem; color: #cbd5e1; }
      .meta { margin-top: .75rem; font-size: .85rem; color: #94a3b8; }
      nav { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0 1.5rem; }
      .nav-link {
        text-decoration: none;
        color: #cbd5e1;
        border: 1px solid #334155;
        border-radius: 9999px;
        padding: .38rem .8rem;
        font-size: .88rem;
      }
      .nav-link.active { background: #1d4ed8; border-color: #1d4ed8; color: white; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
      .card {
        background: rgba(15, 23, 42, 0.82);
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 1rem;
        box-shadow: 0 10px 35px rgba(2, 6, 23, 0.35);
      }
      .card h2 { margin: 0 0 .35rem; font-size: 1.05rem; color: #e0f2fe; }
      .description { margin: 0 0 .85rem; color: #94a3b8; font-size: .92rem; }
      pre {
        margin: 0;
        overflow: auto;
        background: #020617;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: .8rem;
        font-size: .78rem;
        line-height: 1.45;
        color: #bfdbfe;
      }
    </style>
  </head>
  <body>
    <main class="container">
      <header>
        <h1>${escapeHtml(page.title)}</h1>
        <p class="subtitle">${escapeHtml(page.subtitle)}</p>
        <p class="meta">Path: ${escapeHtml(page.path)} · Readiness: ${escapeHtml(page.readiness)}</p>
      </header>
      <nav>${renderNavigation(path)}</nav>
      <div class="grid">${sections}</div>
    </main>
  </body>
</html>`;
}

const server = createServer(async (req, res) => {
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  try {
    const body = method === 'POST' ? await readRequestBody(req) : undefined;

    if (path.startsWith('/api/')) {
      const payload = await getApiRoutePayload(path, method, body);
      const statusCode = payload && typeof payload === 'object' && 'error' in payload ? 400 : 200;
      res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    const payload = await getPagePayload(path);
    const statusCode = payload && typeof payload === 'object' && 'error' in payload ? 404 : 200;
    res.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderPagePayload(path, payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error';
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'request_failed', message }));
  }
});

server.listen(port, host, () => {
  console.log(`@hashi-bot/web listening on http://localhost:${port}`);
});
