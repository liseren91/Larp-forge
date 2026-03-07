"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Grid3X3, ShieldCheck, Filter, Loader2 } from "lucide-react";

const factionColors: Record<string, string> = {};
const palette = [
  "#f59e0b", "#3b82f6", "#8b5cf6", "#10b981", "#ef4444",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];
function getFactionColor(faction: string | null): string {
  if (!faction) return "#6b7280";
  if (!factionColors[faction]) {
    factionColors[faction] = palette[Object.keys(factionColors).length % palette.length];
  }
  return factionColors[faction];
}

export default function MatrixPage() {
  const { gameId } = useParams() as { gameId: string };
  const [filterText, setFilterText] = useState("");
  const [factionFilter, setFactionFilter] = useState<string[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);

  const matrix = trpc.plotlineMatrix.getData.useQuery({ gameId });
  const toggleCell = trpc.plotlineMatrix.toggleCell.useMutation({
    onSuccess: () => matrix.refetch(),
  });

  const data = matrix.data;

  const factions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.characters.map((c) => c.faction).filter(Boolean))] as string[];
  }, [data]);

  const filteredCharacters = useMemo(() => {
    if (!data) return [];
    return data.characters.filter((c) => {
      if (filterText && !c.name.toLowerCase().includes(filterText.toLowerCase())) return false;
      if (factionFilter.length > 0 && !factionFilter.includes(c.faction ?? "")) return false;
      return true;
    });
  }, [data, filterText, factionFilter]);

  const runMatrixAudit = async () => {
    setIsAuditing(true);
    setAuditResult(null);
    try {
      const resp = await fetch("/api/ai/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, mode: "plotline_matrix" }),
      });
      const json = await resp.json();
      setAuditResult(json.summary || json.error || "Audit complete.");
    } catch {
      setAuditResult("Audit failed.");
    } finally {
      setIsAuditing(false);
    }
  };

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (data.plotlines.length === 0 || data.characters.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500">
        <Grid3X3 size={48} />
        <p className="text-lg font-medium">No matrix data yet</p>
        <p className="text-sm">Create characters and plotlines first, then manage assignments here.</p>
      </div>
    );
  }

  const avgTotal =
    Object.values(data.columnTotals).reduce((a, b) => a + b, 0) / data.characters.length || 1;

  function getTotalColor(total: number): string {
    if (total < 3) return "#ef4444";
    if (total < avgTotal) return "#f59e0b";
    return "#10b981";
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Plotline Matrix</h1>
          <span className="text-xs text-zinc-500">
            {data.characters.length} characters × {data.plotlines.length} plotlines
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-zinc-500" />
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter characters..."
              className="h-8 w-40 text-xs"
            />
          </div>
          {factions.length > 1 && (
            <div className="flex gap-1">
              {factions.map((f) => (
                <button
                  key={f}
                  onClick={() =>
                    setFactionFilter((prev) =>
                      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
                    )
                  }
                  className={`rounded px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                    factionFilter.includes(f)
                      ? "border-amber-500 text-amber-400"
                      : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={runMatrixAudit} disabled={isAuditing}>
            {isAuditing ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <ShieldCheck size={14} className="mr-1" />
            )}
            AI Audit
          </Button>
        </div>
      </div>

      {auditResult && (
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
          <div className="flex items-start justify-between">
            <pre className="whitespace-pre-wrap text-sm text-zinc-300 max-h-60 overflow-y-auto flex-1">
              {auditResult}
            </pre>
            <button
              onClick={() => setAuditResult(null)}
              className="ml-4 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-r border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs font-medium text-zinc-500">
                Plotline
              </th>
              {filteredCharacters.map((c) => (
                <th
                  key={c.id}
                  className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-1 py-2 text-center"
                >
                  <div
                    className="flex flex-col items-center gap-0.5"
                    style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                  >
                    <span className="text-[10px] font-medium text-zinc-300 max-h-24 overflow-hidden">
                      {c.name}
                    </span>
                    {c.faction && (
                      <span
                        className="text-[8px] font-medium"
                        style={{ color: getFactionColor(c.faction) }}
                      >
                        {c.faction}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-l border-zinc-800 bg-zinc-950 px-3 py-2 text-center text-[10px] text-zinc-500">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.plotlines.map((pl) => {
              const cellSet = new Set(data.cells[pl.id] ?? []);
              return (
                <tr key={pl.id} className="group hover:bg-zinc-900/50">
                  <td className="sticky left-0 z-10 border-r border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-300 group-hover:bg-zinc-900">
                    <div className="flex items-center gap-1.5">
                      {pl.name}
                      <Badge color="zinc" className="text-[8px]">
                        {pl.type.toLowerCase()}
                      </Badge>
                    </div>
                  </td>
                  {filteredCharacters.map((c) => {
                    const active = cellSet.has(c.id);
                    return (
                      <td
                        key={c.id}
                        className="border-zinc-800/30 px-1 py-1 text-center"
                      >
                        <button
                          onClick={() =>
                            toggleCell.mutate({ plotlineId: pl.id, characterId: c.id })
                          }
                          className={`inline-block h-5 w-5 rounded transition-colors ${
                            active
                              ? "shadow-sm"
                              : "border border-zinc-800 hover:border-zinc-600"
                          }`}
                          style={
                            active
                              ? { backgroundColor: getFactionColor(c.faction) }
                              : undefined
                          }
                        />
                      </td>
                    );
                  })}
                  <td className="border-l border-zinc-800 px-3 py-1.5 text-center text-xs text-zinc-400">
                    {data.rowTotals[pl.id] ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-800">
              <td className="sticky left-0 z-10 border-r border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-500">
                Total
              </td>
              {filteredCharacters.map((c) => {
                const total = data.columnTotals[c.id] ?? 0;
                return (
                  <td key={c.id} className="px-1 py-2 text-center">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                      style={{
                        color: getTotalColor(total),
                        backgroundColor: `${getTotalColor(total)}15`,
                      }}
                    >
                      {total}
                    </span>
                  </td>
                );
              })}
              <td className="border-l border-zinc-800 px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
