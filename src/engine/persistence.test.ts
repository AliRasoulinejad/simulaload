import { describe, it, expect } from "vitest";
import {
  serializeGraph,
  deserializeGraph,
  assertEdgesReferenceKnownNodes,
  assertNoDuplicateNodeIds,
  assertSingleEntryPoint,
} from "./persistence";
import type { SimulationGraphEdge, SimulationGraphNode } from "./persistence";

const sampleNodes: SimulationGraphNode[] = [
  { nodeId: "entry", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 50 } },
  { nodeId: "cdn", type: "cdn", position: { x: 100, y: 0 }, config: { capacity: 200, queueDepth: 0, cacheHitRatio: 0.8 } },
];
const sampleEdges: SimulationGraphEdge[] = [{ edgeId: "e1", sourceId: "entry", targetId: "cdn", weight: 100 }];

describe("persistence", () => {
  it("round-trips a graph through serialize/deserialize unchanged", () => {
    const json = serializeGraph(sampleNodes, sampleEdges);
    const parsed = deserializeGraph(json);
    expect(parsed.nodes).toEqual(sampleNodes);
    expect(parsed.edges).toEqual(sampleEdges);
    expect(parsed.version).toBe(1);
  });

  it("rejects JSON with an unknown component type", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [{ nodeId: "n1", type: "mysteryBox", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    });
    expect(() => deserializeGraph(badJson)).toThrow();
  });

  it("rejects JSON missing required fields", () => {
    const badJson = JSON.stringify({ version: 1, nodes: [{ nodeId: "n1" }], edges: [] });
    expect(() => deserializeGraph(badJson)).toThrow();
  });

  it("rejects JSON that is not valid JSON at all", () => {
    expect(() => deserializeGraph("{not json")).toThrow();
  });

  it("rejects an edge referencing a node ID that is not in the nodes list", () => {
    const json = serializeGraph(sampleNodes, [{ edgeId: "eBad", sourceId: "entry", targetId: "doesNotExist", weight: 100 }]);
    expect(() => assertEdgesReferenceKnownNodes(deserializeGraph(json))).toThrow();
  });

  it("rejects a graph with two nodes sharing the same nodeId", () => {
    const duplicateNodes: SimulationGraphNode[] = [
      ...sampleNodes,
      { nodeId: "cdn", type: "cache", position: { x: 50, y: 50 }, config: { capacity: 100 } },
    ];
    const json = serializeGraph(duplicateNodes, []);
    expect(() => assertNoDuplicateNodeIds(deserializeGraph(json))).toThrow();
  });

  it("does not throw for a graph with all-unique node IDs", () => {
    const json = serializeGraph(sampleNodes, sampleEdges);
    expect(() => assertNoDuplicateNodeIds(deserializeGraph(json))).not.toThrow();
  });

  it("rejects a graph with more than one entryPoint node", () => {
    const twoEntryNodes: SimulationGraphNode[] = [
      ...sampleNodes,
      { nodeId: "entry2", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
    ];
    const json = serializeGraph(twoEntryNodes, sampleEdges);
    expect(() => assertSingleEntryPoint(deserializeGraph(json))).toThrow();
  });
});
