"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { AiInput } from "@/components/ui/ai-input";
import { AiTextarea } from "@/components/ui/ai-textarea";
import { Pencil, Trash2, Plus, Sparkles, Link2, Save, X } from "lucide-react";
import { RelationshipEditor } from "./relationship-editor";
import { BriefPanel } from "./brief-panel";
import { CustomFieldsPanel } from "./custom-fields-panel";

interface Props {
  characterId: string;
  gameId: string;
  onDelete: () => void;
  onUpdate: () => void;
}

export function CharacterDetail({ characterId, gameId, onDelete, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [showAddRel, setShowAddRel] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "attributes" | "relationships" | "brief">("info");

  const char = trpc.character.getById.useQuery({ id: characterId });
  const updateChar = trpc.character.update.useMutation({
    onSuccess: () => {
      setEditing(false);
      char.refetch();
      onUpdate();
    },
  });

  const [form, setForm] = useState({ name: "", faction: "", archetype: "", description: "", status: "DRAFT" as const });

  const startEdit = () => {
    if (char.data) {
      setForm({
        name: char.data.name,
        faction: char.data.faction ?? "",
        archetype: char.data.archetype ?? "",
        description: char.data.description ?? "",
        status: char.data.status as any,
      });
      setEditing(true);
    }
  };

  if (!char.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const c = char.data;
  const allRels = [...c.relationshipsFrom, ...c.relationshipsTo];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold">{c.name}</h2>
            <Badge color={c.type === "NPC" ? "purple" : "zinc"}>{c.type}</Badge>
            <Badge
              color={c.status === "READY" ? "green" : c.status === "IN_PROGRESS" ? "amber" : "zinc"}
            >
              {c.status.toLowerCase().replace("_", " ")}
            </Badge>
          </div>
          <div className="flex gap-2">
            {c.faction && <Badge color="blue">{c.faction}</Badge>}
            {c.archetype && <span className="text-sm text-zinc-500">{c.archetype}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={startEdit}>
            <Pencil size={14} className="mr-1" /> Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => { if (confirm("Delete this character?")) onDelete(); }}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-zinc-800">
        {(["info", "attributes", "relationships", "brief"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              activeTab === tab
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab === "info"
              ? "Info"
              : tab === "attributes"
              ? "Attributes"
              : tab === "relationships"
              ? `Relationships (${allRels.length})`
              : "Brief"}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div>
          {c.description && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-400">Description</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{c.description}</p>
            </div>
          )}
          {c.plotlineEntities.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-400">Plotlines</h3>
              <div className="flex flex-wrap gap-2">
                {c.plotlineEntities.map((pe) => (
                  <Badge key={pe.plotline.id} color="purple">{pe.plotline.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "attributes" && (
        <CustomFieldsPanel characterId={characterId} gameId={gameId} />
      )}

      {activeTab === "relationships" && (
        <RelationshipEditor
          characterId={characterId}
          gameId={gameId}
          relationships={allRels}
          currentEntityId={characterId}
          onUpdate={() => { char.refetch(); onUpdate(); }}
        />
      )}

      {activeTab === "brief" && (
        <BriefPanel entityId={characterId} gameId={gameId} />
      )}

      {editing && (
        <Modal open={editing} onClose={() => setEditing(false)} title="Edit Character">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateChar.mutate({ id: characterId, ...form });
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Name</label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Faction</label>
                <AiInput gameId={gameId} fieldName="faction" value={form.faction} onChange={(e) => setForm((p) => ({ ...p, faction: e.target.value }))} onValueChange={(v) => setForm((p) => ({ ...p, faction: v }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Archetype</label>
                <AiInput gameId={gameId} fieldName="archetype" value={form.archetype} onChange={(e) => setForm((p) => ({ ...p, archetype: e.target.value }))} onValueChange={(v) => setForm((p) => ({ ...p, archetype: v }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Status</label>
              <Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}>
                <option value="DRAFT">Draft</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="READY">Ready</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Description</label>
              <AiTextarea gameId={gameId} fieldName="character description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} onValueChange={(v) => setForm((p) => ({ ...p, description: v }))} rows={4} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={updateChar.isPending}>
                {updateChar.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
