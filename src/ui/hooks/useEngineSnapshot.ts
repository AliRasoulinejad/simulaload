import { useSyncExternalStore } from "react";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { EngineSnapshot } from "../../engine/types";

export function useEngineSnapshot(engine: SimulationEngine): EngineSnapshot {
  return useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.getSnapshot(),
  );
}
