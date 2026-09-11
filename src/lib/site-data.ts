import { BookOpen, Heart, User, Users } from "lucide-react";

import venueMirth from "@/assets/venue-mirth.jpg";
import venueNola from "@/assets/venue-nola.jpg";
import venueKronotrop from "@/assets/venue-kronotrop.jpg";
import istanbulHero from "@/assets/istanbul-hero.jpg";

export { venueMirth, venueNola, venueKronotrop, istanbulHero };

export type Review = {
  name: string;
  rating: number;
  date: string;
  comment: string;
};

export type Venue = {
  id?: string;
  slug: string;
  name: string;
  /** null = no photo yet (real venues come without photos for now) */
  image: string | null;
  /** null = no ratings yet */
  rating: string | null;
  reviews: string;
  time: string;
  budget: number;
  tags: string[];
  detail: string;
  category: string;
  city: string;
  ratingBreakdown: number[];
  reviewList: Review[];
  currency?: string;
  website?: string | null;
  lat?: number;
  lon?: number;
};

export const purposes = [
  { label: "Date", icon: Heart },
  { label: "Friends", icon: Users },
  { label: "Study", icon: BookOpen },
  { label: "Alone", icon: User },
];

export const purposeTagMap: Record<string, string[]> = {
  Date: ["Romantic", "Quiet", "Great view", "Cozy"],
  Friends: ["Lively", "Great for groups"],
  Study: ["Good for working", "Quiet"],
  Alone: ["Cozy", "Quiet"],
};

export const venues: Venue[] = [
  {
    slug: "mirth-cafe",
    name: "Mirth Café",
    image: venueMirth,
    rating: "4.8",
    reviews: "320",
    time: "8 min",
    budget: 150,
    tags: ["Cozy", "Great for conversations"],
    detail:
      "A calm atmosphere with great coffee. Fits your budget and is perfect for today’s weather.",
    category: "Cafés",
    city: "Istanbul",
    ratingBreakdown: [72, 20, 5, 2, 1],
    reviewList: [
      {
        name: "Elif",
        rating: 5,
        date: "2 weeks ago",
        comment:
          "My favorite spot to catch up with friends. The coffee is excellent and it never feels rushed.",
      },
      {
        name: "Kerem",
        rating: 5,
        date: "1 month ago",
        comment:
          "Cozy corner seats, great playlist, and the staff remembers your order after two visits.",
      },
      {
        name: "Sara",
        rating: 4,
        date: "2 months ago",
        comment: "Lovely atmosphere, gets a little busy on weekend mornings but worth the wait.",
      },
    ],
  },
  {
    slug: "nola-istanbul",
    name: "Nola Istanbul",
    image: venueNola,
    rating: "4.6",
    reviews: "184",
    time: "12 min",
    budget: 350,
    tags: ["Stylish", "Date friendly"],
    detail: "A stylish spot for a date or catching up with friends.",
    category: "Restaurants",
    city: "Istanbul",
    ratingBreakdown: [60, 28, 8, 3, 1],
    reviewList: [
      {
        name: "Deniz",
        rating: 5,
        date: "1 week ago",
        comment: "Perfect for a first date — great lighting, quiet enough to actually talk.",
      },
      {
        name: "Ayşe",
        rating: 4,
        date: "3 weeks ago",
        comment: "Food was great, service was a bit slow but the ambience made up for it.",
      },
      {
        name: "Mert",
        rating: 5,
        date: "1 month ago",
        comment: "Stylish without trying too hard. Will be back.",
      },
    ],
  },
  {
    slug: "kronotrop",
    name: "Kronotrop",
    image: venueKronotrop,
    rating: "4.5",
    reviews: "521",
    time: "6 min",
    budget: 150,
    tags: ["Spacious", "Good for working"],
    detail: "Spacious, calm and perfect for studying or working.",
    category: "Cafés",
    city: "Istanbul",
    ratingBreakdown: [55, 30, 10, 3, 2],
    reviewList: [
      {
        name: "Yusuf",
        rating: 5,
        date: "3 days ago",
        comment: "My go-to for working outside the house. Plenty of outlets and fast wifi.",
      },
      {
        name: "Elif",
        rating: 4,
        date: "2 weeks ago",
        comment: "Great coffee, can get loud in the afternoon though.",
      },
      {
        name: "Can",
        rating: 4,
        date: "1 month ago",
        comment: "Spacious tables, good for small meetings.",
      },
    ],
  },
  {
    slug: "lacivert",
    name: "Lacivert",
    image: istanbulHero,
    rating: "4.7",
    reviews: "412",
    time: "14 min",
    budget: 500,
    tags: ["Amazing view", "Dinner"],
    detail: "Stunning Bosphorus view and delicious food. Perfect for special moments.",
    category: "Restaurants",
    city: "Istanbul",
    ratingBreakdown: [68, 22, 7, 2, 1],
    reviewList: [
      {
        name: "Zeynep",
        rating: 5,
        date: "5 days ago",
        comment: "The Bosphorus view alone is worth it — food was excellent too.",
      },
      {
        name: "Burak",
        rating: 5,
        date: "2 weeks ago",
        comment: "Took my parents here for their anniversary, everyone loved it.",
      },
      {
        name: "Selin",
        rating: 4,
        date: "1 month ago",
        comment: "A bit pricey but the experience matches the price tag.",
      },
    ],
  },
];

