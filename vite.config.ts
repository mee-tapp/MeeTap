// Build preset: bundles TanStack Start, React, Tailwind, tsconfig paths and the
// Nitro server build (Vercel) in one plugin set. It ships as an npm package from
// the original scaffold; replacing it with a hand-written Vite config is on the
// backlog but not worth the deploy risk right now. Do not add those plugins
// again manually — duplicates break the app.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// The preset only injects VITE_* variables. Server functions (Supabase
// service role, DeepSeek) need the rest of .env too, so load it into process.env
// for the dev/SSR process. In production these are set on the host instead.
Object.assign(
  process.env,
  loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), ""),
  process.env,
);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
