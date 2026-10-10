import type { ComponentType } from "../../engine/types";

interface ToolboxProps {
  onAdd: (type: ComponentType) => void;
}

const addableTypes: { type: ComponentType; label: string }[] = [
  { type: "cdn", label: "CDN" },
  { type: "loadBalancer", label: "Load Balancer" },
  { type: "application", label: "Application" },
  { type: "cache", label: "Cache" },
  { type: "database", label: "Database" },
];

export function Toolbox({ onAdd }: ToolboxProps) {
  return (
    <div data-testid="toolbox">
      {addableTypes.map(({ type, label }) => (
        <button key={type} type="button" onClick={() => onAdd(type)}>
          {label}
        </button>
      ))}
    </div>
  );
}
