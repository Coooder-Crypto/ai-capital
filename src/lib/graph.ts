import type { Relationship, SeedData } from "./types";

export const MAX_RENDERED_EDGES = 320;

export type GraphOptions = {
  selectedId: string;
  depth: string;
  minConfidence: number;
  relationType: string;
};

export function capRenderedEdges(edges: Relationship[]) {
  if (edges.length <= MAX_RENDERED_EDGES) return edges;
  return [...edges].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_RENDERED_EDGES);
}

export function buildVisibleGraph(seed: SeedData, options: GraphOptions) {
  const filteredRelationships = seed.relationships.filter((relationship) => {
    const confidenceOk = relationship.confidence >= options.minConfidence;
    const typeOk = options.relationType === "all" || relationship.type === options.relationType;
    return confidenceOk && typeOk;
  });

  if (options.depth === "all") {
    return {
      nodes: seed.entities,
      edges: capRenderedEdges(filteredRelationships)
    };
  }

  const visibleIds = new Set([options.selectedId]);
  let frontier = new Set([options.selectedId]);
  const maxDepth = Number(options.depth);

  for (let index = 0; index < maxDepth; index += 1) {
    const next = new Set<string>();
    filteredRelationships.forEach((relationship) => {
      if (frontier.has(relationship.source)) next.add(relationship.target);
      if (frontier.has(relationship.target)) next.add(relationship.source);
    });
    next.forEach((id) => visibleIds.add(id));
    frontier = next;
  }

  return {
    nodes: seed.entities.filter((entity) => visibleIds.has(entity.id)),
    edges: capRenderedEdges(
      filteredRelationships.filter(
        (relationship) => visibleIds.has(relationship.source) && visibleIds.has(relationship.target)
      )
    )
  };
}
