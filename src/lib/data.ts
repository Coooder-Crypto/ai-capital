import seedJson from "../generated/seed.json";
import metricsJson from "../generated/metrics.json";
import type { MetricBundle, SeedData } from "./types";

export const seed = seedJson as unknown as SeedData;
export const metricBundle = metricsJson as unknown as MetricBundle;

export const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
export const layerById = new Map(seed.layers.map((layer) => [layer.id, layer]));
export const sourceById = new Map(seed.sources.map((source) => [source.id, source]));

export const metricsByEntityId = new Map<string, MetricBundle["metrics"]>();
for (const metric of metricBundle.metrics) {
  const existing = metricsByEntityId.get(metric.entityId) || [];
  existing.push(metric);
  metricsByEntityId.set(metric.entityId, existing);
}
