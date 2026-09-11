import type { Weather } from "./recommend/scoring.ts";

/**
 * Current weather from Open-Meteo (free, no API key, no account).
 * https://open-meteo.com/en/docs
 */

// WMO weather codes that mean precipitation is happening.
const WET_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
]);

export type CurrentWeather = Weather & {
  weather_code: number;
  label_tr: string;
  label_en: string;
  fetched_at: string;
};

const LABELS: Array<[codes: number[], tr: string, en: string]> = [
  [[0], "Açık", "Clear"],
  [[1, 2], "Az bulutlu", "Partly cloudy"],
  [[3], "Bulutlu", "Cloudy"],
  [[45, 48], "Sisli", "Foggy"],
  [[51, 53, 55, 56, 57], "Çiseleyen yağmur", "Drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Yağmurlu", "Rainy"],
  [[71, 73, 75, 77, 85, 86], "Karlı", "Snowy"],
  [[95, 96, 99], "Fırtınalı", "Stormy"],
];

function label(code: number): [string, string] {
  const hit = LABELS.find(([codes]) => codes.includes(code));
  return hit ? [hit[1], hit[2]] : ["Bilinmiyor", "Unknown"];
}

const cache = new Map<string, { value: CurrentWeather; expires: number }>();
const TTL_MS = 10 * 60 * 1000;

export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,precipitation,rain,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        precipitation?: number;
        rain?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const c = json.current;
    if (!c) return null;
    const code = c.weather_code ?? 0;
    const [tr, en] = label(code);
    const value: CurrentWeather = {
      is_raining: (c.rain ?? 0) > 0 || (c.precipitation ?? 0) > 0 || WET_CODES.has(code),
      temp_c: c.temperature_2m ?? null,
      is_windy: (c.wind_speed_10m ?? 0) >= 30,
      weather_code: code,
      label_tr: tr,
      label_en: en,
      fetched_at: new Date().toISOString(),
    };
    cache.set(key, { value, expires: Date.now() + TTL_MS });
    return value;
  } catch {
    return null;
  }
}
