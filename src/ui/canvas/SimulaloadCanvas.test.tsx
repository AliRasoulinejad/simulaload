import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SimulaloadCanvas } from "./SimulaloadCanvas";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { createComponent } from "../../engine/factory";

describe("SimulaloadCanvas", () => {
  it("renders a React Flow node for each node added to the engine", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    engine.addNode(createComponent("cdn", "cdn1"));

    render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 }, cdn1: { x: 200, y: 0 } }}
        edgeRegistry={[]}
      />,
    );

    expect(screen.getByText(/entryPoint/i)).toBeInTheDocument();
    expect(screen.getByText(/cdn/i)).toBeInTheDocument();
  });

  it("re-renders node RPS labels after a manual engine tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 77 }));

    render(<SimulaloadCanvas engine={engine} nodePositions={{ entry1: { x: 0, y: 0 } }} edgeRegistry={[]} />);
    act(() => engine.tick());

    expect(screen.getByText(/77/)).toBeInTheDocument();
  });
});
