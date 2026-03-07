"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AiInput } from "@/components/ui/ai-input";
import { AiTextarea } from "@/components/ui/ai-textarea";
import { Plus, Users, Pencil, Trash2, Link2, Sparkles, UsersRound, BookOpen, FileSpreadsheet } from "lucide-react";
import { CharacterDetail } from "@/components/game/character-detail";
import { MassCreatePanel } from "@/components/game/mass-create-panel";
import { StoryImportPanel } from "@/components/game/story-import-panel";
import { CsvPanel } from "@/components/game/csv-panel";

type NewCharacter = {
  name: string;
  type: "CHARACTER" | "NPC";
  faction: string;
  archetype: string;
  description: string;
};

const emptyChar: NewCharacter = { name: "", type: "CHARACTER", faction: "", archetype: "", description: "" };

export default function CharactersPage() {
  const { gameId } = useParams() as { gameId: string };
  const [showCreate, setShowCreate] = useState(false);
  const [showMassCreate, setShowMassCreate] = useState(false);
  const [showStoryImport, setShowStoryImport] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [newChar, setNewChar] = useState<NewCharacter>(emptyChar);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const characters = trpc.character.list.useQuery({ gameId });
  const createChar = trpc.character.create.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setNewChar(emptyChar);
      characters.refetch();
    },
  });
  const deleteChar = trpc.character.delete.useMutation({
    onSuccess: () => {
      setSelectedId(null);
      characters.refetch();
    },
  });

  const filtered = characters.data?.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.faction?.toLowerCase().includes(filter.toLowerCase()) ||
      c.archetype?.toLowerCase().includes(filter.toLowerCase())
  );

  const factions = [...new Set(characters.data?.map((c) => c.faction).filter(Boolean))];

  const factionColorMap: Record<string, string> = {};
  const colors = ["amber", "blue", "purple", "green", "red", "pink", "cyan"];
  factions.forEach((f, i) => {
    if (f) factionColorMap[f] = colors[i % colors.length];
  });

  return (
    <div className="flex h-screen">
      <div className="w-80 flex-shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="border-b border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Characters</h2>
            <div className="flex gap-1">
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus size={14} className="mr-1" /> Add
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowMassCreate(true)}>
                <UsersRound size={14} className="mr-1" /> Mass
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowStoryImport(true)}>
                <BookOpen size={14} className="mr-1" /> Import
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowCsv(true)}>
                <FileSpreadsheet size={14} className="mr-1" /> CSV
              </Button>
            </div>
          </div>
          <Input
            placeholder="Filter by name, faction..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered?.length === 0 && (
            <EmptyState
              icon={<Users size={32} />}
              title="No characters yet"
              description="Add your first character to begin building the cast."
            />
          )}
          {filtered?.map((char) => (
            <button
              key={char.id}
              onClick={() => setSelectedId(char.id)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/50 ${
                selectedId === char.id ? "bg-zinc-800" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{char.name}</span>
                <Badge color={char.type === "NPC" ? "purple" : "zinc"} className="text-[10px]">
                  {char.type}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {char.faction && (
                  <Badge color={(factionColorMap[char.faction] as any) ?? "zinc"} className="text-[10px]">
                    {char.faction}
                  </Badge>
                )}
                {char.archetype && (
                  <span className="text-[10px] text-zinc-500">{char.archetype}</span>
                )}
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-zinc-600">
                <span className="flex items-center gap-0.5">
                  <Link2 size={10} />
                  {char.relationshipsFrom.length + char.relationshipsTo.length} rels
                </span>
                {char.briefVersions[0] && (
                  <Badge
                    color={
                      char.briefVersions[0].status === "APPROVED" ? "green" :
                      char.briefVersions[0].status === "REVIEW" ? "amber" : "zinc"
                    }
                    className="text-[10px]"
                  >
                    brief: {char.briefVersions[0].status.toLowerCase()}
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedId ? (
          <CharacterDetail
            characterId={selectedId}
            gameId={gameId}
            onDelete={() => deleteChar.mutate({ id: selectedId })}
            onUpdate={() => characters.refetch()}
          />
        ) : (
          <EmptyState
            icon={<Users size={48} />}
            title="Select a character"
            description="Choose a character from the list to view details, edit relationships, and manage briefs."
          />
        )}
      </div>

      <MassCreatePanel
        open={showMassCreate}
        onClose={() => setShowMassCreate(false)}
        gameId={gameId}
        onCreated={() => characters.refetch()}
      />

      <StoryImportPanel
        open={showStoryImport}
        onClose={() => setShowStoryImport(false)}
        gameId={gameId}
        onCreated={() => characters.refetch()}
      />

      <CsvPanel
        open={showCsv}
        onClose={() => setShowCsv(false)}
        gameId={gameId}
        onImported={() => characters.refetch()}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Character">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createChar.mutate({ ...newChar, gameId });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name *</label>
            <Input
              value={newChar.name}
              onChange={(e) => setNewChar((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Lord Mortenval"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Type</label>
              <Select
                value={newChar.type}
                onChange={(e) => setNewChar((p) => ({ ...p, type: e.target.value as "CHARACTER" | "NPC" }))}
              >
                <option value="CHARACTER">Character (PC)</option>
                <option value="NPC">NPC</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Faction / Clan</label>
              <Input
                value={newChar.faction}
                onChange={(e) => setNewChar((p) => ({ ...p, faction: e.target.value }))}
                placeholder="e.g. Tremere"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Archetype</label>
            <AiInput
              gameId={gameId}
              fieldName="archetype"
              value={newChar.archetype}
              onChange={(e) => setNewChar((p) => ({ ...p, archetype: e.target.value }))}
              onValueChange={(v) => setNewChar((p) => ({ ...p, archetype: v }))}
              placeholder="e.g. Manipulative Elder"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Description</label>
            <AiTextarea
              gameId={gameId}
              fieldName="character description"
              value={newChar.description}
              onChange={(e) => setNewChar((p) => ({ ...p, description: e.target.value }))}
              onValueChange={(v) => setNewChar((p) => ({ ...p, description: v }))}
              placeholder="Brief description of the character's role in the game..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createChar.isPending}>
              {createChar.isPending ? "Creating..." : "Create Character"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
