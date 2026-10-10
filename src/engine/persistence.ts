import { z } from "zod";
import type { ComponentType, EdgeId, NodeId } from "./types";

export interface SimulationGraphNode {
  nodeId: NodeId;
  type: ComponentType;
  position: { x: number; y: number };
  config: Record<string, number>;
}

export interface SimulationGraphEdge {
  edgeId: EdgeId;
  sourceId: NodeId;
  targetId: NodeId;
  weight: number;
}

export interface SimulationGraph {
  version: 1;
  nodes: SimulationGraphNode[];
  edges: SimulationGraphEdge[];
}

const nodeSchema = z.object({
  nodeId: z.string(),
  type: z.enum(["entryPoint", "cdn", "loadBalancer", "application", "cache", "database"]),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.number()),
});

const edgeSchema = z.object({
  edgeId: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  weight: z.number(),
});

export const simulationGraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

export function serializeGraph(nodes: SimulationGraphNode[], edges: SimulationGraphEdge[]): string {
  const graph: SimulationGraph = { version: 1, nodes, edges };
  return JSON.stringify(graph, null, 2);
}

export function deserializeGraph(json: string): SimulationGraph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid simulation graph: not valid JSON");
  }

  const result = simulationGraphSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid simulation graph: ${result.error.message}`);
  }
  return result.data;
}

export function assertEdgesReferenceKnownNodes(graph: SimulationGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      throw new Error(`Edge ${edge.edgeId} references an unknown node`);
    }
  }
}

export function assertSingleEntryPoint(graph: SimulationGraph): void {
  const entryPoints = graph.nodes.filter((node) => node.type === "entryPoint");
  if (entryPoints.length !== 1) {
    throw new Error(`Expected exactly one entryPoint node, found ${entryPoints.length}`);
  }
}
