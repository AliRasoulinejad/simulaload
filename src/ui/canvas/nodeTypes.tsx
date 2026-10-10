import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeMetricsSnapshot } from "../../engine/types";
import { formatTypeLabel } from "./formatTypeLabel";
import "./componentNode.css";

export interface ComponentNodeData {
  snapshot: NodeMetricsSnapshot;
  [key: string]: unknown;
}

export function ComponentNode({ data }: Partial<NodeProps> & { data: ComponentNodeData }) {
  const { snapshot } = data;
  const utilizationPercent = Math.min(100, Math.round(snapshot.utilization * 100));

  return (
    <div data-testid="component-node" className={`component-node status-${snapshot.status}`}>
      <Handle type="target" position={Position.Left} />
      <div className="component-node__label">{formatTypeLabel(snapshot.type)}</div>
      <div className="component-node__rps">{Math.round(snapshot.currentRps)} rps</div>
      <div className="component-node__bar">
        <div className="component-node__bar-fill" style={{ width: `${utilizationPercent}%` }} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = {
  entryPoint: ComponentNode,
  cdn: ComponentNode,
  loadBalancer: ComponentNode,
  application: ComponentNode,
  cache: ComponentNode,
  database: ComponentNode,
};
