import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Filter,
  Flame,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { VenueCard } from "@/components/venue-card";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { categories, cities, purposes } from "@/lib/site-data";
import { useCity } from "@/lib/city-context";
import { useUserPosition } from "@/hooks/use-user-position";
import { fetchStats, fetchVenues } from "@/lib/venues/server";

const MAX_BUDGET = 20000;
const MAX_DISTANCE = 120;

function formatDistance(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export const Route = createFileRoute("/explore/")({
  head: () => ({
    meta: [
      { title: "Explore — MeeTap" },
      {
        name: "description",
        content:
          "Search, filter and discover cafés, restaurants, bars and activities matched to your mood, budget and distance.",
      },
      { property: "og:title", content: "Explore places on MeeTap" },
      {
        property: "og:description",
        content: "Browse trending, featured and recommended places near you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Explore,
});

function Explore() {
  const { city } = useCity();
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [budget, setBudget] = useState(MAX_BUDGET);
  const [distance, setDistance] = useState(MAX_DISTANCE);
  const [saved, setSaved] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    (mood ? 1 : 0) +
    (category !== "All" ? 1 : 0) +
    (budget < MAX_BUDGET ? 1 : 0) +
    (distance < MAX_DISTANCE ? 1 : 0);

  const toggleSaved = (name: string) =>
    setSaved((items) =>
      items.includes(name) ? items.filter((item) => item !== name) : [...items, name],
    );

  // Real venues for this city, filtered on the server (typing is debounced).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { position } = useUserPosition();
  const venuesQuery = useQuery({
    queryKey: ["venues", city, category, mood, budget, distance, debouncedQuery, position],
    queryFn: () =>
      fetchVenues({
        data: {
          city,
          category,
          mood,
          query: debouncedQuery,
          maxBudget: budget < MAX_BUDGET ? budget : null,
          maxDistanceMin: distance < MAX_DISTANCE ? distance : null,
          lat: position?.lat ?? null,
          lon: position?.lon ?? null,
        },
      }),
    placeholderData: (previous) => previous,
  });
  const cityVenues = useMemo(() => venuesQuery.data?.venues ?? [], [venuesQuery.data]);
  const totalListed = venuesQuery.data?.total ?? 0;

  const statsQuery = useQuery({
    queryKey: ["stats", city],
    queryFn: () => fetchStats({ data: { city } }),
  });
  const liveStats = statsQuery.data;

  const stats = useMemo(
    () => [
      { value: `${liveStats?.places ?? totalListed}`, label: "Places listed" },
      { value: `${liveStats?.cities ?? 0}`, label: "Cities" },
      { value: `${liveStats?.searches ?? 0}`, label: "Searches" },
      { value: liveStats?.avgRating ?? "—", label: "Avg. rating" },
    ],
    [liveStats, totalListed],
  );

  const featured = useMemo(() => cityVenues.slice(0, 4), [cityVenues]);

  const filtered = useMemo(() => {
    // Mood, budget and distance are already applied on the server; this keeps
    // the list consistent while a new query is loading.
    return cityVenues.filter((venue) => {
      if (category !== "All" && venue.category !== category) return false;
      if (venue.budget > budget) return false;
      if (Number.parseInt(venue.time, 10) > distance) return false;
      if (
        query &&
        !venue.name.toLowerCase().includes(query.toLowerCase()) &&
        !venue.tags.some((tag) => tag.toLowerCase().includes(query.toLowerCase()))
      )
        return false;
      return true;
    });
  }, [cityVenues, category, budget, distance, query]);

  return (
    <main className="text-foreground">
      <section className="site-shell pb-10 pt-14 md:pt-20">
        <Reveal>
          <p className="section-label">Discover · {city}</p>
          <h1 className="mt-4 max-w-2xl text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.03]">
            Explore every mood, every corner of {city}.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            Search, filter and discover places matched to exactly how you feel right now.
          </p>

          <form
            className="mt-8 flex max-w-xl items-center rounded-full border border-border bg-surface-raised p-2 shadow-[var(--shadow-button)]"
            onSubmit={(event) => event.preventDefault()}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Search className="size-4" />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search places, tags, vibes..."
              aria-label="Search places"
            />
          </form>
        </Reveal>
      </section>

      <section className="site-shell pb-14">
        <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card px-5 py-4">
              <p className="text-2xl font-semibold">
                <CountUp value={stat.value} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="site-shell pb-16">
        <Reveal className="flex flex-wrap items-center gap-2">
          {categories.map((item) => (
            <Button
              key={item}
              type="button"
              variant="chip"
              data-active={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </Button>
          ))}
          <Button
            type="button"
            variant="glass"
            className="rounded-full"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter className="size-4" /> Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </Reveal>

        {filtersOpen && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 rounded-lg border border-border bg-card p-5 duration-300">
            <div className="flex flex-wrap items-center gap-2">
              {purposes.map(({ label, icon: Icon }) => (
                <Button
                  key={label}
                  type="button"
                  variant="chip"
                  data-active={mood === label}
                  onClick={() => setMood((current) => (current === label ? null : label))}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <SlidersHorizontal className="size-3.5" /> Max budget
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    ₺
                    <input
                      type="number"
                      min={0}
                      max={MAX_BUDGET}
                      step={100}
                      value={budget}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setBudget(Number.isNaN(next) ? 0 : Math.min(Math.max(next, 0), MAX_BUDGET));
                      }}
                      className="w-20 rounded-md border border-border bg-transparent px-2 py-1 text-right text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label="Max budget amount"
                    />
                    {budget >= MAX_BUDGET ? "+" : ""}
                  </span>
                </div>
                <Slider
                  value={[budget]}
                  max={MAX_BUDGET}
                  step={100}
                  onValueChange={(value) => setBudget(value[0] ?? budget)}
                  className="mt-4"
                  aria-label="Max budget"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <SlidersHorizontal className="size-3.5" /> Max distance
                  </span>
                  <span className="text-muted-foreground">
                    {formatDistance(distance)}
                    {distance >= MAX_DISTANCE ? "+" : ""}
                  </span>
                </div>
                <Slider
                  value={[distance]}
                  max={MAX_DISTANCE}
                  step={10}
                  onValueChange={(value) => setDistance(value[0] ?? distance)}
                  className="mt-4"
                  aria-label="Max distance"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="site-shell pb-20">
        <Reveal>
          <div className="flex items-end justify-between">
            <div>
              <p className="section-label flex items-center gap-2">
                <Flame className="size-3.5" /> Featured
              </p>
              <h2 className="mt-3 text-3xl font-semibold">Handpicked for this week.</h2>
            </div>
          </div>
          <Carousel className="mt-8" opts={{ align: "start", loop: true }}>
            <CarouselContent>
              {featured.map((venue) => (
                <CarouselItem key={venue.slug} className="sm:basis-1/2 lg:basis-1/3">
                  <VenueCard
                    venue={venue}
                    saved={saved.includes(venue.slug)}
                    onSave={() => toggleSaved(venue.slug)}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="mt-6 flex justify-end gap-2">
              <CarouselPrevious
                variant="glass"
                className="static size-10 translate-y-0 rounded-full"
              />
              <CarouselNext variant="hero" className="static size-10 translate-y-0 rounded-full" />
            </div>
          </Carousel>
        </Reveal>
      </section>

      <section className="site-shell pb-20">
        <Reveal>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="section-label flex items-center gap-2">
                <TrendingUp className="size-3.5" /> Trending now
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                {filtered.length} places match your filters
              </h2>
            </div>
          </div>

          {filtered.length > 0 ? (
            <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {filtered.map((venue) => (
                <VenueCard
                  key={venue.slug}
                  venue={venue}
                  saved={saved.includes(venue.slug)}
                  onSave={() => toggleSaved(venue.slug)}
                />
              ))}
            </div>
          ) : venuesQuery.isPending ? (
            <div className="mt-9 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
              <p className="font-semibold">Finding places in {city}…</p>
            </div>
          ) : (
            <div className="mt-9 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
              <p className="font-semibold">No places match those filters yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try widening your budget or distance, or clear the mood filter.
              </p>
              <Button
                variant="glass"
                className="mt-5 rounded-full"
                onClick={() => {
                  setMood(null);
                  setCategory("All");
                  setBudget(MAX_BUDGET);
                  setDistance(MAX_DISTANCE);
                  setQuery("");
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
        </Reveal>
      </section>

      <section className="site-shell pb-20">
        <Reveal>
          <p className="section-label flex items-center gap-2">
            <Sparkles className="size-3.5" /> Recommended for you
          </p>
          <h2 className="mt-3 text-3xl font-semibold">Next cities to explore.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cities.map((cityOption, index) => (
              <article
                key={cityOption.name}
                className={`group relative aspect-[4/5] overflow-hidden rounded-lg border bg-card ${index === 0 ? "border-primary" : "border-border"}`}
              >
                <img
                  src={cityOption.image}
                  alt={`${cityOption.name} city view`}
                  loading="lazy"
                  width={1024}
                  height={1280}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                {cityOption.comingSoon && (
                  <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
                    Coming soon
                  </span>
                )}
                <div className="absolute bottom-4 left-4">
                  <h3 className="font-semibold">{cityOption.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{cityOption.note}</p>
                </div>
              </article>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="site-shell pb-24">
        <Reveal className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card px-8 py-14 text-center shadow-[var(--shadow-card)] sm:flex-row sm:justify-between sm:text-left">
          <div>
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary sm:mb-0">
              <Building2 />
            </span>
            <h2 className="mt-4 text-3xl font-semibold">Can't find the right spot?</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Get the MeeTap app for real-time recommendations wherever you are.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-4 fill-warm text-warm" /> {liveStats?.avgRating ?? "—"}{" "}
              <span className="text-xs">rating</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="size-4" /> {liveStats?.reviews ?? 0}{" "}
              <span className="text-xs">reviews</span>
            </div>
          </div>
          <Button variant="hero" className="w-full rounded-full px-6 sm:w-auto" asChild>
            <Link to="/about" hash="download">
              Get the app <ArrowRight />
            </Link>
          </Button>
        </Reveal>
      </section>
    </main>
  );
}
