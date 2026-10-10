import { EntryPointComponent } from "./components/EntryPointComponent";
import { CdnComponent } from "./components/CdnComponent";
import { LoadBalancerComponent } from "./components/LoadBalancerComponent";
import { ApplicationComponent } from "./components/ApplicationComponent";
import { CacheComponent } from "./components/CacheComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";
import type { LoadPublisherInterface, LoadSubscriberInterface } from "./interfaces";
import { ReactiveSubscriberBase } from "./ReactiveSubscriberBase";
import type { EdgeId, EngineSnapshot, NodeId } from "./types";

export type AnyComponent =
  | EntryPointComponent
  | CdnComponent
  | LoadBalancerComponent
  | ApplicationComponent
  | CacheComponent
  | DatabaseComponent;

interface EdgeRecord {
  sourceId: NodeId;
  targetId: NodeId;
  weight: number;
}

function isPublisher(component: AnyComponent): component is AnyComponent & LoadPublisherInterface {
  return typeof (component as Partial<LoadPublisherInterface>).subscribe === "function";
}

function isSubscriber(component: AnyComponent): component is AnyComponent & LoadSubscriberInterface {
  return typeof (component as Partial<LoadSubscriberInterface>).onLoadReceived === "function";
}

export class SimulationEngine {
  private nodes = new Map<NodeId, AnyComponent>();
  private edgeRecords = new Map<EdgeId, EdgeRecord>();
  private entryPointId: NodeId | null = null;
  private listeners = new Set<() => void>();
  private cachedSnapshot: EngineSnapshot | null = null;

  addNode(component: AnyComponent): void {
    if (component.type === "entryPoint") {
      if (this.entryPointId !== null) {
        throw new Error("Only one Entry Point is allowed per graph");
      }
      this.entryPointId = component.nodeId;
    }
    this.nodes.set(component.nodeId, component);
    this.recomputeExpectedUpstreamCounts();
    this.notify();
  }

  removeNode(nodeId: NodeId): void {
    for (const [edgeId, record] of Array.from(this.edgeRecords.entries())) {
      if (record.sourceId === nodeId || record.targetId === nodeId) {
        this.removeEdge(edgeId);
      }
    }
    if (nodeId === this.entryPointId) {
      this.getEntryPoint()?.stopClock();
      this.entryPointId = null;
    }
    this.nodes.delete(nodeId);
    this.recomputeExpectedUpstreamCounts();
    this.notify();
  }

  /**
   * Empties the engine in place (keeping object identity, so existing
   * `subscribe()` listeners stay valid). Stops the clock first.
   */
  clear(): void {
    this.pause();
    for (const nodeId of Array.from(this.nodes.keys())) {
      this.removeNode(nodeId);
    }
    this.entryPointId = null;
    this.notify();
  }

