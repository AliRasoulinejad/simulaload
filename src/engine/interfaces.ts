import type {
  AbsorbResult,
  AcceptResult,
  ComponentType,
  EdgeId,
  NodeId,
  NodeMetricsSnapshot,
  WeightedEdge,
} from "./types";

export interface CapacityModelInterface {
  readonly capacity: number;
  readonly queueDepth: number;
  readonly currentQueue: number;
  accept(incoming: number, deltaSeconds: number): AcceptResult;
}

export interface AbsorptionModelInterface {
  readonly absorptionRatio: number;
  absorb(incoming: number): AbsorbResult;
}

export interface DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number>;
}

export interface ConfigurableInterface<TConfig> {
  getConfig(): TConfig;
  setConfig(partial: Partial<TConfig>): void;
}

export interface MetricsSnapshotInterface {
  getSnapshot(): NodeMetricsSnapshot;
}

export interface LoadSubscriberInterface {
  readonly nodeId: NodeId;
  readonly type: ComponentType;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType>;
  canAcceptUpstream(publisherType: ComponentType): boolean;
  registerUpstream(publisherId: NodeId): void;
  unregisterUpstream(publisherId: NodeId): void;
  onLoadReceived(amount: number, fromNodeId: NodeId): void;
}

export interface LoadPublisherInterface {
  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void;
  unsubscribe(subscriberId: NodeId): void;
}
