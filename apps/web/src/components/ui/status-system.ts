export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

export function getStatusTone(value: string | undefined): StatusTone {
  const text = (value ?? 'unknown').toLowerCase();
  if (text.includes('ok') || text.includes('ready') || text.includes('healthy') || text.includes('allowed')) {
    return 'good';
  }
  if (text.includes('warn') || text.includes('degraded') || text.includes('paused')) {
    return 'warn';
  }
  if (text.includes('fail') || text.includes('error') || text.includes('critical') || text.includes('lock') || text.includes('kill')) {
    return 'bad';
  }
  return 'neutral';
}
