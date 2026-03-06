"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, GitBranch, Users, Trash2, UserPlus } from "lucide-react";

const PLOT_TYPES = ["POLITICAL", "PERSONAL", "MYSTERY", "ACTION", "SOCIAL", "OTHER"] as const;
const plotColorMap: Record<string, string> = {
  POLITICAL: "red",
  PERSONAL: "blue",
  MYSTERY: "purple",
  ACTION: "amber",
  SOCIAL: "green",
  OTHER: "zinc",
};

export default function PlotlinesPage() {
  const { gameId } = useParams() as { gameId: string };
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [assignEntityId, setAssignEntityId] = useState("");
  const [form, setForm] = useState({ name: "", type: "OTHER" as (typeof PLOT_TYPES)[number], description: "" });

  const plotlines = trpc.plotline.list.useQuery({ gameId });
  const characters = trpc.character.list.useQuery({ gameId });
  const createPlotline = trpc.plotline.create.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setForm({ name: "", type: "OTHER", description: "" });
      plotlines.refetch();
    },
  });
  const deletePlotline = trpc.plotline.delete.useMutation({ onSuccess: () => plotlines.refetch() });
  const assignEntity = trpc.plotline.assignEntity.useMutation({
    onSuccess: () => {
      setShowAssign(null);
      setAssignEntityId("");
      plotlines.refetch();
    },
  });
  const removeEntity = trpc.plotline.removeEntity.useMutation({ onSuccess: () => plotlines.refetch() });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Plotlines</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} className="mr-1" /> New Plotline
        </Button>
      </div>

      {plotlines.data?.length === 0 && (
        <EmptyState
          icon={<GitBranch size={48} />}
          title="No plotlines yet"
          description="Create plotlines to organize narrative threads and assign characters to them."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} className="mr-1" /> Create Plotline
            </Button>
          }
        />
      )}

      <div className="space-y-4">
        {plotlines.data?.map((pl) => (
          <div key={pl.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{pl.name}</h3>
                  <Badge color={plotColorMap[pl.type] as any}>{pl.type.toLowerCase()}</Badge>
                  <Badge color={pl.status === "ACTIVE" ? "green" : pl.status === "RESOLVED" ? "blue" : "zinc"}>
                    {pl.status.toLowerCase()}
                  </Badge>
                </div>
                {pl.description && <p className="text-sm text-zinc-400">{pl.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAssign(pl.id)}>
                  <UserPlus size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { if (confirm("Delete this plotline?")) deletePlotline.mutate({ id: pl.id }); }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>

            {pl.entities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pl.entities.map((pe) => (
                  <div
                    key={pe.entity.id}
                    className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs"
                  >
                    <Users size={10} className="text-zinc-500" />
                    <span>{pe.entity.name}</span>
                    <button
                      onClick={() => removeEntity.mutate({ plotlineId: pl.id, entityId: pe.entity.id })}
                      className="ml-1 text-zinc-600 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Plotline">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPlotline.mutate({ ...form, gameId });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. The Succession Crisis"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Type</label>
            <Select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))}>
              {PLOT_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe the plotline arc..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={createPlotline.isPending}>
              {createPlotline.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showAssign} onClose={() => setShowAssign(null)} title="Assign Character to Plotline">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (showAssign) assignEntity.mutate({ plotlineId: showAssign, entityId: assignEntityId });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Character</label>
            <Select value={assignEntityId} onChange={(e) => setAssignEntityId(e.target.value)} required>
              <option value="">Select a character...</option>
              {characters.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.faction ? `(${c.faction})` : ""}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button type="submit" disabled={assignEntity.isPending}>Assign</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
