"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Flame, Users, Link2, Sparkles, ArrowRight, Check } from "lucide-react";

interface Props {
  onComplete: () => void;
}

const STEPS = [
  { label: "Create Game", icon: Flame },
  { label: "Add Characters", icon: Users },
  { label: "Create Relationships", icon: Link2 },
  { label: "Generate Brief", icon: Sparkles },
];

export function Onboarding({ onComplete }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [gameId, setGameId] = useState("");
  const [characterIds, setCharacterIds] = useState<string[]>([]);

  const [gameName, setGameName] = useState("");
  const [gameGenre, setGameGenre] = useState("");
  const [charName, setCharName] = useState("");
  const [charFaction, setCharFaction] = useState("");
  const [char2Name, setChar2Name] = useState("");
  const [char2Faction, setChar2Faction] = useState("");
  const [relType, setRelType] = useState("RIVALRY");

  const createGame = trpc.game.create.useMutation();
  const createChar = trpc.character.create.useMutation();
  const createRel = trpc.relationship.create.useMutation();

  const handleCreateGame = async () => {
    const game = await createGame.mutateAsync({
      name: gameName,
      genre: gameGenre || undefined,
      format: "CHAMBER",
    });
    setGameId(game.id);
    setStep(1);
  };

  const handleAddCharacters = async () => {
    const c1 = await createChar.mutateAsync({ gameId, name: charName, faction: charFaction || undefined });
    const c2 = await createChar.mutateAsync({ gameId, name: char2Name, faction: char2Faction || undefined });
    setCharacterIds([c1.id, c2.id]);
    setStep(2);
  };

  const handleCreateRelationship = async () => {
    await createRel.mutateAsync({
      gameId,
      fromEntityId: characterIds[0],
      toEntityId: characterIds[1],
      type: relType as any,
      bidirectional: true,
    });
    setStep(3);
  };

  const handleGenerateBrief = () => {
    router.push(`/game/${gameId}/characters`);
    onComplete();
  };

  return (
    <div className="mx-auto max-w-lg py-12 px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-600">
          <Flame size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to LARP Forge</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Let's set up your first game in a few quick steps
        </p>
      </div>

      <div className="mb-8 flex justify-between">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  i < step
                    ? "border-emerald-500 bg-emerald-900/30"
                    : i === step
                    ? "border-amber-500 bg-amber-900/30"
                    : "border-zinc-700 bg-zinc-800"
                }`}
              >
                {i < step ? <Check size={16} className="text-emerald-400" /> : <Icon size={16} className={i === step ? "text-amber-400" : "text-zinc-500"} />}
              </div>
              <span className={`text-[10px] ${i === step ? "text-amber-400" : "text-zinc-500"}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="font-semibold">Create Your Game</h2>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Game Name *</label>
            <Input value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="e.g. Court of Shadows" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Genre</label>
            <Input value={gameGenre} onChange={(e) => setGameGenre(e.target.value)} placeholder="e.g. Gothic Horror" />
          </div>
          <Button onClick={handleCreateGame} disabled={!gameName.trim() || createGame.isPending} className="w-full">
            {createGame.isPending ? "Creating..." : "Create Game"} <ArrowRight size={14} className="ml-2" />
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="font-semibold">Add Two Characters</h2>
          <p className="text-xs text-zinc-500">Start with at least two characters to create your first relationship.</p>
          <div className="space-y-3 rounded-lg border border-zinc-700 p-3">
            <h3 className="text-sm font-medium text-zinc-400">Character 1</h3>
            <Input value={charName} onChange={(e) => setCharName(e.target.value)} placeholder="Name" />
            <Input value={charFaction} onChange={(e) => setCharFaction(e.target.value)} placeholder="Faction (optional)" />
          </div>
          <div className="space-y-3 rounded-lg border border-zinc-700 p-3">
            <h3 className="text-sm font-medium text-zinc-400">Character 2</h3>
            <Input value={char2Name} onChange={(e) => setChar2Name(e.target.value)} placeholder="Name" />
            <Input value={char2Faction} onChange={(e) => setChar2Faction(e.target.value)} placeholder="Faction (optional)" />
          </div>
          <Button
            onClick={handleAddCharacters}
            disabled={!charName.trim() || !char2Name.trim() || createChar.isPending}
            className="w-full"
          >
            {createChar.isPending ? "Adding..." : "Add Characters"} <ArrowRight size={14} className="ml-2" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="font-semibold">Create a Relationship</h2>
          <p className="text-xs text-zinc-500">
            Connect {charName} and {char2Name} with a relationship.
          </p>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Relationship Type</label>
            <Select value={relType} onChange={(e) => setRelType(e.target.value)}>
              <option value="RIVALRY">Rivalry</option>
              <option value="ALLIANCE">Alliance</option>
              <option value="LOVE">Love</option>
              <option value="FAMILY">Family</option>
              <option value="SECRET">Secret</option>
              <option value="DEBT">Debt</option>
              <option value="MENTORSHIP">Mentorship</option>
              <option value="ENMITY">Enmity</option>
            </Select>
          </div>
          <Button onClick={handleCreateRelationship} disabled={createRel.isPending} className="w-full">
            {createRel.isPending ? "Creating..." : "Create Relationship"} <ArrowRight size={14} className="ml-2" />
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-900/30 border-2 border-emerald-500">
            <Check size={24} className="text-emerald-400" />
          </div>
          <h2 className="font-semibold">You're All Set!</h2>
          <p className="text-sm text-zinc-400">
            Your game is ready. Head to the characters page to generate your first AI brief.
          </p>
          <Button onClick={handleGenerateBrief} className="w-full">
            Go to Characters <Sparkles size={14} className="ml-2" />
          </Button>
        </div>
      )}

      <div className="mt-4 text-center">
        <button onClick={onComplete} className="text-xs text-zinc-600 hover:text-zinc-400">
          Skip onboarding
        </button>
      </div>
    </div>
  );
}
