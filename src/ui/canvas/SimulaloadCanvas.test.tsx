import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimulaloadCanvas } from "./SimulaloadCanvas";
import { SimulationEngine } from "../../engine/SimulationEngine";

describe("SimulaloadCanvas", () => {
  it("renders an empty canvas without crashing", () => {
    const engine = new SimulationEngine();
    render(<SimulaloadCanvas engine={engine} />);
    expect(screen.getByTestId("simulaload-canvas")).toBeInTheDocument();
  });
});
