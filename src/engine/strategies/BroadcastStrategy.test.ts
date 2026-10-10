import { describe, it, expect } from "vitest";
import { BroadcastStrategy } from "./BroadcastStrategy";

describe("BroadcastStrategy", () => {
  it("sends the full amount down every edge", () => {
    const strategy = new BroadcastStrategy();
    const outputs = strategy.computeOutputs(50, [
      { edgeId: "a", targetId: "n1", weight: 0 },
      { edgeId: "b", targetId: "n2", weight: 0 },
    ]);
    expect(outputs.get("a")).toBe(50);
    expect(outputs.get("b")).toBe(50);
  });
});
