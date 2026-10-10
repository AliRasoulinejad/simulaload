import { SimulationEngine } from "./engine/SimulationEngine";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";

const engine = new SimulationEngine();

function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <SimulaloadCanvas engine={engine} />
    </div>
  );
}

export default App;
