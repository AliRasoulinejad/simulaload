import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { SingleForwardStrategy } from "../strategies/SingleForwardStrategy";
import { CapacityModel } from "../models/CapacityModel";
import { AbsorptionModel } from "../models/AbsorptionModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { CacheConfig, ComponentType, EdgeId, NodeId, WeightedEdge } from "../types";

export class CacheComponent extends ReactiveSubscriberBase implements ConfigurableInterface<CacheConfig> {
  readonly type = "cache" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["application"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new SingleForwardStrategy();
  private readonly capacityModelRef: CapacityModel;
  private readonly absorptionModelRef: AbsorptionModel;

  constructor(public readonly nodeId: NodeId, config: CacheConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    const absorptionModel = new AbsorptionModel(config.hitRatio);
    super(capacityModel, absorptionModel);
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

  getConfig(): CacheConfig {
    return {
      capacity: this.capacityModelRef.capacity,
      queueDepth: this.capacityModelRef.queueDepth,
      hitRatio: this.absorptionModelRef.absorptionRatio,
    };
  }

  setConfig(partial: Partial<CacheConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
    if (partial.hitRatio !== undefined) this.absorptionModelRef.absorptionRatio = partial.hitRatio;
  }
}
