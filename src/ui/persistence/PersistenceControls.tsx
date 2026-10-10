import { useRef } from "react";
import { exportGraph, importGraph } from "../../engine/graphIO";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface PersistenceControlsProps {
  engine: SimulationEngine;
  positions: Record<NodeId, { x: number; y: number }>;
  onImported: (positions: Record<NodeId, { x: number; y: number }>) => void;
}

export function PersistenceControls({ engine, positions, onImported }: PersistenceControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportGraph(engine, positions);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "simulaload-graph.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const restoredPositions = importGraph(engine, text);
      onImported(restoredPositions);
    } catch (error) {
      window.alert(`Could not import graph: ${(error as Error).message}`);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div data-testid="persistence-controls">
      <button type="button" onClick={handleExport}>
        Export
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        Import
      </button>
      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
    </div>
  );
}
