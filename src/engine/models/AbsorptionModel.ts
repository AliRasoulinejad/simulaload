import type { AbsorbResult } from "../types";
import type { AbsorptionModelInterface } from "../interfaces";

export class AbsorptionModel implements AbsorptionModelInterface {
  absorptionRatio: number;

  constructor(absorptionRatio: number) {
    this.absorptionRatio = absorptionRatio;
  }

  absorb(incoming: number): AbsorbResult {
    const absorbed = incoming * this.absorptionRatio;
    return { absorbed, remainder: incoming - absorbed };
  }
}
