import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersistenceControls } from "./PersistenceControls";
import { SimulationEngine } from "../../engine/SimulationEngine";

describe("PersistenceControls", () => {
  it("renders an export button that is enabled even on an empty graph", async () => {
    const engine = new SimulationEngine();
    render(<PersistenceControls engine={engine} positions={{}} onImported={vi.fn()} />);

    const exportButton = screen.getByRole("button", { name: /export/i });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);
  });
});
