export type NodeId = string;
export type EdgeId = string;

export type ComponentType =
  | "entryPoint"
  | "cdn"
  | "loadBalancer"
  | "application"
  | "cache"
  | "database";

export interface WeightedEdge {
  edgeId: EdgeId;
  targetId: NodeId;
  weight: number;
}

export interface AcceptResult {
  accepted: number;
  queued: number;
  dropped: number;
}

export interface AbsorbResult {
  absorbed: number;
  remainder: number;
}

export type NodeStatus = "idle" | "healthy" | "degraded" | "overloaded";

export interface NodeMetricsSnapshot {
  nodeId: NodeId;
  type: ComponentType;
  currentRps: number;
  utilization: number;
  queueLength: number;
  droppedThisTick: number;
  droppedTotal: number;
  status: NodeStatus;
}

export interface EngineSnapshot {
  nodes: Record<NodeId, NodeMetricsSnapshot>;
  edgeLoads: Record<EdgeId, number>;
}

export interface EntryPointConfig {
  targetRps: number;
}

export interface CdnConfig {
  capacity: number;
  queueDepth: number;
  cacheHitRatio: number;
}

export interface LoadBalancerConfig {
  capacity: number;
  queueDepth: number;
}

export interface ApplicationConfig {
  capacity: number;
  queueDepth: number;
}

export interface CacheConfig {
  capacity: number;
  queueDepth: number;
  hitRatio: number;
}

export interface DatabaseConfig {
  capacity: number;
  queueDepth: number;
}
