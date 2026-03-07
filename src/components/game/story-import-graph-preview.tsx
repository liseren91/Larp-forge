"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import type { CharacterCandidate, RelationshipCandidate } from "./story-import-panel";

const REL_COLORS: Record<string, string> = {
  RIVALRY: "#ef4444",
  ALLIANCE: "#10b981",
  SECRET: "#a855f7",
  DEBT: "#f59e0b",
  LOVE: "#ec4899",
  FAMILY: "#3b82f6",
  MENTORSHIP: "#06b6d4",
  ENMITY: "#dc2626",
  OTHER: "#71717a",
};

interface Props {
  characters: CharacterCandidate[];
  relationships: RelationshipCandidate[];
  existingCharacters: Array<{ id: string; name: string; faction: string | null }>;
  getRefName: (ref: string) => string;
}

export function StoryImportGraphPreview({
  characters,
  relationships,
  existingCharacters,
  getRefName,
}: Props) {
  const { nodes, edges } = useMemo(() => {
    const nodeIds = new Set<string>();
    const nodeMap = new Map<string, { id: string; name: string; isNew: boolean }>();

    for (const c of characters) {
      const key = c.matchedEntityId ?? c.tempId;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { id: key, name: c.name, isNew: !c.matchedEntityId });
        nodeIds.add(key);
      }
    }

    for (const r of relationships) {
      for (const ref of [r.fromRef, r.toRef]) {
        if (!nodeMap.has(ref)) {
          const existing = existingCharacters.find((e) => e.id === ref);
          nodeMap.set(ref, {
            id: ref,
            name: existing?.name ?? getRefName(ref),
            isNew: false,
          });
          nodeIds.add(ref);
        }
      }
    }

    const entries = Array.from(nodeMap.values());
    const cols = Math.max(3, Math.ceil(Math.sqrt(entries.length)));
    const nodes: Node[] = entries.map((n, i) => ({
      id: n.id,
      position: {
        x: (i % cols) * 180 + Math.random() * 30,
        y: Math.floor(i / cols) * 120 + Math.random() * 30,
      },
      data: { label: n.name },
      style: {
        background: n.isNew ? "#f59e0b" : "#3b82f6",
        color: "#fff",
        border: "none",
        borderRadius: "10px",
        padding: "6px 12px",
        fontSize: "11px",
        fontWeight: 600,
        minWidth: 60,
        textAlign: "center" as const,
      },
    }));

    const edges: Edge[] = relationships.map((r) => ({
      id: r.tempId,
      source: r.fromRef,
      target: r.toRef,
      label: r.typeLabel.toLowerCase(),
      style: {
        stroke: REL_COLORS[r.typeLabel] ?? "#71717a",
        strokeWidth: Math.max(1, r.intensity / 3),
      },
      markerEnd: r.bidirectional
        ? undefined
        : { type: MarkerType.ArrowClosed, color: REL_COLORS[r.typeLabel] ?? "#71717a" },
      labelStyle: { fontSize: 9, fill: "#a1a1aa" },
    }));

    return { nodes, edges };
  }, [characters, relationships, existingCharacters, getRefName]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      className="bg-zinc-950"
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      <Background color="#27272a" gap={16} />
    </ReactFlow>
  );
}
