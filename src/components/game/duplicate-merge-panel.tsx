"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AlertTriangle, GitMerge, RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  onMerged: () => void;
}

type MergeField = "name" | "type" | "faction" | "archetype" | "description" | "status";

export function DuplicateMergePanel({ open, onClose, gameId, onMerged }: Props) {
  const duplicates = trpc.character.findDuplicateNames.useQuery(
    { gameId },
    { enabled: open }
  );
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [sourceId, setSourceId] = useState<string>("");
  const [fieldStrategy, setFieldStrategy] = useState<Partial<Record<MergeField, "target" | "source">>>({});

  const selectedGroup = useMemo(() => {
    if (!duplicates.data?.length) return undefined;
    return duplicates.data.find((g) => g.normalizedName === selectedGroupKey) ?? duplicates.data[0];
  }, [duplicates.data, selectedGroupKey]);

  const entities = selectedGroup?.entities ?? [];

  const preview = trpc.character.previewMerge.useQuery(
    { gameId, targetId, sourceId },
    { enabled: open && !!targetId && !!sourceId && targetId !== sourceId }
  );

  const mergeMutation = trpc.character.mergeDuplicate.useMutation({
    onSuccess: () => {
      duplicates.refetch();
      onMerged();
      setSourceId("");
      setFieldStrategy({});
    },
  });

  const applySuggestedFromPreview = () => {
    if (!preview.data) return;
    const next: Partial<Record<MergeField, "target" | "source">> = {};
    for (const diff of preview.data.fieldDiffs) {
      if (diff.different) next[diff.field as MergeField] = diff.suggested as "target" | "source";
    }
    setFieldStrategy(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Duplicate finder & merge"
      className="max-w-[min(1100px,calc(100vw-2rem))]"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-xs text-zinc-400">
          <p>
            Finds characters with same normalized name and merges one duplicate into another with preview.
            Source character will be deleted after merge.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Duplicate group</label>
            <Select
              value={selectedGroup?.normalizedName ?? ""}
              onChange={(e) => {
                setSelectedGroupKey(e.target.value);
                setTargetId("");
                setSourceId("");
                setFieldStrategy({});
              }}
            >
              {(duplicates.data ?? []).map((g) => (
                <option key={g.normalizedName} value={g.normalizedName}>
                  {g.entities[0]?.name} ({g.count})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Target (keep)</label>
            <Select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                if (sourceId === e.target.value) setSourceId("");
              }}
            >
              <option value="">Select target</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} [{e.type}] rel:{e.relationshipsCount} plot:{e.plotlinesCount}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Source (remove)</label>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Select source</option>
              {entities
                .filter((e) => e.id !== targetId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} [{e.type}] rel:{e.relationshipsCount} plot:{e.plotlinesCount}
                  </option>
                ))}
            </Select>
          </div>
        </div>

        {preview.data && (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <p className="text-sm font-medium">Merge preview (field diff)</p>
              <Button variant="ghost" onClick={applySuggestedFromPreview}>
                <RefreshCw size={14} className="mr-1.5" />
                Apply suggested
              </Button>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30">
                    <th className="text-left px-2 py-2 text-zinc-400">Field</th>
                    <th className="text-left px-2 py-2 text-zinc-400">Target</th>
                    <th className="text-left px-2 py-2 text-zinc-400">Source</th>
                    <th className="text-left px-2 py-2 text-zinc-400">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.fieldDiffs.map((diff) => {
                    const strategy = fieldStrategy[diff.field as MergeField] ?? "target";
                    const resultValue = strategy === "source" ? diff.source : diff.target;
                    return (
                      <tr key={diff.field} className="border-b border-zinc-800/40 align-top">
                        <td className="px-2 py-2 font-medium">{diff.field}</td>
                        <td className="px-2 py-2 text-zinc-300 whitespace-pre-wrap">{diff.target ?? "∅"}</td>
                        <td className="px-2 py-2 text-zinc-300 whitespace-pre-wrap">{diff.source ?? "∅"}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1 mb-1">
                            <button
                              type="button"
                              onClick={() => setFieldStrategy((p) => ({ ...p, [diff.field]: "target" }))}
                              className={`px-2 py-0.5 rounded border ${
                                strategy === "target"
                                  ? "border-amber-600 text-amber-400 bg-amber-900/20"
                                  : "border-zinc-700 text-zinc-400"
                              }`}
                            >
                              keep target
                            </button>
                            <button
                              type="button"
                              onClick={() => setFieldStrategy((p) => ({ ...p, [diff.field]: "source" }))}
                              className={`px-2 py-0.5 rounded border ${
                                strategy === "source"
                                  ? "border-amber-600 text-amber-400 bg-amber-900/20"
                                  : "border-zinc-700 text-zinc-400"
                              }`}
                            >
                              use source
                            </button>
                          </div>
                          <p className="text-zinc-500 whitespace-pre-wrap">{resultValue ?? "∅"}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-400">
              Moved from source: relationships, plotline memberships, custom attributes, subroles and briefs.
            </div>
          </div>
        )}

        {(mergeMutation.error || preview.error || duplicates.error) && (
          <div className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p>{mergeMutation.error?.message ?? preview.error?.message ?? duplicates.error?.message}</p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="danger"
            disabled={!targetId || !sourceId || targetId === sourceId || mergeMutation.isPending}
            onClick={() => {
              if (!confirm("Merge duplicates? Source character will be deleted.")) return;
              mergeMutation.mutate({
                gameId,
                targetId,
                sourceId,
                fieldStrategy,
              });
            }}
          >
            <GitMerge size={14} className="mr-1.5" />
            {mergeMutation.isPending ? "Merging..." : "Merge duplicates"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

