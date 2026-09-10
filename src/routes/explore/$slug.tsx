import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Heart, MapPin, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { allVenues, type Review } from "@/lib/site-data";

export const Route = createFileRoute("/explore/$slug")({
  loader: ({ params }) => {
    const venue = allVenues.find((item) => item.slug === params.slug);
    if (!venue) throw notFound();
    return venue;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — MeeTap` },
          { name: "description", content: loaderData.detail },
          { property: "og:title", content: `${loaderData.name} — MeeTap` },
          { property: "og:description", content: loaderData.detail },
          { property: "og:type", content: "website" },
        ]
      : [],
  }),
  component: VenueDetail,
});

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function VenueDetail() {
  const venue = Route.useLoaderData();
  const [saved, setSaved] = useState(false);
  const [reviews, setReviews] = useState<Review[]>(venue.reviewList);
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitReview = () => {
    if (!userRating) return;
    setReviews((current) => [
      { name: "You", rating: userRating, date: "Just now", comment: comment || "No comment left." },
      ...current,
    ]);
    setSubmitted(true);
    setComment("");
  };

  return (
    <main className="text-foreground">
      <section className="site-shell pb-6 pt-8">
        <Button variant="glass" size="sm" className="rounded-full" asChild>
          <Link to="/explore">
            <ArrowLeft className="size-3.5" /> Back to explore
          </Link>
        </Button>
      </section>

      <section className="site-shell grid gap-10 pb-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border shadow-[var(--shadow-card)]">
          <img
            src={venue.image}
            alt={`${venue.name} interior`}
            loading="eager"
            width={1280}
            height={800}
            className="h-full w-full object-cover"
          />
          <Button
            size="icon"
            variant="glass"
            className="absolute right-4 top-4 rounded-full"
            aria-label={saved ? `Unsave ${venue.name}` : `Save ${venue.name}`}
            onClick={() => setSaved((value) => !value)}
          >
            <Heart className={saved ? "fill-current" : ""} />
          </Button>
          <span className="absolute left-4 top-4 rounded-full bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur-sm">
            {venue.category}
          </span>
        </div>

        <div>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">{venue.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1 font-semibold">
              <Star className="size-4 fill-warm text-warm" /> {venue.rating}
            </span>
            <span className="text-muted-foreground">({venue.reviews} reviews)</span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-3.5" /> {venue.time}
            </span>
          </div>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">{venue.detail}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {venue.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="hero" className="rounded-full px-6" asChild>
              <Link to="/about" hash="download">
                Get the app <ArrowRight />
              </Link>
            </Button>
            <Button variant="glass" className="rounded-full px-6" asChild>
              <Link to="/explore">Explore similar places</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="site-shell grid gap-14 pb-24 lg:grid-cols-[.85fr_1.15fr]">
        <div>
          <p className="section-label">Rating breakdown</p>
          <h2 className="mt-3 text-2xl font-semibold">{venue.rating} out of 5</h2>
          <div className="mt-6 space-y-3">
            {venue.ratingBreakdown.map((percent, index) => {
              const star = 5 - index;
              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <span className="w-10 shrink-0 text-muted-foreground">{star} star</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-warm" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-muted-foreground">{percent}%</span>
                </div>
              );
            })}
          </div>

          <div className="mt-10 rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-button)]">
            <h3 className="font-semibold">Rate this place</h3>
            <p className="mt-1 text-xs text-muted-foreground">Tap a star to leave your rating.</p>
            <div className="mt-4 flex gap-1" onMouseLeave={() => setHoverRating(0)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                  onMouseEnter={() => setHoverRating(value)}
                  onClick={() => setUserRating(value)}
                  className="p-0.5"
                >
                  <Star
                    className={`size-7 transition-colors ${value <= (hoverRating || userRating) ? "fill-warm text-warm" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Share your experience..."
              rows={3}
              className="mt-4 w-full rounded-lg border border-border bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              variant="hero"
              className="mt-3 rounded-full px-6"
              disabled={!userRating}
              onClick={submitReview}
            >
              Submit review
            </Button>
            {submitted && (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                Thanks for rating! You gave {userRating} star{userRating > 1 ? "s" : ""}.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="section-label">Reviews</p>
          <h2 className="mt-3 text-2xl font-semibold">What people are saying</h2>
          <div className="mt-6 space-y-4">
            {reviews.map((review, index) => (
              <div
                key={`${review.name}-${index}`}
                className="rounded-lg border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                      {initials(review.name)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{review.name}</p>
                      <p className="text-xs text-muted-foreground">{review.date}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star
                        key={starIndex}
                        className={`size-3.5 ${starIndex < review.rating ? "fill-warm text-warm" : "text-muted-foreground"}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
