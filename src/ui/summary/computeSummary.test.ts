import { describe, it, expect } from "vitest";
import { computeSummary } from "./computeSummary";
import type { EngineSnapshot } from "../../engine/types";

function snapshotWith(nodes: EngineSnapshot["nodes"]): EngineSnapshot {
  return { nodes, edgeLoads: {} };
}

describe("computeSummary", () => {
  it("sums the entry point's RPS as totalIn and all nodes' droppedThisTick as totalDropped", () => {
    const snapshot = snapshotWith({
      entry: { nodeId: "entry", type: "entryPoint", currentRps: 100, utilization: 0, queueLength: 0, droppedThisTick: 0, droppedTotal: 0, status: "healthy" },
      app: { nodeId: "app", type: "application", currentRps: 80, utilization: 0.8, queueLength: 0, droppedThisTick: 20, droppedTotal: 20, status: "overloaded" },
    });

    const summary = computeSummary(snapshot);

    expect(summary.totalIn).toBe(100);
    expect(summary.totalDropped).toBe(20);
    expect(summary.successRatePercent).toBe(80);
  });

  it("reports 100% success and no NaN when totalIn is zero", () => {
    const snapshot = snapshotWith({
      entry: { nodeId: "entry", type: "entryPoint", currentRps: 0, utilization: 0, queueLength: 0, droppedThisTick: 0, droppedTotal: 0, status: "idle" },
    });

    const summary = computeSummary(snapshot);

    expect(summary.successRatePercent).toBe(100);
    expect(Number.isNaN(summary.successRatePercent)).toBe(false);
  });
});
