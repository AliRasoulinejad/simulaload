import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryBar } from "./SummaryBar";
import type { EngineSnapshot } from "../../engine/types";

describe("SummaryBar", () => {
  it("renders totalIn, totalDropped, and successRatePercent", () => {
    const snapshot: EngineSnapshot = {
      nodes: {
        entry: { nodeId: "entry", type: "entryPoint", currentRps: 100, utilization: 0, queueLength: 0, droppedThisTick: 0, droppedTotal: 0, status: "healthy" },
      },
      edgeLoads: {},
    };

    render(<SummaryBar snapshot={snapshot} />);

    expect(screen.getByText(/100/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
