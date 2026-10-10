import { ReactFlow, Background, Controls, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodeTypes";
import type { SimulationEngine } from "../../engine/SimulationEngine";

interface SimulaloadCanvasProps {
  engine: SimulationEngine;
}

export function SimulaloadCanvas({ engine: _engine }: SimulaloadCanvasProps) {
  return (
    <div data-testid="simulaload-canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} nodeTypes={nodeTypes} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
