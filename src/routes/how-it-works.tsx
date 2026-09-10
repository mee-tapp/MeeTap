import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, MapPin, MousePointer2, Search, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { useInView } from "@/hooks/use-in-view";
import { venueKronotrop, venueMirth, venueNola } from "@/lib/site-data";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How MeeTap Works — Live Demo" },
      {
        name: "description",
        content:
          "Watch MeeTap turn a craving into a table: type what you want, see results appear instantly, and pick the perfect place.",
      },
      { property: "og:title", content: "How MeeTap Works" },
      {
        property: "og:description",
        content: "A live look at how MeeTap finds the right place for your mood.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

const TYPE_TEXT = "somewhere romantic for Italian with my girlfriend tonight";
const TYPE_SPEED = 45;

type Phase = "idle" | "typing" | "searching" | "results" | "selecting" | "detail";

const demoResults = [
  {
    name: "Trattoria Lucca",
    image: venueNola,
    rating: "4.8",
    time: "6 min",
    tags: ["Romantic", "Wood-fired pizza"],
    detail: "Candlelit tables, a wood-fired oven, and a wine list that never misses.",
  },
  {
    name: "Nonna's Table",
    image: venueKronotrop,
    rating: "4.7",
    time: "9 min",
    tags: ["Family-run", "Fresh pasta"],
    detail: "Handmade pasta every morning, recipes passed down three generations.",
  },
  {
    name: "Bella Vista",
    image: venueMirth,
    rating: "4.6",
    time: "12 min",
    tags: ["Rooftop", "Date night"],
    detail: "Italian classics with a skyline view — go for sunset, stay for tiramisu.",
  },
];

const SELECTED_INDEX = 1;

const captions: Record<Phase, string> = {
  idle: "Just tell MeeTap what you're in the mood for.",
  typing: "Just tell MeeTap what you're in the mood for.",
  searching: "We instantly match your craving with real places nearby.",
  results: "Results tailored to your mood, budget and distance — no endless scrolling.",
  selecting: "Results tailored to your mood, budget and distance — no endless scrolling.",
  detail: "Tap any place to see ratings, reviews and everything you need to decide.",
};

function HowItWorks() {
  return (
    <main className="text-foreground">
      <section className="site-shell pb-10 pt-14 md:pt-20">
        <Reveal>
          <p className="section-label">How it works</p>
          <h1 className="mt-5 max-w-2xl text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.03]">
            Watch MeeTap find the right table.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            No forms, no filters to configure. Just say what you're craving and watch the rest
            happen — this is a live look at the actual experience.
          </p>
        </Reveal>
      </section>

      <section className="site-shell pb-24">
        <Reveal delay={120}>
          <DemoSection />
        </Reveal>
      </section>

      <section className="site-shell pb-24 text-center">
        <Reveal>
          <p className="section-label">That's it</p>
          <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
            No forms. No filters to dig through.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            MeeTap reads your mood, budget, weather and distance together — so what you see is
            already what you're looking for.
          </p>
          <Button variant="glass" className="mt-8 rounded-full px-6" asChild>
            <Link to="/about" hash="download">
              Get the app
            </Link>
          </Button>
        </Reveal>
      </section>
    </main>
  );
}

function DemoSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedText, setTypedText] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    setPhase("typing");

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      charIndex += 1;
      setTypedText(TYPE_TEXT.slice(0, charIndex));
      if (charIndex >= TYPE_TEXT.length) {
        clearInterval(typeInterval);
      }
    }, TYPE_SPEED);

    return () => clearInterval(typeInterval);
  }, [inView]);

  useEffect(() => {
    if (phase !== "typing" || typedText !== TYPE_TEXT) return;
    const t = setTimeout(() => setPhase("searching"), 350);
    return () => clearTimeout(t);
  }, [phase, typedText]);

  useEffect(() => {
    const nextDelay: Partial<Record<Phase, number>> = {
      searching: 1000,
      results: 1900,
      selecting: 900,
    };
    const nextPhase: Partial<Record<Phase, Phase>> = {
      searching: "results",
      results: "selecting",
      selecting: "detail",
    };
    const delay = nextDelay[phase];
    const next = nextPhase[phase];
    if (delay === undefined || next === undefined) return;
    const t = setTimeout(() => setPhase(next), delay);
    return () => clearTimeout(t);
  }, [phase]);

  const resultsVisible = phase === "results" || phase === "selecting" || phase === "detail";
  const selected = demoResults[SELECTED_INDEX]!;

  return (
    <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
      <div className="lg:sticky lg:top-28">
        <p className="section-label">Live demo</p>
        <h2 className="mt-4 text-3xl font-semibold leading-tight md:text-4xl">
          From craving to
          <br />
          reservation-ready.
        </h2>
        <p
          key={captions[phase]}
          className="mt-6 max-w-md animate-in fade-in slide-in-from-bottom-2 text-lg leading-7 text-muted-foreground duration-500"
        >
          {captions[phase]}
        </p>
        <Button variant="hero" className="mt-8 rounded-full px-6" asChild>
          <Link to="/explore">
            Try it yourself <ArrowRight />
          </Link>
        </Button>
      </div>

      <div
        ref={ref}
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
      >
        <div className="flex h-9 items-center gap-1.5 border-b border-border bg-secondary/40 px-4">
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="ml-3 text-[11px] text-muted-foreground">meetap.app/explore</span>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface-raised p-2 shadow-[var(--shadow-button)]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {phase === "searching" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate px-2 text-sm">
              {typedText || <span className="text-muted-foreground">What are you craving?</span>}
              {phase === "typing" && <span className="ml-0.5 animate-pulse">|</span>}
            </span>
          </div>

          {phase === "searching" && (
            <p className="mt-4 animate-in fade-in text-xs text-muted-foreground duration-500">
              Finding romantic Italian spots for tonight...
            </p>
          )}

          {resultsVisible && phase !== "detail" && (
            <p className="mt-4 animate-in fade-in text-xs text-muted-foreground duration-500">
              {demoResults.length} places match “{TYPE_TEXT}”
            </p>
          )}

          {resultsVisible && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {phase !== "detail" &&
                demoResults.map((venue, index) => {
                  const isTarget = index === SELECTED_INDEX;
                  const isSelecting = phase === "selecting" && isTarget;
                  return (
                    <div
                      key={venue.name}
                      className={`relative animate-in fade-in slide-in-from-bottom-4 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-button)] transition-all duration-500 fill-mode-both ${isSelecting ? "border-primary ring-2 ring-primary" : "border-border"}`}
                      style={{ animationDelay: `${index * 150}ms` }}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <img
                          src={venue.image}
                          alt={`${venue.name} interior`}
                          loading="lazy"
                          width={640}
                          height={480}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold">{venue.name}</h3>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Star className="size-3 fill-warm text-warm" /> {venue.rating}
                          <span>·</span>
                          <MapPin className="size-3" /> {venue.time}
                        </div>
                      </div>
                      {isSelecting && <FakeCursor />}
                    </div>
                  );
                })}
            </div>
          )}

          {phase === "detail" && (
            <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-button)] duration-500">
              <div className="flex gap-4">
                <img
                  src={selected.image}
                  alt={`${selected.name} interior`}
                  width={200}
                  height={200}
                  className="size-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <h3 className="font-semibold">{selected.name}</h3>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="size-3.5 fill-warm text-warm" /> {selected.rating}
                    <span>·</span>
                    <MapPin className="size-3.5" /> {selected.time}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{selected.detail}</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-warm" /> This is what a MeeTap listing looks like.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FakeCursor() {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setArrived(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <MousePointer2
      className={`pointer-events-none absolute z-20 size-5 fill-foreground text-foreground drop-shadow transition-all duration-700 ease-out ${arrived ? "bottom-4 right-4 opacity-100" : "bottom-10 right-10 opacity-0"}`}
    />
  );
}
