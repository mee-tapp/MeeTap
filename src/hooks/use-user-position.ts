import { useCallback, useEffect, useRef, useState } from "react";

export type UserPosition = { lat: number; lon: number };

/**
 * Browser geolocation without the usual race: the permission prompt can take
 * the user many seconds, so we never time out while it is showing. Ask on
 * demand (first focus of the search box), cache the answer, and let callers
 * await the in-flight request when they need it.
 */
export function useUserPosition() {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [status, setStatus] = useState<"idle" | "asking" | "granted" | "denied" | "unavailable">(
    "idle",
  );
  const pending = useRef<Promise<UserPosition | null> | null>(null);

  const request = useCallback((): Promise<UserPosition | null> => {
    if (position) return Promise.resolve(position);
    if (pending.current) return pending.current;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return Promise.resolve(null);
    }
    setStatus("asking");
    pending.current = new Promise<UserPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setPosition(next);
          setStatus("granted");
          resolve(next);
        },
        (err) => {
          setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
          resolve(null);
        },
        // 25 s covers a slow first prompt; a fix cached for 5 min is fine for "nearby".
        { enableHighAccuracy: false, timeout: 25000, maximumAge: 5 * 60 * 1000 },
      );
    }).finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [position]);

  // If the user already granted permission earlier, fetch silently on mount.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") void request();
        if (p.state === "denied") setStatus("denied");
      })
      .catch(() => {});
  }, [request]);

  return { position, status, request };
}
