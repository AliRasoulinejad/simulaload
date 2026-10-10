import { describe, it, expect } from "vitest";
import { exportGraph, importGraph } from "./graphIO";
import { SimulationEngine } from "./SimulationEngine";
import { createComponent } from "./factory";

describe("graphIO", () => {
  it("exports the current graph and re-imports it into a fresh engine with equivalent behavior", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 30 }));
    engine.addNode(createComponent("cdn", "cdn1"));
    engine.addEdge("entry1", "cdn1", "e1");
    const positions = { entry1: { x: 0, y: 0 }, cdn1: { x: 150, y: 0 } };

    const json = exportGraph(engine, positions);

    const freshEngine = new SimulationEngine();
    const restoredPositions = importGraph(freshEngine, json);

    freshEngine.tick();
    expect(freshEngine.getSnapshot().nodes["cdn1"].currentRps).toBe(30);
    expect(restoredPositions.cdn1).toEqual({ x: 150, y: 0 });
  });

  it("throws and does not mutate the target engine when the JSON references an unknown node in an edge", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [{ nodeId: "entry1", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } }],
      edges: [{ edgeId: "e1", sourceId: "entry1", targetId: "missing", weight: 100 }],
    });
    const engine = new SimulationEngine();

    expect(() => importGraph(engine, badJson)).toThrow();
    expect(engine.getNode("entry1")).toBeUndefined();
  });

  it("throws and does not mutate the target engine when the JSON contains duplicate node IDs", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [
        { nodeId: "entry1", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
        { nodeId: "dup1", type: "cdn", position: { x: 100, y: 0 }, config: {} },
        { nodeId: "dup1", type: "cache", position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [],
    });
    const engine = new SimulationEngine();

    expect(() => importGraph(engine, badJson)).toThrow();
    expect(engine.getNode("entry1")).toBeUndefined();
    expect(engine.getNode("dup1")).toBeUndefined();
  });

  it("throws when the JSON contains more than one entryPoint", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [
        { nodeId: "entry1", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
        { nodeId: "entry2", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
      ],
      edges: [],
    });
    const engine = new SimulationEngine();

    expect(() => importGraph(engine, badJson)).toThrow();
  });

  it("replaces the existing graph on a second import instead of accumulating into it", () => {
    const graphA = JSON.stringify({
      version: 1,
      nodes: [
        { nodeId: "entryA", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
        { nodeId: "cdnA", type: "cdn", position: { x: 100, y: 0 }, config: {} },
      ],
      edges: [{ edgeId: "eA", sourceId: "entryA", targetId: "cdnA", weight: 100 }],
    });
    const graphB = JSON.stringify({
      version: 1,
      nodes: [
        { nodeId: "entryB", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 25 } },
        { nodeId: "lbB", type: "loadBalancer", position: { x: 100, y: 0 }, config: {} },
      ],
      edges: [{ edgeId: "eB", sourceId: "entryB", targetId: "lbB", weight: 100 }],
    });
    const engine = new SimulationEngine();

    importGraph(engine, graphA);
    const positions = importGraph(engine, graphB);

    expect(Object.keys(engine.getSnapshot().nodes).sort()).toEqual(["entryB", "lbB"]);
    expect(engine.getEdges()).toEqual([{ edgeId: "eB", sourceId: "entryB", targetId: "lbB", weight: 100 }]);
    expect(Object.keys(positions).sort()).toEqual(["entryB", "lbB"]);
    engine.tick();
    expect(engine.getSnapshot().nodes["lbB"].currentRps).toBe(25);
  });

  it("leaves an existing graph completely unchanged when an import fails a semantic engine check", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 30 }));
    engine.addNode(createComponent("cdn", "cdn1"));
    engine.addEdge("entry1", "cdn1", "e1");
    const nodesBefore = Object.keys(engine.getSnapshot().nodes).sort();
    const edgesBefore = engine.getEdges();

    // Passes the schema and structural checks, but entryPoint -> cache violates the upstream matrix.
    const badJson = JSON.stringify({
      version: 1,
      nodes: [
        { nodeId: "cacheX", type: "cache", position: { x: 100, y: 0 }, config: {} },
        { nodeId: "entryX", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
      ],
      edges: [{ edgeId: "eX", sourceId: "entryX", targetId: "cacheX", weight: 100 }],
    });

    expect(() => importGraph(engine, badJson)).toThrow();
    expect(Object.keys(engine.getSnapshot().nodes).sort()).toEqual(nodesBefore);
    expect(engine.getEdges()).toEqual(edgesBefore);
    engine.tick();
    expect(engine.getSnapshot().nodes["cdn1"].currentRps).toBe(30);
  });
});
