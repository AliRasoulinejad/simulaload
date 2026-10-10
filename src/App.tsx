import { useCallback, useState } from "react";
import { SimulationEngine } from "./engine/SimulationEngine";
import { createComponent } from "./engine/factory";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";
import { Toolbox } from "./ui/toolbox/Toolbox";
import type { ComponentType } from "./engine/types";

const engine = new SimulationEngine();
let nextId = 1;

function App() {
  const [, setVersion] = useState(0);

  const handleAdd = useCallback((type: ComponentType) => {
    const nodeId = `${type}-${nextId++}`;
    engine.addNode(createComponent(type, nodeId));
    setVersion((v) => v + 1);
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      <Toolbox onAdd={handleAdd} />
      <SimulaloadCanvas engine={engine} />
    </div>
  );
}

export default App;
