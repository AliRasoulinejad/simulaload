import type { ComponentType } from "../../engine/types";
import { componentIcons } from "../icons";
import "./toolbox.css";

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
    <div data-testid="toolbox" className="toolbox">
      {addableTypes.map(({ type, label }) => {
        const Icon = componentIcons[type];
        return (
          <button key={type} type="button" className="toolbox-item" onClick={() => onAdd(type)}>
            <Icon />
            {label}
          </button>
        );
      })}
    </div>
  );
}
