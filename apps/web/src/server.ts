import { createServer } from 'node:http';

import { getApiRoutePayload, getPagePayload } from './index.js';
import {
  createBacktestLabViewModel,
  createRunsIntelligenceViewModel,
  createTradesReviewViewModel,
  type BacktestLabViewModel,
} from './pages/control-room-view-models.js';

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



function safeCurrency(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return '—';
}

function safePercent(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toFixed(2)}%`;
  }
  return '—';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function buildFragmentLink(path: string, query: URLSearchParams, sectionKey: string): string {
  const next = new URLSearchParams(query);
  next.set('refresh', sectionKey);
  next.delete('section');
  return `${path}?${next.toString()}`;
}

function buildPaginationLinks(path: string, query: URLSearchParams, page: number, pageSize: number): { prev: string; next: string } {
  const prev = new URLSearchParams(query);
  prev.set('page', String(Math.max(1, page - 1)));
  prev.set('pageSize', String(pageSize));
  const next = new URLSearchParams(query);
  next.set('page', String(page + 1));
  next.set('pageSize', String(pageSize));
  return {
    prev: `${path}?${prev.toString()}`,
    next: `${path}?${next.toString()}`,
  };
}

function renderPaginationBar(path: string, query: URLSearchParams, pagination: { page: number; totalPages: number; pageSize: number; totalRows: number; hasPrev: boolean; hasNext: boolean; rowStart: number; rowEnd: number }): string {
  const links = buildPaginationLinks(path, query, pagination.page, pagination.pageSize);
  return `<div class="pagination-bar"><span>Rows ${escapeHtml(String(pagination.rowStart))}-${escapeHtml(String(pagination.rowEnd))} / ${escapeHtml(String(pagination.totalRows))} · page ${escapeHtml(String(pagination.page))}/${escapeHtml(String(pagination.totalPages))} · page size ${escapeHtml(String(pagination.pageSize))}</span><span class="pagination-actions"><a class="nav-link ${pagination.hasPrev ? '' : 'disabled'}" href="${escapeHtml(links.prev)}">Previous</a><a class="nav-link ${pagination.hasNext ? '' : 'disabled'}" href="${escapeHtml(links.next)}">Next</a></span></div>`;
}

function renderOperatorStatusStrip(page: FoundationPage): string {
  const modeSection = sectionData(page, 'venue_summary') ?? sectionData(page, 'safety_mode');
  const workerHealth = sectionData(page, 'health') ?? sectionData(page, 'safety_health');
  const profile = asRecord(sectionData(page, 'launch_context') ?? sectionData(page, 'query_state'));
  const symbols = asRecord(sectionData(page, 'active_run') ?? sectionData(page, 'trade_sources'));
  return `<section class="operator-strip"><article><p>Mode</p><h3>${statusBadge(String(modeSection?.mode ?? 'unavailable'))}</h3></article><article><p>Worker Health</p><h3>${statusBadge(String(workerHealth?.status ?? 'worker heartbeat not surfaced'))}</h3></article><article><p>Active Symbol</p><h3>${escapeHtml(String(symbols?.symbolCode ?? symbols?.selectedRunId ?? 'not selected'))}</h3></article><article><p>Active Profile</p><h3>${escapeHtml(String(profile?.profileCode ?? profile?.mode ?? 'not selected'))}</h3></article><article><p>Dataset / TF</p><h3>${escapeHtml(String(profile?.datasetId ?? 'dataset n/a'))} · ${escapeHtml(String(profile?.timeframe ?? 'tf n/a'))}</h3></article><article><p>Run ID</p><h3>${escapeHtml(String(profile?.selectedRunId ?? symbols?.selectedRunId ?? 'n/a'))}</h3></article></section>`;
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

function toneBadge(tone: 'good' | 'warn' | 'bad' | 'neutral'): string {
  return `<span class="badge ${tone}">${escapeHtml(tone)}</span>`;
}

function renderBacktestHero(page: FoundationPage): string {
  const vm = createBacktestLabViewModel(page as unknown as Record<string, unknown>);
  const context = vm.commandContext;
  const metricCards = vm.heroMetrics.map((metric) => `<article class="metric-card">
    <p>${escapeHtml(metric.label)}</p>
    <h3>${escapeHtml(metric.value)}</h3>
    <div class="metric-meta">${toneBadge(metric.tone ?? 'neutral')} ${statusBadge(metric.availability.status)}${metric.availability.reason ? `<span class="muted">${escapeHtml(metric.availability.reason)}</span>` : ''}</div>
  </article>`).join('');

  return `<section class="command-context">
    <article><p>Dataset</p><h3>${escapeHtml(context.dataset)}</h3></article>
    <article><p>Symbols</p><h3>${escapeHtml(context.symbols)}</h3></article>
    <article><p>Timeframe</p><h3>${escapeHtml(context.timeframe)}</h3></article>
    <article><p>Profile</p><h3>${escapeHtml(context.profile)}</h3></article>
    <article><p>Selected Run</p><h3>${escapeHtml(context.selectedRun)}</h3></article>
    <article><p>Run Count</p><h3>${escapeHtml(context.runCount)}</h3></article>
    <article><p>Status</p><h3>${statusBadge(context.status)}</h3></article>
  </section>
  <section class="metric-strip research">${metricCards}</section>`;
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
  const vm = createRunsIntelligenceViewModel(page as unknown as Record<string, unknown>);
  return `<section class="metric-strip">
    <article><p>Replay Runs</p><h3>${escapeHtml(vm.context.replayRunCount)}</h3></article>
    <article><p>Backtest Runs</p><h3>${escapeHtml(vm.context.backtestRunCount)}</h3></article>
    <article><p>Total Surfaced</p><h3>${escapeHtml(vm.context.totalRuns)}</h3></article>
    <article><p>Latest Run Timestamp</p><h3>${escapeHtml(vm.context.latestRunTs)}</h3></article>
    <article><p>Page Status</p><h3>${statusBadge(vm.context.status)}</h3></article>
  </section>`;
}

function renderTradesHero(page: FoundationPage): string {
  const vm = createTradesReviewViewModel(page as unknown as Record<string, unknown>);
  return `<section class="metric-strip">
    <article><p>Replay Sources</p><h3>${escapeHtml(vm.context.replaySources)}</h3></article>
    <article><p>Backtest Sources</p><h3>${escapeHtml(vm.context.backtestSources)}</h3></article>
    <article><p>Selected Source</p><h3>${escapeHtml(vm.context.selectedSourceMode)}</h3></article>
    <article><p>Selected Run</p><h3>${escapeHtml(vm.context.selectedRunId)}</h3></article>
    <article><p>Review Status</p><h3>${statusBadge(vm.context.reviewStatus)}</h3></article>
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


