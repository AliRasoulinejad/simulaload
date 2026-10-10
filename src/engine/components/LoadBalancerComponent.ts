import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { WeightedSplitStrategy } from "../strategies/WeightedSplitStrategy";
import { CapacityModel } from "../models/CapacityModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { ComponentType, EdgeId, LoadBalancerConfig, NodeId, WeightedEdge } from "../types";

export class LoadBalancerComponent extends ReactiveSubscriberBase implements ConfigurableInterface<LoadBalancerConfig> {
  readonly type = "loadBalancer" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint", "cdn"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new WeightedSplitStrategy();
  private readonly capacityModelRef: CapacityModel;

  readonly nodeId: NodeId;

  constructor(nodeId: NodeId, config: LoadBalancerConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    super(capacityModel);
    this.nodeId = nodeId;
    this.capacityModelRef = capacityModel;
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  setEdgeWeight(edgeId: EdgeId, weight: number): void {
    this.registry.updateEdgeWeight(edgeId, weight);
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }

  protected onFlush(outgoing: number): void {
    this.registry.dispatch(outgoing, this.strategy);
  }

  getConfig(): LoadBalancerConfig {
    return { capacity: this.capacityModelRef.capacity, queueDepth: this.capacityModelRef.queueDepth };
  }

  setConfig(partial: Partial<LoadBalancerConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
  }
}
