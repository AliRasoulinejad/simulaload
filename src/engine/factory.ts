import { CdnComponent } from "./components/CdnComponent";
import { LoadBalancerComponent } from "./components/LoadBalancerComponent";
import { ApplicationComponent } from "./components/ApplicationComponent";
import { CacheComponent } from "./components/CacheComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";
import { EntryPointComponent } from "./components/EntryPointComponent";
import type { AnyComponent } from "./SimulationEngine";
import type {
  ApplicationConfig,
  CacheConfig,
  CdnConfig,
  ComponentType,
  DatabaseConfig,
  EntryPointConfig,
  LoadBalancerConfig,
  NodeId,
} from "./types";

type ConfigForType = {
  entryPoint: EntryPointConfig;
  cdn: CdnConfig;
  loadBalancer: LoadBalancerConfig;
  application: ApplicationConfig;
  cache: CacheConfig;
  database: DatabaseConfig;
};

const defaultConfigs: ConfigForType = {
  entryPoint: { targetRps: 50 },
  cdn: { capacity: 100, queueDepth: 10, cacheHitRatio: 0.7 },
  loadBalancer: { capacity: 500, queueDepth: 20 },
  application: { capacity: 100, queueDepth: 10 },
  cache: { capacity: 200, queueDepth: 10, hitRatio: 0.6 },
  database: { capacity: 80, queueDepth: 5 },
};

export function createComponent<T extends ComponentType>(
  type: T,
  nodeId: NodeId,
  overrides?: Partial<ConfigForType[T]>,
): AnyComponent {
  const config = { ...defaultConfigs[type], ...overrides } as ConfigForType[T];
  switch (type) {
    case "entryPoint":
      return new EntryPointComponent(nodeId, config as EntryPointConfig);
    case "cdn":
      return new CdnComponent(nodeId, config as CdnConfig);
    case "loadBalancer":
      return new LoadBalancerComponent(nodeId, config as LoadBalancerConfig);
    case "application":
      return new ApplicationComponent(nodeId, config as ApplicationConfig);
    case "cache":
      return new CacheComponent(nodeId, config as CacheConfig);
    case "database":
      return new DatabaseComponent(nodeId, config as DatabaseConfig);
    default:
      throw new Error(`Unknown component type: ${type}`);
  }
}
