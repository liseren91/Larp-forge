"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const FACTION_COLORS: Record<string, string> = {};
const PALETTE = [
  "#f59e0b", "#3b82f6", "#a855f7", "#10b981", "#ef4444",
  "#ec4899", "#06b6d4", "#f97316", "#8b5cf6", "#14b8a6",
];

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

function getFactionColor(faction: string | null): string {
  if (!faction) return "#71717a";
  if (!FACTION_COLORS[faction]) {
    FACTION_COLORS[faction] = PALETTE[Object.keys(FACTION_COLORS).length % PALETTE.length];
  }
  return FACTION_COLORS[faction];
}

export default function GraphPage() {
  const { gameId } = useParams() as { gameId: string };
  const [filterFaction, setFilterFaction] = useState<string>("");
  const [filterRelType, setFilterRelType] = useState<string>("");

  const characters = trpc.character.list.useQuery({ gameId });
  const relationships = trpc.relationship.list.useQuery({ gameId });

  const factions = useMemo(() => {
    const set = new Set<string>();
    characters.data?.forEach((c) => { if (c.faction) set.add(c.faction); });
    return Array.from(set);
  }, [characters.data]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!characters.data || !relationships.data) return { nodes: [], edges: [] };

    let chars = characters.data;
    let rels = relationships.data;

    if (filterFaction) {
      const charIds = new Set(chars.filter((c) => c.faction === filterFaction).map((c) => c.id));
      chars = chars.filter((c) => charIds.has(c.id));
      rels = rels.filter((r) => charIds.has(r.fromEntityId) || charIds.has(r.toEntityId));
    }
    if (filterRelType) {
      rels = rels.filter((r) => r.type === filterRelType);
      const relCharIds = new Set(rels.flatMap((r) => [r.fromEntityId, r.toEntityId]));
      chars = chars.filter((c) => relCharIds.has(c.id));
    }

    const cols = Math.ceil(Math.sqrt(chars.length));
    const nodes: Node[] = chars.map((c, i) => ({
      id: c.id,
      position: {
        x: (i % cols) * 200 + Math.random() * 40,
        y: Math.floor(i / cols) * 160 + Math.random() * 40,
      },
      data: {
        label: c.name,
        faction: c.faction,
        relCount:
          c.relationshipsFrom.length + c.relationshipsTo.length,
      },
      style: {
        background: getFactionColor(c.faction),
        color: "#fff",
        border: "none",
        borderRadius: "12px",
        padding: "8px 14px",
        fontSize: "12px",
        fontWeight: 600,
        minWidth: 80,
        textAlign: "center" as const,
      },
    }));

    const edges: Edge[] = rels.map((r) => ({
      id: r.id,
      source: r.fromEntityId,
      target: r.toEntityId,
      label: r.type.toLowerCase(),
      style: { stroke: REL_COLORS[r.type] ?? "#71717a", strokeWidth: Math.max(1, r.intensity / 3) },
      markerEnd: r.bidirectional
        ? undefined
        : { type: MarkerType.ArrowClosed, color: REL_COLORS[r.type] ?? "#71717a" },
      labelStyle: { fontSize: 10, fill: "#a1a1aa" },
    }));

    return { nodes, edges };
  }, [characters.data, relationships.data, filterFaction, filterRelType]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (!characters.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        className="bg-zinc-950"
      >
        <Background color="#27272a" gap={20} />
        <Controls className="!bg-zinc-800 !border-zinc-700 !text-zinc-300 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-300 [&>button:hover]:!bg-zinc-700" />
        <MiniMap
          className="!bg-zinc-900 !border-zinc-700"
          nodeColor={(n) => getFactionColor(n.data?.faction)}
        />

        <Panel position="top-left" className="flex gap-2 rounded-lg bg-zinc-900/90 border border-zinc-800 p-2 backdrop-blur">
          <Select
            value={filterFaction}
            onChange={(e) => setFilterFaction(e.target.value)}
            className="h-8 text-xs w-40"
          >
            <option value="">All factions</option>
            {factions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
          <Select
            value={filterRelType}
            onChange={(e) => setFilterRelType(e.target.value)}
            className="h-8 text-xs w-40"
          >
            <option value="">All relationship types</option>
            {Object.keys(REL_COLORS).map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </Select>
        </Panel>

        <Panel position="top-right" className="rounded-lg bg-zinc-900/90 border border-zinc-800 p-3 backdrop-blur">
          <div className="text-xs text-zinc-400 space-y-1">
            <div className="font-medium text-zinc-300 mb-1">Legend</div>
            {factions.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: getFactionColor(f) }} />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
