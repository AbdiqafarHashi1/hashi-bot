import type { TelemetryEmergencyCommandEvent, TelemetryEmergencyCommandSink } from '../types/incident-event.js';

export class InMemoryEmergencyCommandSink implements TelemetryEmergencyCommandSink {
  private readonly events: TelemetryEmergencyCommandEvent[] = [];

  public async recordEmergencyCommand(event: TelemetryEmergencyCommandEvent): Promise<void> {
    this.events.push(event);
  }

  public list(): TelemetryEmergencyCommandEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events.length = 0;
  }
}
