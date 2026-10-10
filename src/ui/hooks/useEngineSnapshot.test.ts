import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEngineSnapshot } from "./useEngineSnapshot";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { EntryPointComponent } from "../../engine/components/EntryPointComponent";

describe("useEngineSnapshot", () => {
  it("returns the current snapshot and re-renders after a manual tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 42 }));

    const { result } = renderHook(() => useEngineSnapshot(engine));
    expect(result.current.nodes["entry"].currentRps).toBe(0);

    act(() => engine.tick());

    expect(result.current.nodes["entry"].currentRps).toBe(42);
  });
});
