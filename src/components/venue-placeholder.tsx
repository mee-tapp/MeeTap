import { Coffee, Compass, UtensilsCrossed, Wine } from "lucide-react";

const ICONS: Record<string, typeof Coffee> = {
  Cafés: Coffee,
  Restaurants: UtensilsCrossed,
  Bars: Wine,
  Activities: Compass,
};

/**
 * Photo-less venue visual. Real venues have no photos yet; this keeps every
 * card and header the same size so photos can be dropped in later without
 * touching layout.
 */
export function VenuePlaceholder({
  category,
  className = "",
  iconClassName = "size-8",
}: {
  category: string;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = ICONS[category] ?? Compass;
  return (
    <div
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center bg-secondary text-muted-foreground ${className}`}
    >
      <Icon className={iconClassName} strokeWidth={1.25} />
    </div>
  );
}
