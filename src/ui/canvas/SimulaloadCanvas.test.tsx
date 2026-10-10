import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimulaloadCanvas } from "./SimulaloadCanvas";
import { SimulationEngine } from "../../engine/SimulationEngine";

// jsdom does not implement ResizeObserver, which React Flow requires on mount.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("SimulaloadCanvas", () => {
  it("renders an empty canvas without crashing", () => {
    const engine = new SimulationEngine();
    render(<SimulaloadCanvas engine={engine} />);
    expect(screen.getByTestId("simulaload-canvas")).toBeInTheDocument();
  });
});
