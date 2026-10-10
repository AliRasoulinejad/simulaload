import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { SingleForwardStrategy } from "../strategies/SingleForwardStrategy";
import { CapacityModel } from "../models/CapacityModel";
import { AbsorptionModel } from "../models/AbsorptionModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { CdnConfig, ComponentType, EdgeId, NodeId, WeightedEdge } from "../types";

export class CdnComponent extends ReactiveSubscriberBase implements ConfigurableInterface<CdnConfig> {
  readonly type = "cdn" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new SingleForwardStrategy();
  private readonly capacityModelRef: CapacityModel;
  private readonly absorptionModelRef: AbsorptionModel;

  readonly nodeId: NodeId;

  constructor(nodeId: NodeId, config: CdnConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    const absorptionModel = new AbsorptionModel(config.cacheHitRatio);
    super(capacityModel, absorptionModel);
    this.nodeId = nodeId;
    this.capacityModelRef = capacityModel;
    this.absorptionModelRef = absorptionModel;
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }

  protected onFlush(outgoing: number): void {
    this.registry.dispatch(outgoing, this.strategy);
  }

  getConfig(): CdnConfig {
    return {
      capacity: this.capacityModelRef.capacity,
      queueDepth: this.capacityModelRef.queueDepth,
      cacheHitRatio: this.absorptionModelRef.absorptionRatio,
    };
  }

  setConfig(partial: Partial<CdnConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
    if (partial.cacheHitRatio !== undefined) this.absorptionModelRef.absorptionRatio = partial.cacheHitRatio;
  }
}
