import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
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
  onNodeMoved?: (nodeId: NodeId, position: { x: number; y: number }) => void;
  onNodeRemoved?: (nodeId: NodeId) => void;
  onEdgeRemoved?: (edgeId: string) => void;
}

/**
 * React-Flow-only view state the engine doesn't own. `nodes` is rebuilt from
 * the engine snapshot on every tick, so measured size and selection must be
 * carried across rebuilds or React Flow would lose them (nodes would be
 * re-measured endlessly and Backspace/Delete would never see a selection).
 */
interface NodeViewState {
  measured?: { width: number; height: number };
  selected?: boolean;
  dragging?: boolean;
}

export function SimulaloadCanvas({
  engine,
  nodePositions,
  edgeRegistry,
  onNodeClick,
  onEdgeCreated,
  onNodeMoved,
  onNodeRemoved,
  onEdgeRemoved,
}: SimulaloadCanvasProps) {
  const snapshot = useEngineSnapshot(engine);
  const [nodeView, setNodeView] = useState<Record<NodeId, NodeViewState>>({});
  const [selectedEdges, setSelectedEdges] = useState<Record<string, boolean>>({});

  const nodes = useMemo(
    () =>
      Object.values(snapshot.nodes).map((nodeSnapshot) => ({
        id: nodeSnapshot.nodeId,
        type: nodeSnapshot.type,
        position: nodePositions[nodeSnapshot.nodeId] ?? { x: 0, y: 0 },
        data: { snapshot: nodeSnapshot },
        // The Entry Point is pinned: exactly one per graph and never deletable.
        deletable: nodeSnapshot.type !== "entryPoint",
        ...nodeView[nodeSnapshot.nodeId],
      })),
    [snapshot, nodePositions, nodeView],
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
        selected: selectedEdges[edgeId] ?? false,
        style: { strokeWidth: style.strokeWidth, opacity: style.opacity },
      };
    });
  }, [snapshot, edgeRegistry, selectedEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const viewUpdates: Record<NodeId, NodeViewState> = {};
      const removed: NodeId[] = [];
      for (const change of changes) {
        switch (change.type) {
          case "position":
            if (change.position) onNodeMoved?.(change.id, change.position);
            viewUpdates[change.id] = { ...viewUpdates[change.id], dragging: change.dragging ?? false };
            break;
          case "dimensions":
            if (change.dimensions) {
              viewUpdates[change.id] = { ...viewUpdates[change.id], measured: change.dimensions };
            }
            break;
          case "select":
            viewUpdates[change.id] = { ...viewUpdates[change.id], selected: change.selected };
            break;
          case "remove":
            if (engine.getNode(change.id)?.type === "entryPoint") break;
            engine.removeNode(change.id);
            removed.push(change.id);
            onNodeRemoved?.(change.id);
            break;
          default:
            break;
        }
      }
      if (Object.keys(viewUpdates).length === 0 && removed.length === 0) return;
      setNodeView((prev) => {
        const next = { ...prev };
        for (const [nodeId, update] of Object.entries(viewUpdates)) {
          next[nodeId] = { ...next[nodeId], ...update };
        }
        for (const nodeId of removed) delete next[nodeId];
        return next;
      });
    },
    [engine, onNodeMoved, onNodeRemoved],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "select") {
          setSelectedEdges((prev) => ({ ...prev, [change.id]: change.selected }));
        } else if (change.type === "remove") {
          engine.removeEdge(change.id);
          setSelectedEdges((prev) => {
            const next = { ...prev };
            delete next[change.id];
            return next;
          });
          onEdgeRemoved?.(change.id);
        }
      }
    },
    [engine, onEdgeRemoved],
  );

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
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          deleteKeyCode={["Backspace", "Delete"]}
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
