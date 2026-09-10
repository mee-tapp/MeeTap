import { Link } from "@tanstack/react-router";
import { Instagram, Linkedin, X } from "lucide-react";

import meetapLogo from "@/assets/meetap-logo.png";

const navLinkClass = "transition-colors hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="site-shell flex flex-col items-center justify-between gap-8 py-10 md:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <img src={meetapLogo} alt="" className="size-8 rounded-md" />
          <div>
            <strong>MeeTap</strong>
            <p className="text-xs text-muted-foreground">Good places for any mood.</p>
          </div>
        </Link>
        <nav
          className="flex flex-wrap justify-center gap-7 text-sm text-muted-foreground"
          aria-label="Footer navigation"
        >
          <Link to="/" activeOptions={{ exact: true }} className={navLinkClass}>
            Home
          </Link>
          <Link to="/explore" className={navLinkClass}>
            Explore
          </Link>
          <Link to="/how-it-works" className={navLinkClass}>
            How it works
          </Link>
          <Link to="/about" className={navLinkClass}>
            About
          </Link>
        </nav>
        <div className="flex gap-3">
          <Instagram className="size-5" />
          <X className="size-5" />
          <Linkedin className="size-5" />
        </div>
      </div>
    </footer>
  );
}
