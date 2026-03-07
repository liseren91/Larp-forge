"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Flame, LayoutDashboard, LogOut, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { ImpersonationBanner } from "./impersonation-banner";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex min-h-screen flex-col">
      <ImpersonationBanner />
      <div className="flex flex-1">
        <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900/30">
          <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-600">
              <Flame size={14} className="text-white" />
            </div>
            <span className="font-bold text-sm">LARP Forge</span>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            <NavItem href="/dashboard" icon={<LayoutDashboard size={16} />} active={pathname === "/dashboard"}>
              Dashboard
            </NavItem>
            {session?.user?.isAdmin && (
              <NavItem href="/admin" icon={<Shield size={16} />} active={pathname === "/admin"}>
                Admin
              </NavItem>
            )}
          </nav>

          <div className="border-t border-zinc-800 p-3">
            {session?.user && (
              <div className="mb-2 flex items-center gap-2 px-2">
                {session.user.image ? (
                  <img src={session.user.image} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-xs">
                    {session.user.name?.[0] ?? session.user.email?.[0] ?? "?"}
                  </div>
                )}
                <span className="truncate text-xs text-zinc-400">{session.user.name ?? session.user.email}</span>
              </div>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: ReactNode;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "bg-zinc-800 text-amber-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
