import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { createComponent } from "../../engine/factory";
import { CdnComponent } from "../../engine/components/CdnComponent";

describe("InspectorPanel", () => {
  it("renders nothing when no node is selected", () => {
    const engine = new SimulationEngine();
    render(<InspectorPanel engine={engine} selectedNodeId={null} />);
    expect(screen.queryByTestId("inspector-panel")).not.toBeInTheDocument();
  });

  it("renders CDN fields for a selected CDN node and applies edits immediately", async () => {
    const engine = new SimulationEngine();
    const cdn = createComponent("cdn", "cdn1") as CdnComponent;
    engine.addNode(cdn);

    render(<InspectorPanel engine={engine} selectedNodeId="cdn1" />);

    const hitRatioInput = screen.getByLabelText(/cache hit ratio/i);
    await userEvent.clear(hitRatioInput);
    await userEvent.type(hitRatioInput, "0.5");

    expect(cdn.getConfig().cacheHitRatio).toBeCloseTo(0.5, 5);
  });

  it("renders the live-adjustable targetRps slider for the Entry Point", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));

    render(<InspectorPanel engine={engine} selectedNodeId="entry1" />);

    expect(screen.getByLabelText(/target rps/i)).toBeInTheDocument();
  });
});