export const moreVenues: Venue[] = [
  {
    slug: "bosphorus-nights",
    name: "Bosphorus Nights",
    image: venueNola,
    rating: "4.5",
    reviews: "276",
    time: "10 min",
    budget: 250,
    tags: ["Lively", "Great view"],
    detail: "Live music and Bosphorus views make this a favorite for evenings out with friends.",
    category: "Bars",
    city: "Istanbul",
    ratingBreakdown: [50, 32, 12, 4, 2],
    reviewList: [
      {
        name: "Onur",
        rating: 5,
        date: "4 days ago",
        comment: "Great live music on weekends, perfect for a night out with friends.",
      },
      {
        name: "Aylin",
        rating: 4,
        date: "3 weeks ago",
        comment: "Good vibe, drinks are a little pricey but worth it for the view.",
      },
      {
        name: "Emre",
        rating: 4,
        date: "2 months ago",
        comment: "Gets crowded fast, come early to grab a table by the window.",
      },
    ],
  },
  {
    slug: "rooftop-sunset",
    name: "Rooftop Sunset",
    image: istanbulHero,
    rating: "4.6",
    reviews: "198",
    time: "18 min",
    budget: 400,
    tags: ["Rooftop", "Amazing view"],
    detail: "Watch the sunset over the city with a drink in hand. Best enjoyed slowly.",
    category: "Bars",
    city: "Istanbul",
    ratingBreakdown: [62, 26, 8, 3, 1],
    reviewList: [
      {
        name: "Pelin",
        rating: 5,
        date: "1 week ago",
        comment: "Best sunset spot in the city, hands down.",
      },
      {
        name: "Tolga",
        rating: 5,
        date: "1 month ago",
        comment: "Went for one drink, stayed for three. Incredible view.",
      },
      {
        name: "Nazlı",
        rating: 4,
        date: "2 months ago",
        comment: "Beautiful spot, reserve ahead on weekends.",
      },
    ],
  },
  {
    slug: "kadikoy-walk",
    name: "Kadıköy Walk",
    image: venueMirth,
    rating: "4.4",
    reviews: "142",
    time: "5 min",
    budget: 0,
    tags: ["Great for groups", "Cozy"],
    detail: "A relaxed walking route through Kadıköy's backstreets, markets and street art.",
    category: "Activities",
    city: "Istanbul",
    ratingBreakdown: [48, 34, 12, 4, 2],
    reviewList: [
      {
        name: "Ege",
        rating: 5,
        date: "6 days ago",
        comment: "Such a fun way to see a different side of Kadıköy. Loved the street art stops.",
      },
      {
        name: "İrem",
        rating: 4,
        date: "1 month ago",
        comment: "Relaxed pace, great for a group with mixed energy levels.",
      },
      {
        name: "Baran",
        rating: 4,
        date: "2 months ago",
        comment: "Good route, would love a few more food stops along the way.",
      },
    ],
  },
  {
    slug: "bosphorus-cruise",
    name: "Bosphorus Cruise",
    image: venueKronotrop,
    rating: "4.9",
    reviews: "365",
    time: "25 min",
    budget: 600,
    tags: ["Scenic", "Date friendly"],
    detail: "A short boat ride along the strait — one of the best ways to see the city.",
    category: "Activities",
    city: "Istanbul",
    ratingBreakdown: [82, 14, 3, 1, 0],
    reviewList: [
      {
        name: "Ceylin",
        rating: 5,
        date: "3 days ago",
        comment: "Absolutely magical, best way to see Istanbul from the water.",
      },
      {
        name: "Kaan",
        rating: 5,
        date: "2 weeks ago",
        comment: "Took my partner for our anniversary, unforgettable.",
      },
      {
        name: "Defne",
        rating: 5,
        date: "1 month ago",
        comment: "Worth every penny, the sunset timing is perfect.",
      },
    ],
  },
];

