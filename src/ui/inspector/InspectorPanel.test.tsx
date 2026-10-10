import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { createComponent } from "../../engine/factory";
import { CdnComponent } from "../../engine/components/CdnComponent";
import { ApplicationComponent } from "../../engine/components/ApplicationComponent";

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

  it("clamps a negative capacity to 0 before applying it", () => {
    const engine = new SimulationEngine();
    const app = createComponent("application", "app1") as ApplicationComponent;
    engine.addNode(app);

    render(<InspectorPanel engine={engine} selectedNodeId="app1" />);

    const capacityInput = screen.getByLabelText(/capacity/i);
    expect(capacityInput).toHaveAttribute("min", "0");
    fireEvent.change(capacityInput, { target: { value: "-50" } });

    expect(app.getConfig().capacity).toBe(0);
  });

  it("clamps a ratio above 1 down to 1 before applying it", () => {
    const engine = new SimulationEngine();
    const cdn = createComponent("cdn", "cdn1") as CdnComponent;
    engine.addNode(cdn);

    render(<InspectorPanel engine={engine} selectedNodeId="cdn1" />);

    const hitRatioInput = screen.getByLabelText(/cache hit ratio/i);
    expect(hitRatioInput).toHaveAttribute("max", "1");
    fireEvent.change(hitRatioInput, { target: { value: "1.7" } });

    expect(cdn.getConfig().cacheHitRatio).toBe(1);
  });
});
