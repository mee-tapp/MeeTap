import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Camera,
  FileText,
  Globe,
  Instagram,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Plus,
  Store,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categories } from "@/lib/site-data";
import { CITIES } from "@/lib/city-context";
import { useAuth } from "@/lib/auth/auth-context";
import {
  CITY_CENTERS,
  clearMenu,
  createMyVenue,
  deleteMyPhoto,
  fetchMyPhotos,
  fetchMyVenue,
  setMenuLink,
  updateMyVenue,
  uploadMenuPdf,
  uploadMyPhoto,
  type BusinessVenue,
} from "@/lib/business/venue-client";

const VENUE_CATEGORIES = categories.filter((c) => c !== "All");

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

export function BusinessDashboard() {
  const { user, profile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<"overview" | "photos" | "menu">("overview");

  const venueQuery = useQuery({
    queryKey: ["my-venue", user?.id],
    queryFn: () => fetchMyVenue(user!.id),
    enabled: Boolean(user),
  });

  if (venueQuery.isLoading) {
    return (
      <main className="site-shell flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!venueQuery.data) {
    return (
      <BusinessHome
        ownerId={user!.id}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["my-venue", user?.id] })}
      />
    );
  }

  const venue = venueQuery.data;
  const navItems = [
    { id: "overview" as const, label: "Restaurant info", icon: Store },
    { id: "photos" as const, label: "Photos", icon: Camera },
    { id: "menu" as const, label: "Menu", icon: UtensilsCrossed },
  ];

  return (
    <main className="site-shell pb-24 pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-8">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 border border-border">
            <AvatarFallback className="text-lg font-semibold">
              {initials(profile?.business_name || venue.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold">{venue.name}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-3.5" /> Business dashboard
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  venue.is_active ? "bg-emerald-500/15 text-emerald-500" : "bg-warm/15 text-warm"
                }`}
              >
                {venue.is_active ? "Live on MeeTap" : "Draft — under review"}
              </span>
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

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="glass-panel flex flex-row gap-1 rounded-2xl p-2 lg:flex-col lg:pb-4">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors lg:flex-none ${
                section === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div>
          {section === "overview" && <OverviewSection venue={venue} />}
          {section === "photos" && <PhotosSection venue={venue} />}
          {section === "menu" && <MenuSection venue={venue} />}
        </div>
      </div>
    </main>
  );
}

function BusinessHome({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const { user, profile, signOut } = useAuth();
  const [showForm, setShowForm] = useState(false);

  if (showForm) {
    return (
      <CreateVenueOnboarding
        ownerId={ownerId}
        onCreated={onCreated}
        onBack={() => setShowForm(false)}
      />
    );
  }

  return (
    <main className="site-shell pb-24 pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-8">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 border border-border">
            <AvatarFallback className="text-lg font-semibold">
              {initials(profile?.business_name || profile?.display_name || user?.email || "")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold">
              {profile?.business_name || profile?.display_name || user?.email}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-3.5" /> Business account
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

      <div className="mx-auto mt-16 max-w-lg text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Store className="size-7" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold">Add your restaurant</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Create your listing to manage its info, photos, and menu. It stays private to you until
          it's reviewed and published to Explore.
        </p>
        <Button variant="hero" className="mt-6 rounded-full px-6" onClick={() => setShowForm(true)}>
          <Plus className="size-4" /> Add my restaurant
        </Button>
      </div>
    </main>
  );
}

const PRICE_BANDS = [1, 2, 3, 4];

function CreateVenueOnboarding({
  ownerId,
  onCreated,
  onBack,
}: {
  ownerId: string;
  onCreated: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(VENUE_CATEGORIES[0]!);
  const [cuisines, setCuisines] = useState("");
  const [city, setCity] = useState<string>(CITIES[0]);
  const [district, setDistrict] = useState("");
  const [street, setStreet] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [priceBand, setPriceBand] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Enter your restaurant's name.");
      return;
    }
    setSubmitting(true);
    try {
      await createMyVenue({
        ownerId,
        name,
        category,
        cuisines,
        city,
        district,
        street,
        phone,
        website,
        instagram,
        openingHours,
        priceBand,
        description,
      });
      toast.success("Your listing was created.");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create your listing.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="site-shell py-16">
      <form onSubmit={submit} className="mx-auto max-w-2xl">
        <Button type="button" variant="glass" size="sm" className="rounded-full" onClick={onBack}>
          Back
        </Button>

        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">Add your restaurant</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Tell us about your place. You can add photos and a menu next.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          <section className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            <h2 className="text-sm font-semibold text-muted-foreground">Basics</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="venue-name">Restaurant name</Label>
                <Input
                  id="venue-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Mirth Café"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-2">
                  {VENUE_CATEGORIES.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant="chip"
                      data-active={category === option}
                      onClick={() => setCategory(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="venue-cuisines">Cuisines</Label>
                <Input
                  id="venue-cuisines"
                  value={cuisines}
                  onChange={(event) => setCuisines(event.target.value)}
                  placeholder="e.g. Turkish, Kebab, Seafood"
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple cuisines with commas.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="venue-description">Description</Label>
                <Textarea
                  id="venue-description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A short description guests will see on your page."
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <MapPin className="size-3.5" /> Location
            </h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label>City</Label>
                <div className="flex gap-2">
                  {CITIES.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant="chip"
                      data-active={city === option}
                      onClick={() => setCity(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="venue-district">District</Label>
                  <Input
                    id="venue-district"
                    value={district}
                    onChange={(event) => setDistrict(event.target.value)}
                    placeholder="e.g. Kadıköy"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="venue-street">Street address</Label>
                  <Input
                    id="venue-street"
                    value={street}
                    onChange={(event) => setStreet(event.target.value)}
                    placeholder="Street, building no."
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll place you at the {city} city centre for now — pinpointing your exact location
                on the map is coming soon.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            <h2 className="text-sm font-semibold text-muted-foreground">Contact</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="venue-phone" className="flex items-center gap-1.5">
                  <Phone className="size-3.5" /> Phone
                </Label>
                <Input
                  id="venue-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+90 ..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="venue-website" className="flex items-center gap-1.5">
                    <Globe className="size-3.5" /> Website
                  </Label>
                  <Input
                    id="venue-website"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="venue-instagram" className="flex items-center gap-1.5">
                    <Instagram className="size-3.5" /> Instagram
                  </Label>
                  <Input
                    id="venue-instagram"
                    value={instagram}
                    onChange={(event) => setInstagram(event.target.value)}
                    placeholder="@yourplace"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            <h2 className="text-sm font-semibold text-muted-foreground">Hours &amp; price</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="venue-hours">Opening hours</Label>
                <Textarea
                  id="venue-hours"
                  rows={2}
                  value={openingHours}
                  onChange={(event) => setOpeningHours(event.target.value)}
                  placeholder="e.g. Mon–Sun 09:00–23:00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price level</Label>
                <div className="flex gap-2">
                  {PRICE_BANDS.map((band) => (
                    <Button
                      key={band}
                      type="button"
                      variant="chip"
                      data-active={priceBand === band}
                      onClick={() => setPriceBand(band)}
                    >
                      {"₺".repeat(band)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <Button
          type="submit"
          variant="hero"
          className="mt-8 w-full rounded-full"
          disabled={submitting}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : "Create listing"}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Your listing starts as a draft. It won't appear in Explore until it's reviewed.
        </p>
      </form>
    </main>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function OverviewSection({ venue }: { venue: BusinessVenue }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(venue.name);
  const [category, setCategory] = useState(venue.category);
  const [cuisines, setCuisines] = useState(venue.cuisines.join(", "));
  const [description, setDescription] = useState(venue.description ?? "");
  const [district, setDistrict] = useState(venue.district ?? "");
  const [street, setStreet] = useState(venue.address?.street ?? "");
  const [phone, setPhone] = useState(venue.phone ?? "");
  const [website, setWebsite] = useState(venue.website ?? "");
  const [instagram, setInstagram] = useState(venue.instagram ?? "");
  const [openingHours, setOpeningHours] = useState(venue.opening_hours ?? "");
  const [priceBand, setPriceBand] = useState<number | null>(venue.price_band);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateMyVenue(venue.id, {
        name: name.trim(),
        category,
        cuisines,
        description: description.trim() || null,
        district: district.trim() || null,
        street,
        phone: phone.trim() || null,
        website: website.trim() || null,
        instagram: instagram.trim() || null,
        opening_hours: openingHours.trim() || null,
        price_band: priceBand,
      });
      await queryClient.invalidateQueries({ queryKey: ["my-venue", user?.id] });
      toast.success("Restaurant info updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Restaurant info">
      <div className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ov-name">Name</Label>
          <Input id="ov-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <div className="flex flex-wrap gap-2">
            {VENUE_CATEGORIES.map((option) => (
              <Button
                key={option}
                type="button"
                variant="chip"
                data-active={category === option}
                onClick={() => setCategory(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-cuisines">Cuisines</Label>
          <Input
            id="ov-cuisines"
            value={cuisines}
            onChange={(event) => setCuisines(event.target.value)}
            placeholder="e.g. Turkish, Kebab, Seafood"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-description">Description</Label>
          <Textarea
            id="ov-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-district" className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> District
          </Label>
          <Input
            id="ov-district"
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-street">Street address</Label>
          <Input
            id="ov-street"
            value={street}
            onChange={(event) => setStreet(event.target.value)}
            placeholder="Street, building no."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-phone" className="flex items-center gap-1.5">
            <Phone className="size-3.5" /> Phone
          </Label>
          <Input id="ov-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-website" className="flex items-center gap-1.5">
            <Globe className="size-3.5" /> Website
          </Label>
          <Input
            id="ov-website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-instagram" className="flex items-center gap-1.5">
            <Instagram className="size-3.5" /> Instagram
          </Label>
          <Input
            id="ov-instagram"
            value={instagram}
            onChange={(event) => setInstagram(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-hours">Opening hours</Label>
          <Textarea
            id="ov-hours"
            rows={2}
            value={openingHours}
            onChange={(event) => setOpeningHours(event.target.value)}
            placeholder="e.g. Mon–Sun 09:00–23:00"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Price level</Label>
          <div className="flex gap-2">
            {PRICE_BANDS.map((band) => (
              <Button
                key={band}
                type="button"
                variant="chip"
                data-active={priceBand === band}
                onClick={() => setPriceBand(band)}
              >
                {"₺".repeat(band)}
              </Button>
            ))}
          </div>
        </div>
        <Button variant="hero" className="rounded-full px-6" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
        </Button>
      </div>
    </SectionCard>
  );
}

function PhotosSection({ venue }: { venue: BusinessVenue }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const photosQuery = useQuery({
    queryKey: ["my-venue-photos", venue.id],
    queryFn: () => fetchMyPhotos(venue.id),
  });

  const remove = useMutation({
    mutationFn: (photoId: string) => deleteMyPhoto(photoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-venue-photos", venue.id] }),
    onError: () => toast.error("Could not delete photo."),
  });

  const handleFile = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploading(true);
    try {
      await uploadMyPhoto(venue.id, user.id, file);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-venue-photos", venue.id] }),
        queryClient.invalidateQueries({ queryKey: ["my-venue", user.id] }),
      ]);
      toast.success("Photo added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload photo.");
    } finally {
      setUploading(false);
    }
  };

  const photos = photosQuery.data ?? [];

  return (
    <SectionCard title="Photos">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border"
          >
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove.mutate(photo.id)}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
              aria-label="Delete photo"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
          <span className="text-xs">Add photo</span>
        </button>
      </div>
      {photos.length === 0 && !photosQuery.isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">
          No photos yet. The first photo you add becomes your cover photo.
        </p>
      )}
    </SectionCard>
  );
}

type MenuChoice = "link" | "pdf" | null;

function MenuSection({ venue }: { venue: BusinessVenue }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [choice, setChoice] = useState<MenuChoice>(null);
  const [linkValue, setLinkValue] = useState("");
  const [saving, setSaving] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["my-venue", user?.id] });

  const openDialog = () => {
    setChoice(null);
    setLinkValue(venue.menu_url ?? "");
    setDialogOpen(true);
  };

  const saveLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!linkValue.trim()) {
      toast.error("Enter a link to your menu.");
      return;
    }
    setSaving(true);
    try {
      await setMenuLink(venue.id, linkValue);
      await invalidate();
      toast.success("Menu link saved.");
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the link.");
    } finally {
      setSaving(false);
    }
  };

  const handlePdf = async (file: File | undefined) => {
    if (!file || !user) return;
    if (file.type !== "application/pdf") {
      toast.error("Please choose a PDF file.");
      return;
    }
    setSaving(true);
    try {
      await uploadMenuPdf(venue.id, user.id, file);
      await invalidate();
      toast.success("Menu PDF uploaded.");
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the PDF.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await clearMenu(venue.id);
      await invalidate();
      toast.success("Menu removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the menu.");
    }
  };

  const hasMenu = Boolean(venue.menu_url || venue.menu_pdf_url);

  return (
    <SectionCard title="Menu">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          void handlePdf(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {hasMenu ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            {venue.menu_pdf_url ? (
              <FileText className="size-5 shrink-0 text-muted-foreground" />
            ) : (
              <LinkIcon className="size-5 shrink-0 text-muted-foreground" />
            )}
            <a
              href={venue.menu_pdf_url ?? venue.menu_url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm font-medium hover:underline"
            >
              {venue.menu_pdf_url ? "View menu PDF" : venue.menu_url}
            </a>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="glass" size="sm" className="rounded-full" onClick={openDialog}>
              Replace
            </Button>
            <Button
              variant="glass"
              size="icon"
              className="rounded-full"
              aria-label="Remove menu"
              onClick={remove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No menu yet. Add a link to your existing online menu, or upload it as a PDF.
          </p>
          <Button variant="hero" size="sm" className="mt-4 rounded-full" onClick={openDialog}>
            <Plus className="size-4" /> Add menu
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add your menu</DialogTitle>
          </DialogHeader>

          {choice === null && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setChoice("link")}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-6 text-sm font-medium transition-colors hover:border-primary hover:bg-secondary"
              >
                <LinkIcon className="size-6" /> Add link
              </button>
              <button
                type="button"
                onClick={() => {
                  setChoice("pdf");
                  fileInput.current?.click();
                }}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-6 text-sm font-medium transition-colors hover:border-primary hover:bg-secondary"
              >
                <FileText className="size-6" /> Upload PDF
              </button>
            </div>
          )}

          {choice === "link" && (
            <form onSubmit={saveLink} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="menu-link">Menu link</Label>
                <Input
                  id="menu-link"
                  type="url"
                  required
                  autoFocus
                  value={linkValue}
                  onChange={(event) => setLinkValue(event.target.value)}
                  placeholder="https://…"
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  variant="hero"
                  className="rounded-full px-6"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {choice === "pdf" && saving && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
