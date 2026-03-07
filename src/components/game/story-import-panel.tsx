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
  Upload,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Trash2,
  AlertCircle,
  GitBranch,
  Users,
  Link2,
} from "lucide-react";
import { StoryImportGraphPreview } from "./story-import-graph-preview";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CharacterCandidate {
  tempId: string;
  selected: boolean;
  name: string;
  type: "CHARACTER" | "NPC";
  faction: string;
  archetype: string;
  description: string;
  matchedEntityId: string | null;
  matchedEntityName: string | null;
  confidence: number;
  evidence: string;
}

export interface RelationshipCandidate {
  tempId: string;
  selected: boolean;
  fromRef: string;
  toRef: string;
  typeLabel: string;
  description: string;
  intensity: number;
  bidirectional: boolean;
  evidence: string;
}

type WizardStep = "select-doc" | "analyzing" | "review-characters" | "review-relationships" | "applying" | "done";

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
  onCreated: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StoryImportPanel({ open, onClose, gameId, onCreated }: Props) {
  const [step, setStep] = useState<WizardStep>("select-doc");
  const [error, setError] = useState<string | null>(null);

  // Step 1 — document selection
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2–3 — candidates
  const [characters, setCharacters] = useState<CharacterCandidate[]>([]);
  const [relationships, setRelationships] = useState<RelationshipCandidate[]>([]);

  // Step 5 — results
  const [applyResult, setApplyResult] = useState<{
    createdCharacters: number;
    updatedTypes: number;
    createdRelationships: number;
  } | null>(null);

  const files = trpc.file.list.useQuery({ gameId });
  const existingChars = trpc.character.list.useQuery({ gameId });
  const applyMutation = trpc.storyImport.applyImport.useMutation({
    onSuccess: (result) => {
      setApplyResult(result);
      setStep("done");
      onCreated();
    },
    onError: (err) => setError(err.message),
  });

  const filesWithText = files.data?.filter((f) => f.extractedText) ?? [];

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
        const res = await fetch("/api/files/upload", { method: "POST", body: formData });
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

      const charCandidates: CharacterCandidate[] = (data.characters ?? []).map((c: any) => ({
        tempId: c.tempId ?? `temp_${Math.random().toString(36).slice(2, 8)}`,
        selected: true,
        name: c.name ?? "",
        type: c.suggestedType === "NPC" ? "NPC" : "CHARACTER",
        faction: c.faction ?? "",
        archetype: c.archetype ?? "",
        description: c.description ?? "",
        matchedEntityId: c.matchedEntityId ?? null,
        matchedEntityName: c.matchedEntityId ? (existingMap.get(c.matchedEntityId) ?? null) : null,
        confidence: c.confidence ?? 0,
        evidence: c.evidence ?? "",
      }));

      const relCandidates: RelationshipCandidate[] = (data.relationships ?? []).map((r: any) => ({
        tempId: r.tempId ?? `rel_${Math.random().toString(36).slice(2, 8)}`,
        selected: true,
        fromRef: r.fromRef ?? "",
        toRef: r.toRef ?? "",
        typeLabel: RELATIONSHIP_TYPES.includes(r.typeLabel) ? r.typeLabel : "OTHER",
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

    const selectedChars = characters.filter((c) => c.selected && c.name.trim());
    const selectedRels = relationships.filter((r) => r.selected);

    const typeUpdates: { entityId: string; type: "CHARACTER" | "NPC" }[] = [];
    for (const c of selectedChars) {
      if (c.matchedEntityId) {
        const existing = existingChars.data?.find((e) => e.id === c.matchedEntityId);
        if (existing && existing.type !== c.type) {
          typeUpdates.push({ entityId: c.matchedEntityId, type: c.type });
        }
      }
    }

    applyMutation.mutate({
      gameId,
      characters: selectedChars.map((c) => ({
        tempId: c.tempId,
        name: c.name,
        type: c.type,
        faction: c.faction || undefined,
        archetype: c.archetype || undefined,
        description: c.description || undefined,
        matchedEntityId: c.matchedEntityId,
      })),
      relationships: selectedRels.map((r) => ({
        fromRef: r.fromRef,
        toRef: r.toRef,
        type: r.typeLabel as (typeof RELATIONSHIP_TYPES)[number],
        description: r.description || undefined,
        intensity: r.intensity,
        bidirectional: r.bidirectional,
      })),
      typeUpdates,
    });
  };

  /* ─── Helpers for relationship display ─── */
  const getRefName = useCallback(
    (ref: string) => {
      const char = characters.find((c) => c.tempId === ref);
      if (char) return char.name;
      const existing = existingChars.data?.find((c) => c.id === ref);
      if (existing) return existing.name;
      return ref;
    },
    [characters, existingChars.data]
  );

  const allEntityRefs = useMemo(() => {
    const refs: { id: string; name: string }[] = [];
    for (const c of characters) {
      refs.push({ id: c.matchedEntityId ?? c.tempId, name: c.name });
    }
    for (const e of existingChars.data ?? []) {
      if (!refs.some((r) => r.id === e.id)) {
        refs.push({ id: e.id, name: e.name });
      }
    }
    return refs;
  }, [characters, existingChars.data]);

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

  const selectedCharsCount = characters.filter((c) => c.selected && c.name.trim()).length;
  const selectedRelsCount = relationships.filter((r) => r.selected).length;
  const newCharsCount = characters.filter((c) => c.selected && c.name.trim() && !c.matchedEntityId).length;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Story"
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
            Choose an existing document or upload a new story file. The AI will analyze it and extract characters and relationships.
          </p>

          {filesWithText.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Existing documents</label>
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
                      <span className="text-sm font-medium truncate">{f.name}</span>
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
              Analyze Story
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: Analyzing ─── */}
      {step === "analyzing" && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-amber-400">Analyzing story and extracting characters...</span>
          <span className="text-xs text-zinc-500">This may take a moment for longer documents</span>
        </div>
      )}

      {/* ─── STEP: Review Characters ─── */}
      {step === "review-characters" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Users size={16} />
                Extracted Characters ({characters.length})
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                {newCharsCount} new, {characters.length - newCharsCount} matched to existing.
                Edit names, types, and deselect any you don't want.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={characters.every((c) => c.selected)}
                      onChange={() => {
                        const allSel = characters.every((c) => c.selected);
                        setCharacters((prev) => prev.map((c) => ({ ...c, selected: !allSel })));
                      }}
                      className="rounded"
                    />
                  </th>
                  <th className="pb-2 pr-2">Name</th>
                  <th className="pb-2 pr-2 w-28">Status</th>
                  <th className="pb-2 pr-2 w-28">Type</th>
                  <th className="pb-2 pr-2">Faction</th>
                  <th className="pb-2 pr-2">Archetype</th>
                  <th className="pb-2 pr-2">Description</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {characters.map((row) => (
                  <tr key={row.tempId} className="border-b border-zinc-800/50 group">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() =>
                          setCharacters((prev) =>
                            prev.map((c) =>
                              c.tempId === row.tempId ? { ...c, selected: !c.selected } : c
                            )
                          )
                        }
                        className="rounded"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={row.name}
                        onChange={(e) =>
                          setCharacters((prev) =>
                            prev.map((c) =>
                              c.tempId === row.tempId ? { ...c, name: e.target.value } : c
                            )
                          )
                        }
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      {row.matchedEntityId ? (
                        <Badge color="blue" className="text-[10px]">
                          Existing
                        </Badge>
                      ) : (
                        <Badge color="amber" className="text-[10px]">
                          New
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={row.type}
                        onChange={(e) =>
                          setCharacters((prev) =>
                            prev.map((c) =>
                              c.tempId === row.tempId
                                ? { ...c, type: e.target.value as "CHARACTER" | "NPC" }
                                : c
                            )
                          )
                        }
                        className="h-7 text-xs min-w-[90px]"
                      >
                        <option value="CHARACTER">PC</option>
                        <option value="NPC">NPC</option>
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={row.faction}
                        onChange={(e) =>
                          setCharacters((prev) =>
                            prev.map((c) =>
                              c.tempId === row.tempId ? { ...c, faction: e.target.value } : c
                            )
                          )
                        }
                        placeholder="Faction"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={row.archetype}
                        onChange={(e) =>
                          setCharacters((prev) =>
                            prev.map((c) =>
                              c.tempId === row.tempId ? { ...c, archetype: e.target.value } : c
                            )
                          )
                        }
                        placeholder="Archetype"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <textarea
                        value={row.description}
                        onChange={(e) =>
                          setCharacters((prev) =>
                            prev.map((c) =>
                              c.tempId === row.tempId ? { ...c, description: e.target.value } : c
                            )
                          )
                        }
                        placeholder="Description"
                        rows={3}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 resize-y"
                      />
                    </td>
                    <td className="py-1.5 align-top">
                      <button
                        onClick={() =>
                          setCharacters((prev) => prev.filter((c) => c.tempId !== row.tempId))
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

          {characters.some((c) => c.evidence) && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer hover:text-zinc-300">Show AI evidence</summary>
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {characters
                  .filter((c) => c.evidence)
                  .map((c) => (
                    <p key={c.tempId}>
                      <span className="text-zinc-400 font-medium">{c.name}:</span> {c.evidence}
                    </p>
                  ))}
              </div>
            </details>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("select-doc")}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {selectedCharsCount} character{selectedCharsCount !== 1 ? "s" : ""} selected
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Link2 size={16} />
                Extracted Relationships ({relationships.length})
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Review and edit relationship suggestions. Remap characters if needed.
              </p>
            </div>
          </div>

          {relationships.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No relationships were extracted from the story.
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
                    <tr key={rel.tempId} className="border-b border-zinc-800/50 group">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={rel.selected}
                          onChange={() =>
                            setRelationships((prev) =>
                              prev.map((r) =>
                                r.tempId === rel.tempId ? { ...r, selected: !r.selected } : r
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
                                r.tempId === rel.tempId ? { ...r, fromRef: e.target.value } : r
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
                                r.tempId === rel.tempId ? { ...r, toRef: e.target.value } : r
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
                                r.tempId === rel.tempId ? { ...r, typeLabel: e.target.value } : r
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
                                  ? { ...r, intensity: parseInt(e.target.value) || 5 }
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
              <summary className="cursor-pointer hover:text-zinc-300">Show AI evidence</summary>
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {relationships
                  .filter((r) => r.evidence)
                  .map((r) => (
                    <p key={r.tempId}>
                      <span className="text-zinc-400 font-medium">
                        {getRefName(r.fromRef)} → {getRefName(r.toRef)}:
                      </span>{" "}
                      {r.evidence}
                    </p>
                  ))}
              </div>
            </details>
          )}

          {/* Graph Preview */}
          {relationships.length > 0 && (
            <details className="border border-zinc-800 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-2">
                <GitBranch size={14} />
                Graph Preview
              </summary>
              <div className="h-64 border-t border-zinc-800">
                <StoryImportGraphPreview
                  characters={characters}
                  relationships={relationships.filter((r) => r.selected)}
                  existingCharacters={existingChars.data ?? []}
                  getRefName={getRefName}
                />
              </div>
            </details>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("review-characters")}>
              <ArrowLeft size={14} className="mr-1" /> Characters
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {selectedCharsCount} char{selectedCharsCount !== 1 ? "s" : ""},{" "}
                {selectedRelsCount} rel{selectedRelsCount !== 1 ? "s" : ""}
              </span>
              <Button onClick={handleApply} disabled={selectedCharsCount === 0}>
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
          <span className="text-sm text-amber-400">Creating characters and relationships...</span>
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
              <p>{applyResult.createdCharacters} new character{applyResult.createdCharacters !== 1 ? "s" : ""} created</p>
            )}
            {applyResult.updatedTypes > 0 && (
              <p>{applyResult.updatedTypes} character type{applyResult.updatedTypes !== 1 ? "s" : ""} updated</p>
            )}
            {applyResult.createdRelationships > 0 && (
              <p>{applyResult.createdRelationships} relationship{applyResult.createdRelationships !== 1 ? "s" : ""} created</p>
            )}
            {applyResult.createdCharacters === 0 &&
              applyResult.updatedTypes === 0 &&
              applyResult.createdRelationships === 0 && (
                <p>No changes were needed — all entities already exist.</p>
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
