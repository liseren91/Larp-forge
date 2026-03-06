import Link from "next/link";
import { Flame } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-center">
      <Flame size={48} className="text-zinc-600" />
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-zinc-400">This page doesn't exist in any timeline.</p>
      <Link
        href="/dashboard"
        className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
