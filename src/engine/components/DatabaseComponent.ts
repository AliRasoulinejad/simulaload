import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { CapacityModel } from "../models/CapacityModel";
import type { ConfigurableInterface } from "../interfaces";
import type { ComponentType, DatabaseConfig, NodeId } from "../types";

export class DatabaseComponent extends ReactiveSubscriberBase implements ConfigurableInterface<DatabaseConfig> {
  readonly type = "database" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["application", "cache"]);
  private readonly capacityModelRef: CapacityModel;

  constructor(public readonly nodeId: NodeId, config: DatabaseConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    super(capacityModel);
    this.capacityModelRef = capacityModel;
  }

  protected onFlush(_outgoing: number): void {
    // Terminal sink: Database never implements LoadPublisherInterface, so there is nothing downstream.
  }

  getConfig(): DatabaseConfig {
    return { capacity: this.capacityModelRef.capacity, queueDepth: this.capacityModelRef.queueDepth };
  }

  setConfig(partial: Partial<DatabaseConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
  }
}
