import { useMemo, useSyncExternalStore } from "react";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { EngineSnapshot } from "../../engine/types";

// SimulationEngine.getSnapshot() returns a fresh object on every call, which
// makes useSyncExternalStore loop forever. Cache the snapshot per engine and
// drop the cache whenever the engine notifies a change.
export function useEngineSnapshot(engine: SimulationEngine): EngineSnapshot {
  const store = useMemo(() => {
    let cached: EngineSnapshot | null = null;
    return {
      subscribe: (onChange: () => void) =>
        engine.subscribe(() => {
          cached = null;
          onChange();
        }),
      getSnapshot: (): EngineSnapshot => {
        if (cached === null) cached = engine.getSnapshot();
        return cached;
      },
    };
  }, [engine]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
