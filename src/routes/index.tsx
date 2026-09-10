import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Cloud,
  Coffee,
  Footprints,
  Loader2,
  MapPin,
  Search,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { CityMap } from "@/components/city-map";
import { VenueCard } from "@/components/venue-card";
import {
  allVenues,
  venues,
  istanbulHero,
  venueMirth,
  venueNola,
  venueKronotrop,
} from "@/lib/site-data";

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
  component: Index,
});

const discoveryCategories = [
  { label: "Trending", icon: TrendingUp },
  { label: "Quick Bite", icon: Zap },
  { label: "Near You", icon: MapPin },
];

const featuredPicks = allVenues.filter((venue) =>
  ["lacivert", "bosphorus-cruise", "rooftop-sunset"].includes(venue.slug),
);

const mapPins = [
  { venue: venues[0]!, left: "14%", top: "28%" },
  { venue: venues[1]!, left: "38%", top: "68%" },
  { venue: venues[2]!, left: "64%", top: "25%" },
  { venue: venues[3]!, left: "86%", top: "65%" },
];

const foundVenue = featuredPicks[0]!;

function Index() {
  const [query, setQuery] = useState("");
  const [discoverySaved, setDiscoverySaved] = useState<string[]>([]);
  const toggleDiscoverySaved = (name: string) =>
    setDiscoverySaved((items) =>
      items.includes(name) ? items.filter((item) => item !== name) : [...items, name],
    );
  const [heroPhase, setHeroPhase] = useState<"idle" | "searching" | "done">("idle");

  useEffect(() => {
    if (heroPhase !== "searching") return;
    const t = setTimeout(() => setHeroPhase("done"), 1500);
    return () => clearTimeout(t);
  }, [heroPhase]);

  return (
    <main className="min-h-screen overflow-hidden text-foreground">
      <section
        id="top"
        className="site-shell grid min-h-[650px] items-center gap-16 pb-20 pt-12 lg:grid-cols-[1.06fr_.94fr] lg:pt-16"
      >
        <div>
          <p
            className="section-label animate-in fade-in slide-in-from-left-4 duration-700 fill-mode-both"
            style={{ animationDelay: "0ms" }}
          >
            Discover places, not just locations
          </p>
          <h1
            className="mt-5 max-w-[650px] animate-in fade-in slide-in-from-left-8 text-[clamp(3rem,5.2vw,5rem)] font-semibold leading-[.98] duration-700 fill-mode-both"
            style={{ animationDelay: "100ms" }}
          >
            Less hesitation,
            <br />
            more destination.
          </h1>
          <p
            className="mt-6 max-w-xl animate-in fade-in slide-in-from-left-8 text-lg leading-8 text-muted-foreground duration-700 fill-mode-both"
            style={{ animationDelay: "220ms" }}
          >
            Tell us what you feel like doing — we’ll find the best places based on your mood,
            budget, weather and location.
          </p>
          <form
            className="mt-9 flex max-w-xl animate-in fade-in slide-in-from-left-8 items-center rounded-full border border-border bg-surface-raised p-2 shadow-[var(--shadow-button)] duration-700 fill-mode-both"
            style={{ animationDelay: "340ms" }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!query.trim()) return;
              setHeroPhase("searching");
            }}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {heroPhase === "searching" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHeroPhase("idle");
              }}
              className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="What do you feel like doing today?"
              aria-label="Describe what you want to do"
            />
            <Button size="icon" type="submit" variant="hero" className="size-10 rounded-full">
              <ArrowRight />
            </Button>
          </form>

          {heroPhase === "searching" && (
            <div
              className="relative mt-4 h-44 max-w-xl animate-in fade-in overflow-hidden rounded-lg border border-border bg-card/70 duration-700 fill-mode-both"
              style={{ animationDelay: "460ms" }}
            >
              <CityMap />

              {mapPins.map(({ venue, left, top }) => (
                <span
                  key={venue.slug}
                  title={venue.name}
                  className="absolute flex -translate-x-1/2 -translate-y-full items-center justify-center text-muted-foreground"
                  style={{ left, top }}
                >
                  <MapPin className="size-4" />
                </span>
              ))}

              <span className="float-soft absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center [--tilt:0deg]">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/30" />
                <span className="relative flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <MapPin className="size-3.5" />
                </span>
              </span>

              <p className="absolute inset-x-0 bottom-2 px-2 text-center text-[11px] text-muted-foreground">
                Scanning for “{query}”...
              </p>
            </div>
          )}

          {heroPhase === "done" && (
            <div className="mt-4 max-w-xl animate-in fade-in slide-in-from-bottom-2 rounded-lg border border-border bg-card/70 p-4 duration-500">
              <div className="flex items-center gap-3">
                <img
                  src={foundVenue.image}
                  alt={`${foundVenue.name} interior`}
                  width={96}
                  height={96}
                  className="size-12 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{foundVenue.name}</p>
                  <p className="text-xs text-muted-foreground">
                    A popular pick while we fine-tune your match
                  </p>
                </div>
                <Button size="sm" variant="hero" className="shrink-0 rounded-full" asChild>
                  <Link to="/explore/$slug" params={{ slug: foundVenue.slug }}>
                    View
                  </Link>
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Context icon={MapPin} value="Istanbul" sub={foundVenue.tags[0] ?? "Nearby"} />
                <Context icon={Cloud} value="18°C" sub="Cloudy today" />
                <Context icon={Wallet} value={`₺ ${foundVenue.budget}`} sub="Budget" />
                <Context icon={Footprints} value={foundVenue.time} sub="Distance" />
              </div>
            </div>
          )}
        </div>

        <div
          className="hero-collage relative mx-auto hidden h-[560px] w-full max-w-[520px] lg:block"
          aria-label="Featured places in Istanbul"
        >
          <img
            src={istanbulHero}
            alt="Galata Tower and Istanbul at sunset"
            width={1024}
            height={1280}
            className="absolute right-7 top-0 h-[360px] w-[270px] animate-in fade-in slide-in-from-right-12 rounded-xl border border-border object-cover shadow-[var(--shadow-card)] duration-700 fill-mode-both"
            style={{ animationDelay: "200ms" }}
          />
          <div
            className="float-soft absolute left-8 top-36 w-[190px] animate-in fade-in rotate-[-8deg] rounded-xl border border-border bg-surface-raised p-2 shadow-[var(--shadow-card)] duration-700 fill-mode-both [--tilt:-8deg]"
            style={{ animationDelay: "420ms" }}
          >
            <img
              src={venueMirth}
              alt="Cozy café interior"
              width={1280}
              height={800}
              className="h-[220px] w-full rounded-lg object-cover"
            />
            <p className="p-3 text-sm font-semibold">
              <Users className="mr-2 inline size-4" />
              Cozy cafés
            </p>
          </div>
          <div
            className="float-soft absolute bottom-24 right-0 w-[175px] animate-in fade-in rotate-[5deg] rounded-xl border border-border bg-surface-raised p-2 shadow-[var(--shadow-card)] duration-700 fill-mode-both [--tilt:5deg]"
            style={{ animationDelay: "560ms" }}
          >
            <img
              src={venueNola}
              alt="Restaurant for conversations"
              width={1280}
              height={800}
              className="h-[150px] w-full rounded-lg object-cover"
            />
            <p className="p-3 text-sm font-semibold">
              <Users className="mr-2 inline size-4" />
              Great conversations
            </p>
          </div>
          <div
            className="glass-panel absolute bottom-0 left-28 flex animate-in fade-in slide-in-from-bottom-6 items-center gap-4 rounded-xl px-5 py-4 duration-700 fill-mode-both"
            style={{ animationDelay: "700ms" }}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Coffee />
            </span>
            <p className="max-w-[220px] text-xs leading-5 text-muted-foreground">
              <strong className="text-foreground">MeeTap analyzes your context</strong>
              <br />
              and finds the best options for you.
            </p>
          </div>
        </div>
      </section>

      <section className="site-shell py-24">
        <Reveal className="flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Discover</p>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight md:text-5xl">
              Discover something
              <br />
              worth going out for.
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Whatever the occasion, there's a place for it. Pick a vibe and start exploring.
            </p>
          </div>
          <Button variant="hero" className="rounded-full px-6" asChild>
            <Link to="/explore">
              Explore all <ArrowRight />
            </Link>
          </Button>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {discoveryCategories.map(({ label, icon: Icon }, index) => (
            <Reveal key={label} delay={index * 60}>
              <Link
                to="/explore"
                className="group flex h-full flex-col items-center gap-3 rounded-lg border border-border bg-card p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-[var(--shadow-button)]"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-secondary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-14 grid gap-5 sm:grid-cols-3">
          {featuredPicks.map((venue) => (
            <VenueCard
              key={venue.slug}
              venue={venue}
              saved={discoverySaved.includes(venue.name)}
              onSave={() => toggleDiscoverySaved(venue.name)}
            />
          ))}
        </Reveal>
      </section>

      <section className="site-shell py-24 text-center">
        <blockquote className="mx-auto max-w-2xl text-3xl leading-snug text-muted-foreground">
          <span className="text-foreground">“</span> MeeTap turns ordinary days
          <br />
          into great experiences. <span className="text-foreground">”</span>
        </blockquote>
        <div className="mt-8 flex items-center justify-center gap-4">
          <div className="flex -space-x-2">
            {[venueMirth, venueNola, venueKronotrop, istanbulHero].map((image, index) => (
              <img
                key={index}
                src={image}
                alt="MeeTap community member"
                loading="lazy"
                width={40}
                height={40}
                className="size-9 rounded-full border-2 border-background object-cover"
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">Join 50,000+ explorers</span>
        </div>
      </section>
    </main>
  );
}

function Context({ icon: Icon, value, sub }: { icon: typeof MapPin; value: string; sub: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card/70 px-3">
      <Icon className="size-4 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}
