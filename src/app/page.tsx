import CapitalMapClient from "./CapitalMapClient";
import { getGraphSeedData, getMetricBundleData } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [graphSeed, metrics] = await Promise.all([getGraphSeedData(), getMetricBundleData()]);

  return (
    <CapitalMapClient
      seed={graphSeed.seed}
      metricBundle={metrics.metricBundle}
      dataSource={graphSeed.dataSource === metrics.dataSource ? graphSeed.dataSource : "json-fallback"}
    />
  );
}
