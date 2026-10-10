import { createComponent } from "./factory";
import {
  assertEdgesReferenceKnownNodes,
  assertNoDuplicateNodeIds,
  assertSingleEntryPoint,
  deserializeGraph,
  serializeGraph,
  type SimulationGraph,
} from "./persistence";
import { SimulationEngine } from "./SimulationEngine";
import type { ComponentType, NodeId } from "./types";

export function exportGraph(engine: SimulationEngine, positions: Record<NodeId, { x: number; y: number }>): string {
  const nodes = Object.keys(positions)
    .map((nodeId) => engine.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => node !== undefined)
    .map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      position: positions[node.nodeId],
      config: node.getConfig() as unknown as Record<string, number>,
    }));

  const edges = engine.getEdges();

  return serializeGraph(nodes, edges);
}

function buildInto(engine: SimulationEngine, graph: SimulationGraph): void {
  for (const node of graph.nodes) {
    engine.addNode(createComponent(node.type as ComponentType, node.nodeId, node.config as never));
  }
  for (const edge of graph.edges) {
    engine.addEdge(edge.sourceId, edge.targetId, edge.edgeId, edge.weight);
  }
}

/**
 * Proves the graph is buildable (wrong upstream types, cycles, single-outgoing
 * violations, duplicate edges) by building it into a throwaway engine, so the
 * live engine is never touched by a graph that would fail halfway.
 */
function validateBuildable(graph: SimulationGraph): void {
  buildInto(new SimulationEngine(), graph);
}

/**
 * Replaces the engine's graph with the one in `json`, atomically: either every
 * check passes and the live engine is cleared and rebuilt, or it throws and
 * the live engine is left completely unchanged.
 */
export function importGraph(engine: SimulationEngine, json: string): Record<NodeId, { x: number; y: number }> {
  const graph = deserializeGraph(json);
  assertSingleEntryPoint(graph);
  assertNoDuplicateNodeIds(graph);
  assertEdgesReferenceKnownNodes(graph);
  validateBuildable(graph);

  engine.clear();
  buildInto(engine, graph);

  const positions: Record<NodeId, { x: number; y: number }> = {};
  for (const node of graph.nodes) positions[node.nodeId] = node.position;
  return positions;
}
