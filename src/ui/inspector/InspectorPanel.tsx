import { useState } from "react";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface InspectorPanelProps {
  engine: SimulationEngine;
  selectedNodeId: NodeId | null;
}

interface NumericField {
  key: string;
  label: string;
  step?: number;
}

/** Ratio fields (e.g. cacheHitRatio, hitRatio) are fractions in [0, 1]. */
function isRatioField(key: string): boolean {
  return key.endsWith("Ratio");
}

/**
 * Clamps a raw input value into the field's valid range. The HTML min/max
 * attributes are only a soft hint, so this is the real guard: negative
 * capacities/queues/RPS or ratios outside [0, 1] would corrupt the engine math.
 */
function clampFieldValue(key: string, value: number): number {
  if (!Number.isFinite(value)) return 0;
  const nonNegative = Math.max(0, value);
  return isRatioField(key) ? Math.min(1, nonNegative) : nonNegative;
}

const fieldsByType: Record<string, NumericField[]> = {
  entryPoint: [{ key: "targetRps", label: "Target RPS", step: 1 }],
  cdn: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
    { key: "cacheHitRatio", label: "Cache Hit Ratio", step: 0.01 },
  ],
  loadBalancer: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
  ],
  application: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
  ],
  cache: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
    { key: "hitRatio", label: "Hit Ratio", step: 0.01 },
  ],
  database: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
  ],
};

export function InspectorPanel({ engine, selectedNodeId }: InspectorPanelProps) {
  // Forces a re-render after each edit so the controlled inputs stay in sync
  // with the component's live config (setConfig does not itself trigger React
  // state updates, since the engine lives outside React state).
  const [, forceRender] = useState(0);

  if (!selectedNodeId) return null;

  const node = engine.getNode(selectedNodeId);
  if (!node) return null;

  const fields = fieldsByType[node.type] ?? [];
  const config = node.getConfig() as unknown as Record<string, number>;

  return (
    <div data-testid="inspector-panel">
      <h3>{node.type}</h3>
      {fields.map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            type="number"
            step={field.step ?? 1}
            min={0}
            max={isRatioField(field.key) ? 1 : undefined}
            value={config[field.key]}
            onChange={(event) => {
              const value = clampFieldValue(field.key, Number(event.target.value));
              node.setConfig({ [field.key]: value } as never);
              forceRender((n) => n + 1);
            }}
          />
        </label>
      ))}
    </div>
  );
}
