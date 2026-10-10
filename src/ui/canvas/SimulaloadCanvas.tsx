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
import { computeEdgeStyle } from "./computeEdgeStyle";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface SimulaloadCanvasProps {
  engine: SimulationEngine;
  nodePositions: Record<NodeId, { x: number; y: number }>;
  edgeRegistry: { edgeId: string; source: NodeId; target: NodeId }[];
  onNodeClick?: (nodeId: NodeId) => void;
  onEdgeCreated?: (edge: { edgeId: string; source: NodeId; target: NodeId }) => void;
}

export function SimulaloadCanvas({
  engine,
  nodePositions,
  edgeRegistry,
  onNodeClick,
  onEdgeCreated,
}: SimulaloadCanvasProps) {
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
    const maxLoad = Math.max(1, ...Object.values(snapshot.edgeLoads));
    return edgeRegistry.map(({ edgeId, source, target }) => {
      const load = snapshot.edgeLoads[edgeId] ?? 0;
      const style = computeEdgeStyle(load, maxLoad);
      return {
        id: edgeId,
        source,
        target,
        animated: style.animated,
        style: { strokeWidth: style.strokeWidth, opacity: style.opacity },
      };
    });
  }, [snapshot, edgeRegistry]);

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
      try {
        engine.addEdge(connection.source, connection.target, edgeId);
      } catch {
        return;
      }
      onEdgeCreated?.({ edgeId, source: connection.source, target: connection.target });
    },
    [engine, onEdgeCreated],
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
          onNodeClick={(_, node) => onNodeClick?.(node.id)}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