function renderReplayCockpit(page: FoundationPage): string {
  const runs = asRecord(sectionData(page, 'runs'));
  const datasets = asRecord(sectionData(page, 'datasets'));
  const activeRun = asRecord(sectionData(page, 'active_run'));
  const runPayload = asRecord(activeRun?.run);
  const replayState = asRecord(runPayload?.replayState);

  const runItems = asArray(runs?.items).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  const datasetItems = asArray(datasets?.datasets).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  const openTrades = asArray(replayState?.openTrades).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  const latestSignals = asArray(replayState?.latestSignals).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  const timeline = asArray(runPayload?.timeline).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  const tradeSummaries = asArray(runPayload?.tradeSummaries).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);

  const active = runItems[0] ?? {};
  const openPosition = openTrades[0];
  const closedSummary = asRecord(replayState?.closedTradesSummary);

  const latestTs = replayState?.cursor && typeof replayState.cursor === 'object' ? asRecord(replayState.cursor)?.timestamp : undefined;
  const timelineTimes = timeline.map((event) => Number(event.ts)).filter((v) => Number.isFinite(v));
  const minTs = timelineTimes.length > 0 ? Math.min(...timelineTimes) : undefined;
  const maxTs = timelineTimes.length > 0 ? Math.max(...timelineTimes) : undefined;
  const equity = Number(closedSummary?.netPnl ?? active.netPnl ?? 0);
  const goalTarget = 500;
  const goalProgress = Math.max(0, Math.min(100, (equity / goalTarget) * 100));
  const maxEquity = Math.max(goalTarget, equity, 0);
  const equityHeight = maxEquity > 0 ? Math.max(4, (equity / maxEquity) * 100) : 0;
  const goalHeight = maxEquity > 0 ? (goalTarget / maxEquity) * 100 : 100;
  const drawdownRiskPct = typeof active.maxDrawdownPct === 'number' ? active.maxDrawdownPct : undefined;

  const timelineRows = timeline.slice(-12).reverse().map((event) => {
    const eventType = String(event.type ?? 'event');
    const when = typeof event.ts === 'number' ? new Date(event.ts).toISOString() : '—';
    return `<li><span class="timeline-dot"></span><div><p class="timeline-title">${escapeHtml(eventType.replaceAll('_', ' '))}</p><p class="timeline-meta">${escapeHtml(when)} · bar ${escapeHtml(String(event.barIndex ?? '—'))}</p></div></li>`;
  }).join('');

  const signalRows = ['biasAlign', 'confirmationStrength', 'pullbackQuality', 'regimeDetection', 'decisionOutcome']
    .map((key) => {
      const signal = latestSignals[0];
      const val = signal ? signal[key] : undefined;
      const text = val === undefined ? 'unavailable' : String(val);
      return `<div class="diag-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(text)}</strong></div>`;
    }).join('');

  const tradesRows = tradeSummaries
    .map((trade) => {
      const net = typeof trade.netPnl === 'number' ? trade.netPnl : undefined;
      const result = net === undefined ? 'open' : net >= 0 ? 'win' : 'loss';
      return `<tr>
        <td>${escapeHtml(typeof trade.closedAtTs === 'number' ? new Date(trade.closedAtTs).toISOString() : typeof trade.openedAtTs === 'number' ? new Date(trade.openedAtTs).toISOString() : '—')}</td>
        <td>${escapeHtml(String(trade.side ?? '—'))}</td>
        <td class="num">${safeNumber(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.position && asRecord(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.position)?.qty)}</td>
        <td class="num">${safeNumber(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.position && asRecord(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.position)?.entryPrice)}</td>
        <td class="num">${safeNumber(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.position && asRecord(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.position)?.closedAtTs)}</td>
        <td class="num">${safeCurrency(trade.netPnl)}</td>
        <td class="num">${safeCurrency(asRecord((openTrades.find((t) => t.tradeId === trade.tradeId) ?? {}))?.totalFees)}</td>
        <td>${statusBadge(result)}</td>
        <td>${escapeHtml(String(trade.closeReason ?? '—'))}</td>
      </tr>`;
    })
    .join('');

  return `<section class="replay-cockpit">
    <article class="panel command-center">
      <header><h3>Replay Command Center</h3><p>Mission control rail for replay orchestration.</p></header>
      <div class="rail-grid">
        <label>Dataset<select name="datasetId" form="replay-create-form">${datasetItems.map((dataset) => `<option value="${escapeHtml(String(dataset.id ?? ''))}">${escapeHtml(String(dataset.name ?? dataset.id ?? 'dataset'))}</option>`).join('') || '<option value="">No datasets</option>'}</select></label>
        <label>Symbol<select name="symbolCodes" form="replay-create-form">${datasetItems.map((dataset) => `<option value="${escapeHtml(String(dataset.symbolCode ?? ''))}">${escapeHtml(String(dataset.symbolCode ?? ''))}</option>`).join('') || '<option value="">—</option>'}</select></label>
        <label>Timeframe<input name="timeframe" form="replay-create-form" value="${escapeHtml(String(active.timeframe ?? '1m'))}" /></label>
        <label>Profile<input name="profileCode" form="replay-create-form" value="${escapeHtml(String(active.profileCode ?? 'GROWTH_HUNTER'))}" /></label>
        <label>Clock<input value="${escapeHtml(typeof latestTs === 'number' ? new Date(latestTs).toISOString() : new Date().toISOString())}" readonly /></label>
        <label>Replay Speed<input name="replaySpeed" form="replay-create-form" value="${escapeHtml(String(replayState?.playbackSpeed ?? 1))}" /></label>
      </div>
      <div class="rail-actions">
        <form id="replay-create-form" class="api-form inline" data-endpoint="/api/replay" data-method="POST"><button type="submit">Start</button></form>
        <form class="api-form inline" data-endpoint="/api/replay/{runId}/control" data-method="POST"><input type="hidden" name="runId" value="${escapeHtml(String(active.runId ?? ''))}" /><input type="hidden" name="type" value="pause" /><button type="submit">Pause</button></form>
        <form class="api-form inline" data-endpoint="/api/replay/{runId}/control" data-method="POST"><input type="hidden" name="runId" value="${escapeHtml(String(active.runId ?? ''))}" /><input type="hidden" name="type" value="play" /><button type="submit">Resume</button></form>
        <form class="api-form inline" data-endpoint="/api/replay/{runId}/control" data-method="POST"><input type="hidden" name="runId" value="${escapeHtml(String(active.runId ?? ''))}" /><input type="hidden" name="type" value="step" /><input type="hidden" name="steps" value="1" /><button type="submit">Step</button></form>
        <form class="api-form inline" data-endpoint="/api/replay/{runId}/control" data-method="POST"><input type="hidden" name="runId" value="${escapeHtml(String(active.runId ?? ''))}" /><input type="hidden" name="type" value="reset" /><button type="submit">Reset</button></form>
      </div>
    </article>

    <section class="metric-strip hero-metrics">
      <article><p>Equity</p><h3>${safeCurrency(equity)}</h3></article>
      <article><p>Realized PnL</p><h3>${safeCurrency(closedSummary?.netPnl)}</h3></article>
      <article><p>Unrealized PnL</p><h3>${safeCurrency(asRecord(openPosition?.position)?.unrealizedPnl)}</h3></article>
      <article><p>Drawdown</p><h3>${safePercent(drawdownRiskPct)}</h3></article>
      <article><p>Goal Progress</p><h3>${safePercent(goalProgress)}</h3></article>
      <article><p>Fees</p><h3>${safeCurrency(asArray(openTrades).reduce<number>((sum, trade) => sum + (typeof asRecord(trade)?.totalFees === 'number' ? Number(asRecord(trade)?.totalFees) : 0), 0))}</h3></article>
    </section>

    <section class="cockpit-grid">
      <article class="panel equity-panel">
        <header><h3>Equity Curve</h3><p>Live run equity vs target goal line.</p></header>
        <div class="zoom-row"><button class="ghost" type="button">1x</button><button class="ghost" type="button">5x</button><button class="ghost" type="button">All</button></div>
        <div class="equity-chart" role="img" aria-label="Equity curve chart">
          <div class="axis y">PnL</div>
          <div class="axis x">Time (${escapeHtml(minTs && maxTs ? `${new Date(minTs).toISOString()} → ${new Date(maxTs).toISOString()}` : 'unavailable')})</div>
          <div class="equity-bar" style="height:${equityHeight}%"></div>
          <div class="goal-line" style="bottom:${goalHeight}%">Goal</div>
        </div>
      </article>

      <article class="panel reasoning-panel">
        <header><h3>Signal / Reasoning</h3><p>Diagnostic frame from available runtime signal payloads.</p></header>
        <div class="diag-grid">${signalRows}</div>
      </article>

      <aside class="side-stack">
        <article class="panel">
          <header><h3>Open Position Inspector</h3><p>Current open trade attributes.</p></header>
          ${openPosition ? `<div class="position-grid">
            <div><span>Symbol</span><strong>${escapeHtml(String(openPosition.symbolCode ?? '—'))}</strong></div>
            <div><span>Side</span><strong>${statusBadge(String(openPosition.side ?? '—'))}</strong></div>
            <div><span>Entry</span><strong>${safeNumber(asRecord(openPosition.position)?.entryPrice)}</strong></div>
            <div><span>Stop</span><strong>${safeNumber(asRecord(openPosition.position)?.stopPrice)}</strong></div>
            <div><span>Take Profit</span><strong>${safeNumber(asRecord(openPosition.position)?.tp1Price)}</strong></div>
            <div><span>Quantity</span><strong>${safeNumber(asRecord(openPosition.position)?.qty)}</strong></div>
            <div><span>Unrealized PnL</span><strong>${safeCurrency(asRecord(openPosition.position)?.unrealizedPnl)}</strong></div>
          </div>` : '<p class="muted">No open position in the active replay state.</p>'}
        </article>

        <article class="panel timeline-panel">
          <header><h3>Activity Timeline</h3><p>Recent runtime events.</p></header>
          ${timelineRows ? `<ol class="timeline">${timelineRows}</ol>` : '<p class="muted">No timeline events available yet.</p>'}
        </article>
      </aside>
    </section>

    <article class="panel goal-panel">
      <header><h3>Goal / Evaluation</h3><p>Target progression and drawdown risk posture.</p></header>
      <div class="goal-grid">
        <div><p>Progress toward target</p><h3>${safePercent(goalProgress)}</h3></div>
        <div><p>Drawdown risk</p><h3>${safePercent(drawdownRiskPct)}</h3></div>
        <div><p>Status</p><h3>${statusBadge(goalProgress >= 100 && (drawdownRiskPct ?? 0) < 10 ? 'pass' : 'in_progress')}</h3></div>
      </div>
    </article>

    <article class="panel">
      <header><h3>Trade History</h3><p>Closed/open trade summaries from replay detail.</p></header>
      <div class="trade-filters"><span>${statusBadge('all')}</span><span>${statusBadge('wins')}</span><span>${statusBadge('losses')}</span></div>
      ${tradesRows ? `<table><thead><tr><th>Time</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Fees</th><th>Result</th><th>Reason</th></tr></thead><tbody>${tradesRows}</tbody></table>` : '<p class="muted">No trade history yet for this run.</p>'}
    </article>
  </section>`;
}


