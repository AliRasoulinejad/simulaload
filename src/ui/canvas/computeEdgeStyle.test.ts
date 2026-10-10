import { describe, it, expect } from "vitest";
import { computeEdgeStyle } from "./computeEdgeStyle";

describe("computeEdgeStyle", () => {
  it("scales stroke width and opacity between a floor and ceiling based on load ratio", () => {
    const noLoad = computeEdgeStyle(0, 100);
    const halfLoad = computeEdgeStyle(50, 100);
    const fullLoad = computeEdgeStyle(100, 100);

    expect(noLoad.strokeWidth).toBeLessThan(halfLoad.strokeWidth);
    expect(halfLoad.strokeWidth).toBeLessThan(fullLoad.strokeWidth);
    expect(noLoad.animated).toBe(false);
    expect(fullLoad.animated).toBe(true);
  });

  it("never divides by zero when maxLoad is zero", () => {
    const style = computeEdgeStyle(0, 0);
    expect(Number.isNaN(style.strokeWidth)).toBe(false);
    expect(Number.isNaN(style.opacity)).toBe(false);
  });
});
