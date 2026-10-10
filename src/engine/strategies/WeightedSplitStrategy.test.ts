import { describe, it, expect } from "vitest";
import { WeightedSplitStrategy } from "./WeightedSplitStrategy";

describe("WeightedSplitStrategy", () => {
  it("splits proportionally to weight", () => {
    const strategy = new WeightedSplitStrategy();
    const outputs = strategy.computeOutputs(100, [
      { edgeId: "a", targetId: "n1", weight: 70 },
      { edgeId: "b", targetId: "n2", weight: 30 },
    ]);
    expect(outputs.get("a")).toBeCloseTo(70, 5);
    expect(outputs.get("b")).toBeCloseTo(30, 5);
  });

  it("returns zero for every edge when all weights are zero, without NaN", () => {
    const strategy = new WeightedSplitStrategy();
    const outputs = strategy.computeOutputs(100, [
      { edgeId: "a", targetId: "n1", weight: 0 },
      { edgeId: "b", targetId: "n2", weight: 0 },
    ]);
    expect(outputs.get("a")).toBe(0);
    expect(outputs.get("b")).toBe(0);
  });

  it("returns an empty map for no edges", () => {
    const strategy = new WeightedSplitStrategy();
    expect(strategy.computeOutputs(100, []).size).toBe(0);
  });
});
