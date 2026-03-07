"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Sparkles, Plus, Trash2, Check } from "lucide-react";

interface CharacterRow {
  id: string;
  selected: boolean;
  name: string;
  type: "CHARACTER" | "NPC";
  faction: string;
  archetype: string;
  description: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  onCreated: () => void;
}

let rowIdCounter = 0;
function newRow(): CharacterRow {
  return {
    id: `row-${++rowIdCounter}`,
    selected: true,
    name: "",
    type: "CHARACTER",
    faction: "",
    archetype: "",
    description: "",
  };
}

export function MassCreatePanel({ open, onClose, gameId, onCreated }: Props) {
  const [tab, setTab] = useState<"ai" | "manual">("ai");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [rows, setRows] = useState<CharacterRow[]>([newRow(), newRow(), newRow()]);

  const createMany = trpc.character.createMany.useMutation({
    onSuccess: () => {
      onCreated();
      onClose();
      setRows([newRow(), newRow(), newRow()]);
      setPrompt("");
    },
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, prompt, count }),
      });
      const data = await res.json();
      if (data.characters) {
        const generated: CharacterRow[] = data.characters.map((c: any) => ({
          id: `row-${++rowIdCounter}`,
          selected: true,
          name: c.name ?? "",
          type: c.type === "NPC" ? "NPC" : "CHARACTER",
          faction: c.faction ?? "",
          archetype: c.archetype ?? "",
          description: c.description ?? "",
        }));
        setRows(generated);
        setTab("manual");
      }
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  const updateRow = (id: string, field: keyof CharacterRow, value: any) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    setRows((prev) => [...prev, newRow()]);
  };

  const toggleAll = () => {
    const allSelected = rows.every((r) => r.selected);
    setRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const selectedRows = rows.filter((r) => r.selected && r.name.trim());

  const handleCreate = () => {
    if (selectedRows.length === 0) return;
    createMany.mutate({
      gameId,
      characters: selectedRows.map((r) => ({
        name: r.name,
        type: r.type,
        faction: r.faction || undefined,
        archetype: r.archetype || undefined,
        description: r.description || undefined,
      })),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mass Create Characters"
      className="max-w-[min(1100px,calc(100vw-2rem))]"
    >
      <div className="min-w-0">
        <div className="flex gap-1 mb-4 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setTab("ai")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "ai" ? "bg-zinc-800 text-amber-400" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles size={14} className="inline mr-1" />
            AI Generate
          </button>
          <button
            onClick={() => setTab("manual")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "manual" ? "bg-zinc-800 text-amber-400" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Manual Table
          </button>
        </div>

        {tab === "ai" && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Describe the characters you need
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "10 vampires for a Masquerade game, 3 clans: Tremere, Ventrue, Brujah. Mix of elders and neonates with political tensions."'
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32">
                <label className="mb-1 block text-sm text-zinc-400">Count</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 5)}
                />
              </div>
              <div className="pt-5">
                <Button onClick={handleGenerate} disabled={generating || !prompt.trim()}>
                  <Sparkles size={14} className="mr-1" />
                  {generating ? "Generating..." : "Generate Preview"}
                </Button>
              </div>
            </div>
            {generating && (
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                Generating characters...
              </div>
            )}
          </div>
        )}

        {(tab === "manual" || (tab === "ai" && rows.some((r) => r.name))) && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-2 w-8">
                      <input
                        type="checkbox"
                        checked={rows.every((r) => r.selected)}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2 w-38">Type</th>
                    <th className="pb-2 pr-2">Faction</th>
                    <th className="pb-2 pr-2">Archetype</th>
                    <th className="pb-2 pr-2">Description</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800/50">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateRow(row.id, "selected", e.target.checked)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, "name", e.target.value)}
                          placeholder="Name"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-1.5 pr-2 min-w-[112px]">
                        <Select
                          value={row.type}
                          onChange={(e) => updateRow(row.id, "type", e.target.value)}
                          className="h-8 min-w-[112px] text-sm font-medium"
                        >
                          <option value="CHARACTER">PC</option>
                          <option value="NPC">NPC</option>
                        </Select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={row.faction}
                          onChange={(e) => updateRow(row.id, "faction", e.target.value)}
                          placeholder="Faction"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={row.archetype}
                          onChange={(e) => updateRow(row.id, "archetype", e.target.value)}
                          placeholder="Archetype"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Textarea
                          value={row.description}
                          onChange={(e) => updateRow(row.id, "description", e.target.value)}
                          placeholder="Description"
                          className="min-h-[5.5rem] w-full min-w-[220px] resize-y text-xs"
                          rows={4}
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          onClick={() => removeRow(row.id)}
                          className="text-zinc-600 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={addRow}>
                <Plus size={14} className="mr-1" /> Add Row
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  {selectedRows.length} character{selectedRows.length !== 1 ? "s" : ""} selected
                </span>
                <Button
                  onClick={handleCreate}
                  disabled={createMany.isPending || selectedRows.length === 0}
                >
                  <Check size={14} className="mr-1" />
                  {createMany.isPending
                    ? "Creating..."
                    : `Create All (${selectedRows.length})`}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
