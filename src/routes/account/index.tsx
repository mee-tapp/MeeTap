import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { History, Loader2, LogOut, Star, User } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VenueCard } from "@/components/venue-card";
import { AuthCard } from "@/components/auth/auth-card";
import { BusinessDashboard } from "@/components/business/business-dashboard";
import { CITIES } from "@/lib/city-context";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchMyHistory,
  fetchMyReviews,
  fetchSavedVenues,
  toggleSavedVenue,
} from "@/lib/venues/account-server";

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [{ title: "Your account — MeeTap" }],
  }),
  component: AccountPage,
});

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AccountPage() {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <main className="site-shell flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="site-shell flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Sign in to see your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Save places, keep track of what you searched for, and see your reviews in one place.
          </p>
        </div>
        <AuthCard />
      </main>
    );
  }

  if (profile?.account_type === "business") {
    return <BusinessDashboard />;
  }

  return (
    <main className="site-shell pb-24 pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-8">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 border border-border">
            <AvatarFallback className="text-lg font-semibold">
              {initials(profile?.display_name ?? user.email ?? "")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold">{profile?.display_name || user.email}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <User className="size-3.5" /> Personal account
            </p>
          </div>
        </div>
        <Button
          variant="glass"
          className="rounded-full"
          onClick={async () => {
            await signOut();
            toast.success("Signed out.");
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>

      <Tabs defaultValue="profile" className="mt-8">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger
            value="profile"
            className="rounded-full border border-border data-[state=active]:border-primary"
          >
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-full border border-border data-[state=active]:border-primary"
          >
            History
          </TabsTrigger>
          <TabsTrigger
            value="saved"
            className="rounded-full border border-border data-[state=active]:border-primary"
          >
            Saved places
          </TabsTrigger>
          <TabsTrigger
            value="reviews"
            className="rounded-full border border-border data-[state=active]:border-primary"
          >
            My reviews
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-8">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="history" className="mt-8">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="saved" className="mt-8">
          <SavedTab />
        </TabsContent>
        <TabsContent value="reviews" className="mt-8">
          <ReviewsTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function ProfileTab() {
  const { user, profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [homeCity, setHomeCity] = useState(profile?.home_city ?? "");
  const [saving, setSaving] = useState(false);

  // Profile loads asynchronously right after sign-in, so seed these fields
  // once it (or a later update) actually arrives.
  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setHomeCity(profile?.home_city ?? "");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    const { error } = await updateProfile({
      display_name: displayName.trim() || null,
      home_city: homeCity || null,
    });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success("Profile updated.");
  };

  return (
    <div className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={user?.email ?? ""} disabled />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Home city</Label>
        <div className="flex gap-2">
          {CITIES.map((option) => (
            <Button
              key={option}
              type="button"
              variant="chip"
              data-active={homeCity === option}
              onClick={() => setHomeCity(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
      <Button variant="hero" className="rounded-full px-6" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
      </Button>
    </div>
  );
}

function HistoryTab() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";
  const query = useQuery({
    queryKey: ["my-history", accessToken],
    queryFn: () => fetchMyHistory({ data: { accessToken } }),
    enabled: Boolean(accessToken),
  });

  if (query.isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  const entries = query.data ?? [];
  if (!entries.length) {
    return (
      <EmptyState
        title="No searches yet"
        body="Your recommendation history will appear here after you search on the home page."
      />
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <History className="size-3.5" /> {entry.city ?? "—"}
            </span>
            <span>{formatDate(entry.createdAt)}</span>
          </div>
          <p className="mt-2 text-sm font-medium">“{entry.query}”</p>
          {entry.results.length > 0 ? (
            <ol className="mt-3 flex flex-wrap gap-2 text-sm">
              {entry.results.map((venue, index) => (
                <li key={venue.slug}>
                  <Link
                    to="/explore/$slug"
                    params={{ slug: venue.slug }}
                    className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground hover:underline"
                  >
                    {index + 1}. {venue.name}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No matches were shown for this search.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SavedTab() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["my-saved", accessToken],
    queryFn: () => fetchSavedVenues({ data: { accessToken } }),
    enabled: Boolean(accessToken),
  });

  const unsave = useMutation({
    mutationFn: (venueId: string) =>
      toggleSavedVenue({ data: { accessToken, venueId, save: false } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-saved", accessToken] }),
    onError: () => toast.error("Could not update saved places."),
  });

  if (query.isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  const venues = query.data?.venues ?? [];
  if (!venues.length) {
    return (
      <EmptyState
        title="No saved places yet"
        body="Save places you love and they'll appear here."
      />
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {venues.map((venue) => (
        <VenueCard
          key={venue.id}
          venue={venue}
          saved
          onSave={() => venue.id && unsave.mutate(venue.id)}
        />
      ))}
    </div>
  );
}

function ReviewsTab() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";
  const query = useQuery({
    queryKey: ["my-reviews", accessToken],
    queryFn: () => fetchMyReviews({ data: { accessToken } }),
    enabled: Boolean(accessToken),
  });

  if (query.isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  const reviews = query.data ?? [];
  if (!reviews.length) {
    return (
      <EmptyState
        title="No reviews yet"
        body="Reviews you write on a venue's page will show up here."
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {reviews.map((review) => (
        <div key={review.id} className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to="/explore/$slug"
              params={{ slug: review.venueSlug }}
              className="font-semibold hover:underline"
            >
              {review.venueName}
            </Link>
            <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={`size-3.5 ${index < review.rating ? "fill-warm text-warm" : "text-muted-foreground"}`}
              />
            ))}
          </div>
          {review.comment && (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.comment}</p>
          )}
        </div>
      ))}
    </div>
  );
}
