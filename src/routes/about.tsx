import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Apple,
  ArrowRight,
  Check,
  Compass,
  Heart,
  Lightbulb,
  QrCode,
  Rocket,
  Smartphone,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone } from "@/components/phone-mockup";
import { istanbulHero } from "@/lib/site-data";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About MeeTap — Our story, mission and team" },
      {
        name: "description",
        content:
          "MeeTap was built in 2026 to help people find good places for exactly how they feel. Meet the team and get the app.",
      },
      { property: "og:title", content: "About MeeTap" },
      {
        property: "og:description",
        content: "Our story, mission, vision, team and the MeeTap app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

const pillars = [
  {
    icon: Target,
    title: "Our Mission",
    text: "Help people find the right place for exactly how they feel — not just where they happen to be.",
  },
  {
    icon: Compass,
    title: "Our Vision",
    text: "A world where discovering a genuinely good place takes seconds, not endless scrolling and second-guessing.",
  },
  {
    icon: Heart,
    title: "Our Philosophy",
    text: "Context beats a star rating. Mood, weather, budget and distance matter more than any generic list.",
  },
];

const timeline = [
  {
    period: "Q1 2026",
    title: "The idea",
    text: "After one too many nights spent scrolling for “somewhere good,” the first sketches of MeeTap were drawn.",
    icon: Lightbulb,
  },
  {
    period: "Q2 2026",
    title: "Building the core",
    text: "Our team started building the mood-matching engine that powers every MeeTap recommendation.",
    icon: Sparkles,
  },
  {
    period: "Q3 2026",
    title: "Istanbul preview",
    text: "MeeTap opened its doors in Istanbul first, learning from real cafés, restaurants and the people who love them.",
    icon: Compass,
  },
  {
    period: "Q4 2026",
    title: "Getting ready to launch",
    text: "Polishing the experience for iOS and Android ahead of our public launch.",
    icon: Rocket,
  },
];

const team = [
  {
    name: "Nihat Guliyev",
    role: "Lead Developer",
    initials: "NG",
    note: "Leads product engineering and the MeeTap platform.",
  },
  {
    name: "Ali Huseynov",
    role: "CTO",
    initials: "AH",
    note: "Oversees MeeTap's technology, infrastructure and architecture.",
  },
  {
    name: "Muhammed Aliyev",
    role: "Marketing Director (CMO)",
    initials: "MA",
    note: "Builds MeeTap's brand and reaches the people who need it.",
  },
];

const appFeatures = [
  "Personalized recommendations based on your mood and context",
  "Real-time weather, budget and distance filtering",
  "Save, organize and share your favorite places",
  "Works across Istanbul, with more cities on the way",
];

function About() {
  return (
    <main className="text-foreground">
      <section className="site-shell pb-16 pt-14 md:pt-20">
        <p className="section-label">About MeeTap</p>
        <h1 className="mt-5 max-w-3xl text-[clamp(2.75rem,6vw,4.5rem)] font-semibold leading-[1.02]">
          Good places, found the way people actually decide.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          MeeTap was born in 2026 from a simple frustration: search engines are great at listing
          places, but terrible at understanding why you're looking. So we built something that
          starts with your mood, not a search box.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-xs font-medium">
            Founded 2026
          </Badge>
          <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-xs font-medium">
            Istanbul, Türkiye
          </Badge>
          <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-xs font-medium">
            Mood-first discovery
          </Badge>
        </div>
      </section>

      <section className="site-shell py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-lg border border-border bg-card p-7 shadow-[var(--shadow-button)]"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-secondary">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-5 font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-shell grid gap-14 py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="section-label">Our story</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight">Why we built MeeTap.</h2>
          <div className="mt-6 space-y-4 leading-7 text-muted-foreground">
            <p>
              We kept noticing the same pattern: you know exactly how you feel — like catching up
              with a friend, getting work done, or finding somewhere quiet to be alone — but every
              map and review app makes you translate that feeling into keywords, filters and endless
              tabs.
            </p>
            <p>
              MeeTap flips that around. Tell us your mood, your budget and how far you're willing to
              go, and we do the translating. It's a small shift with a big effect: less searching,
              more actually going somewhere good.
            </p>
            <p>
              We started in Istanbul because it's a city with endless good places and, honestly, not
              enough good ways to find them. It's where the idea was tested first, and where MeeTap
              still feels most at home.
            </p>
          </div>
        </div>
        <img
          src={istanbulHero}
          alt="Istanbul skyline at sunset"
          loading="lazy"
          width={1024}
          height={1280}
          className="aspect-[4/5] w-full rounded-xl border border-border object-cover shadow-[var(--shadow-card)]"
        />
      </section>

      <section className="site-shell py-20">
        <p className="section-label text-center">Our journey</p>
        <h2 className="mt-4 text-center text-4xl font-semibold">Built in 2026.</h2>
        <div className="relative mt-16">
          <div className="absolute left-5 top-0 h-full w-px bg-border md:left-0 md:right-0 md:top-5 md:h-px md:w-auto" />
          <div className="grid gap-10 md:grid-cols-4 md:gap-6">
            {timeline.map(({ icon: Icon, period, title, text }) => (
              <div key={period} className="relative flex gap-5 pl-14 md:flex-col md:gap-0 md:pl-0">
                <span className="absolute left-0 top-0 z-10 flex size-10 items-center justify-center rounded-full border border-border bg-background md:static md:mx-auto">
                  <Icon className="size-4" />
                </span>
                <div className="md:mt-6 md:text-center">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {period}
                  </span>
                  <h3 className="mt-1 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-shell py-20">
        <p className="section-label">Leadership</p>
        <h2 className="mt-4 text-4xl font-semibold">The people behind MeeTap.</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((member) => (
            <article
              key={member.role}
              className="rounded-lg border border-border bg-card p-6 text-center shadow-[var(--shadow-button)]"
            >
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-secondary text-xl font-semibold text-secondary-foreground">
                {member.initials}
              </div>
              <h3 className="mt-4 font-semibold">{member.name}</h3>
              <p className="text-sm text-muted-foreground">{member.role}</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{member.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="download" className="site-shell py-20">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="grid gap-12 p-8 lg:grid-cols-2 lg:p-14">
            <div>
              <Badge
                variant="secondary"
                className="rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wide"
              >
                Coming soon
              </Badge>
              <h2 className="mt-5 text-4xl font-semibold leading-tight md:text-5xl">
                MeeTap, right in your pocket.
              </h2>
              <p className="mt-5 max-w-md leading-7 text-muted-foreground">
                Get personalized place recommendations, save your favorites and explore new cities —
                wherever you are.
              </p>

              <div className="mt-8 space-y-4">
                {appFeatures.map((feature) => (
                  <div key={feature} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <Check className="size-3" />
                    </span>
                    <p className="text-sm leading-6 text-muted-foreground">{feature}</p>
                  </div>
                ))}
              </div>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button variant="hero" size="lg" disabled className="rounded-full px-6">
                  <Apple /> App Store
                </Button>
                <Button variant="glass" size="lg" disabled className="rounded-full px-6">
                  <Smartphone /> Google Play
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Placeholder — download links go live at launch.
              </p>

              <div className="mt-8 flex flex-wrap gap-8 border-t border-border pt-6 text-xs text-muted-foreground">
                <div>
                  <p className="font-semibold text-foreground">Version</p>
                  <p className="mt-1">1.0.0 · Coming 2026</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Platforms</p>
                  <p className="mt-1">iOS &amp; Android</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Release</p>
                  <p className="mt-1">TBA</p>
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="relative flex items-center gap-6">
                <Phone className="rotate-[-6deg]" splash />
                <Phone className="hidden translate-y-6 rotate-[4deg] sm:block" />
              </div>
              <div className="glass-panel absolute -bottom-4 right-0 hidden flex-col items-center gap-2 rounded-xl p-4 sm:flex">
                <div className="grid size-16 place-items-center rounded-lg border border-border bg-background/60">
                  <QrCode className="size-8 text-muted-foreground" />
                </div>
                <p className="text-center text-[10px] leading-tight text-muted-foreground">
                  Scan to download
                  <br />
                  (coming soon)
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Button variant="hero" className="rounded-full px-6" asChild>
            <Link to="/explore">
              Explore places while you wait <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
