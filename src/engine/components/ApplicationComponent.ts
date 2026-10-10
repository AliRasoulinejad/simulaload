import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { BroadcastStrategy } from "../strategies/BroadcastStrategy";
import { CapacityModel } from "../models/CapacityModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { ApplicationConfig, ComponentType, EdgeId, NodeId, WeightedEdge } from "../types";

export class ApplicationComponent extends ReactiveSubscriberBase implements ConfigurableInterface<ApplicationConfig> {
  readonly type = "application" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint", "cdn", "loadBalancer"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new BroadcastStrategy();
  private readonly capacityModelRef: CapacityModel;

  constructor(public readonly nodeId: NodeId, config: ApplicationConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    super(capacityModel);
    this.capacityModelRef = capacityModel;
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

  getConfig(): ApplicationConfig {
    return { capacity: this.capacityModelRef.capacity, queueDepth: this.capacityModelRef.queueDepth };
  }

  setConfig(partial: Partial<ApplicationConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
  }
}
