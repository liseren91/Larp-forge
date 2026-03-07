"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ListChecks, Settings } from "lucide-react";
import Link from "next/link";

export default function PipelinePage() {
  const { gameId } = useParams() as { gameId: string };

  const stages = trpc.briefPipeline.listStages.useQuery({ gameId });
  const progress = trpc.briefPipeline.getProgress.useQuery({ gameId });
  const characters = trpc.character.list.useQuery({ gameId });
  const setStage = trpc.briefPipeline.setCurrentStage.useMutation({
    onSuccess: () => progress.refetch(),
  });
  const toggleCb = trpc.briefPipeline.toggleCheckbox.useMutation({
    onSuccess: () => progress.refetch(),
  });

  const stagesData = stages.data ?? [];
  const progressData = progress.data ?? [];
  const charsData = characters.data ?? [];

  const kanbanStages = stagesData.filter((s) => s.stageType === "KANBAN_COLUMN");
  const checkboxStages = stagesData.filter((s) => s.stageType === "CHECKBOX");

  const progressMap = new Map(progressData.map((p) => [p.characterId, p]));

  if (stagesData.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500">
        <ListChecks size={48} />
        <p className="text-lg font-medium">No pipeline configured</p>
        <p className="text-sm">Set up workflow stages in game settings first.</p>
        <Link href={`/game/${gameId}/settings`}>
          <Button variant="secondary">
            <Settings size={14} className="mr-1" /> Go to Settings
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Brief Pipeline</h1>
          <span className="text-xs text-zinc-500">
            {charsData.length} characters, {stagesData.length} stages
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-r border-zinc-800 bg-zinc-950 px-4 py-2 text-left text-xs font-medium text-zinc-500">
                Character
              </th>
              {kanbanStages.length > 0 && (
                <th className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-center text-xs font-medium text-zinc-500">
                  Stage
                </th>
              )}
              {checkboxStages.map((s) => (
                <th
                  key={s.id}
                  className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-center"
                >
                  <div className="flex items-center justify-center gap-1">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-xs font-medium text-zinc-400">{s.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {charsData.map((char) => {
              const prog = progressMap.get(char.id);
              const checkedSet = new Set(
                prog?.checkedStages.filter((cs) => cs.checked).map((cs) => cs.stageId) ?? []
              );

              const allChecked =
                checkboxStages.length > 0 &&
                checkboxStages.every((s) => checkedSet.has(s.id));

              return (
                <tr
                  key={char.id}
                  className={`border-b border-zinc-800/30 hover:bg-zinc-900/50 ${
                    allChecked ? "bg-emerald-950/20" : ""
                  }`}
                >
                  <td className="sticky left-0 z-10 border-r border-zinc-800 bg-zinc-950 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-300">{char.name}</span>
                      {char.faction && (
                        <Badge color="blue" className="text-[10px]">
                          {char.faction}
                        </Badge>
                      )}
                      <Badge
                        color={char.type === "NPC" ? "purple" : "zinc"}
                        className="text-[10px]"
                      >
                        {char.type}
                      </Badge>
                    </div>
                  </td>
                  {kanbanStages.length > 0 && (
                    <td className="px-3 py-2 text-center">
                      <Select
                        className="h-7 w-auto text-xs"
                        value={prog?.currentStageId ?? ""}
                        onChange={(e) =>
                          setStage.mutate({
                            characterId: char.id,
                            stageId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">— none —</option>
                        {kanbanStages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                  )}
                  {checkboxStages.map((s) => (
                    <td key={s.id} className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          toggleCb.mutate({ characterId: char.id, stageId: s.id })
                        }
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          checkedSet.has(s.id)
                            ? "border-transparent text-white"
                            : "border-zinc-700 hover:border-zinc-500"
                        }`}
                        style={
                          checkedSet.has(s.id)
                            ? { backgroundColor: s.color }
                            : undefined
                        }
                      >
                        {checkedSet.has(s.id) && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2.5 6L5 8.5L9.5 3.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
