import { computeSummary } from "./computeSummary";
import type { EngineSnapshot } from "../../engine/types";

interface SummaryBarProps {
  snapshot: EngineSnapshot;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export function SummaryBar({ snapshot }: SummaryBarProps) {
  const summary = computeSummary(snapshot);
  const text = `In: ${Math.round(summary.totalIn)} rps · Dropped: ${Math.round(summary.totalDropped)} rps · Success: ${formatPercent(summary.successRatePercent)}`;
  return <div data-testid="summary-bar">{text}</div>;
}
