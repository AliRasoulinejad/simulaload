import type { AcceptResult } from "../types";
import type { CapacityModelInterface } from "../interfaces";

export class CapacityModel implements CapacityModelInterface {
  capacity: number;
  queueDepth: number;
  private queue = 0;
  private droppedTotal = 0;

  constructor(capacity: number, queueDepth: number) {
    this.capacity = capacity;
    this.queueDepth = queueDepth;
  }

  get currentQueue(): number {
    return this.queue;
  }

  get cumulativeDropped(): number {
    return this.droppedTotal;
  }

  accept(incoming: number, deltaSeconds: number): AcceptResult {
    const incomingCount = incoming * deltaSeconds;
    const capacityCount = this.capacity * deltaSeconds;
    const totalPending = incomingCount + this.queue;
    const processedCount = Math.min(totalPending, capacityCount);
    const remainder = totalPending - processedCount;
    const queuedCount = Math.min(remainder, this.queueDepth);
    const droppedCount = remainder - queuedCount;

    this.queue = queuedCount;
    this.droppedTotal += droppedCount;

    if (deltaSeconds === 0) {
      return { accepted: 0, queued: queuedCount, dropped: 0 };
    }

    return {
      accepted: processedCount / deltaSeconds,
      queued: queuedCount / deltaSeconds,
      dropped: droppedCount / deltaSeconds,
    };
  }
}