function buildMiniSparkline(points: Array<{ x: number; y: number }>, stroke: string): string {
  if (points.length === 0) {
    return '<p class="muted">No series points available from runtime payload.</p>';
  }

  const width = 640;
  const height = 180;
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const ySpan = maxY - minY || 1;
  const xSpan = points.length - 1 || 1;

  const path = points
    .map((point, index) => {
      const x = (index / xSpan) * width;
      const y = height - ((point.y - minY) / ySpan) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-sparkline" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${stroke}" stroke-width="2"/></svg>`;
}

function renderBacktestLabPanels(page: FoundationPage): string {
  const vm: BacktestLabViewModel = createBacktestLabViewModel(page as unknown as Record<string, unknown>);
  const runRows = vm.runRows.slice(0, 120).map((row) => `<tr>
    <td><code>${escapeHtml(row.runId)}</code></td>
    <td>${escapeHtml(row.dataset)}</td>
    <td>${escapeHtml(row.profile)}</td>
    <td>${statusBadge(row.status)}</td>
    <td>${escapeHtml(row.createdAt)}</td>
    <td>${escapeHtml(row.completedAt)}</td>
    <td class="num">${escapeHtml(row.netPnl)}</td>
    <td class="num">${escapeHtml(row.winRate)}</td>
    <td class="num">${escapeHtml(row.trades)}</td>
    <td><a href="/api/backtests/${encodeURIComponent(row.runId)}">detail</a> · <a href="/replay">replay</a></td>
  </tr>`).join('');

  const tradeRows = vm.tradeRows.slice(0, 160).map((row) => `<tr>
    <td>${escapeHtml(row.tradeId)}</td><td>${escapeHtml(row.symbol)}</td><td>${statusBadge(row.side)}</td><td>${escapeHtml(row.setup)}</td><td>${statusBadge(row.state)}</td><td>${escapeHtml(row.openedAt)}</td><td>${escapeHtml(row.closedAt)}</td><td class="num">${escapeHtml(row.netPnl)}</td><td>${escapeHtml(row.reason)}</td>
  </tr>`).join('');

  const evaluationRows = vm.evaluation.map((item) => `<div class="diag-row"><span>${escapeHtml(item.title)}</span><strong>${escapeHtml(item.value)}</strong>${toneBadge(item.tone)}${item.availability.reason ? `<span class="muted">${escapeHtml(item.availability.reason)}</span>` : ''}</div>`).join('');

  return `<section class="panel-grid two-col">
    <article class="panel">
      <header><h3>Performance Panel</h3><p>Equity and drawdown layers prepared via normalized chart view-models.</p></header>
      <div class="chart-wrap">
        <p class="chart-label">${escapeHtml(vm.equitySeries.label)} · ${statusBadge(vm.equitySeries.availability.status)}</p>
        ${buildMiniSparkline(vm.equitySeries.points, '#36d399')}
      </div>
      <div class="chart-wrap">
        <p class="chart-label">${escapeHtml(vm.drawdownSeries.label)} · ${statusBadge(vm.drawdownSeries.availability.status)}</p>
        ${buildMiniSparkline(vm.drawdownSeries.points, '#f59e0b')}
      </div>
      <div class="trade-filters"><span>${statusBadge('1W')}</span><span>${statusBadge('1M')}</span><span>${statusBadge('All')}</span></div>
    </article>
    <article class="panel">
      <header><h3>Distribution / Outcomes</h3><p>Derived from selected run trade rows only.</p></header>
      <div class="diag-grid">
        <div class="diag-row"><span>Wins / Losses</span><strong>${escapeHtml(vm.distribution.winsLosses)}</strong></div>
        <div class="diag-row"><span>Average Win</span><strong>${escapeHtml(vm.distribution.avgWin)}</strong></div>
        <div class="diag-row"><span>Average Loss</span><strong>${escapeHtml(vm.distribution.avgLoss)}</strong></div>
        <div class="diag-row"><span>Best Trade</span><strong>${escapeHtml(vm.distribution.bestTrade)}</strong></div>
        <div class="diag-row"><span>Worst Trade</span><strong>${escapeHtml(vm.distribution.worstTrade)}</strong></div>
        <div class="diag-row"><span>Trade Count by Reason</span><strong>${escapeHtml(vm.distribution.reasonSummary)}</strong><span class="muted">${escapeHtml(vm.distribution.pnlDistributionStatus.reason ?? '')}</span></div>
      </div>
    </article>
  </section>

  <section class="panel-grid single-col">
    <article class="panel">
      <header><h3>Run Analyzer Table</h3><p>Large-table ready normalized run rows with cross-navigation actions.</p></header>
      ${runRows ? `<table><thead><tr><th>Run ID</th><th>Dataset</th><th>Profile</th><th>Status</th><th>Created</th><th>Completed</th><th>Net PnL</th><th>Win Rate</th><th>Trades</th><th>Actions</th></tr></thead><tbody>${runRows}</tbody></table>` : '<p class="muted">No run rows available yet.</p>'}
    </article>
  </section>

  <section class="panel-grid two-col">
    <article class="panel">
      <header><h3>Trade Review Bridge</h3><p>Bridge from backtest into trade and replay workflows.</p></header>
      <div class="diag-grid">
        <div class="diag-row"><span>Trades Review</span><strong><a href="/trades">Open in Trades Review</a></strong></div>
        <div class="diag-row"><span>Replay Handoff</span><strong><a href="/replay">Inspect in Replay</a></strong></div>
        <div class="diag-row"><span>Operator Guidance</span><strong>${escapeHtml(vm.commandContext.selectedRun === 'none selected' ? 'Select or launch a run to unlock trade/evaluation details.' : 'Run selected. Use analyzer rows to pivot into detail/replay.')}</strong></div>
      </div>
      <header><h3>Trade Sample (Selected Run)</h3><p>First rows from normalized trade review model.</p></header>
      ${tradeRows ? `<table><thead><tr><th>Trade</th><th>Symbol</th><th>Side</th><th>Setup</th><th>State</th><th>Opened</th><th>Closed</th><th>Net PnL</th><th>Reason</th></tr></thead><tbody>${tradeRows}</tbody></table>` : '<p class="muted">No trade rows surfaced by selected run payload.</p>'}
    </article>
    <article class="panel">
      <header><h3>Evaluation / Prop Readiness</h3><p>Explicitly runtime-bound evaluation summary.</p></header>
      <div class="diag-grid">${evaluationRows}</div>
    </article>
  </section>`;
}

function renderControlRail(path: string): string {
  if (path === '/backtest') {
    const vm = createBacktestLabViewModel((globalThis as { __lastPagePayload?: unknown }).__lastPagePayload as Record<string, unknown> | undefined ?? { path });
    return `<section class="command-rail">
      <h3>Backtest Launch Rail</h3>
      <p>Research launch workflow uses runtime-confirmed API fields only.</p>
      <form class="api-form" data-endpoint="/api/backtests" data-method="POST">
        <label>Dataset<input name="datasetId" placeholder="${escapeHtml(vm.launchDefaults.datasetPlaceholder)}" required /></label>
        <label>Profile<input name="profileCode" placeholder="${escapeHtml(vm.launchDefaults.profilePlaceholder)}" required /></label>
        <label>Timeframe<input name="timeframe" placeholder="${escapeHtml(vm.launchDefaults.timeframePlaceholder)}" required /></label>
        <label>Symbols (comma-separated)<input name="symbols" placeholder="${escapeHtml(vm.launchDefaults.symbolsPlaceholder)}" required /></label>
        <label>Initial Balance<input name="initialBalance" placeholder="${escapeHtml(vm.launchDefaults.initialBalancePlaceholder)}" /></label>
        <label>Slippage Bps<input name="slippageBps" placeholder="${escapeHtml(vm.launchDefaults.slippageBpsPlaceholder)}" /></label>
        <label>Commission Bps<input name="commissionBps" placeholder="${escapeHtml(vm.launchDefaults.commissionBpsPlaceholder)}" /></label>
        <label>Max Concurrent Positions<input name="maxConcurrentPositions" placeholder="${escapeHtml(vm.launchDefaults.maxConcurrentPositionsPlaceholder)}" /></label>
        <button type="submit">Launch Backtest Run</button>
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

function renderPanels(page: FoundationPage, query: URLSearchParams = new URLSearchParams()): string {
  if (page.path === '/replay') {
    return renderReplayCockpit(page);
  }

  if (page.path === '/backtest') {
    return renderBacktestLabPanels(page);
  }

  if (page.path === '/live') {
    const orders = sectionData(page, 'orders');
    const positions = sectionData(page, 'positions');
    const incidents = sectionData(page, 'incidents');
    const liveContext = sectionData(page, 'operator_context');
    const focus = String(liveContext?.sectionFocus ?? 'summary');

    return `<section data-section="positions" class="panel-grid single-col">
      <article class="panel ${focus === 'positions' ? 'panel-focus' : ''}"><header><h3>Open Positions</h3><p>No active positions when empty.</p></header>${positions && Array.isArray((positions as Record<string, unknown>).positions) && ((positions as Record<string, unknown>).positions as unknown[]).length===0 ? '<p class="muted">No active positions</p>' : renderJsonBlock(positions ?? {})}</article>
    </section>
    <section data-section="orders" class="panel-grid single-col">
      <article class="panel ${focus === 'orders' ? 'panel-focus' : ''}"><header><h3>Open Orders</h3><p>No orders in flight when empty.</p></header>${orders && Array.isArray((orders as Record<string, unknown>).orders) && ((orders as Record<string, unknown>).orders as unknown[]).length===0 ? '<p class="muted">No orders in flight</p>' : renderJsonBlock(orders ?? {})}</article>
    </section>
    <section data-section="incidents" class="panel-grid single-col">
      <article class="panel ${focus === 'incidents' ? 'panel-focus' : ''}"><header><h3>Incidents</h3><p>Worker heartbeat not surfaced is treated as degraded monitoring.</p></header>${renderJsonBlock(incidents ?? {})}</article>
    </section>
    <section data-section="health" class="panel-grid two-col">${page.sections
      .filter((section) => !['orders', 'positions', 'incidents', 'venue_summary'].includes(section.key))
      .map((section) => `<article class="panel"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`)
      .join('')}</section>`;
  }

  if (page.path === '/runs') {
    const vm = createRunsIntelligenceViewModel(page as unknown as Record<string, unknown>);
    const metricCards = vm.metrics.map((metric) => `<article class="metric-card"><p>${escapeHtml(metric.label)}</p><h3>${escapeHtml(metric.value)}</h3><div class="metric-meta">${statusBadge(metric.availability.status)}</div></article>`).join('');
    const rows = vm.inventoryRows.slice(0, 300).map((row) => `<tr>
      <td>${escapeHtml(row.runId)}</td>
      <td>${statusBadge(row.mode)}</td>
      <td>${escapeHtml(row.dataset)}</td>
      <td>${escapeHtml(row.profile)}</td>
      <td>${escapeHtml(row.timeframe)}</td>
      <td>${escapeHtml(row.symbols)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${escapeHtml(row.createdAt)}</td>
      <td>${escapeHtml(row.completedAt)}</td>
      <td class="num">${escapeHtml(row.totalTrades)}</td>
      <td class="num">${escapeHtml(row.netPnl)}</td>
      <td class="num">${escapeHtml(row.winRate)}</td>
      <td>${row.quickActions.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join(' · ')}</td>
    </tr>`).join('');

    const sortDir = vm.queryState.sort.dir;
    const nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    const sortHref = (field: string) => {
      const q = new URLSearchParams(query);
      q.set('sort', field);
      q.set('dir', nextDir);
      return `/runs?${q.toString()}`;
    };

    return `<section data-section="hero-metrics" class="metric-strip research">${metricCards}</section>
    <section data-section="run-inventory" class="panel-grid single-col">
      <article class="panel">
        <header><h3>Run Inventory Table</h3><p>Cross-mode run table normalized for replay/backtest comparison.</p></header>
        ${rows ? `<table><thead><tr><th>Run ID</th><th>Mode</th><th>Dataset</th><th>Profile</th><th>TF</th><th>Symbols</th><th>Status</th><th><a href="${escapeHtml(sortHref('createdAt'))}">Created</a></th><th><a href="${escapeHtml(sortHref('completedAt'))}">Completed</a></th><th><a href="${escapeHtml(sortHref('tradeCount'))}">Trades</a></th><th><a href="${escapeHtml(sortHref('netPnl'))}">Net PnL</a></th><th><a href="${escapeHtml(sortHref('winRate'))}">Win Rate</a></th><th>Quick Actions</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No run inventory rows surfaced.</p>'}
        ${renderPaginationBar('/runs', query, vm.pagination)}
      </article>
    </section>
    <section data-section="run-comparison" class="panel-grid two-col">
      <article class="panel"><header><h3>Run Comparison</h3><p>Best/worst and latest surfaced run references.</p></header><div class="diag-grid">
        <div class="diag-row"><span>Best Run</span><strong>${escapeHtml(vm.comparison.bestRun)}</strong></div>
        <div class="diag-row"><span>Worst Run</span><strong>${escapeHtml(vm.comparison.worstRun)}</strong></div>
        <div class="diag-row"><span>Highest Win Rate</span><strong>${escapeHtml(vm.comparison.highestWinRate)}</strong></div>
        <div class="diag-row"><span>Highest Trade Count</span><strong>${escapeHtml(vm.comparison.highestTradeCount)}</strong></div>
      </div></article>
      <article class="panel"><header><h3>Run Health / Completion</h3><p>Completion mix and dispatch guidance.</p></header><div class="diag-grid">
        <div class="diag-row"><span>Completed vs Pending</span><strong>${escapeHtml(vm.healthPanel.completedVsPending)}</strong></div>
        <div class="diag-row"><span>Replay vs Backtest</span><strong>${escapeHtml(vm.healthPanel.replayVsBacktest)}</strong></div>
        <div class="diag-row"><span>Guidance</span><strong>${escapeHtml(vm.healthPanel.emptyGuidance)}</strong></div>
      </div></article>
    </section>
    <section data-section="run-health" class="panel-grid single-col"><article class="panel"><header><h3>Dispatch Summary</h3><p>Mode/run selection and next operator step.</p></header><div class="diag-grid"><div class="diag-row"><span>Mode</span><strong>${escapeHtml(vm.dispatchSummary.selectedMode)}</strong></div><div class="diag-row"><span>Selected Run</span><strong>${escapeHtml(vm.dispatchSummary.selectedRun)}</strong></div><div class="diag-row"><span>Inventory</span><strong>${escapeHtml(vm.dispatchSummary.inventoryState)}</strong></div><div class="diag-row"><span>Next</span><strong>${escapeHtml(vm.dispatchSummary.nextAction)}</strong></div></div></article></section>`;
  }

  if (page.path === '/trades') {
    const vm = createTradesReviewViewModel(page as unknown as Record<string, unknown>);
    const metricCards = Object.values(vm.metrics).map((metric) => `<article class="metric-card"><p>${escapeHtml(metric.label)}</p><h3>${escapeHtml(metric.value)}</h3><div class="metric-meta">${statusBadge(metric.availability.status)} ${metric.availability.reason ? `<span class="muted">${escapeHtml(metric.availability.reason)}</span>` : ''}</div></article>`).join('');
    const tradeRows = vm.tradeRows.slice(0, 400).map((row) => `<tr>
      <td>${statusBadge(row.result.label)}</td><td>${escapeHtml(row.side)}</td><td>${escapeHtml(row.symbol)}</td>
      <td class="num">${escapeHtml(row.qty)}</td><td class="num">${escapeHtml(row.entry)}</td><td class="num">${escapeHtml(row.exit)}</td>
      <td class="num">${escapeHtml(row.tpSl)}</td><td class="num">${escapeHtml(row.pnlNet)}</td><td class="num">${escapeHtml(row.fees)}</td>
      <td>${escapeHtml(row.reason)}</td><td>${escapeHtml(row.opened)}</td><td>${escapeHtml(row.closed)}</td><td>${escapeHtml(row.sourceMode)}:${escapeHtml(row.sourceRun)}</td>
      <td>${row.quickActions.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join(' · ')}</td>
    </tr>`).join('');

    const sortDir = vm.queryState.sort.dir;
    const nextDir = sortDir === 'asc' ? 'desc' : 'asc';
    const sortHref = (field: string) => {
      const q = new URLSearchParams(query);
      q.set('sort', field);
      q.set('dir', nextDir);
      return `/trades?${q.toString()}`;
    };

    return `<section data-section="hero-metrics" class="metric-strip research">${metricCards}</section>
    <section data-section="investigation-rail" class="panel-grid two-col">
      <article class="panel"><header><h3>Source Selection / Investigation Rail</h3><p>Choose source type and pivot into run detail/replay/backtest workflows.</p></header><div class="diag-grid">
        <div class="diag-row"><span>Selected Source Mode</span><strong>${escapeHtml(vm.context.selectedSourceMode)}</strong></div>
        <div class="diag-row"><span>Selected Run ID</span><strong>${escapeHtml(vm.context.selectedRunId)}</strong></div>
        <div class="diag-row"><span>Detail Endpoint</span><strong>${escapeHtml(vm.context.selectedDetailEndpoint)}</strong></div>
      </div></article>
      <article class="panel"><header><h3>Outcome / Distribution</h3><p>Wins/losses and reason frequency summary from surfaced trade rows.</p></header><div class="diag-grid">
        <div class="diag-row"><span>Wins / Losses</span><strong>${escapeHtml(vm.outcome.winsVsLosses)}</strong></div>
        <div class="diag-row"><span>Reason Frequency</span><strong>${escapeHtml(vm.outcome.reasonFrequency)}</strong></div>
      </div></article>
    </section>
    <section data-section="trade-table" class="panel-grid single-col"><article class="panel"><header><h3>Trade Investigation Table</h3><p>Normalized cross-source rows with sorting + pagination foundation.</p></header>
      ${tradeRows ? `<table><thead><tr><th><a href="${escapeHtml(sortHref('result'))}">Result</a></th><th>Side</th><th><a href="${escapeHtml(sortHref('symbol'))}">Symbol</a></th><th>Qty</th><th>Entry</th><th>Exit</th><th>TP/SL</th><th><a href="${escapeHtml(sortHref('pnl'))}">PnL Net</a></th><th>Fees</th><th>Reason</th><th><a href="${escapeHtml(sortHref('opened'))}">Opened</a></th><th><a href="${escapeHtml(sortHref('closed'))}">Closed</a></th><th>Source Run</th><th>Quick Actions</th></tr></thead><tbody>${tradeRows}</tbody></table>` : '<p class="muted">No trade rows surfaced from selected replay/backtest run details.</p>'}
      ${renderPaginationBar('/trades', query, vm.pagination)}
    </article></section>
    <section data-section="trade-inspector" class="panel-grid two-col">
      <article class="panel sticky-panel"><header><h3>Trade Inspector</h3><p>Selected/default trade lifecycle detail bridge.</p></header><div class="diag-grid">
        <div class="diag-row"><span>Symbol / Side</span><strong>${escapeHtml(vm.inspector.symbol)} · ${escapeHtml(vm.inspector.side)}</strong></div>
        <div class="diag-row"><span>Entry / Exit</span><strong>${escapeHtml(vm.inspector.entry)} / ${escapeHtml(vm.inspector.exit)}</strong></div>
        <div class="diag-row"><span>PnL / Fees</span><strong>${escapeHtml(vm.inspector.pnl)} / ${escapeHtml(vm.inspector.fees)}</strong></div>
      </div></article>
      <article data-section="outcome-panel" class="panel"><header><h3>Timeline / Lifecycle Bridge</h3><p>Workflow bridge to replay/backtest/run detail debugging.</p></header><div class="diag-grid">
        <div class="diag-row"><span>Workflow</span><strong>${escapeHtml(vm.timelineBridge.title)}</strong></div>
        ${vm.timelineBridge.notes.map((note) => `<p class="muted">• ${escapeHtml(note)}</p>`).join('')}
      </div></article>
    </section>`;
  }

  if (page.path === '/safety') {
    const safetyContext = sectionData(page, 'safety_query_context');
    const focus = String(safetyContext?.view ?? 'summary');
    const classFor = (key: string) => (focus === 'incidents' && key.includes('incident')) || (focus === 'lockout' && key.includes('safety_state')) ? 'panel-focus' : '';
    return `<section data-section="safety-summary" class="panel-grid three-col">${page.sections.slice(0, 3).map((section) => `<article class="panel ${classFor(section.key)}"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>
    <section data-section="incidents" class="panel-grid two-col">${page.sections.slice(3, 5).map((section) => `<article class="panel ${classFor(section.key)}"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>
    <section data-section="lockouts" class="panel-grid single-col">${page.sections.slice(5).map((section) => `<article class="panel ${classFor(section.key)}"><header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>${renderJsonBlock(section.data)}</article>`).join('')}</section>`;
  }

  return `<section class="panel-grid two-col">${page.sections.map((section) => `<article class="panel" id="${escapeHtml(section.key)}">
      <header><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.description)}</p></header>
      ${renderJsonBlock(section.data)}
    </article>`).join('')}</section>`;
}

function renderPagePayload(path: string, payload: unknown, query: URLSearchParams = new URLSearchParams()): string {
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

  (globalThis as { __lastPagePayload?: unknown }).__lastPagePayload = page;

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
      .command-context { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:.6rem; margin:1rem 0; }
      .command-context article,.metric-card{ background:#0b1426; border:1px solid #22324f; border-radius:10px; padding:.75rem; }
      .metric-strip.research{ grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
      .metric-meta{ display:flex; flex-wrap:wrap; gap:.35rem; align-items:center; }
      .single-col{ grid-template-columns:1fr; }
      .chart-wrap{ border:1px solid #22324f; background:#091325; border-radius:10px; padding:.65rem; margin-bottom:.75rem; }
      .chart-sparkline{ width:100%; height:180px; display:block; }
      .chart-label{ margin:.2rem 0 .5rem; color:#a7bbdc; font-size:.82rem; }
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
      .sticky-panel { position: sticky; top: 1rem; align-self: start; }
      .panel-focus { border-color:#4c74be; box-shadow:0 0 0 1px rgba(76,116,190,.45); }
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

      .replay-cockpit { display:grid; gap:.75rem; }
      .command-center .rail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:.55rem; margin-top:.45rem; }
      .command-center label { display:flex; flex-direction:column; gap:.3rem; color:#a9bcde; font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; }
      .command-center .rail-actions { margin-top:.7rem; display:flex; flex-wrap:wrap; gap:.45rem; }
      .hero-metrics .metric-value { font-size:1.3rem; }
      .cockpit-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(280px,.9fr); gap:.75rem; align-items:start; }
      .equity-panel .zoom-row { display:flex; gap:.4rem; padding: .65rem .85rem 0; }
      button.ghost { background:#101b31; border-color:#2d4269; }
      .equity-chart { position:relative; margin:.7rem .85rem .85rem; height:260px; border:1px solid #283a5c; border-radius:10px; background:linear-gradient(180deg,#091426,#0a1527); padding:1rem 1rem 2rem 2.1rem; }
      .equity-chart .axis { position:absolute; color:#7f95be; font-size:.72rem; }
      .equity-chart .axis.y { left:.5rem; top:1rem; writing-mode:vertical-rl; transform:rotate(180deg); }
      .equity-chart .axis.x { left:2.1rem; bottom:.55rem; }
      .equity-bar { position:absolute; left:3rem; right:2rem; bottom:2rem; background:linear-gradient(180deg, rgba(76,149,255,.82), rgba(48,108,203,.38)); border:1px solid #4d78bc; border-bottom:none; border-radius:8px 8px 0 0; min-height:2px; }
      .goal-line { position:absolute; left:2.2rem; right:1rem; border-top:1px dashed #d6a95d; color:#e5be7a; font-size:.72rem; padding-top:.2rem; }
      .diag-grid { padding:.65rem .85rem .85rem; display:grid; gap:.5rem; }
      .diag-row { display:flex; justify-content:space-between; gap:.5rem; border-bottom:1px solid #1d2c47; padding-bottom:.34rem; }
      .diag-row span { color:#9db0d4; text-transform:capitalize; }
      .side-stack { display:grid; gap:.75rem; }
      .position-grid { padding:.65rem .85rem .85rem; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.5rem .8rem; }
      .position-grid span { display:block; color:#8fa5cf; font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; }
      .position-grid strong { font-size:.96rem; }
      .timeline { list-style:none; margin:0; padding:.75rem .85rem .85rem; display:grid; gap:.6rem; }
      .timeline li { display:grid; grid-template-columns:14px 1fr; gap:.5rem; align-items:start; }
      .timeline-dot { width:10px; height:10px; border-radius:50%; margin-top:.28rem; background:#4d76bb; box-shadow:0 0 0 3px rgba(77,118,187,.2); }
      .timeline-title { margin:0; text-transform:capitalize; }
      .timeline-meta { margin:.18rem 0 0; color:#8da3cb; font-size:.76rem; }
      .goal-grid { padding:.75rem .85rem .9rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.55rem; }
      .goal-grid p { margin:0; color:#90a6ce; font-size:.76rem; text-transform:uppercase; letter-spacing:.06em; }
      .goal-grid h3 { margin:.35rem 0 0; }
      .trade-filters { padding:0 .85rem .55rem; display:flex; gap:.35rem; }
      .pagination-bar { display:flex; justify-content:space-between; gap:.6rem; align-items:center; padding:.6rem .85rem; border-top:1px solid #1f2f4b; color:#9fb1d6; font-size:.82rem; }
      .pagination-actions { display:flex; gap:.45rem; }
      .nav-link.disabled { pointer-events:none; opacity:.5; }
      .operator-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:.6rem; margin:.7rem 0 .9rem; }
      .operator-strip article { border:1px solid #2a3b5d; border-radius:10px; background:#0a1528; padding:.55rem .7rem; }
      .operator-strip p { margin:0; color:#8fa4ca; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; }
      .operator-strip h3 { margin:.35rem 0 0; font-size:.95rem; }

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
      @media (max-width: 1200px) { .cockpit-grid { grid-template-columns:1fr; } }
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
      ${renderOperatorStatusStrip(page)}
      ${hero}
      ${renderControlRail(page.path)}
      ${renderPanels(page, query)}
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

          for (const key of ['steps', 'barIndex', 'timestamp', 'speed', 'replaySpeed', 'initialBalance', 'slippageBps', 'commissionBps', 'maxConcurrentPositions']) {
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

function renderControlRoomSection(path: string, sectionKey: string, payload: unknown, query: URLSearchParams): string | undefined {
  const page = asPage(payload);
  if (!page) return undefined;

  const supported: Record<string, Set<string>> = {
    '/trades': new Set(['hero-metrics', 'investigation-rail', 'trade-table', 'trade-inspector', 'outcome-panel']),
    '/runs': new Set(['hero-metrics', 'run-inventory', 'run-comparison', 'run-health']),
    '/replay': new Set(['command-rail', 'metrics-strip', 'open-position', 'reasoning-panel', 'timeline', 'trades-table']),
    '/backtest': new Set(['hero-metrics', 'launch-rail', 'performance-panel', 'outcomes-panel', 'run-analyzer']),
    '/live': new Set(['positions', 'orders', 'health', 'incidents']),
    '/safety': new Set(['safety-summary', 'incidents', 'lockouts']),
  };

  if (!supported[path]?.has(sectionKey)) {
    return undefined;
  }

  const html = renderPanels(page, query);
  const exact = new RegExp(`<section[^>]*data-section="${sectionKey}"[^>]*>[\\s\\S]*?<\/section>`);
  const match = html.match(exact);
  if (match) return match[0];

  return html;
}

const server = createServer(async (req, res) => {
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const query = url.searchParams;

  try {
    const body = method === 'POST' ? await readRequestBody(req) : undefined;

    if (path.startsWith('/api/')) {
      const payload = await getApiRoutePayload(path, method, body);
      const statusCode = payload && typeof payload === 'object' && 'error' in payload ? 400 : 200;
      res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    const payload = await getPagePayload(path, query);
    const statusCode = payload && typeof payload === 'object' && 'error' in payload ? 404 : 200;
    const sectionKey = query.get('refresh')?.trim() ?? query.get('section')?.trim();
    const fragment = sectionKey ? renderControlRoomSection(path, sectionKey, payload, query) : undefined;
    res.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fragment ?? renderPagePayload(path, payload, query));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_error';
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'request_failed', message }));
  }
});

server.listen(port, host, () => {
  console.log(`@hashi-bot/web listening on http://localhost:${port}`);
});
