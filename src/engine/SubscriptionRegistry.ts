import type { ComponentType, EdgeId, NodeId, WeightedEdge } from "./types";
import type { DispatchStrategyInterface, LoadPublisherInterface, LoadSubscriberInterface } from "./interfaces";

interface SubscriberEntry {
  subscriber: LoadSubscriberInterface;
  edge: WeightedEdge;
}

export class SubscriptionRegistry implements LoadPublisherInterface {
  private subscribers = new Map<NodeId, SubscriberEntry>();
  private lastDispatch = new Map<EdgeId, number>();

  constructor(
    private readonly publisherNodeId: NodeId,
    private readonly publisherType: ComponentType,
  ) {}

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    if (!subscriber.canAcceptUpstream(this.publisherType)) {
      throw new Error(`${subscriber.nodeId} cannot accept upstream of type ${this.publisherType}`);
    }
    this.subscribers.set(subscriber.nodeId, { subscriber, edge });
    subscriber.registerUpstream(this.publisherNodeId);
  }

  unsubscribe(subscriberId: NodeId): void {
    const entry = this.subscribers.get(subscriberId);
    if (!entry) return;
    entry.subscriber.unregisterUpstream(this.publisherNodeId);
    this.subscribers.delete(subscriberId);
    this.lastDispatch.delete(entry.edge.edgeId);
  }

  updateEdgeWeight(edgeId: EdgeId, weight: number): void {
    for (const entry of this.subscribers.values()) {
      if (entry.edge.edgeId === edgeId) entry.edge.weight = weight;
    }
  }

  dispatch(outgoing: number, strategy: DispatchStrategyInterface): void {
    const entries = Array.from(this.subscribers.values());
    if (entries.length === 0) return;

    const edges = entries.map((entry) => entry.edge);
    const outputs = strategy.computeOutputs(outgoing, edges);

    for (const entry of entries) {
      const amount = outputs.get(entry.edge.edgeId) ?? 0;
      this.lastDispatch.set(entry.edge.edgeId, amount);
      entry.subscriber.onLoadReceived(amount, this.publisherNodeId);
    }
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.lastDispatch;
  }
}
