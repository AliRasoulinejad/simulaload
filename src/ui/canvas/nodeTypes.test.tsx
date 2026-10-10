import type React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { ComponentNode } from "./nodeTypes";
import { formatTypeLabel } from "./formatTypeLabel";
import type { NodeMetricsSnapshot } from "../../engine/types";

function renderNode(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

const baseSnapshot: NodeMetricsSnapshot = {
  nodeId: "app1",
  type: "application",
  currentRps: 80,
  utilization: 0.8,
  queueLength: 0,
  droppedThisTick: 0,
  droppedTotal: 0,
  status: "degraded",
};

describe("ComponentNode", () => {
  it("renders the component type label and current RPS", () => {
    renderNode(<ComponentNode data={{ snapshot: baseSnapshot }} id="app1" type="application" />);
    expect(screen.getByText(/application/i)).toBeInTheDocument();
    expect(screen.getByText(/80/)).toBeInTheDocument();
  });

  it("reflects overloaded status with a distinct visual class", () => {
    const overloaded = { ...baseSnapshot, status: "overloaded" as const };
    renderNode(<ComponentNode data={{ snapshot: overloaded }} id="app1" type="application" />);
    expect(screen.getByTestId("component-node")).toHaveClass("status-overloaded");
  });

  it("formats type keys into readable labels", () => {
    expect(formatTypeLabel("loadBalancer")).toBe("Load Balancer");
    expect(formatTypeLabel("entryPoint")).toBe("Entry Point");
    expect(formatTypeLabel("cdn")).toBe("CDN");
    expect(formatTypeLabel("database")).toBe("Database");
  });
});
