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
  return `<pre class="json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}

function renderNavigation(currentPath: string): string {
  const links = [
    { href: '/overview', label: 'Overview' },
    { href: '/replay', label: 'Replay Lab' },
    { href: '/backtest', label: 'Backtest Lab' },
    { href: '/live', label: 'Live Ops' },
    { href: '/trades', label: 'Trades' },
    { href: '/runs', label: 'Runs' },
    { href: '/safety', label: 'Safety' },
    { href: '/settings', label: 'Settings' }
  ];

  return links
    .map((link) => {
      const active = currentPath === link.href || (link.href === '/overview' && currentPath === '/') ? 'active' : '';
      return `<a class="nav-link ${active}" href="${link.href}">${link.label}</a>`;
    })
    .join('');
}

type FoundationSection = { key: string; title: string; description: string; data: unknown };
type FoundationPage = {
  path: string;
  title: string;
  subtitle: string;
  readiness: string;
  sections: FoundationSection[];
};

function asPage(payload: unknown): FoundationPage | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const rec = payload as Record<string, unknown>;
  if (typeof rec.title !== 'string' || !Array.isArray(rec.sections) || typeof rec.path !== 'string') {
    return undefined;
  }

  return rec as FoundationPage;
}

function sectionData(page: FoundationPage, key: string): Record<string, unknown> | undefined {
  const section = page.sections.find((item) => item.key === key);
  return section && typeof section.data === 'object' && section.data !== null ? (section.data as Record<string, unknown>) : undefined;
}

function statusBadge(value: string | undefined): string {
  const text = value ?? 'unknown';
  const normalized = text.toLowerCase();
  const tone = normalized.includes('ok') || normalized.includes('ready') || normalized.includes('healthy') || normalized.includes('allowed')
    ? 'good'
    : normalized.includes('warn') || normalized.includes('degraded') || normalized.includes('paused')
      ? 'warn'
      : normalized.includes('fail') || normalized.includes('error') || normalized.includes('critical') || normalized.includes('lock') || normalized.includes('kill')
        ? 'bad'
        : 'neutral';
  return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
}

function safeNumber(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return '—';
}

function renderOverviewHero(page: FoundationPage): string {
  const capabilities = sectionData(page, 'capabilities');
  const liveExecution = capabilities && typeof capabilities.liveExecution === 'object' && capabilities.liveExecution !== null
    ? (capabilities.liveExecution as Record<string, unknown>)
    : undefined;

  const replayRuns = capabilities && typeof capabilities.replay === 'object' && capabilities.replay !== null
    ? (capabilities.replay as Record<string, unknown>)
    : undefined;

  const backtestRuns = capabilities && typeof capabilities.backtest === 'object' && capabilities.backtest !== null
    ? (capabilities.backtest as Record<string, unknown>)
    : undefined;

  return `<section class="metric-strip">
    <article>
      <p>Mode</p>
      <h3>${escapeHtml(String(liveExecution?.mode ?? 'paper'))}</h3>
    </article>
    <article>
      <p>Venue</p>
      <h3>${escapeHtml(String(liveExecution?.venue ?? 'mock'))}</h3>
    </article>
    <article>
      <p>Replay Runs</p>
      <h3>${safeNumber(replayRuns?.runCount)}</h3>
    </article>
    <article>
      <p>Backtest Runs</p>
      <h3>${safeNumber(backtestRuns?.runCount)}</h3>
    </article>
    <article>
      <p>Adapter State</p>
      <h3>${statusBadge(String(liveExecution?.status ?? 'unknown'))}</h3>
    </article>
  </section>`;
}

function renderReplayHero(page: FoundationPage): string {
  const runs = sectionData(page, 'runs');
  const items = Array.isArray(runs?.items) ? runs.items : [];
  const first = items[0] && typeof items[0] === 'object' ? (items[0] as Record<string, unknown>) : undefined;

  return `<section class="metric-strip">
    <article><p>Replay Runs</p><h3>${safeNumber(items.length)}</h3></article>
    <article><p>Latest Run</p><h3>${escapeHtml(String(first?.runId ?? '—'))}</h3></article>
    <article><p>Status</p><h3>${statusBadge(String(first?.status ?? 'idle'))}</h3></article>
    <article><p>Profile</p><h3>${escapeHtml(String(first?.profileCode ?? 'GROWTH_HUNTER'))}</h3></article>
    <article><p>Timeframe</p><h3>${escapeHtml(String(first?.timeframe ?? '1m'))}</h3></article>
  </section>`;
}

function renderBacktestHero(page: FoundationPage): string {
  const runs = sectionData(page, 'runs');
  const items = Array.isArray(runs?.items) ? runs.items : [];
  const latest = items[0] && typeof items[0] === 'object' ? (items[0] as Record<string, unknown>) : undefined;
  return `<section class="metric-strip">
    <article><p>Backtests</p><h3>${safeNumber(items.length)}</h3></article>
    <article><p>Latest Net PnL</p><h3>${safeNumber(latest?.netPnl)}</h3></article>
    <article><p>Win Rate</p><h3>${safeNumber(latest?.winRatePct)}%</h3></article>
    <article><p>Total Trades</p><h3>${safeNumber(latest?.totalTrades)}</h3></article>
    <article><p>Status</p><h3>${statusBadge(String(latest?.status ?? 'unknown'))}</h3></article>
  </section>`;
}

function renderLiveHero(page: FoundationPage): string {
  const summary = sectionData(page, 'venue_summary');
  const safety = sectionData(page, 'safety');
  const safetyData = safety && typeof safety.safety === 'object' && safety.safety !== null ? (safety.safety as Record<string, unknown>) : undefined;

  return `<section class="metric-strip">
    <article><p>Mode</p><h3>${statusBadge(String(summary?.mode ?? 'paper'))}</h3></article>
    <article><p>Venue</p><h3>${escapeHtml(String(summary?.venue ?? 'mock'))}</h3></article>
    <article><p>Health</p><h3>${statusBadge(String(safetyData?.healthStatus ?? summary?.status ?? 'unknown'))}</h3></article>
    <article><p>Control State</p><h3>${statusBadge(String(safetyData?.controlState ?? 'normal'))}</h3></article>
    <article><p>Recovery</p><h3>${statusBadge(String(safetyData?.recoveryState ?? 'idle'))}</h3></article>
  </section>`;
}

function renderSettingsHero(page: FoundationPage): string {
  const execution = sectionData(page, 'execution_summary');
  const profiles = page.sections.find((item) => item.key === 'profiles');
  const profileCount = Array.isArray(profiles?.data) ? profiles.data.length : 0;
  return `<section class="metric-strip">
    <article><p>Profiles</p><h3>${safeNumber(profileCount)}</h3></article>
    <article><p>Mode</p><h3>${escapeHtml(String(execution?.mode ?? 'paper'))}</h3></article>
    <article><p>Venue</p><h3>${escapeHtml(String(execution?.venue ?? 'mock'))}</h3></article>
    <article><p>Account</p><h3>${escapeHtml(String(execution?.accountRef ?? 'paper-account'))}</h3></article>
    <article><p>Adapter</p><h3>${statusBadge(String(execution?.adapterReady === true ? 'ready' : 'degraded'))}</h3></article>
  </section>`;
}

function renderRunsHero(page: FoundationPage): string {
  const replayRuns = sectionData(page, 'replay_runs');
  const backtestRuns = sectionData(page, 'backtest_runs');
  const replayItems = Array.isArray(replayRuns?.runs) ? replayRuns.runs : [];
  const backtestItems = Array.isArray(backtestRuns?.runs) ? backtestRuns.runs : [];

  return `<section class="metric-strip">
    <article><p>Replay Runs</p><h3>${safeNumber(replayItems.length)}</h3></article>
    <article><p>Backtest Runs</p><h3>${safeNumber(backtestItems.length)}</h3></article>
    <article><p>Replay API</p><h3>${statusBadge(String(replayRuns?.status ?? 'unknown'))}</h3></article>
    <article><p>Backtest API</p><h3>${statusBadge(String(backtestRuns?.status ?? 'unknown'))}</h3></article>
    <article><p>Page Scope</p><h3>Cross-Mode</h3></article>
  </section>`;
}

function renderTradesHero(page: FoundationPage): string {
  const sources = sectionData(page, 'trade_sources');
  return `<section class="metric-strip">
    <article><p>Replay Sources</p><h3>${safeNumber(sources?.replayRunsAvailable)}</h3></article>
    <article><p>Backtest Sources</p><h3>${safeNumber(sources?.backtestRunsAvailable)}</h3></article>
    <article><p>Replay Detail</p><h3>${escapeHtml(String(sources?.replayDetailEndpointTemplate ?? '/api/replay/{runId}'))}</h3></article>
    <article><p>Backtest Detail</p><h3>${escapeHtml(String(sources?.backtestDetailEndpointTemplate ?? '/api/backtests/{runId}'))}</h3></article>
    <article><p>Status</p><h3>${statusBadge('review_ready')}</h3></article>
  </section>`;
}

function renderSafetyHero(page: FoundationPage): string {
  const modeState = sectionData(page, 'safety_mode');
  const safetyState = sectionData(page, 'safety_state');
  const safety = safetyState && typeof safetyState.safety === 'object' && safetyState.safety !== null
    ? (safetyState.safety as Record<string, unknown>)
    : undefined;

  return `<section class="metric-strip">
    <article><p>Mode</p><h3>${statusBadge(String(modeState?.mode ?? 'paper'))}</h3></article>
    <article><p>Venue</p><h3>${escapeHtml(String(modeState?.venue ?? 'mock'))}</h3></article>
    <article><p>Health</p><h3>${statusBadge(String(safety?.healthStatus ?? modeState?.status ?? 'unknown'))}</h3></article>
    <article><p>Control</p><h3>${statusBadge(String(safety?.controlState ?? 'normal'))}</h3></article>
    <article><p>Recovery</p><h3>${statusBadge(String(safety?.recoveryState ?? 'idle'))}</h3></article>
  </section>`;
}

function renderControlRail(path: string): string {
  if (path === '/replay') {
    return `<section class="command-rail">
      <h3>Replay Command Rail</h3>
      <div class="actions-grid">
        <form class="api-form" data-endpoint="/api/replay" data-method="POST">
          <label>Create Run</label>
          <input name="datasetId" placeholder="dataset-btc-1m" />
          <input name="profileCode" placeholder="GROWTH_HUNTER" />
          <input name="timeframe" placeholder="1m" />
          <button type="submit">Create</button>
        </form>
        <form class="api-form" data-endpoint="/api/replay/{runId}/control" data-method="POST">
          <label>Control Run</label>
          <input name="runId" placeholder="run id" required />
          <select name="type">
            <option value="play">play</option>
            <option value="pause">pause</option>
            <option value="step">step</option>
            <option value="jump_to_index">jump_to_index</option>
            <option value="jump_to_timestamp">jump_to_timestamp</option>
            <option value="set_speed">set_speed</option>
            <option value="reset">reset</option>
          </select>
          <input name="steps" placeholder="steps" />
          <input name="barIndex" placeholder="barIndex" />
          <input name="timestamp" placeholder="timestamp" />
          <input name="speed" placeholder="speed" />
          <button type="submit">Send</button>
        </form>
      </div>
    </section>`;
  }

  if (path === '/backtest') {
    return `<section class="command-rail">
      <h3>Backtest Launch Rail</h3>
      <form class="api-form inline" data-endpoint="/api/backtests" data-method="POST">
        <input name="datasetId" placeholder="dataset-btc-1m" required />
        <input name="profileCode" placeholder="PROP_HUNTER" required />
        <input name="timeframe" placeholder="1m" required />
        <input name="symbols" placeholder="BTCUSDT,EURUSD" required />
        <input name="initialBalance" placeholder="10000" />
        <input name="slippageBps" placeholder="5" />
        <input name="commissionBps" placeholder="4" />
        <button type="submit">Launch Backtest</button>
      </form>
    </section>`;
  }

  if (path === '/live') {
    return `<section class="command-rail danger">
      <h3>Emergency Visibility Rail</h3>
      <p>Web runtime is visibility-only; worker remains authoritative for real emergency execution.</p>
      <form class="api-form inline" data-endpoint="/api/live/emergency" data-method="POST">
        <select name="command">
          <option value="acknowledge_incident">acknowledge_incident</option>
          <option value="cancel_all_orders">cancel_all_orders</option>
          <option value="flatten_positions">flatten_positions</option>
          <option value="disable_live_mode">disable_live_mode</option>
        </select>
        <button type="submit">Send Visibility Command</button>
      </form>
    </section>`;
  }

  if (path === '/safety') {
    return `<section class="command-rail danger">
      <h3>Safety Visibility Rail</h3>
      <p>Safety lockout and incident context are read-first. Emergency command endpoint remains visibility-only from web runtime.</p>
      <form class="api-form inline" data-endpoint="/api/live/emergency" data-method="POST">
        <select name="command">
          <option value="acknowledge_incident">acknowledge_incident</option>
          <option value="cancel_all_orders">cancel_all_orders</option>
          <option value="flatten_positions">flatten_positions</option>
          <option value="disable_live_mode">disable_live_mode</option>
        </select>
        <button type="submit">Submit Visibility Command</button>
      </form>
    </section>`;
  }

  return '';
}

function renderTableFromRuns(items: unknown[]): string {
  const rows = items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .slice(0, 12)
    .map((row) => `<tr>
      <td>${escapeHtml(String(row.runId ?? '—'))}</td>
      <td>${statusBadge(String(row.status ?? 'unknown'))}</td>
      <td>${escapeHtml(String(row.profileCode ?? '—'))}</td>
      <td>${escapeHtml(String(row.timeframe ?? '—'))}</td>
      <td class="num">${safeNumber(row.totalTrades)}</td>
      <td class="num">${safeNumber(row.netPnl)}</td>
    </tr>`)
    .join('');

  if (!rows) {
    return '<p class="muted">No runs available.</p>';
  }

  return `<table>
    <thead><tr><th>Run</th><th>Status</th><th>Profile</th><th>TF</th><th>Trades</th><th>Net PnL</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPanels(page: FoundationPage): string {
  if (page.path === '/replay' || page.path === '/backtest') {
    const runs = sectionData(page, 'runs');
    const items = Array.isArray(runs?.items) ? runs.items : [];

    return `<section class="panel-grid two-col">
      <article class="panel">
        <header><h3>${escapeHtml(page.path === '/replay' ? 'Run Console' : 'Run Analyzer')}</h3><p>Operational table with current summaries.</p></header>
        ${renderTableFromRuns(items)}
      </article>
      <article class="panel">
        <header><h3>${escapeHtml(page.path === '/replay' ? 'Diagnostics + Notes' : 'Defaults + Notes')}</h3><p>Execution-safe guidance from current branch capabilities.</p></header>
        ${page.sections.slice(1).map((s) => `<div class="divider"><h4>${escapeHtml(s.title)}</h4>${renderJsonBlock(s.data)}</div>`).join('')}
      </article>
    </section>`;
  }

  if (page.path === '/live') {
    const orders = sectionData(page, 'orders');
    const positions = sectionData(page, 'positions');
    const incidents = sectionData(page, 'incidents');

    return `<section class="panel-grid three-col">
      <article class="panel"><header><h3>Orders</h3><p>Open orders snapshot.</p></header>${renderJsonBlock(orders ?? {})}</article>
      <article class="panel"><header><h3>Positions</h3><p>Open positions snapshot.</p></header>${renderJsonBlock(positions ?? {})}</article>
      <article class="panel"><header><h3>Incidents</h3><p>Latest incident context.</p></header>${renderJsonBlock(incidents ?? {})}</article>
    </section>
    <section class="panel-grid two-col">${page.sections
      .filter((section) => !['orders', 'positions', 'incidents', 'venue_summary'].includes(section.key))
      .map((section) => `<article class="panel"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`)
      .join('')}</section>`;
  }

  if (page.path === '/runs') {
    const replayRuns = sectionData(page, 'replay_runs');
    const backtestRuns = sectionData(page, 'backtest_runs');
    const replayItems = Array.isArray(replayRuns?.runs) ? replayRuns.runs : [];
    const backtestItems = Array.isArray(backtestRuns?.runs) ? backtestRuns.runs : [];
    return `<section class="panel-grid two-col">
      <article class="panel">
        <header><h3>Replay Run Inventory</h3><p>Recent replay run summaries.</p></header>
        ${renderTableFromRuns(replayItems)}
      </article>
      <article class="panel">
        <header><h3>Backtest Run Inventory</h3><p>Recent backtest run summaries.</p></header>
        ${renderTableFromRuns(backtestItems)}
      </article>
    </section>
    <section class="panel-grid two-col">${page.sections.slice(2).map((section) => `<article class="panel"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>`;
  }

  if (page.path === '/trades') {
    return `<section class="panel-grid two-col">${page.sections.map((section) => `<article class="panel"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>`;
  }

  if (page.path === '/safety') {
    return `<section class="panel-grid three-col">${page.sections.slice(0, 3).map((section) => `<article class="panel"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>
    <section class="panel-grid two-col">${page.sections.slice(3).map((section) => `<article class="panel"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>`;
  }

  return `<section class="panel-grid two-col">${page.sections.map((section) => `<article class="panel" id="${escapeHtml(section.key)}">
      <header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>
      ${renderJsonBlock(section.data)}
    </article>`).join('')}</section>`;
}

function renderPagePayload(path: string, payload: unknown): string {
  const page = asPage(payload);
  if (!page) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hashi Bot Console</title>
    <style>body{font-family:ui-sans-serif,system-ui;margin:2rem;background:#0b1020;color:#f8fafc}a{color:#93c5fd}</style>
  </head>
  <body>
    <h1>Page unavailable</h1>
    <p>The requested path could not be rendered.</p>
    ${renderJsonBlock(payload)}
  </body>
</html>`;
  }

  const hero = page.path === '/replay'
    ? renderReplayHero(page)
    : page.path === '/backtest'
      ? renderBacktestHero(page)
      : page.path === '/live'
        ? renderLiveHero(page)
        : page.path === '/trades'
          ? renderTradesHero(page)
          : page.path === '/runs'
            ? renderRunsHero(page)
            : page.path === '/safety'
              ? renderSafetyHero(page)
        : page.path === '/settings'
          ? renderSettingsHero(page)
          : renderOverviewHero(page);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: linear-gradient(180deg, #070a12 0%, #0a1020 55%, #090f1d 100%);
        color: #e8efff;
      }
      .shell { max-width: 1500px; margin: 0 auto; padding: 1rem 1.1rem 2rem; }
      .command-bar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 1rem;
        align-items: center;
        border: 1px solid #263145;
        border-radius: 14px;
        background: linear-gradient(120deg, rgba(8,12,22,.98), rgba(11,20,38,.93));
        padding: .9rem 1rem;
        box-shadow: 0 10px 35px rgba(0,0,0,.35);
      }
      .title h1 { margin: 0; font-size: 1.3rem; letter-spacing: .01em; }
      .title p { margin: .35rem 0 0; color: #9fb0d2; font-size: .9rem; }
      nav { display: flex; flex-wrap: wrap; gap: .45rem; }
      .nav-link { text-decoration: none; color: #c5d6fb; border: 1px solid #2f3f61; background: #0f1729; border-radius: 9px; padding: .42rem .7rem; font-size: .85rem; }
      .nav-link.active { border-color: #3d7fff; background: #173160; color: #f4f8ff; }
      .meta-row { margin: .8rem 0 1rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; }
      .readiness { color:#a8b9dd; font-size:.84rem; }
      .metric-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: .65rem;
        margin-bottom: .9rem;
      }
      .metric-strip article {
        border: 1px solid #283550;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(13,20,36,.95), rgba(9,16,29,.96));
        padding: .7rem .85rem;
      }
      .metric-strip p { margin: 0; color: #90a3cb; font-size: .74rem; text-transform: uppercase; letter-spacing: .08em; }
      .metric-strip h3 { margin: .42rem 0 0; font-size: 1.22rem; line-height: 1.2; }
      .badge { display:inline-flex; align-items:center; border-radius:999px; padding:.18rem .55rem; font-size:.72rem; border:1px solid transparent; letter-spacing:.04em; text-transform:uppercase; }
      .badge.good { background:#0f2e24; color:#48d79f; border-color:#1f6f54; }
      .badge.warn { background:#35260f; color:#f8bf63; border-color:#7a5520; }
      .badge.bad { background:#37181d; color:#ff8f9d; border-color:#7e3140; }
      .badge.neutral { background:#1e273a; color:#b7c8e8; border-color:#3a4d73; }
      .command-rail {
        margin-bottom: 1rem;
        border: 1px solid #2a3a58;
        border-radius: 12px;
        background: rgba(10,18,32,.95);
        padding: .75rem .85rem;
      }
      .command-rail.danger { border-color: #704042; background: rgba(30, 13, 16, .6); }
      .command-rail h3 { margin: 0 0 .3rem; font-size: .98rem; }
      .command-rail p { margin: 0 0 .6rem; color:#a3b3d2; font-size:.86rem; }
      .actions-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:.7rem; }
      .api-form { display:flex; flex-wrap:wrap; gap:.45rem; align-items:center; border:1px solid #253552; border-radius:10px; padding:.55rem; background:#0e1729; }
      .api-form.inline { border:none; padding:0; background:transparent; }
      .api-form label { width:100%; color:#afc0e2; font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; }
      input, select, button {
        background:#0a1222; color:#dbe8ff; border:1px solid #2d3f63; border-radius:8px; padding:.45rem .52rem; font:inherit; font-size:.84rem;
      }
      button { background:#1a3c7a; border-color:#3e6ec4; font-weight:600; cursor:pointer; }
      .panel-grid { display:grid; gap:.75rem; }
      .panel-grid.two-col { grid-template-columns:repeat(auto-fit,minmax(350px,1fr)); }
      .panel-grid.three-col { grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
      .panel {
        border: 1px solid #293754;
        background: linear-gradient(180deg, rgba(13,20,35,.95), rgba(8,15,26,.96));
        border-radius: 12px;
        overflow: hidden;
      }
      .panel header { padding: .75rem .85rem; border-bottom:1px solid #22324f; }
      .panel h3 { margin:0; font-size:1rem; }
      .panel h4 { margin:.4rem 0; font-size:.9rem; color:#ccd9f3; }
      .panel header p { margin:.34rem 0 0; color:#8fa4ca; font-size:.84rem; }
      .divider { padding:.65rem .85rem; border-top:1px solid #1f2b44; }
      .json {
        margin: 0;
        padding: .78rem .9rem;
        background: #060d19;
        color: #b6c8ec;
        overflow: auto;
        max-height: 430px;
        font-size: .75rem;
        line-height: 1.45;
      }
      table { width:100%; border-collapse:collapse; font-size:.82rem; }
      th, td { padding:.55rem .62rem; border-bottom:1px solid #1f2f4b; text-align:left; }
      th { color:#93abd5; text-transform:uppercase; letter-spacing:.06em; font-size:.72rem; background:#0a1426; position:sticky; top:0; }
      td.num { text-align:right; font-variant-numeric: tabular-nums; }
      .muted { color:#96a8cd; padding:.75rem .85rem; }
      .toast {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 40;
        border: 1px solid #3c588f;
        background: #0f1d38;
        border-radius: 10px;
        padding: .55rem .75rem;
        min-width: 260px;
        display: none;
      }
      @media (max-width: 900px) {
        .command-bar { grid-template-columns: 1fr; }
        .meta-row { flex-direction: column; align-items: flex-start; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="command-bar">
        <div class="title">
          <h1>${escapeHtml(page.title)}</h1>
          <p>${escapeHtml(page.subtitle)}</p>
        </div>
        <nav>${renderNavigation(path)}</nav>
      </header>
      <div class="meta-row">
        <span class="readiness">Path: ${escapeHtml(page.path)} · Readiness: ${statusBadge(page.readiness)}</span>
        <span class="readiness">Clock: ${escapeHtml(new Date().toISOString())}</span>
      </div>
      ${hero}
      ${renderControlRail(page.path)}
      ${renderPanels(page)}
    </main>
    <aside id="toast" class="toast"></aside>
    <script>
      const toast = document.getElementById('toast');
      const showToast = (message) => {
        if (!toast) return;
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3600);
      };

      const asNumberIfFinite = (value) => {
        if (value == null || value === '') return undefined;
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
      };

      for (const form of document.querySelectorAll('.api-form')) {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          let endpoint = String(form.dataset.endpoint || '/');
          const method = String(form.dataset.method || 'POST');

          const runId = data.get('runId');
          if (endpoint.includes('{runId}')) {
            endpoint = endpoint.replace('{runId}', encodeURIComponent(String(runId || '')));
            data.delete('runId');
          }

          const payload = Object.fromEntries(data.entries());
          if (payload.symbols && typeof payload.symbols === 'string') {
            payload.symbols = payload.symbols.split(',').map((item) => item.trim()).filter(Boolean);
          }

          for (const key of ['steps', 'barIndex', 'timestamp', 'speed', 'initialBalance', 'slippageBps', 'commissionBps']) {
            if (key in payload) {
              const parsed = asNumberIfFinite(payload[key]);
              if (parsed === undefined) {
                delete payload[key];
              } else {
                payload[key] = parsed;
              }
            }
          }

          try {
            const res = await fetch(endpoint, {
              method,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const body = await res.json();
            showToast('Request complete: ' + (body.status || body.error || 'ok'));
          } catch (error) {
            showToast('Request failed: ' + (error instanceof Error ? error.message : String(error)));
          }
        });
      }
    </script>
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
