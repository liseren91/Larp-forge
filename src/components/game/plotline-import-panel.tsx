"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Trash2,
  AlertCircle,
  GitBranch,
  Users,
  Link2,
  UserPlus,
  UserCheck,
} from "lucide-react";
import { StoryImportGraphPreview } from "./story-import-graph-preview";
import type { CharacterCandidate, RelationshipCandidate } from "./story-import-panel";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CharacterResolution = "existing" | "new-character" | "new-npc";

interface PlotlineCharacterCandidate {
  tempId: string;
  selected: boolean;
  mentionName: string;
  evidence: string;
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

type WizardStep =
  | "select-doc"
  | "analyzing"
  | "review-characters"
  | "review-relationships"
  | "applying"
  | "done";

const RELATIONSHIP_TYPES = [
  "RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE",
  "FAMILY", "MENTORSHIP", "ENMITY", "OTHER",
] as const;

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  plotlineId: string;
  plotlineName: string;
  onImported: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PlotlineImportPanel({
  open,
  onClose,
  gameId,
  plotlineId,
  plotlineName,
  onImported,
}: Props) {
  const [step, setStep] = useState<WizardStep>("select-doc");
  const [error, setError] = useState<string | null>(null);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [characters, setCharacters] = useState<PlotlineCharacterCandidate[]>([]);
  const [relationships, setRelationships] = useState<RelationshipCandidate[]>([]);

  const [applyResult, setApplyResult] = useState<{
    createdCharacters: number;
    linkedToPlotline: number;
    createdRelationships: number;
  } | null>(null);

  const files = trpc.file.list.useQuery({ gameId });
  const existingChars = trpc.character.list.useQuery({ gameId });
  const applyMutation = trpc.storyImport.applyPlotlineImport.useMutation({
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
    (tempId: string, patch: Partial<PlotlineCharacterCandidate>) =>
      setCharacters((prev) =>
        prev.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c))
      ),
    []
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
      const res = await fetch("/api/ai/extract-story-graph", {
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

      const charCandidates: PlotlineCharacterCandidate[] = (
        data.characters ?? []
      ).map((c: any) => {
        const matchedId = c.matchedEntityId ?? null;
        const matchedName = matchedId
          ? existingMap.get(matchedId) ?? null
          : null;
        const conf = c.confidence ?? 0;
        const hasMatch = matchedId && matchedName && conf >= 0.5;

        return {
          tempId:
            c.tempId ??
            `temp_${Math.random().toString(36).slice(2, 8)}`,
          selected: true,
          mentionName: c.name ?? "",
          evidence: c.evidence ?? "",
          confidence: conf,
          resolution: hasMatch
            ? ("existing" as const)
            : c.suggestedType === "NPC"
              ? ("new-npc" as const)
              : ("new-character" as const),
          selectedEntityId: hasMatch ? matchedId : null,
          suggestedEntityId: matchedId,
          suggestedEntityName: matchedName,
          name: c.name ?? "",
          faction: c.faction ?? "",
          archetype: c.archetype ?? "",
          description: c.description ?? "",
        };
      });

      // Normalize: AI uses matchedEntityId in rels for matched chars,
      // but we need tempId everywhere so user resolution changes stay consistent
      const matchedToTemp = new Map<string, string>();
      for (const c of charCandidates) {
        if (c.suggestedEntityId) {
          matchedToTemp.set(c.suggestedEntityId, c.tempId);
        }
      }

      const relCandidates: RelationshipCandidate[] = (
        data.relationships ?? []
      ).map((r: any) => ({
        tempId:
          r.tempId ?? `rel_${Math.random().toString(36).slice(2, 8)}`,
        selected: true,
        fromRef: matchedToTemp.get(r.fromRef ?? "") ?? r.fromRef ?? "",
        toRef: matchedToTemp.get(r.toRef ?? "") ?? r.toRef ?? "",
        typeLabel: RELATIONSHIP_TYPES.includes(r.typeLabel)
          ? r.typeLabel
          : "OTHER",
        description: r.description ?? "",
        intensity: Math.max(1, Math.min(10, Math.round(r.intensity ?? 5))),
        bidirectional: r.bidirectional ?? true,
        evidence: r.evidence ?? "",
      }));

      setCharacters(charCandidates);
      setRelationships(relCandidates);
      setStep("review-characters");
    } catch (err: any) {
      setError(err.message ?? "Analysis failed");
      setStep("select-doc");
    }
  };

  /* ─── Apply handler ─── */
  const handleApply = () => {
    setError(null);
    setStep("applying");

    const selectedChars = characters.filter(
      (c) => c.selected && (c.resolution === "existing" ? c.selectedEntityId : c.name.trim())
    );
    const selectedRels = relationships.filter((r) => r.selected);

    applyMutation.mutate({
      gameId,
      plotlineId,
      characters: selectedChars.map((c) => ({
        tempId: c.tempId,
        name: c.resolution === "existing"
          ? (existingChars.data?.find((e) => e.id === c.selectedEntityId)?.name ?? c.name)
          : c.name,
        type:
          c.resolution === "existing"
            ? (existingChars.data?.find((e) => e.id === c.selectedEntityId)?.type as "CHARACTER" | "NPC") ?? "CHARACTER"
            : c.resolution === "new-npc"
              ? "NPC"
              : "CHARACTER",
        faction: c.faction || undefined,
        archetype: c.archetype || undefined,
        description: c.description || undefined,
        matchedEntityId: c.resolution === "existing" ? c.selectedEntityId : null,
      })),
      relationships: selectedRels.map((r) => ({
        fromRef: r.fromRef,
        toRef: r.toRef,
        type: r.typeLabel as (typeof RELATIONSHIP_TYPES)[number],
        description: r.description || undefined,
        intensity: r.intensity,
        bidirectional: r.bidirectional,
      })),
    });
  };

  /* ─── Helpers for relationship display ─── */
  const getRefName = useCallback(
    (ref: string) => {
      const char = characters.find((c) => c.tempId === ref);
      if (char) {
        if (char.resolution === "existing" && char.selectedEntityId) {
          return existingChars.data?.find((e) => e.id === char.selectedEntityId)?.name ?? char.mentionName;
        }
        return char.name || char.mentionName;
      }
      const existing = existingChars.data?.find((c) => c.id === ref);
      if (existing) return existing.name;
      return ref;
    },
    [characters, existingChars.data]
  );

  // All rels use tempId after normalization in handleAnalyze
  const allEntityRefs = useMemo(() => {
    const refs: { id: string; name: string }[] = characters.map((c) => ({
      id: c.tempId,
      name: getRefName(c.tempId) || c.mentionName,
    }));
    for (const e of existingChars.data ?? []) {
      if (!refs.some((r) => r.id === e.id)) {
        refs.push({ id: e.id, name: e.name });
      }
    }
    return refs;
  }, [characters, existingChars.data, getRefName]);

  // Convert to CharacterCandidate for graph preview.
  // Use tempId as node key (matchedEntityId = tempId for existing → keeps tempId as key, blue color)
  const toGraphCandidates = useMemo(
    (): CharacterCandidate[] =>
      characters.map((c) => ({
        tempId: c.tempId,
        selected: c.selected,
        name: getRefName(c.tempId) || c.mentionName,
        type: c.resolution === "new-npc" ? "NPC" : "CHARACTER",
        faction: c.faction,
        archetype: c.archetype,
        description: c.description,
        matchedEntityId: c.resolution === "existing" ? c.tempId : null,
        matchedEntityName: null,
        confidence: c.confidence,
        evidence: c.evidence,
      })),
    [characters, getRefName]
  );

  /* ─── Reset on close ─── */
  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("select-doc");
      setSelectedFileId(null);
      setCharacters([]);
      setRelationships([]);
      setError(null);
      setApplyResult(null);
    }, 300);
  };

  const selectedCharsCount = characters.filter(
    (c) => c.selected && (c.resolution === "existing" ? c.selectedEntityId : c.name.trim())
  ).length;
  const selectedRelsCount = relationships.filter((r) => r.selected).length;
  const newCharsCount = characters.filter(
    (c) => c.selected && c.resolution !== "existing" && c.name.trim()
  ).length;
  const existingCharsCount = characters.filter(
    (c) => c.selected && c.resolution === "existing" && c.selectedEntityId
  ).length;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Import to "${plotlineName}"`}
      className="max-w-[min(1200px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)]"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 text-xs text-zinc-500">
        {[
          { key: "select-doc", label: "Select Document" },
          { key: "review-characters", label: "Characters" },
          { key: "review-relationships", label: "Relationships" },
        ].map((s, i) => (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="mx-1 text-zinc-700">/</span>}
            <span
              className={
                step === s.key || (step === "analyzing" && s.key === "select-doc")
                  ? "text-amber-400 font-medium"
                  : step === "done" || step === "applying"
                    ? "text-zinc-400"
                    : "text-zinc-600"
              }
            >
              {s.label}
            </span>
          </span>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ─── STEP: Select Document ─── */}
      {step === "select-doc" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Choose a document or upload a new file. The AI will extract characters
            and relationships, then you decide how to link them to{" "}
            <span className="font-medium text-zinc-200">{plotlineName}</span>.
          </p>

          {filesWithText.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Existing documents
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filesWithText.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFileId(f.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      selectedFileId === f.id
                        ? "border-amber-600 bg-amber-600/10"
                        : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-zinc-500" />
                      <span className="text-sm font-medium truncate">
                        {f.name}
                      </span>
                      <Badge color="zinc" className="text-[10px] ml-auto">
                        {f.category}
                      </Badge>
                    </div>
                    {f.extractedText && (
                      <p className="mt-1 text-xs text-zinc-500 truncate">
                        {f.extractedText.slice(0, 120)}...
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-zinc-800 pt-4">
            <label className="text-sm font-medium text-zinc-300 mb-2 block">
              Or upload a new file
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => handleUpload(e.target.files)}
                className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:text-zinc-300 hover:file:bg-zinc-700"
              />
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  Uploading...
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-600">PDF, DOCX, TXT, MD</p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleAnalyze}
              disabled={!selectedFileId || uploading}
            >
              <Sparkles size={14} className="mr-1" />
              Analyze Document
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: Analyzing ─── */}
      {step === "analyzing" && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-amber-400">
            Analyzing document and extracting characters...
          </span>
          <span className="text-xs text-zinc-500">
            This may take a moment for longer documents
          </span>
        </div>
      )}

      {/* ─── STEP: Review Characters ─── */}
      {step === "review-characters" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Users size={16} />
              Extracted Characters ({characters.length})
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              For each character found in the document, choose to link an
              existing character or create a new one.
            </p>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {characters.map((row) => (
              <div
                key={row.tempId}
                className={`rounded-lg border p-3 transition-colors ${
                  row.selected
                    ? "border-zinc-700 bg-zinc-900/70"
                    : "border-zinc-800/50 bg-zinc-950/50 opacity-50"
                }`}
              >
                {/* Header: checkbox + mention name + evidence */}
                <div className="flex items-start gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => updateChar(row.tempId, { selected: !row.selected })}
                    className="rounded mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-zinc-100">
                        &ldquo;{row.mentionName}&rdquo;
                      </span>
                      {row.suggestedEntityId && row.resolution !== "existing" && (
                        <span className="text-[10px] text-zinc-500">
                          AI suggested: {row.suggestedEntityName} ({Math.round(row.confidence * 100)}%)
                        </span>
                      )}
                    </div>
                    {row.evidence && (
                      <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 italic">
                        {row.evidence}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setCharacters((prev) =>
                        prev.filter((c) => c.tempId !== row.tempId)
                      )
                    }
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {row.selected && (
                  <>
                    {/* Resolution toggle */}
                    <div className="flex gap-1 mb-2">
                      <button
                        onClick={() =>
                          updateChar(row.tempId, {
                            resolution: "existing",
                            selectedEntityId:
                              row.selectedEntityId ?? row.suggestedEntityId ?? null,
                          })
                        }
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          row.resolution === "existing"
                            ? "bg-blue-600/20 text-blue-300 border border-blue-600/50"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
                        }`}
                      >
                        <UserCheck size={12} />
                        Use existing
                      </button>
                      <button
                        onClick={() =>
                          updateChar(row.tempId, { resolution: "new-character" })
                        }
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          row.resolution === "new-character"
                            ? "bg-amber-600/20 text-amber-300 border border-amber-600/50"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
                        }`}
                      >
                        <UserPlus size={12} />
                        Create PC
                      </button>
                      <button
                        onClick={() =>
                          updateChar(row.tempId, { resolution: "new-npc" })
                        }
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          row.resolution === "new-npc"
                            ? "bg-purple-600/20 text-purple-300 border border-purple-600/50"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
                        }`}
                      >
                        <UserPlus size={12} />
                        Create NPC
                      </button>
                    </div>

                    {/* Resolution details */}
                    {row.resolution === "existing" ? (
                      <div>
                        <Select
                          value={row.selectedEntityId ?? ""}
                          onChange={(e) =>
                            updateChar(row.tempId, {
                              selectedEntityId: e.target.value || null,
                            })
                          }
                          className="h-8 text-xs"
                        >
                          <option value="">Select a character...</option>
                          {(existingChars.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.faction ? ` (${c.faction})` : ""}
                              {" — "}
                              {c.type}
                            </option>
                          ))}
                        </Select>
                        {!row.selectedEntityId && (
                          <p className="text-[10px] text-amber-500 mt-1">
                            Please select a character to link
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_1fr] gap-2">
                        <div>
                          <Input
                            value={row.name}
                            onChange={(e) =>
                              updateChar(row.tempId, { name: e.target.value })
                            }
                            placeholder="Name"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Input
                            value={row.faction}
                            onChange={(e) =>
                              updateChar(row.tempId, { faction: e.target.value })
                            }
                            placeholder="Faction"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Input
                            value={row.archetype}
                            onChange={(e) =>
                              updateChar(row.tempId, {
                                archetype: e.target.value,
                              })
                            }
                            placeholder="Archetype"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Input
                            value={row.description}
                            onChange={(e) =>
                              updateChar(row.tempId, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Description"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("select-doc")}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {existingCharsCount} linked, {newCharsCount} new
              </span>
              <Button onClick={() => setStep("review-relationships")}>
                Relationships
                <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP: Review Relationships ─── */}
      {step === "review-relationships" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Link2 size={16} />
              Extracted Relationships ({relationships.length})
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Review relationship suggestions. They will be created under{" "}
              <span className="text-zinc-300">{plotlineName}</span>.
            </p>
          </div>

          {relationships.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No relationships were extracted from the document.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-2 w-8">
                      <input
                        type="checkbox"
                        checked={relationships.every((r) => r.selected)}
                        onChange={() => {
                          const allSel = relationships.every((r) => r.selected);
                          setRelationships((prev) =>
                            prev.map((r) => ({ ...r, selected: !allSel }))
                          );
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="pb-2 pr-2">From</th>
                    <th className="pb-2 pr-2">To</th>
                    <th className="pb-2 pr-2 w-32">Type</th>
                    <th className="pb-2 pr-2">Description</th>
                    <th className="pb-2 pr-2 w-20">Intensity</th>
                    <th className="pb-2 pr-2 w-16">Bidir</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {relationships.map((rel) => (
                    <tr
                      key={rel.tempId}
                      className="border-b border-zinc-800/50 group"
                    >
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={rel.selected}
                          onChange={() =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? { ...r, selected: !r.selected }
                                  : r
                              )
                            )
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Select
                          value={rel.fromRef}
                          onChange={(e) =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? { ...r, fromRef: e.target.value }
                                  : r
                              )
                            )
                          }
                          className="h-7 text-xs"
                        >
                          {allEntityRefs.map((ref) => (
                            <option key={ref.id} value={ref.id}>
                              {ref.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Select
                          value={rel.toRef}
                          onChange={(e) =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? { ...r, toRef: e.target.value }
                                  : r
                              )
                            )
                          }
                          className="h-7 text-xs"
                        >
                          {allEntityRefs.map((ref) => (
                            <option key={ref.id} value={ref.id}>
                              {ref.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Select
                          value={rel.typeLabel}
                          onChange={(e) =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? { ...r, typeLabel: e.target.value }
                                  : r
                              )
                            )
                          }
                          className="h-7 text-xs"
                        >
                          {RELATIONSHIP_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t.charAt(0) + t.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={rel.description}
                          onChange={(e) =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? { ...r, description: e.target.value }
                                  : r
                              )
                            )
                          }
                          placeholder="Description"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={rel.intensity}
                          onChange={(e) =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? {
                                      ...r,
                                      intensity:
                                        parseInt(e.target.value) || 5,
                                    }
                                  : r
                              )
                            )
                          }
                          className="h-7 text-xs w-16"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={rel.bidirectional}
                          onChange={() =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId
                                  ? { ...r, bidirectional: !r.bidirectional }
                                  : r
                              )
                            )
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          onClick={() =>
                            setRelationships((prev) =>
                              prev.filter((r) => r.tempId !== rel.tempId)
                            )
                          }
                          className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {relationships.some((r) => r.evidence) && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer hover:text-zinc-300">
                Show AI evidence
              </summary>
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {relationships
                  .filter((r) => r.evidence)
                  .map((r) => (
                    <p key={r.tempId}>
                      <span className="text-zinc-400 font-medium">
                        {getRefName(r.fromRef)} &rarr; {getRefName(r.toRef)}:
                      </span>{" "}
                      {r.evidence}
                    </p>
                  ))}
              </div>
            </details>
          )}

          {relationships.length > 0 && (
            <details className="border border-zinc-800 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-2">
                <GitBranch size={14} />
                Graph Preview
              </summary>
              <div className="h-64 border-t border-zinc-800">
                <StoryImportGraphPreview
                  characters={toGraphCandidates}
                  relationships={relationships.filter((r) => r.selected)}
                  existingCharacters={existingChars.data ?? []}
                  getRefName={getRefName}
                />
              </div>
            </details>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => setStep("review-characters")}
            >
              <ArrowLeft size={14} className="mr-1" /> Characters
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {selectedCharsCount} char
                {selectedCharsCount !== 1 ? "s" : ""},{" "}
                {selectedRelsCount} rel
                {selectedRelsCount !== 1 ? "s" : ""}
              </span>
              <Button
                onClick={handleApply}
                disabled={selectedCharsCount === 0}
              >
                <Check size={14} className="mr-1" />
                Apply Import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP: Applying ─── */}
      {step === "applying" && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-amber-400">
            Creating characters, linking to plotline...
          </span>
        </div>
      )}

      {/* ─── STEP: Done ─── */}
      {step === "done" && applyResult && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="h-12 w-12 rounded-full bg-emerald-900/30 border border-emerald-800 flex items-center justify-center">
            <Check size={24} className="text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold">Import Complete</h3>
          <div className="text-sm text-zinc-400 text-center space-y-1">
            {applyResult.createdCharacters > 0 && (
              <p>
                {applyResult.createdCharacters} new character
                {applyResult.createdCharacters !== 1 ? "s" : ""} created
              </p>
            )}
            {applyResult.linkedToPlotline > 0 && (
              <p>
                {applyResult.linkedToPlotline} character
                {applyResult.linkedToPlotline !== 1 ? "s" : ""} linked to{" "}
                <span className="text-zinc-200">{plotlineName}</span>
              </p>
            )}
            {applyResult.createdRelationships > 0 && (
              <p>
                {applyResult.createdRelationships} relationship
                {applyResult.createdRelationships !== 1 ? "s" : ""} created
              </p>
            )}
            {applyResult.createdCharacters === 0 &&
              applyResult.linkedToPlotline === 0 &&
              applyResult.createdRelationships === 0 && (
                <p>No changes were needed — all entities already linked.</p>
              )}
          </div>
          <Button onClick={handleClose} className="mt-2">
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}
