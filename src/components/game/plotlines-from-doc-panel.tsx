"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  FileText,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  GitBranch,
  Users,
  Link2,
  UserPlus,
  UserCheck,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CharacterResolution = "existing" | "new-character" | "new-npc";

interface CharCandidate {
  tempId: string;
  selected: boolean;
  mentionName: string;
  confidence: number;
  resolution: CharacterResolution;
  selectedEntityId: string | null;
  suggestedEntityId: string | null;
  suggestedEntityName: string | null;
  name: string;
  faction: string;
  archetype: string;
  description: string;
}

interface RelCandidate {
  tempId: string;
  selected: boolean;
  fromRef: string;
  toRef: string;
  typeLabel: string;
  description: string;
  intensity: number;
  bidirectional: boolean;
}

interface PlotlineCandidate {
  tempId: string;
  selected: boolean;
  name: string;
  type: string;
  description: string;
  evidence: string;
  characterTempIds: string[];
  relationships: RelCandidate[];
}

type WizardStep =
  | "select-doc"
  | "analyzing"
  | "review-plotlines"
  | "review-characters"
  | "review-relationships"
  | "applying"
  | "done";

const PLOT_TYPES = ["POLITICAL", "PERSONAL", "MYSTERY", "ACTION", "SOCIAL", "OTHER"] as const;

const RELATIONSHIP_TYPES = [
  "RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE",
  "FAMILY", "MENTORSHIP", "ENMITY", "OTHER",
] as const;

