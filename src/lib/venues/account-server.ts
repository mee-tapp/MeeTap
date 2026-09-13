import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { verifyAccessToken } from "@/lib/auth/server-auth";
import { toVenue, type VenueRowLite } from "./server";

/**
 * Account-area server functions – saved places, own reviews, search history.
 * Every handler verifies the caller's Supabase access token itself (never
 * trusts a client-supplied user id) and then reads/writes through the
 * existing service client, scoped explicitly to that verified id.
 *
 * This is an additive layer: it does not change fetchVenues/fetchFeatured/
 * recommendVenues/submitReview behavior for anonymous users.
 */

async function requireUser(accessToken: string) {
  const user = await verifyAccessToken(accessToken);
  if (!user) throw new Error("Not authenticated");
  return user;
}

const withToken = z.object({ accessToken: z.string() });

export const fetchSavedVenues = createServerFn({ method: "GET" })
  .validator((input: unknown) => withToken.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(data.accessToken);
    const { serviceClient, CITY_CENTERS } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const { data: rows, error } = await sb
      .from("saved_venues")
      .select(
        "created_at,venue:venues(id,slug,name,category,cuisines,lat,lon,district,city,price_band,currency,ambiance_tags,rating_avg,rating_count,confidence,website,opening_hours,outdoor_seating,seaside,photo_url,photo_attribution)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const savedAt = new Map<string, string>();
    const venues = (rows as unknown as Array<{ created_at: string; venue: VenueRowLite | null }>)
      .filter((row) => row.venue)
      .map((row) => {
        savedAt.set(row.venue!.id, row.created_at);
        const center = CITY_CENTERS[row.venue!.city] ?? CITY_CENTERS["Istanbul"]!;
        return toVenue(row.venue!, center);
      });
    return { venues, savedAt: Object.fromEntries(savedAt) };
  });

export const toggleSavedVenue = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ accessToken: z.string(), venueId: z.string().uuid(), save: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser(data.accessToken);
    const { serviceClient } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    if (data.save) {
      const { error } = await sb
        .from("saved_venues")
        .upsert({ user_id: user.id, venue_id: data.venueId }, { onConflict: "user_id,venue_id" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("saved_venues")
        .delete()
        .eq("user_id", user.id)
        .eq("venue_id", data.venueId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

type MyReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  venue: { slug: string; name: string } | null;
};

export const fetchMyReviews = createServerFn({ method: "GET" })
  .validator((input: unknown) => withToken.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(data.accessToken);
    const { serviceClient } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const { data: rows, error } = await sb
      .from("reviews")
      .select("id,rating,comment,created_at,venue:venues(slug,name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows as unknown as MyReviewRow[])
      .filter((r) => r.venue)
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        venueSlug: r.venue!.slug,
        venueName: r.venue!.name,
      }));
  });

type QueryLogRow = {
  id: string;
  raw_query: string;
  city: string | null;
  created_at: string;
  results: Array<{ venue_id: string; score: number }> | null;
};

export const fetchMyHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) => withToken.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(data.accessToken);
    const { serviceClient } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const { data: rows, error } = await sb
      .from("query_logs")
      .select("id,raw_query,city,created_at,results")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    const logs = rows as unknown as QueryLogRow[];

    const venueIds = [...new Set(logs.flatMap((l) => (l.results ?? []).map((r) => r.venue_id)))];
    const venueMap = new Map<string, { slug: string; name: string }>();
    if (venueIds.length) {
      const { data: venueRows } = await sb.from("venues").select("id,slug,name").in("id", venueIds);
      for (const v of (venueRows ?? []) as Array<{ id: string; slug: string; name: string }>) {
        venueMap.set(v.id, { slug: v.slug, name: v.name });
      }
    }

    return logs.map((log) => ({
      id: log.id,
      query: log.raw_query,
      city: log.city,
      createdAt: log.created_at,
      results: (log.results ?? [])
        .map((r) => venueMap.get(r.venue_id))
        .filter((v): v is { slug: string; name: string } => Boolean(v)),
    }));
  });
