"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Flame,
  LayoutDashboard,
  Users,
  Network,
  GitBranch,
  MessageSquare,
  ChevronLeft,
} from "lucide-react";
import type { ReactNode } from "react";

export default function GameLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const gameId = params.gameId as string;

  const game = trpc.game.getById.useQuery({ id: gameId });

  const tabs = [
    { href: `/game/${gameId}`, label: "Overview", icon: <LayoutDashboard size={16} /> },
    { href: `/game/${gameId}/characters`, label: "Characters", icon: <Users size={16} /> },
    { href: `/game/${gameId}/graph`, label: "Network Graph", icon: <Network size={16} /> },
    { href: `/game/${gameId}/plotlines`, label: "Plotlines", icon: <GitBranch size={16} /> },
    { href: `/game/${gameId}/chat`, label: "AI Chat", icon: <MessageSquare size={16} /> },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900/30">
        <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-600">
            <Flame size={14} className="text-white" />
          </div>
          <span className="font-bold text-sm truncate">{game.data?.name ?? "Loading..."}</span>
        </div>

        <div className="border-b border-zinc-800 px-3 py-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <ChevronLeft size={12} />
            Back to Dashboard
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                pathname === tab.href
                  ? "bg-zinc-800 text-amber-400"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              )}
            >
              {tab.icon}
              {tab.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
