"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { AuditPanel } from "@/components/game/audit-panel";
import { Users, GitBranch, Link2, MessageSquare } from "lucide-react";

export default function GameOverviewPage() {
  const { gameId } = useParams() as { gameId: string };
  const game = trpc.game.getById.useQuery({ id: gameId });

  if (!game.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const g = game.data;
  const charCount = g._count.characters;
  const relCount = g._count.relationships;
  const plotCount = g._count.plotlines;
  const chatCount = g._count.chatMessages;
  const briefsDone = g.characters.filter((c) =>
    c.status === "READY"
  ).length;
  const briefPct = charCount > 0 ? Math.round((briefsDone / charCount) * 100) : 0;
  const density = charCount > 1 ? (relCount / (charCount * (charCount - 1) / 2) * 100).toFixed(0) : "0";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{g.name}</h1>
          <Badge color={g.format === "CHAMBER" ? "blue" : "purple"}>
            {g.format.toLowerCase()}
          </Badge>
          <Badge color="zinc">{g.status.toLowerCase()}</Badge>
        </div>
        {g.genre && <p className="text-sm text-zinc-400">{g.genre}</p>}
        {g.setting && <p className="mt-2 text-sm text-zinc-500">{g.setting}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard icon={<Users size={18} />} label="Characters" value={charCount} />
        <MetricCard icon={<Link2 size={18} />} label="Relationships" value={relCount} sub={`${density}% density`} />
        <MetricCard icon={<GitBranch size={18} />} label="Plotlines" value={plotCount} />
        <MetricCard icon={<MessageSquare size={18} />} label="Brief Completion" value={`${briefPct}%`} sub={`${briefsDone}/${charCount}`} />
      </div>

      {g.designDocSummary && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h3 className="mb-2 font-semibold text-zinc-300">Design Document Summary</h3>
          <p className="text-sm text-zinc-400 whitespace-pre-wrap">{g.designDocSummary}</p>
        </div>
      )}

      <AuditPanel gameId={gameId} />
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 text-zinc-500">{icon}</div>
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
      {sub && <div className="mt-1 text-xs text-zinc-600">{sub}</div>}
    </div>
  );
}
