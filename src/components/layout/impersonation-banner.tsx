"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";

export function ImpersonationBanner() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  if (!session?.user?.impersonatedBy) return null;

  async function handleExit() {
    setExiting(true);
    try {
      const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to exit impersonation");
        return;
      }
      await update();
      router.push("/admin");
      router.refresh();
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-600 px-4 py-1.5 text-sm font-medium text-black">
      <Eye size={14} />
      <span>
        Impersonating{" "}
        <strong>{session.user.name ?? session.user.email ?? session.user.id}</strong>
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="ml-2 inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-black/40 disabled:opacity-50"
      >
        <X size={12} />
        {exiting ? "Exiting..." : "Exit"}
      </button>
    </div>
  );
}
