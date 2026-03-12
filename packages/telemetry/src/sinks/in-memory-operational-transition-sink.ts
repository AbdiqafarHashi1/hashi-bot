import type { TelemetryOperationalTransitionEvent, TelemetryOperationalTransitionSink } from '../types/incident-event.js';

export class InMemoryOperationalTransitionSink implements TelemetryOperationalTransitionSink {
  private readonly events: TelemetryOperationalTransitionEvent[] = [];

  public async recordTransition(event: TelemetryOperationalTransitionEvent): Promise<void> {
    this.events.push(event);
  }

  public list(): TelemetryOperationalTransitionEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events.length = 0;
  }
}
