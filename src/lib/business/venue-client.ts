import { supabase } from "@/lib/auth/client";

/**
 * Business-dashboard data access. Every call goes straight from the browser
 * to Supabase using the signed-in user's own session — RLS (see migration
 * 0018_business_venues.sql) is what actually enforces "only the owner can
 * touch their own venue/photos/menu", not this file. No server functions
 * needed for this, same pattern as updateProfile in auth-context.tsx.
 */

// Small, local city-center table — deliberately not imported from the
// server-only recommend engine, which must never end up in a client bundle.
export const CITY_CENTERS: Record<string, { lat: number; lon: number; currency: string }> = {
  Istanbul: { lat: 41.0369, lon: 28.985, currency: "TRY" },
  Baku: { lat: 40.3777, lon: 49.852, currency: "AZN" },
};

export type BusinessVenue = {
  id: string;
  slug: string;
  name: string;
  category: string;
  cuisines: string[];
  city: string;
  district: string | null;
  address: { street?: string } | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  opening_hours: string | null;
  price_band: number | null;
  currency: string | null;
  photo_url: string | null;
  description: string | null;
  menu_url: string | null;
  menu_pdf_url: string | null;
  is_active: boolean;
};

const VENUE_COLUMNS =
  "id,slug,name,category,cuisines,city,district,address,phone,website,instagram,opening_hours,price_band,currency,photo_url,description,menu_url,menu_pdf_url,is_active";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${base || "venue"}-${suffix}`;
}

export async function fetchMyVenue(ownerId: string): Promise<BusinessVenue | null> {
  const { data, error } = await supabase
    .from("venues")
    .select(VENUE_COLUMNS)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BusinessVenue | null;
}

export type CreateVenueInput = {
  ownerId: string;
  name: string;
  category: string;
  cuisines: string;
  city: string;
  district: string;
  street: string;
  phone: string;
  website: string;
  instagram: string;
  openingHours: string;
  priceBand: number | null;
  description: string;
};

function parseCuisines(value: string): string[] {
  return value
    .split(",")
    .map((c) => c.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export async function createMyVenue(input: CreateVenueInput): Promise<BusinessVenue> {
  const center = CITY_CENTERS[input.city] ?? CITY_CENTERS["Istanbul"]!;
  const slug = slugify(input.name);
  const { data, error } = await supabase
    .from("venues")
    .insert({
      owner_id: input.ownerId,
      slug,
      name: input.name.trim(),
      category: input.category,
      cuisines: parseCuisines(input.cuisines),
      city: input.city,
      district: input.district.trim() || null,
      address: input.street.trim() ? { street: input.street.trim() } : {},
      phone: input.phone.trim() || null,
      website: input.website.trim() || null,
      instagram: input.instagram.trim() || null,
      opening_hours: input.openingHours.trim() || null,
      price_band: input.priceBand,
      description: input.description.trim() || null,
      currency: center.currency,
      // Placeholder location until the owner sets a precise pin — kept
      // inactive below so an approximate location never misleads a search.
      lat: center.lat,
      lon: center.lon,
      location: `SRID=4326;POINT(${center.lon} ${center.lat})`,
      is_active: false,
    })
    .select(VENUE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as BusinessVenue;
}

export type UpdateVenueInput = Partial<
  Pick<
    BusinessVenue,
    | "name"
    | "category"
    | "district"
    | "phone"
    | "website"
    | "instagram"
    | "opening_hours"
    | "price_band"
    | "description"
  >
> & { cuisines?: string; street?: string };

export async function updateMyVenue(venueId: string, patch: UpdateVenueInput): Promise<void> {
  const { cuisines, street, ...rest } = patch;
  const dbPatch: Record<string, unknown> = { ...rest };
  if (cuisines !== undefined) dbPatch["cuisines"] = parseCuisines(cuisines);
  if (street !== undefined) dbPatch["address"] = street.trim() ? { street: street.trim() } : {};
  const { error } = await supabase.from("venues").update(dbPatch).eq("id", venueId);
  if (error) throw new Error(error.message);
}

export type VenuePhoto = { id: string; url: string; sort_order: number };

export async function fetchMyPhotos(venueId: string): Promise<VenuePhoto[]> {
  const { data, error } = await supabase
    .from("venue_photos")
    .select("id,url,sort_order")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data as VenuePhoto[];
}

/** Uploads a file to Storage, records it, and — if it's the venue's first
 * photo — sets it as the venue's cover photo (the column every existing
 * card/page already reads from). */
export async function uploadMyPhoto(
  venueId: string,
  ownerId: string,
  file: File,
): Promise<VenuePhoto> {
  const path = `${ownerId}/${venueId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("venue-photos").upload(path, file);
  if (uploadError) throw new Error(uploadError.message);
  const { data: publicUrl } = supabase.storage.from("venue-photos").getPublicUrl(path);

  const existing = await fetchMyPhotos(venueId);
  const { data, error } = await supabase
    .from("venue_photos")
    .insert({ venue_id: venueId, url: publicUrl.publicUrl, sort_order: existing.length })
    .select("id,url,sort_order")
    .single();
  if (error) throw new Error(error.message);

  if (existing.length === 0) {
    await supabase.from("venues").update({ photo_url: publicUrl.publicUrl }).eq("id", venueId);
  }
  return data as VenuePhoto;
}

export async function deleteMyPhoto(photoId: string): Promise<void> {
  const { error } = await supabase.from("venue_photos").delete().eq("id", photoId);
  if (error) throw new Error(error.message);
}

/** The two supported ways a business can attach their menu: a link to an
 * existing online menu, or an uploaded PDF. Setting one clears the other. */
export async function setMenuLink(venueId: string, url: string): Promise<void> {
  const { error } = await supabase
    .from("venues")
    .update({ menu_url: url.trim(), menu_pdf_url: null })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
}

export async function uploadMenuPdf(venueId: string, ownerId: string, file: File): Promise<string> {
  const path = `${ownerId}/${venueId}/menu-${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("venue-photos")
    .upload(path, file, { contentType: "application/pdf" });
  if (uploadError) throw new Error(uploadError.message);
  const { data: publicUrl } = supabase.storage.from("venue-photos").getPublicUrl(path);
  const { error } = await supabase
    .from("venues")
    .update({ menu_pdf_url: publicUrl.publicUrl, menu_url: null })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
  return publicUrl.publicUrl;
}

export async function clearMenu(venueId: string): Promise<void> {
  const { error } = await supabase
    .from("venues")
    .update({ menu_url: null, menu_pdf_url: null })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
}
