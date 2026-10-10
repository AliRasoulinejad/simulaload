import type { EngineSnapshot } from "../../engine/types";

export interface Summary {
  totalIn: number;
  totalDropped: number;
  successRatePercent: number;
}

export function computeSummary(snapshot: EngineSnapshot): Summary {
  const nodes = Object.values(snapshot.nodes);
  const entryPoint = nodes.find((node) => node.type === "entryPoint");
  const totalIn = entryPoint?.currentRps ?? 0;
  const totalDropped = nodes.reduce((sum, node) => sum + node.droppedThisTick, 0);
  const successRatePercent = totalIn <= 0 ? 100 : Math.max(0, ((totalIn - totalDropped) / totalIn) * 100);

  return { totalIn, totalDropped, successRatePercent };
}
