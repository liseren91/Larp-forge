"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowRight, ArrowLeftRight } from "lucide-react";

const REL_TYPES = ["RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE", "FAMILY", "MENTORSHIP", "ENMITY", "OTHER"] as const;

const relColorMap: Record<string, string> = {
  RIVALRY: "red",
  ALLIANCE: "green",
  SECRET: "purple",
  DEBT: "amber",
  LOVE: "pink",
  FAMILY: "blue",
  MENTORSHIP: "cyan",
  ENMITY: "red",
  OTHER: "zinc",
};

interface Props {
  characterId: string;
  gameId: string;
  relationships: any[];
  currentEntityId: string;
  onUpdate: () => void;
}

export function RelationshipEditor({ characterId, gameId, relationships, currentEntityId, onUpdate }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    toEntityId: "",
    type: "OTHER" as (typeof REL_TYPES)[number],
    description: "",
    intensity: 5,
    bidirectional: true,
  });

  const characters = trpc.character.list.useQuery({ gameId });
  const createRel = trpc.relationship.create.useMutation({
    onSuccess: () => {
      setShowAdd(false);
      setForm({ toEntityId: "", type: "OTHER", description: "", intensity: 5, bidirectional: true });
      onUpdate();
    },
  });
  const deleteRel = trpc.relationship.delete.useMutation({ onSuccess: onUpdate });

  const otherChars = characters.data?.filter((c) => c.id !== characterId) ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">
          {relationships.length} relationship{relationships.length !== 1 ? "s" : ""}
        </h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} className="mr-1" /> Add Relationship
        </Button>
      </div>

      <div className="space-y-2">
        {relationships.map((rel) => {
          const isFrom = rel.fromEntityId === currentEntityId;
          const other = isFrom ? rel.toEntity : rel.fromEntity;
          return (
            <div
              key={rel.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <div className="flex items-center gap-3">
                {rel.bidirectional ? (
                  <ArrowLeftRight size={14} className="text-zinc-500" />
                ) : (
                  <ArrowRight size={14} className={`text-zinc-500 ${!isFrom ? "rotate-180" : ""}`} />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{other?.name ?? "Unknown"}</span>
                    <Badge color={relColorMap[rel.type] as any}>{rel.type.toLowerCase()}</Badge>
                    <span className="text-xs text-zinc-600">intensity: {rel.intensity}/10</span>
                  </div>
                  {rel.description && (
                    <p className="mt-0.5 text-xs text-zinc-500">{rel.description}</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (confirm("Remove this relationship?")) deleteRel.mutate({ id: rel.id }); }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          );
        })}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Relationship">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createRel.mutate({
              gameId,
              fromEntityId: characterId,
              toEntityId: form.toEntityId,
              type: form.type,
              description: form.description || undefined,
              intensity: form.intensity,
              bidirectional: form.bidirectional,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Connected Character *</label>
            <Select
              value={form.toEntityId}
              onChange={(e) => setForm((p) => ({ ...p, toEntityId: e.target.value }))}
              required
            >
              <option value="">Select a character...</option>
              {otherChars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.faction ? `(${c.faction})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Type</label>
              <Select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))}
              >
                {REL_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Intensity (1-10)</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.intensity}
                onChange={(e) => setForm((p) => ({ ...p, intensity: parseInt(e.target.value) || 5 }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.bidirectional}
              onChange={(e) => setForm((p) => ({ ...p, bidirectional: e.target.checked }))}
              className="rounded border-zinc-700"
              id="bidir"
            />
            <label htmlFor="bidir" className="text-sm text-zinc-400">Bidirectional</label>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe this relationship..."
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={createRel.isPending}>
              {createRel.isPending ? "Adding..." : "Add Relationship"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
