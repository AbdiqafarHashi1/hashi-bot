import { getStatusTone } from './status-system.js';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderStatusBadge(value: string | undefined): string {
  const text = value ?? 'unknown';
  return `<span class="badge ${getStatusTone(value)}">${escapeHtml(text)}</span>`;
}

export function formatNumber(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function renderJson(data: unknown): string {
  return `<pre class="json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}
