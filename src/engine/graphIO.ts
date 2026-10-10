import { createComponent } from "./factory";
import { assertEdgesReferenceKnownNodes, assertSingleEntryPoint, deserializeGraph, serializeGraph } from "./persistence";
import type { SimulationEngine } from "./SimulationEngine";
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

export function importGraph(engine: SimulationEngine, json: string): Record<NodeId, { x: number; y: number }> {
  const graph = deserializeGraph(json);
  assertSingleEntryPoint(graph);
  assertEdgesReferenceKnownNodes(graph);

  const positions: Record<NodeId, { x: number; y: number }> = {};
  for (const node of graph.nodes) {
    engine.addNode(createComponent(node.type as ComponentType, node.nodeId, node.config as never));
    positions[node.nodeId] = node.position;
  }
  for (const edge of graph.edges) {
    engine.addEdge(edge.sourceId, edge.targetId, edge.edgeId, edge.weight);
  }
  return positions;
}
