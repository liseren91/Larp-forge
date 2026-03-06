"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AppShell } from "@/components/layout/app-shell";
import { Onboarding } from "@/components/game/onboarding";
import { Plus, Gamepad2, Users, GitBranch } from "lucide-react";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [newGame, setNewGame] = useState({ name: "", genre: "", format: "CHAMBER" as "CHAMBER" | "FIELD", playerCount: 20 });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const games = trpc.game.list.useQuery(undefined, { enabled: status === "authenticated" });
  const createGame = trpc.game.create.useMutation({
    onSuccess: (game) => {
      setShowCreate(false);
      games.refetch();
      router.push(`/game/${game.id}`);
    },
  });

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (status === "unauthenticated") {
    router.push("/auth/signin");
    return null;
  }

  if (showOnboarding || (games.data && games.data.length === 0 && !games.isLoading)) {
    const isFirstVisit = games.data?.length === 0;
    if (isFirstVisit && !showOnboarding) {
      setShowOnboarding(true);
    }
  }

  if (showOnboarding) {
    return (
      <AppShell>
        <Onboarding onComplete={() => { setShowOnboarding(false); games.refetch(); }} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Games</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-2" />
            New Game
          </Button>
        </div>

        {games.data?.length === 0 && (
          <EmptyState
            icon={<Gamepad2 size={48} />}
            title="No games yet"
            description="Create your first LARP game to get started with character design and AI-powered brief generation."
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus size={16} className="mr-2" />
                Create Your First Game
              </Button>
            }
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.data?.map((game) => (
            <button
              key={game.id}
              onClick={() => router.push(`/game/${game.id}`)}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition-all hover:border-amber-800/50 hover:bg-zinc-900"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors">
                  {game.name}
                </h3>
                <Badge color={game.format === "CHAMBER" ? "blue" : "purple"}>
                  {game.format.toLowerCase()}
                </Badge>
              </div>
              {game.genre && <p className="mb-3 text-xs text-zinc-500">{game.genre}</p>}
              <div className="flex gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {game._count.characters} characters
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch size={12} />
                  {game._count.plotlines} plotlines
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Game">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createGame.mutate(newGame);
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Game Name *</label>
            <Input
              value={newGame.name}
              onChange={(e) => setNewGame((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Court of Shadows"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Genre</label>
            <Input
              value={newGame.genre}
              onChange={(e) => setNewGame((p) => ({ ...p, genre: e.target.value }))}
              placeholder="e.g. Gothic Horror, Political Intrigue"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Format</label>
              <Select
                value={newGame.format}
                onChange={(e) => setNewGame((p) => ({ ...p, format: e.target.value as "CHAMBER" | "FIELD" }))}
              >
                <option value="CHAMBER">Chamber / Parlor</option>
                <option value="FIELD">Field (Poligonka)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Player Count</label>
              <Input
                type="number"
                value={newGame.playerCount}
                onChange={(e) => setNewGame((p) => ({ ...p, playerCount: parseInt(e.target.value) || 20 }))}
                min={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createGame.isPending}>
              {createGame.isPending ? "Creating..." : "Create Game"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
