"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn, useSession, type ClientSafeProvider } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInPageContent />
    </Suspense>
  );
}

function SignInPageContent() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({});

  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  useEffect(() => {
    if (status === "authenticated") {
      window.location.href = callbackUrl;
      return;
    }
    getProviders().then((availableProviders) => {
      setProviders(availableProviders ?? {});
    });
  }, [status, callbackUrl]);

  const hasGoogle = Boolean(providers.google);
  const hasEmail = Boolean(providers.email);

  if (status === "loading") {
    return <SignInLoading />;
  }

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

        {error && (
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            {error === "Callback"
              ? "Ошибка входа. Проверьте NEXTAUTH_SECRET в .env и Redirect URI в Google Cloud Console: http://localhost:3000/api/auth/callback/google"
              : `Ошибка: ${error}`}
          </div>
        )}

        <div className="space-y-3">
          {hasGoogle && (
            <Button
              className="w-full"
              size="lg"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              Continue with Google
            </Button>
          )}

          {hasGoogle && hasEmail && (
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-zinc-900/50 px-2 text-zinc-500">or</span>
              </div>
            </div>
          )}

          {hasEmail && (
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
          )}

          {!hasGoogle && !hasEmail && (
            <p className="text-sm text-zinc-400">No auth providers are configured.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SignInLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
    </div>
  );
}
