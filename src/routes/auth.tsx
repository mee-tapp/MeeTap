import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { HomePage } from "@/components/home-page";

const authSearch = z.object({
  mode: z.enum(["signin", "signup"]).default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => authSearch.parse(search),
  head: () => ({
    meta: [
      { title: "Sign in — MeeTap" },
      { name: "description", content: "Sign in or create your MeeTap account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();

  return (
    <main className="relative min-h-[calc(100dvh-5rem)] overflow-hidden">
      {/* The real homepage, kept alive behind the auth layer — darkened and
          blurred rather than a screenshot, so the brand stays recognizable. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 scale-105 blur-2xl select-none"
      >
        <HomePage />
      </div>
      <div className="absolute inset-0 -z-10 bg-background/78" />

      <div className="flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4 py-16">
        <AuthCard key={mode} defaultMode={mode} />
      </div>
    </main>
  );
}