const plotColorMap: Record<string, string> = {
  POLITICAL: "red",
  PERSONAL: "blue",
  MYSTERY: "purple",
  ACTION: "amber",
  SOCIAL: "green",
  OTHER: "zinc",
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  onImported: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PlotlinesFromDocPanel({ open, onClose, gameId, onImported }: Props) {
  const [step, setStep] = useState<WizardStep>("select-doc");
  const [error, setError] = useState<string | null>(null);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [plotlines, setPlotlines] = useState<PlotlineCandidate[]>([]);
  const [characters, setCharacters] = useState<CharCandidate[]>([]);
  const [expandedPlotline, setExpandedPlotline] = useState<string | null>(null);

  const [applyResult, setApplyResult] = useState<{
    createdPlotlines: number;
    skippedPlotlines: number;
    createdCharacters: number;
    reusedCharacters: number;
    linkedToPlotlines: number;
    createdRelationships: number;
  } | null>(null);

  const files = trpc.file.list.useQuery({ gameId });
  const existingChars = trpc.character.list.useQuery({ gameId });
  const applyMutation = trpc.storyImport.applyPlotlinesImport.useMutation({
    onSuccess: (result) => {
      setApplyResult(result);
      setStep("done");
      onImported();
    },
    onError: (err) => setError(err.message),
  });

  const filesWithText = files.data?.filter((f) => f.extractedText) ?? [];

  /* ─── Helpers ─── */

  const updateChar = useCallback(
    (tempId: string, patch: Partial<CharCandidate>) =>
      setCharacters((prev) =>
        prev.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c))
      ),
    []
  );

  const updatePlotline = useCallback(
    (tempId: string, patch: Partial<PlotlineCandidate>) =>
      setPlotlines((prev) =>
        prev.map((p) => (p.tempId === tempId ? { ...p, ...patch } : p))
      ),
    []
  );

  const getRefName = useCallback(
    (ref: string) => {
      const ch = characters.find((c) => c.tempId === ref);
      if (ch) {
        if (ch.resolution === "existing" && ch.selectedEntityId) {
          return existingChars.data?.find((e) => e.id === ch.selectedEntityId)?.name ?? ch.name;
        }
        return ch.name;
      }
      const existing = existingChars.data?.find((e) => e.id === ref);
      return existing?.name ?? ref;
    },
    [characters, existingChars.data]
  );

  /* ─── Upload handler ─── */
  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const file = fileList[0];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("gameId", gameId);
        formData.append("category", "REFERENCE");
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.id) {
          await files.refetch();
          setSelectedFileId(data.id);
        } else {
          setError(data.error ?? "Upload failed");
        }
      } catch (err: any) {
        setError(err.message ?? "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [gameId, files]
  );

  /* ─── Analyze handler ─── */
  const handleAnalyze = async () => {
    setError(null);
    setStep("analyzing");
    try {
      const res = await fetch("/api/ai/extract-plotlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, fileId: selectedFileId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setStep("select-doc");
        return;
      }

      const existingMap = new Map(
        (existingChars.data ?? []).map((c) => [c.id, c.name])
      );

      const globalChars = new Map<string, CharCandidate>();
      const plotlineCandidates: PlotlineCandidate[] = [];

      for (const pl of data.plotlines ?? []) {
        const charTempIds: string[] = [];
        for (const c of pl.characters ?? []) {
          const tid = c.tempId ?? `temp_${Math.random().toString(36).slice(2, 8)}`;
          if (!globalChars.has(tid)) {
            const matchedId = c.matchedEntityId ?? null;
            const matchedName = matchedId ? existingMap.get(matchedId) ?? null : null;
            const conf = c.confidence ?? 0;
            const hasMatch = matchedId && matchedName && conf >= 0.5;

            globalChars.set(tid, {
              tempId: tid,
              selected: true,
              mentionName: c.name ?? "",
              confidence: conf,
              resolution: hasMatch
                ? "existing"
                : c.suggestedType === "NPC"
                  ? "new-npc"
                  : "new-character",
              selectedEntityId: hasMatch ? matchedId : null,
              suggestedEntityId: matchedId,
              suggestedEntityName: matchedName,
              name: c.name ?? "",
              faction: c.faction ?? "",
              archetype: c.archetype ?? "",
              description: c.description ?? "",
            });
          }
          charTempIds.push(tid);
        }

        const matchedToTemp = new Map<string, string>();
        for (const c of globalChars.values()) {
          if (c.suggestedEntityId) matchedToTemp.set(c.suggestedEntityId, c.tempId);
        }

        const rels: RelCandidate[] = (pl.relationships ?? []).map((r: any) => ({
          tempId: r.tempId ?? `rel_${Math.random().toString(36).slice(2, 8)}`,
          selected: true,
          fromRef: matchedToTemp.get(r.fromRef ?? "") ?? r.fromRef ?? "",
          toRef: matchedToTemp.get(r.toRef ?? "") ?? r.toRef ?? "",
          typeLabel: RELATIONSHIP_TYPES.includes(r.typeLabel) ? r.typeLabel : "OTHER",
          description: r.description ?? "",
          intensity: Math.max(1, Math.min(10, Math.round(r.intensity ?? 5))),
          bidirectional: r.bidirectional ?? true,
        }));

        plotlineCandidates.push({
          tempId: pl.tempId ?? `pl_${Math.random().toString(36).slice(2, 8)}`,
          selected: true,
          name: pl.name ?? "Unnamed Plotline",
          type: PLOT_TYPES.includes(pl.type) ? pl.type : "OTHER",
          description: pl.description ?? "",
          evidence: pl.evidence ?? "",
          characterTempIds: charTempIds,
          relationships: rels,
        });
      }

      setCharacters(Array.from(globalChars.values()));
      setPlotlines(plotlineCandidates);
      setStep("review-plotlines");
    } catch (err: any) {
      setError(err.message ?? "Analysis failed");
      setStep("select-doc");
    }
  };

  /* ─── Apply handler ─── */
  const handleApply = () => {
    setError(null);
    setStep("applying");

    const selectedPlotlines = plotlines.filter((p) => p.selected);
    const selectedCharTempIds = new Set<string>();
    for (const pl of selectedPlotlines) {
      for (const tid of pl.characterTempIds) selectedCharTempIds.add(tid);
    }

    const relevantChars = characters.filter(
      (c) => c.selected && selectedCharTempIds.has(c.tempId)
        && (c.resolution === "existing" ? c.selectedEntityId : c.name.trim())
    );

    applyMutation.mutate({
      gameId,
      plotlines: selectedPlotlines.map((pl) => ({
        tempId: pl.tempId,
        name: pl.name,
        type: pl.type as any,
        description: pl.description || undefined,
        characters: relevantChars
          .filter((c) => pl.characterTempIds.includes(c.tempId))
          .map((c) => ({
            tempId: c.tempId,
            name: c.resolution === "existing"
              ? (existingChars.data?.find((e) => e.id === c.selectedEntityId)?.name ?? c.name)
              : c.name,
            type: c.resolution === "existing"
              ? ((existingChars.data?.find((e) => e.id === c.selectedEntityId)?.type as "CHARACTER" | "NPC") ?? "CHARACTER")
              : c.resolution === "new-npc" ? "NPC" : "CHARACTER",
            faction: c.faction || undefined,
            archetype: c.archetype || undefined,
            description: c.description || undefined,
            matchedEntityId: c.resolution === "existing" ? c.selectedEntityId : null,
          })),
        relationships: pl.relationships
          .filter((r) => r.selected)
          .map((r) => ({
            fromRef: r.fromRef,
            toRef: r.toRef,
            type: r.typeLabel as any,
            description: r.description || undefined,
            intensity: r.intensity,
            bidirectional: r.bidirectional,
          })),
      })),
    });
  };

  /* ─── Reset & Close ─── */
  const handleClose = () => {
    setStep("select-doc");
    setError(null);
    setSelectedFileId(null);
    setPlotlines([]);
    setCharacters([]);
    setApplyResult(null);
    setExpandedPlotline(null);
    onClose();
  };

  /* ─── Derived data ─── */
  const selectedPlotlines = plotlines.filter((p) => p.selected);
  const totalCharsInSelected = useMemo(() => {
    const ids = new Set<string>();
    for (const pl of selectedPlotlines) {
      for (const tid of pl.characterTempIds) ids.add(tid);
    }
    return ids.size;
  }, [selectedPlotlines]);

  const totalRelsInSelected = useMemo(() => {
    return selectedPlotlines.reduce((sum, pl) => sum + pl.relationships.filter((r) => r.selected).length, 0);
  }, [selectedPlotlines]);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Plotlines from Document"
      className="max-w-2xl"
    >
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-300">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ─── STEP: select-doc ─── */}
      {step === "select-doc" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Upload or select a document that describes your game&apos;s storylines.
            AI will extract plotlines, characters, and relationships from it.
          </p>

          {filesWithText.length > 0 && (
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Existing documents</label>
              <Select
                value={selectedFileId ?? ""}
                onChange={(e) => setSelectedFileId(e.target.value || null)}
              >
                <option value="">Select a document...</option>
                {filesWithText.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">or</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <FileText size={14} className="mr-1" />
              {uploading ? "Uploading..." : "Upload new file"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleAnalyze} disabled={!selectedFileId}>
              <Sparkles size={14} className="mr-1" /> Analyze
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: analyzing ─── */}
      {step === "analyzing" && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Sparkles size={32} className="animate-pulse text-amber-400" />
          <p className="text-sm text-zinc-400">Analyzing document for plotlines...</p>
          <p className="text-xs text-zinc-600">This may take 20-30 seconds</p>
        </div>
      )}

      {/* ─── STEP: review-plotlines ─── */}
      {step === "review-plotlines" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Extracted Plotlines ({plotlines.length})
            </h3>
            <p className="text-xs text-zinc-500">
              {selectedPlotlines.length} selected
            </p>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {plotlines.map((pl) => (
              <div
                key={pl.tempId}
                className={`rounded-lg border p-4 transition-colors ${
                  pl.selected
                    ? "border-zinc-700 bg-zinc-800/50"
                    : "border-zinc-800 bg-zinc-900/30 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={pl.selected}
                    onChange={(e) =>
                      updatePlotline(pl.tempId, { selected: e.target.checked })
                    }
                    className="mt-1 accent-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Input
                        value={pl.name}
                        onChange={(e) =>
                          updatePlotline(pl.tempId, { name: e.target.value })
                        }
                        className="font-semibold text-sm h-7 px-2"
                      />
                      <Select
                        value={pl.type}
                        onChange={(e) =>
                          updatePlotline(pl.tempId, { type: e.target.value })
                        }
                        className="w-32 h-7 text-xs"
                      >
                        {PLOT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t.charAt(0) + t.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <textarea
                      value={pl.description}
                      onChange={(e) =>
                        updatePlotline(pl.tempId, { description: e.target.value })
                      }
                      className="w-full text-xs text-zinc-400 bg-transparent border border-zinc-800 rounded px-2 py-1 mt-1 resize-none"
                      rows={2}
                    />
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Users size={10} /> {pl.characterTempIds.length} characters
                      </span>
                      <span className="flex items-center gap-1">
                        <Link2 size={10} /> {pl.relationships.length} relationships
                      </span>
                    </div>
                    {pl.evidence && (
                      <p className="mt-2 text-xs text-zinc-600 italic line-clamp-2">
                        &ldquo;{pl.evidence}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("select-doc")}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep("review-characters")}
              disabled={selectedPlotlines.length === 0}
            >
              Review Characters <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: review-characters ─── */}
      {step === "review-characters" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Characters ({characters.length})
            </h3>
            <p className="text-xs text-zinc-500">
              Across {selectedPlotlines.length} plotlines
            </p>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {characters.map((c) => {
              const inSelectedPlotlines = selectedPlotlines.some((pl) =>
                pl.characterTempIds.includes(c.tempId)
              );
              if (!inSelectedPlotlines) return null;

              return (
                <div
                  key={c.tempId}
                  className={`rounded-lg border p-3 ${
                    c.selected
                      ? "border-zinc-700 bg-zinc-800/50"
                      : "border-zinc-800 bg-zinc-900/30 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={(e) =>
                        updateChar(c.tempId, { selected: e.target.checked })
                      }
                      className="mt-1 accent-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-sm font-medium">{c.mentionName}</span>
                        {c.suggestedEntityName && (
                          <Badge color="blue" className="text-[10px]">
                            matched: {c.suggestedEntityName} ({Math.round(c.confidence * 100)}%)
                          </Badge>
                        )}
                        {((c.resolution === "existing" && c.selectedEntityId) || c.suggestedEntityId) && (
                          <Link
                            href={`/game/${gameId}/characters?open=${c.selectedEntityId ?? c.suggestedEntityId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300"
                          >
                            <ExternalLink size={10} /> Open character
                          </Link>
                        )}
                      </div>

                      {(c.description || c.faction || c.archetype) && (
                        <div className="mb-2 rounded bg-zinc-900/60 border border-zinc-800 px-2 py-1.5 text-xs text-zinc-400">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">From document</span>
                          {c.description && (
                            <p className="mt-0.5 line-clamp-4">{c.description}</p>
                          )}
                          {(c.faction || c.archetype) && (
                            <p className="mt-1 text-zinc-500">
                              {[c.faction, c.archetype].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex gap-1 mb-2">
                        <button
                          onClick={() =>
                            updateChar(c.tempId, {
                              resolution: "existing",
                              selectedEntityId: c.suggestedEntityId,
                            })
                          }
                          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                            c.resolution === "existing"
                              ? "bg-blue-600 text-white"
                              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                          }`}
                          disabled={!(existingChars.data?.length)}
                        >
                          <UserCheck size={10} /> Use existing
                        </button>
                        <button
                          onClick={() =>
                            updateChar(c.tempId, { resolution: "new-character" })
                          }
                          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                            c.resolution === "new-character"
                              ? "bg-amber-600 text-white"
                              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <UserPlus size={10} /> Create PC
                        </button>
                        <button
                          onClick={() =>
                            updateChar(c.tempId, { resolution: "new-npc" })
                          }
                          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                            c.resolution === "new-npc"
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <UserPlus size={10} /> Create NPC
                        </button>
                      </div>

                      {c.resolution === "existing" && (
                        <Select
                          value={c.selectedEntityId ?? ""}
                          onChange={(e) =>
                            updateChar(c.tempId, {
                              selectedEntityId: e.target.value || null,
                            })
                          }
                          className="text-xs h-7"
                        >
                          <option value="">Select character...</option>
                          {(existingChars.data ?? []).map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} {e.faction ? `(${e.faction})` : ""}
                            </option>
                          ))}
                        </Select>
                      )}

                      {c.resolution !== "existing" && (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <Input
                            value={c.name}
                            onChange={(e) =>
                              updateChar(c.tempId, { name: e.target.value })
                            }
                            placeholder="Name"
                            className="text-xs h-7"
                          />
                          <Input
                            value={c.faction}
                            onChange={(e) =>
                              updateChar(c.tempId, { faction: e.target.value })
                            }
                            placeholder="Faction"
                            className="text-xs h-7"
                          />
                          <Input
                            value={c.archetype}
                            onChange={(e) =>
                              updateChar(c.tempId, { archetype: e.target.value })
                            }
                            placeholder="Archetype"
                            className="text-xs h-7"
                          />
                          <Input
                            value={c.description}
                            onChange={(e) =>
                              updateChar(c.tempId, { description: e.target.value })
                            }
                            placeholder="Description"
                            className="text-xs h-7"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("review-plotlines")}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
            <Button onClick={() => setStep("review-relationships")}>
              Review Relationships <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: review-relationships ─── */}
      {step === "review-relationships" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Relationships by Plotline
            </h3>
            <p className="text-xs text-zinc-500">
              {totalRelsInSelected} total across {selectedPlotlines.length} plotlines
            </p>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {selectedPlotlines.map((pl) => (
              <div key={pl.tempId} className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                <button
                  onClick={() =>
                    setExpandedPlotline(
                      expandedPlotline === pl.tempId ? null : pl.tempId
                    )
                  }
                  className="w-full flex items-center justify-between p-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-zinc-500" />
                    <span className="text-sm font-medium">{pl.name}</span>
                    <Badge color={plotColorMap[pl.type] as any} className="text-[10px]">
                      {pl.type.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {pl.relationships.filter((r) => r.selected).length} rel.
                    </span>
                  </div>
                  {expandedPlotline === pl.tempId ? (
                    <ChevronUp size={14} className="text-zinc-500" />
                  ) : (
                    <ChevronDown size={14} className="text-zinc-500" />
                  )}
                </button>

                {expandedPlotline === pl.tempId && (
                  <div className="border-t border-zinc-800 p-3 space-y-2">
                    {pl.relationships.length === 0 ? (
                      <p className="text-xs text-zinc-600">No relationships extracted for this plotline.</p>
                    ) : (
                      pl.relationships.map((rel) => (
                        <div
                          key={rel.tempId}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                            rel.selected ? "bg-zinc-800/50" : "opacity-40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={rel.selected}
                            onChange={(e) => {
                              setPlotlines((prev) =>
                                prev.map((p) =>
                                  p.tempId === pl.tempId
                                    ? {
                                        ...p,
                                        relationships: p.relationships.map((r) =>
                                          r.tempId === rel.tempId
                                            ? { ...r, selected: e.target.checked }
                                            : r
                                        ),
                                      }
                                    : p
                                )
                              );
                            }}
                            className="accent-amber-500"
                          />
                          <span className="font-medium text-zinc-300">
                            {getRefName(rel.fromRef)}
                          </span>
                          <span className="text-zinc-600">
                            {rel.bidirectional ? "↔" : "→"}
                          </span>
                          <span className="font-medium text-zinc-300">
                            {getRefName(rel.toRef)}
                          </span>
                          <Badge
                            color={
                              rel.typeLabel === "RIVALRY" || rel.typeLabel === "ENMITY"
                                ? "red"
                                : rel.typeLabel === "ALLIANCE"
                                  ? "green"
                                  : rel.typeLabel === "LOVE" || rel.typeLabel === "FAMILY"
                                    ? "blue"
                                    : "zinc"
                            }
                            className="text-[10px]"
                          >
                            {rel.typeLabel.toLowerCase()}
                          </Badge>
                          <span className="text-zinc-600 truncate flex-1">
                            {rel.description}
                          </span>
                          <span className="text-zinc-600">{rel.intensity}/10</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("review-characters")}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
            <Button onClick={handleApply}>
              <Check size={14} className="mr-1" />
              Apply ({selectedPlotlines.length} plotlines, {totalCharsInSelected} chars, {totalRelsInSelected} rels)
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: applying ─── */}
      {step === "applying" && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Sparkles size={32} className="animate-pulse text-amber-400" />
          <p className="text-sm text-zinc-400">Creating plotlines, characters, and relationships...</p>
        </div>
      )}

      {/* ─── STEP: done ─── */}
      {step === "done" && applyResult && (
        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-900/50 border border-green-700">
              <Check size={24} className="text-green-400" />
            </div>
            <h3 className="font-semibold">Import Complete</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{applyResult.createdPlotlines}</p>
              <p className="text-xs text-zinc-500">Plotlines created</p>
              {applyResult.skippedPlotlines > 0 && (
                <p className="text-[10px] text-zinc-600">{applyResult.skippedPlotlines} duplicates skipped</p>
              )}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-400">{applyResult.createdCharacters}</p>
              <p className="text-xs text-zinc-500">Characters created</p>
              {applyResult.reusedCharacters > 0 && (
                <p className="text-[10px] text-zinc-600">{applyResult.reusedCharacters} existing reused</p>
              )}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{applyResult.linkedToPlotlines}</p>
              <p className="text-xs text-zinc-500">Character-plotline links</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
              <p className="text-2xl font-bold text-purple-400">{applyResult.createdRelationships}</p>
              <p className="text-xs text-zinc-500">Relationships created</p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleClose}>
              <Check size={14} className="mr-1" /> Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
