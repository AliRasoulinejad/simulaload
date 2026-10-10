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
});
