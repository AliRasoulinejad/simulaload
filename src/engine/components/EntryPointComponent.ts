import { DEFAULT_TICK_SECONDS } from "../constants";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { SingleForwardStrategy } from "../strategies/SingleForwardStrategy";
import type { ConfigurableInterface, LoadPublisherInterface, LoadSubscriberInterface, MetricsSnapshotInterface } from "../interfaces";
import type { EdgeId, EntryPointConfig, NodeId, NodeMetricsSnapshot, WeightedEdge } from "../types";

export class EntryPointComponent implements LoadPublisherInterface, ConfigurableInterface<EntryPointConfig>, MetricsSnapshotInterface {
  readonly type = "entryPoint" as const;
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new SingleForwardStrategy();
  private targetRps: number;
  private clockHandle: ReturnType<typeof setInterval> | null = null;
  private lastDispatchedRps = 0;

  constructor(public readonly nodeId: NodeId, config: EntryPointConfig) {
    this.targetRps = Math.max(0, config.targetRps);
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  startClock(tickSeconds: number = DEFAULT_TICK_SECONDS, onTick?: () => void): void {
    if (this.clockHandle) return;
    this.clockHandle = setInterval(() => {
      this.tick();
      onTick?.();
    }, tickSeconds * 1000);
  }

  stopClock(): void {
    if (this.clockHandle) {
      clearInterval(this.clockHandle);
      this.clockHandle = null;
    }
  }

  tick(): void {
    this.lastDispatchedRps = this.targetRps;
    this.registry.dispatch(this.targetRps, this.strategy);
  }

  getConfig(): EntryPointConfig {
    return { targetRps: this.targetRps };
  }

  setConfig(partial: Partial<EntryPointConfig>): void {
    if (partial.targetRps !== undefined) {
      this.targetRps = Math.max(0, partial.targetRps);
    }
  }

  getSnapshot(): NodeMetricsSnapshot {
    return {
      nodeId: this.nodeId,
      type: this.type,
      currentRps: this.lastDispatchedRps,
      utilization: 0,
      queueLength: 0,
      droppedThisTick: 0,
      droppedTotal: 0,
      status: this.lastDispatchedRps > 0 ? "healthy" : "idle",
    };
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }
}
