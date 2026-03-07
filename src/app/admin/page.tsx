"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, UserCheck, Gamepad2 } from "lucide-react";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  _count: { games: number };
}

export default function AdminPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && !session?.user?.isAdmin) {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.isAdmin) {
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then(setUsers)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [status, session]);

  async function handleImpersonate(userId: string) {
    setImpersonating(userId);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to impersonate");
        return;
      }
      await update();
      router.push("/dashboard");
      router.refresh();
    } finally {
      setImpersonating(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!session?.user?.isAdmin) {
    return null;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/20">
            <Shield size={20} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-zinc-400">
              {users.length} registered user{users.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-3 font-medium text-zinc-400">User</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Email</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-center">Games</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Joined</th>
                <th className="px-4 py-3 font-medium text-zinc-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isCurrentUser = user.id === session.user.id;
                return (
                  <tr
                    key={user.id}
                    className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <img
                            src={user.image}
                            alt=""
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs">
                            {user.name?.[0] ?? user.email?.[0] ?? "?"}
                          </div>
                        )}
                        <span className="font-medium text-zinc-100">
                          {user.name ?? "—"}
                        </span>
                        {isCurrentUser && (
                          <Badge color="amber">you</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {user.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-zinc-400">
                        <Gamepad2 size={14} />
                        {user._count.games}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isCurrentUser && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleImpersonate(user.id)}
                          disabled={impersonating === user.id}
                        >
                          <UserCheck size={14} className="mr-1.5" />
                          {impersonating === user.id
                            ? "Switching..."
                            : "Impersonate"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
