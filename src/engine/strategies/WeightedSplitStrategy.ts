import type { EdgeId, WeightedEdge } from "../types";
import type { DispatchStrategyInterface } from "../interfaces";

export class WeightedSplitStrategy implements DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number> {
    const outputs = new Map<EdgeId, number>();
    const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0);

    if (totalWeight <= 0) {
      for (const edge of edges) outputs.set(edge.edgeId, 0);
      return outputs;
    }

    for (const edge of edges) {
      outputs.set(edge.edgeId, availableLoad * (edge.weight / totalWeight));
    }
    return outputs;
  }
}
