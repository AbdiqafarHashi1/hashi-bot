import type { TelemetryIncidentEvent, TelemetryIncidentSink } from '../types/incident-event.js';

export class InMemoryIncidentSink implements TelemetryIncidentSink {
  private readonly events: TelemetryIncidentEvent[] = [];

  public async record(event: TelemetryIncidentEvent): Promise<void> {
    this.events.push(event);
  }

  public list(): TelemetryIncidentEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events.length = 0;
  }
}
