import { Coffee, Footprints, Map, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import meetapLogo from "@/assets/meetap-logo.png";
import { istanbulHero, venueMirth } from "@/lib/site-data";

export function Phone({ className, splash = false }: { className?: string; splash?: boolean }) {
  return (
    <div className={`phone-frame ${className ?? ""}`}>
      <div className="phone-notch" />
      <div className="h-full overflow-hidden rounded-[2rem] bg-background">
        {splash ? (
          <div className="relative h-full">
            <img
              src={istanbulHero}
              alt="MeeTap mobile app Istanbul screen"
              loading="lazy"
              width={1024}
              height={1280}
              className="h-full w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
            <div className="absolute inset-x-5 top-12 text-center">
              <img src={meetapLogo} alt="" className="mx-auto size-10 rounded-lg" />
              <p className="mt-2 font-semibold">MeeTap</p>
            </div>
            <div className="absolute inset-x-6 bottom-10 text-center">
              <h3 className="text-3xl font-semibold leading-tight">
                Good places
                <br />
                for any mood.
              </h3>
              <p className="mt-3 text-xs text-muted-foreground">
                Discover amazing places around you.
              </p>
              <Button variant="hero" className="mt-5 w-full rounded-full">
                Get started
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={meetapLogo} alt="" className="size-7 rounded-md" />
                <strong>MeeTap</strong>
              </div>
              <span className="text-xs text-muted-foreground">Istanbul</span>
            </div>
            <p className="mt-8 text-xs text-muted-foreground">Good to see you</p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight">
              What do you feel
              <br />
              like doing today?
            </h3>
            <div className="mt-5 flex items-center gap-2 rounded-full bg-secondary px-4 py-3 text-xs text-muted-foreground">
              <Search className="size-4" /> Search places, activities...
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2">
              {[Coffee, Users, Footprints, Map].map((Icon, index) => (
                <span
                  key={index}
                  className="flex aspect-square items-center justify-center rounded-lg bg-secondary"
                >
                  <Icon className="size-4" />
                </span>
              ))}
            </div>
            <p className="mt-6 text-sm font-semibold">Popular near you</p>
            <img
              src={venueMirth}
              alt="Mirth Café in MeeTap app"
              loading="lazy"
              width={1280}
              height={800}
              className="mt-3 h-40 w-full rounded-lg object-cover"
            />
            <h4 className="mt-3 font-semibold">Mirth Café</h4>
            <p className="mt-1 text-xs text-muted-foreground">★ 4.8 · 8 min</p>
          </div>
        )}
      </div>
    </div>
  );
}