export const bakuVenues: Venue[] = [
  {
    slug: "sahil-restaurant",
    name: "Sahil Restaurant",
    image: venueNola,
    rating: "4.7",
    reviews: "298",
    time: "9 min",
    budget: 300,
    tags: ["Amazing view", "Dinner"],
    detail: "Seaside dining right on Baku Boulevard, with Caspian views and fresh local seafood.",
    category: "Restaurants",
    city: "Baku",
    ratingBreakdown: [70, 21, 6, 2, 1],
    reviewList: [
      {
        name: "Aysel",
        rating: 5,
        date: "1 week ago",
        comment: "The boulevard view at sunset makes this place unforgettable.",
      },
      {
        name: "Rashad",
        rating: 5,
        date: "3 weeks ago",
        comment: "Best seafood I've had in Baku, staff were lovely too.",
      },
      {
        name: "Günel",
        rating: 4,
        date: "1 month ago",
        comment: "Busy on weekends, book ahead if you want a window table.",
      },
    ],
  },
  {
    slug: "icherisheher-cafe",
    name: "Icherisheher Café",
    image: venueMirth,
    rating: "4.6",
    reviews: "211",
    time: "7 min",
    budget: 120,
    tags: ["Cozy", "Great for conversations"],
    detail: "A quiet courtyard café tucked into the Old City, a short walk from the Maiden Tower.",
    category: "Cafés",
    city: "Baku",
    ratingBreakdown: [64, 25, 7, 3, 1],
    reviewList: [
      {
        name: "Nigar",
        rating: 5,
        date: "5 days ago",
        comment: "Hidden gem in the Old City — loved the courtyard seating.",
      },
      {
        name: "Tural",
        rating: 4,
        date: "2 weeks ago",
        comment: "Great coffee, small space so it fills up fast.",
      },
      {
        name: "Leyla",
        rating: 5,
        date: "1 month ago",
        comment: "My favorite spot to slow down after walking Icherisheher.",
      },
    ],
  },
  {
    slug: "nizami-terrace",
    name: "Nizami Terrace",
    image: venueKronotrop,
    rating: "4.5",
    reviews: "176",
    time: "11 min",
    budget: 220,
    tags: ["Lively", "Rooftop"],
    detail: "A rooftop bar just off Nizami Street with skyline views and a relaxed crowd.",
    category: "Bars",
    city: "Baku",
    ratingBreakdown: [55, 29, 11, 3, 2],
    reviewList: [
      {
        name: "Farid",
        rating: 5,
        date: "4 days ago",
        comment: "Great spot to start a night out, good music and views.",
      },
      {
        name: "Sabina",
        rating: 4,
        date: "3 weeks ago",
        comment: "Nice terrace, drinks are a bit pricey but worth it.",
      },
      {
        name: "Elvin",
        rating: 4,
        date: "1 month ago",
        comment: "Gets crowded after 9pm, go early for a good table.",
      },
    ],
  },
  {
    slug: "flame-towers-walk",
    name: "Flame Towers Walk",
    image: venueMirth,
    rating: "4.8",
    reviews: "254",
    time: "15 min",
    budget: 0,
    tags: ["Scenic", "Great for groups"],
    detail: "An evening walking route up to the Flame Towers viewpoint, best timed for sunset.",
    category: "Activities",
    city: "Baku",
    ratingBreakdown: [76, 18, 4, 1, 1],
    reviewList: [
      {
        name: "Kamran",
        rating: 5,
        date: "6 days ago",
        comment: "Watching the towers light up at night is unmissable.",
      },
      {
        name: "Aynur",
        rating: 5,
        date: "1 month ago",
        comment: "Perfect easy walk with the best view of the whole city.",
      },
      {
        name: "Vusal",
        rating: 4,
        date: "2 months ago",
        comment: "Bring good shoes, the climb up is worth it.",
      },
    ],
  },
];

export const allVenues: Venue[] = [...venues, ...moreVenues, ...bakuVenues];

export const categories = ["All", "Cafés", "Restaurants", "Activities", "Bars"];

export const cities = [
  { name: "Istanbul", note: "Vibrant & timeless", image: istanbulHero, comingSoon: false },
  { name: "London", note: "Classic & modern", image: venueMirth, comingSoon: true },
  { name: "New York", note: "Always something new", image: venueNola, comingSoon: true },
  { name: "Barcelona", note: "Sun, culture & more", image: venueKronotrop, comingSoon: true },
  { name: "Paris", note: "A city of moods", image: istanbulHero, comingSoon: true },
];
