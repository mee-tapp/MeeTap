import { Heart, MapPin, Star } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { VenuePlaceholder } from "@/components/venue-placeholder";
import type { Venue } from "@/lib/site-data";

export function VenueCard({
  venue,
  saved,
  onSave,
}: {
  venue: Venue;
  saved?: boolean;
  onSave?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <article
      onClick={() => navigate({ to: "/explore/$slug", params: { slug: venue.slug } })}
      className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-button)] transition-shadow hover:shadow-[var(--shadow-card)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {venue.image ? (
          <>
            <img
              src={venue.image}
              alt={`${venue.name} interior`}
              loading="lazy"
              width={1280}
              height={800}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {venue.imageAttribution && (
              <span className="absolute bottom-1 right-1.5 rounded bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground backdrop-blur-sm">
                Photo: {venue.imageAttribution}
              </span>
            )}
          </>
        ) : (
          <VenuePlaceholder category={venue.category} />
        )}
        <Button
          size="icon"
          variant="glass"
          className="absolute right-3 top-3 rounded-full"
          aria-label={`Save ${venue.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onSave?.();
          }}
        >
          <Heart className={saved ? "fill-current" : ""} />
        </Button>
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
          {venue.category}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold">
          <Link
            to="/explore/$slug"
            params={{ slug: venue.slug }}
            onClick={(event) => event.stopPropagation()}
            className="hover:underline"
          >
            {venue.name}
          </Link>
        </h3>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {venue.rating ? (
            <>
              <Star className="size-4 fill-warm text-warm" />
              <strong>{venue.rating}</strong>
              <span className="text-muted-foreground">({venue.reviews})</span>
            </>
          ) : (
            <>
              <Star className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">No ratings yet</span>
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <MapPin className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">{venue.time}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {venue.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{venue.detail}</p>
      </div>
    </article>
  );
}
