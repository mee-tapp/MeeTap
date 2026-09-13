import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, LogOut, MapPin, Menu, User } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { CITIES } from "@/lib/city-context";
import { useCity } from "@/lib/city-context";
import { useAuth } from "@/lib/auth/auth-context";
import meetapLogo from "@/assets/meetap-logo.png";

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AccountControl() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;

  if (!user) {
    return (
      <Button variant="glass" className="hidden rounded-full sm:inline-flex" asChild>
        <Link to="/auth" search={{ mode: "signin" }}>
          Sign in
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden rounded-full sm:inline-flex"
          aria-label="Account menu"
        >
          <Avatar className="size-9 border border-border">
            <AvatarFallback className="text-xs font-semibold">
              {initials(profile?.display_name ?? user.email ?? "")}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/account">
            <User className="mr-1 size-3.5" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            toast.success("Signed out.");
            navigate({ to: "/" });
          }}
        >
          <LogOut className="mr-1 size-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const navLinkClass = "transition-colors hover:text-foreground";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { city, setCity } = useCity();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="site-shell flex h-20 items-center justify-between">
      <Link to="/" className="flex items-center gap-2.5" aria-label="MeeTap home">
        <img src={meetapLogo} alt="" className="size-10 rounded-md object-cover" />
        <span className="text-lg font-semibold">MeeTap</span>
      </Link>

      <nav
        className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"
        aria-label="Primary navigation"
      >
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{ className: "nav-active text-foreground" }}
          className={navLinkClass}
        >
          Home
        </Link>
        <Link
          to="/explore"
          activeProps={{ className: "nav-active text-foreground" }}
          className={navLinkClass}
        >
          Explore
        </Link>
        <Link
          to="/how-it-works"
          activeProps={{ className: "nav-active text-foreground" }}
          className={navLinkClass}
        >
          How it works
        </Link>
        <Link
          to="/about"
          activeProps={{ className: "nav-active text-foreground" }}
          className={navLinkClass}
        >
          About
        </Link>
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="glass" className="hidden sm:inline-flex">
              <MapPin /> {city} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {CITIES.map((option) => (
              <DropdownMenuItem key={option} onClick={() => setCity(option)}>
                {option === city && <Check className="mr-1 size-3.5" />}
                {option}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountControl />
        <Button variant="hero" className="hidden rounded-full px-5 sm:inline-flex" asChild>
          <Link to="/about" hash="download">
            Get the app
          </Link>
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="glass"
              className="rounded-full md:hidden"
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex w-full max-w-xs flex-col gap-8 border-border bg-background sm:max-w-sm"
          >
            <SheetTitle className="flex items-center gap-2.5">
              <img src={meetapLogo} alt="" className="size-8 rounded-md object-cover" />
              <span className="text-base font-semibold">MeeTap</span>
            </SheetTitle>
            <nav className="flex flex-col gap-1 text-base" aria-label="Mobile navigation">
              <Link
                to="/"
                activeOptions={{ exact: true }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Home
              </Link>
              <Link
                to="/explore"
                activeProps={{ className: "bg-secondary text-foreground" }}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Explore
              </Link>
              <Link
                to="/how-it-works"
                activeProps={{ className: "bg-secondary text-foreground" }}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                How it works
              </Link>
              <Link
                to="/about"
                activeProps={{ className: "bg-secondary text-foreground" }}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                About
              </Link>
              {user ? (
                <Link
                  to="/account"
                  activeProps={{ className: "bg-secondary text-foreground" }}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Account
                </Link>
              ) : (
                <Link
                  to="/auth"
                  search={{ mode: "signin" }}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Sign in
                </Link>
              )}
            </nav>
            <div className="mt-auto flex flex-col gap-3">
              {user && (
                <Button
                  variant="glass"
                  className="justify-center rounded-full"
                  onClick={async () => {
                    await signOut();
                    toast.success("Signed out.");
                    setOpen(false);
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </Button>
              )}
              <div>
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  City
                </p>
                <div className="flex gap-2">
                  {CITIES.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant="chip"
                      data-active={city === option}
                      className="flex-1 justify-center"
                      onClick={() => setCity(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
              <Button variant="hero" className="justify-center rounded-full" asChild>
                <Link to="/about" hash="download" onClick={() => setOpen(false)}>
                  Get the app
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
