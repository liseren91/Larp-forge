import Link from "next/link";
import { Flame, Network, Sparkles, FileText } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600">
              <Flame size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold">LARP Forge</span>
          </div>
          <Link
            href="/auth/signin"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-100 sm:text-6xl">
            Design Your LARP
            <br />
            <span className="text-amber-500">with AI Intelligence</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            An AI-first workspace for designing live-action role-playing games.
            Build character webs, generate player briefs, and manage your game
            — all in one place.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link
              href="/auth/signin"
              className="rounded-lg bg-amber-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-amber-500"
            >
              Get Started Free
            </Link>
          </div>
        </section>

        <section className="grid gap-8 pb-24 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-900/40">
              <Network size={20} className="text-purple-400" />
            </div>
            <h3 className="mb-2 font-semibold">Character Network</h3>
            <p className="text-sm text-zinc-400">
              Interactive force-directed graph of all characters and relationships.
              See your game structure at a glance.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-900/40">
              <Sparkles size={20} className="text-amber-400" />
            </div>
            <h3 className="mb-2 font-semibold">AI Brief Generation</h3>
            <p className="text-sm text-zinc-400">
              Generate structured character briefs using AI that understands LARP
              design. Backstory, goals, secrets — all consistent with your world.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-900/40">
              <FileText size={20} className="text-emerald-400" />
            </div>
            <h3 className="mb-2 font-semibold">Export-Ready</h3>
            <p className="text-sm text-zinc-400">
              Export beautifully formatted character briefs as PDF or DOCX.
              Ready to distribute to your players.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/50 py-8">
        <p className="text-center text-sm text-zinc-500">
          Если у вас что-то сломалось или вы хотите дать денег на оплату нейронок, напишите в TG{" "}
          <a
            href="https://t.me/liseren"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-amber-500 hover:text-amber-400 transition-colors"
          >
            @liseren
          </a>
        </p>
      </footer>
    </div>
  );
}
