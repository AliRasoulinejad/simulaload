import { DEFAULT_TICK_SECONDS } from "./constants";
import type { CapacityModelInterface, AbsorptionModelInterface, LoadSubscriberInterface, MetricsSnapshotInterface } from "./interfaces";
import type { ComponentType, NodeId, NodeMetricsSnapshot, NodeStatus } from "./types";

export abstract class ReactiveSubscriberBase implements LoadSubscriberInterface, MetricsSnapshotInterface {
  abstract readonly nodeId: NodeId;
  abstract readonly type: ComponentType;
  abstract readonly allowedUpstreamTypes: ReadonlySet<ComponentType>;

  private expectedUpstreamCount = 0;
  private buffer = 0;
  private arrivals = 0;
  private lastAcceptedRps = 0;
  private lastDroppedThisTick = 0;
  private droppedTotal = 0;

  protected constructor(
    protected readonly capacityModel?: CapacityModelInterface,
    protected readonly absorptionModel?: AbsorptionModelInterface,
  ) {}

  canAcceptUpstream(publisherType: ComponentType): boolean {
    return this.allowedUpstreamTypes.has(publisherType);
  }

  registerUpstream(_publisherId: NodeId): void {
    this.expectedUpstreamCount += 1;
  }

  unregisterUpstream(_publisherId: NodeId): void {
    this.expectedUpstreamCount = Math.max(0, this.expectedUpstreamCount - 1);
  }

  onLoadReceived(amount: number, _fromNodeId: NodeId): void {
    this.buffer += amount;
    this.arrivals += 1;
    const expected = Math.max(this.expectedUpstreamCount, 1);
    if (this.arrivals >= expected) {
      const incoming = this.buffer;
      this.buffer = 0;
      this.arrivals = 0;
      this.processTick(incoming, DEFAULT_TICK_SECONDS);
    }
  }

  private processTick(incoming: number, deltaSeconds: number): void {
    let afterCapacity = incoming;
    let dropped = 0;

    if (this.capacityModel) {
      const result = this.capacityModel.accept(incoming, deltaSeconds);
      afterCapacity = result.accepted;
      dropped = result.dropped;
    }

    this.lastAcceptedRps = afterCapacity;
    this.lastDroppedThisTick = dropped;
    this.droppedTotal += dropped;

    let outgoing = afterCapacity;
    if (this.absorptionModel) {
      outgoing = this.absorptionModel.absorb(afterCapacity).remainder;
    }

    this.onFlush(outgoing);
  }

  protected abstract onFlush(outgoing: number): void;

  getSnapshot(): NodeMetricsSnapshot {
    const capacity = this.capacityModel?.capacity;
    const utilization = !capacity || capacity <= 0 ? 0 : this.lastAcceptedRps / capacity;
    return {
      nodeId: this.nodeId,
      type: this.type,
      currentRps: this.lastAcceptedRps,
      utilization,
      queueLength: this.capacityModel?.currentQueue ?? 0,
      droppedThisTick: this.lastDroppedThisTick,
      droppedTotal: this.droppedTotal,
      status: this.computeStatus(utilization),
    };
  }

  private computeStatus(utilization: number): NodeStatus {
    if (this.lastAcceptedRps === 0 && this.lastDroppedThisTick === 0) return "idle";
    if (this.lastDroppedThisTick > 0) return "overloaded";
    if (utilization >= 0.8) return "degraded";
    return "healthy";
  }
}
