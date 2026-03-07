"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AiTextarea } from "@/components/ui/ai-textarea";
import { Sparkles, Save, RotateCcw, CheckCircle, Clock, ChevronDown, ChevronUp, Download } from "lucide-react";

interface Props {
  entityId: string;
  gameId: string;
}

const SECTIONS = [
  { key: "backstory", label: "Backstory" },
  { key: "personality", label: "Personality" },
  { key: "goalsPublic", label: "Public Goals" },
  { key: "goalsSecret", label: "Secret Goals" },
  { key: "relationships", label: "Relationships" },
  { key: "mechanics", label: "Mechanics" },
  { key: "contacts", label: "Contacts" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export function BriefPanel({ entityId, gameId }: Props) {
  const [generating, setGenerating] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(SECTIONS.map(s => s.key)));

  const handleExport = (format: string) => {
    window.open(`/api/export/brief?entityId=${entityId}&format=${format}`, "_blank");
  };

  const latestBrief = trpc.brief.getLatest.useQuery({ entityId });
  const allBriefs = trpc.brief.listByEntity.useQuery({ entityId });
  const saveBrief = trpc.brief.save.useMutation({
    onSuccess: () => {
      latestBrief.refetch();
      allBriefs.refetch();
      setEditedSections({});
    },
  });
  const updateStatus = trpc.brief.updateStatus.useMutation({
    onSuccess: () => latestBrief.refetch(),
  });

  const brief = latestBrief.data;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, gameId }),
      });
      const data = await res.json();
      if (data.brief) {
        saveBrief.mutate({ entityId, ...data.brief });
      }
    } catch (err) {
      console.error("Brief generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateSection = async (section: string) => {
    setRegeneratingSection(section);
    try {
      const res = await fetch("/api/ai/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, gameId, section, currentBrief: brief }),
      });
      const data = await res.json();
      if (data.content) {
        setEditedSections((prev) => ({ ...prev, [section]: data.content }));
      }
    } catch (err) {
      console.error("Section regeneration failed:", err);
    } finally {
      setRegeneratingSection(null);
    }
  };

  const handleSaveEdits = () => {
    if (!brief) return;
    const merged: Record<string, string | undefined> = {};
    for (const s of SECTIONS) {
      merged[s.key] = editedSections[s.key] ?? (brief as any)[s.key] ?? undefined;
    }
    saveBrief.mutate({ entityId, ...merged });
  };

  const hasEdits = Object.keys(editedSections).length > 0;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-400">Character Brief</h3>
          {brief && (
            <Badge
              color={
                brief.status === "APPROVED" ? "green" :
                brief.status === "REVIEW" ? "amber" : "zinc"
              }
            >
              v{brief.version} — {brief.status.toLowerCase()}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {hasEdits && (
            <Button size="sm" variant="secondary" onClick={handleSaveEdits} disabled={saveBrief.isPending}>
              <Save size={14} className="mr-1" />
              {saveBrief.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            <Sparkles size={14} className="mr-1" />
            {generating ? "Generating..." : brief ? "Regenerate" : "Generate Brief"}
          </Button>
          {brief && (
            <Button size="sm" variant="ghost" onClick={() => handleExport("html")}>
              <Download size={14} className="mr-1" /> Export
            </Button>
          )}
          {brief && brief.status !== "APPROVED" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateStatus.mutate({ id: brief.id, status: "APPROVED" })}
            >
              <CheckCircle size={14} className="mr-1" /> Approve
            </Button>
          )}
        </div>
      </div>

      {!brief && !generating && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center">
          <Sparkles size={32} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">No brief generated yet. Click "Generate Brief" to create one using AI.</p>
        </div>
      )}

      {generating && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-900/10 p-8 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-amber-400">Generating brief... This may take a moment.</p>
        </div>
      )}

      {brief && !generating && (
        <div className="space-y-3">
          {SECTIONS.map(({ key, label }) => {
            const value = editedSections[key] ?? (brief as any)[key];
            if (!value && !editedSections[key]) return null;
            const isExpanded = expandedSections.has(key);
            return (
              <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                <button
                  onClick={() => toggleSection(key)}
                  className="flex w-full items-center justify-between p-3 text-left"
                >
                  <span className="text-sm font-medium text-zinc-300">{label}</span>
                  <div className="flex items-center gap-2">
                    {editedSections[key] && <Badge color="amber">edited</Badge>}
                    {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-zinc-800 p-3">
                    <AiTextarea
                      gameId={gameId}
                      fieldName={`brief ${label}`}
                      value={editedSections[key] ?? value ?? ""}
                      onChange={(e) =>
                        setEditedSections((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      onValueChange={(v) =>
                        setEditedSections((prev) => ({ ...prev, [key]: v }))
                      }
                      rows={5}
                      className="mb-2"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRegenerateSection(key)}
                      disabled={regeneratingSection === key}
                    >
                      <RotateCcw size={12} className="mr-1" />
                      {regeneratingSection === key ? "Regenerating..." : "Regenerate this section"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {allBriefs.data && allBriefs.data.length > 1 && (
        <div className="mt-6">
          <h4 className="mb-2 text-xs font-medium text-zinc-500">Version History</h4>
          <div className="flex gap-2 flex-wrap">
            {allBriefs.data.map((b) => (
              <Badge key={b.id} color={b.status === "APPROVED" ? "green" : "zinc"}>
                v{b.version} — {b.status.toLowerCase()} — {new Date(b.createdAt).toLocaleDateString()}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
