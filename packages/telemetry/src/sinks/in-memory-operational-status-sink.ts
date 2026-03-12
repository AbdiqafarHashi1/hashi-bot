import type { TelemetryOperationalStatusEvent, TelemetryOperationalStatusSink } from '../types/incident-event.js';

export class InMemoryOperationalStatusSink implements TelemetryOperationalStatusSink {
  private readonly events: TelemetryOperationalStatusEvent[] = [];

  public async recordOperationalStatus(event: TelemetryOperationalStatusEvent): Promise<void> {
    this.events.push(event);
  }

  public list(): TelemetryOperationalStatusEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events.length = 0;
  }
}
