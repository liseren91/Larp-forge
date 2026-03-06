"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm space-y-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-600">
            <Flame size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">LARP Forge</h1>
          <p className="text-sm text-zinc-400">AI-Powered LARP Game Design</p>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Continue with Google
          </Button>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-zinc-900/50 px-2 text-zinc-500">or</span>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const email = new FormData(e.currentTarget).get("email") as string;
              signIn("email", { email, callbackUrl: "/dashboard" });
            }}
            className="space-y-3"
          >
            <input
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            />
            <Button type="submit" variant="secondary" className="w-full" size="lg">
              Sign in with Email
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