  addEdge(sourceId: NodeId, targetId: NodeId, edgeId: EdgeId, weight = 100): void {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) throw new Error("Unknown node referenced in edge");
    if (this.edgeRecords.has(edgeId)) throw new Error(`An edge with id ${edgeId} already exists`);
    if (this.hasEdgeBetween(sourceId, targetId)) {
      throw new Error(`An edge from ${sourceId} to ${targetId} already exists`);
    }
    if (!isPublisher(source)) throw new Error(`${source.type} cannot have outgoing edges`);
    if (this.violatesSingleOutgoingEdgeRule(source)) {
      throw new Error(`${source.type} only supports a single outgoing edge`);
    }
    if (!isSubscriber(target)) throw new Error(`${target.type} cannot have incoming edges`);
    if (!target.canAcceptUpstream(source.type)) {
      throw new Error(`${target.type} cannot accept upstream of type ${source.type}`);
    }
    if (this.wouldCreateCycle(sourceId, targetId)) {
      throw new Error("Adding this edge would create a cycle");
    }
    source.subscribe(target, { edgeId, targetId, weight });
    this.edgeRecords.set(edgeId, { sourceId, targetId, weight });
    this.recomputeExpectedUpstreamCounts();
    this.notify();
  }

  removeEdge(edgeId: EdgeId): void {
    const record = this.edgeRecords.get(edgeId);
    if (!record) return;
    const source = this.nodes.get(record.sourceId);
    if (source && isPublisher(source)) source.unsubscribe(record.targetId);
    this.edgeRecords.delete(edgeId);
    this.recomputeExpectedUpstreamCounts();
    this.notify();
  }

  canConnect(sourceId: NodeId, targetId: NodeId): boolean {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) return false;
    if (!isPublisher(source) || !isSubscriber(target)) return false;
    if (this.hasEdgeBetween(sourceId, targetId)) return false;
    if (this.violatesSingleOutgoingEdgeRule(source)) return false;
    if (!target.canAcceptUpstream(source.type)) return false;
    return !this.wouldCreateCycle(sourceId, targetId);
  }

  private hasEdgeBetween(sourceId: NodeId, targetId: NodeId): boolean {
    for (const record of this.edgeRecords.values()) {
      if (record.sourceId === sourceId && record.targetId === targetId) return true;
    }
    return false;
  }

  /**
   * Sets every subscriber's expected per-tick arrival count to the number of
   * its upstream edges whose source is reachable from the Entry Point. An
   * unreachable upstream never ticks, so counting it would make the
   * subscriber wait across several real ticks and flush an inflated amount.
   */
  private recomputeExpectedUpstreamCounts(): void {
    const reachable = new Set<NodeId>();
    if (this.entryPointId !== null && this.nodes.has(this.entryPointId)) {
      const stack: NodeId[] = [this.entryPointId];
      while (stack.length > 0) {
        const current = stack.pop() as NodeId;
        if (reachable.has(current)) continue;
        reachable.add(current);
        for (const record of this.edgeRecords.values()) {
          if (record.sourceId === current) stack.push(record.targetId);
        }
      }
    }

    const counts = new Map<NodeId, number>();
    for (const record of this.edgeRecords.values()) {
      if (reachable.has(record.sourceId)) {
        counts.set(record.targetId, (counts.get(record.targetId) ?? 0) + 1);
      }
    }

    for (const component of this.nodes.values()) {
      if (component instanceof ReactiveSubscriberBase) {
        component.setExpectedUpstreamCount(counts.get(component.nodeId) ?? 0);
      }
    }
  }

  private hasExistingOutgoingEdge(sourceId: NodeId): boolean {
    return Array.from(this.edgeRecords.values()).some((record) => record.sourceId === sourceId);
  }

  private violatesSingleOutgoingEdgeRule(source: AnyComponent): boolean {
    return (
      (source.type === "entryPoint" || source.type === "cdn" || source.type === "cache") &&
      this.hasExistingOutgoingEdge(source.nodeId)
    );
  }

  private wouldCreateCycle(sourceId: NodeId, targetId: NodeId): boolean {
    if (sourceId === targetId) return true;
    const stack: NodeId[] = [targetId];
    const visited = new Set<NodeId>();
    while (stack.length > 0) {
      const current = stack.pop() as NodeId;
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const record of this.edgeRecords.values()) {
        if (record.sourceId === current) stack.push(record.targetId);
      }
    }
    return false;
  }

  start(): void {
    const entryPoint = this.getEntryPoint();
    entryPoint?.startClock(undefined, () => this.notify());
  }

  pause(): void {
    this.getEntryPoint()?.stopClock();
  }

  tick(): void {
    this.getEntryPoint()?.tick();
    this.notify();
  }

  private getEntryPoint(): EntryPointComponent | undefined {
    const entryPoint = this.entryPointId ? this.nodes.get(this.entryPointId) : undefined;
    return entryPoint instanceof EntryPointComponent ? entryPoint : undefined;
  }

  getSnapshot(): EngineSnapshot {
    if (this.cachedSnapshot !== null) return this.cachedSnapshot;

    const nodes: EngineSnapshot["nodes"] = {};
    const edgeLoads: EngineSnapshot["edgeLoads"] = {};

    for (const component of this.nodes.values()) {
      nodes[component.nodeId] = component.getSnapshot();
      if (isPublisher(component) && "getLastDispatch" in component) {
        const dispatch = (component as { getLastDispatch(): ReadonlyMap<EdgeId, number> }).getLastDispatch();
        for (const [edgeId, amount] of dispatch) edgeLoads[edgeId] = amount;
      }
    }

    this.cachedSnapshot = { nodes, edgeLoads };
    return this.cachedSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getNode(nodeId: NodeId): AnyComponent | undefined {
    return this.nodes.get(nodeId);
  }

  getEdges(): { edgeId: EdgeId; sourceId: NodeId; targetId: NodeId; weight: number }[] {
    return Array.from(this.edgeRecords.entries()).map(([edgeId, record]) => ({ edgeId, ...record }));
  }

  private notify(): void {
    this.cachedSnapshot = null;
    for (const listener of this.listeners) listener();
  }
}
