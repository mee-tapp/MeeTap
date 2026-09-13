import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/components/home-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MeeTap — Good Places for Any Mood" },
      {
        name: "description",
        content:
          "Discover places matched to your mood, budget, location, weather, and travel time.",
      },
      { property: "og:title", content: "MeeTap — Good Places for Any Mood" },
      {
        property: "og:description",
        content: "Tell us what you feel like doing. MeeTap finds the right place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});
