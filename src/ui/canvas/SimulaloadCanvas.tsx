import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  type Connection,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodeTypes";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface SimulaloadCanvasProps {
  engine: SimulationEngine;
  nodePositions: Record<NodeId, { x: number; y: number }>;
}

export function SimulaloadCanvas({ engine, nodePositions }: SimulaloadCanvasProps) {
  const snapshot = useEngineSnapshot(engine);

  const nodes = useMemo(
    () =>
      Object.values(snapshot.nodes).map((nodeSnapshot) => ({
        id: nodeSnapshot.nodeId,
        type: nodeSnapshot.type,
        position: nodePositions[nodeSnapshot.nodeId] ?? { x: 0, y: 0 },
        data: { snapshot: nodeSnapshot },
      })),
    [snapshot, nodePositions],
  );

  const edges = useMemo(() => {
    const edgeEntries: { id: string; source: string; target: string }[] = [];
    for (const edgeId of Object.keys(snapshot.edgeLoads)) {
      edgeEntries.push({ id: edgeId, source: "", target: "" }); // source/target filled by App.tsx edge registry in Task 19
    }
    return edgeEntries;
  }, [snapshot]);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const source = "source" in connection ? connection.source : undefined;
      const target = "target" in connection ? connection.target : undefined;
      if (!source || !target) return false;
      return engine.canConnect(source, target);
    },
    [engine],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edgeId = `${connection.source}->${connection.target}`;
      engine.addEdge(connection.source, connection.target, edgeId);
    },
    [engine],
  );

  return (
    <div data-testid="simulaload-canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
