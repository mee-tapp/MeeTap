import { createContext, useContext, useState, type ReactNode } from "react";

export const CITIES = ["Istanbul", "Baku"] as const;
export type City = (typeof CITIES)[number];

type CityContextValue = {
  city: City;
  setCity: (city: City) => void;
};

const CityContext = createContext<CityContextValue | null>(null);

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<City>("Istanbul");
  return <CityContext.Provider value={{ city, setCity }}>{children}</CityContext.Provider>;
}

export function useCity() {
  const context = useContext(CityContext);
  if (!context) throw new Error("useCity must be used within a CityProvider");
  return context;
}
