import { describe, it, expect } from "vitest";
import { SingleForwardStrategy } from "./SingleForwardStrategy";

describe("SingleForwardStrategy", () => {
  it("sends the full amount to the single edge", () => {
    const strategy = new SingleForwardStrategy();
    const outputs = strategy.computeOutputs(42, [{ edgeId: "a", targetId: "n1", weight: 0 }]);
    expect(outputs.get("a")).toBe(42);
  });

  it("returns an empty map when there is no edge", () => {
    const strategy = new SingleForwardStrategy();
    expect(strategy.computeOutputs(42, []).size).toBe(0);
  });
});
