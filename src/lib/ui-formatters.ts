import type { DataSource, Source } from "@/lib/types";

export function formatNumber(value: string | number | null | undefined) {
  if (typeof value !== "number") return value ?? "N/A";
  return new Intl.NumberFormat("en", { notation: value >= 1000000 ? "compact" : "standard" }).format(value);
}

export function formatMetricLabel(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function shorten(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

export function formatDataSource(dataSource: DataSource) {
  return dataSource === "postgres" ? "PostgreSQL" : "JSON fallback";
}

export function formatEvidenceStrength(source: Pick<Source, "evidenceStrength" | "sourceType">) {
  const labels: Record<NonNullable<Source["evidenceStrength"]>, string> = {
    official_api: "官方 API",
    official_docs: "官方/公开文档",
    official_product_overlap: "官方产品重叠",
    credible_report: "可信报道",
    third_party_index: "第三方索引",
    manual_seed: "人工种子",
    derived: "派生"
  };
  return source.evidenceStrength ? labels[source.evidenceStrength] : source.sourceType || "未分级";
}
