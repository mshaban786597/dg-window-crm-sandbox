"use client";

/**
 * §4 — Reusable address autocomplete with a provider abstraction.
 *
 * Preferred provider: Google Places. The API key is read from the environment
 * via `GOOGLE_MAPS_API_KEY` (see `@/lib/domain`) and is NEVER hardcoded. The
 * Google script is loaded dynamically, and only when a key is present.
 *
 * Graceful degradation is a hard requirement: with no key — or if the provider
 * script fails to load / errors at query time — the component renders a plain
 * manual-entry text input and never blocks the user.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ADDRESS_PROVIDER, GOOGLE_MAPS_API_KEY } from "@/lib/domain";

// ── Public API (no `any`) ────────────────────────────────────────
export interface AddressParts {
  street_address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  latitude?: number;
  longitude?: number;
  formatted_address: string;
}

export interface AddressAutocompleteProps {
  /** Controlled value of the visible street-address input. */
  value: string;
  /** Fired on every keystroke (manual typing). */
  onChange: (value: string) => void;
  /** Fired when a suggestion is chosen, with the parsed address parts. */
  onSelect: (parts: AddressParts) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** US-only restriction is applied by default (§4). */
  country?: string;
}

interface AddressSuggestion {
  id: string;
  label: string;
}

/** Provider abstraction — a source of address suggestions + detail lookups. */
interface AddressProvider {
  readonly id: string;
  ready(): Promise<void>;
  search(query: string): Promise<AddressSuggestion[]>;
  details(id: string): Promise<AddressParts>;
}

type QueryStatus = "idle" | "loading" | "error" | "no-results" | "results";

const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;

// ── Minimal Google Places typings (avoids depending on @types) ────
interface GPrediction {
  description: string;
  place_id: string;
}
interface GAutocompleteService {
  getPlacePredictions(
    request: {
      input: string;
      componentRestrictions?: { country: string | string[] };
      types?: string[];
      sessionToken?: object;
    },
    callback: (predictions: GPrediction[] | null, status: string) => void
  ): void;
}
interface GAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface GPlaceResult {
  address_components?: GAddressComponent[];
  formatted_address?: string;
  geometry?: { location?: { lat(): number; lng(): number } };
}
interface GPlacesService {
  getDetails(
    request: { placeId: string; fields: string[]; sessionToken?: object },
    callback: (result: GPlaceResult | null, status: string) => void
  ): void;
}
interface GPlacesNamespace {
  AutocompleteService: new () => GAutocompleteService;
  PlacesService: new (attrContainer: HTMLElement) => GPlacesService;
  PlacesServiceStatus: { OK: string };
  AutocompleteSessionToken: new () => object;
}
interface GoogleGlobal {
  maps?: { places?: GPlacesNamespace };
}

function getGoogle(): GoogleGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { google?: GoogleGlobal }).google;
}

// Module-level loader so the script is injected at most once per page.
let scriptPromise: Promise<void> | null = null;
function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (getGoogle()?.maps?.places) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-google-places]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      if (getGoogle()?.maps?.places) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-google-places", "true");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function parseGooglePlace(place: GPlaceResult): AddressParts {
  const comp = place.address_components ?? [];
  const pick = (type: string, short = false): string => {
    const c = comp.find((x) => x.types.includes(type));
    if (!c) return "";
    return short ? c.short_name : c.long_name;
  };
  const streetNumber = pick("street_number");
  const route = pick("route");
  const city =
    pick("locality") ||
    pick("sublocality") ||
    pick("postal_town") ||
    pick("administrative_area_level_2");
  const state = pick("administrative_area_level_1", true);
  const zip = pick("postal_code");
  const country = pick("country", true) || "US";
  const loc = place.geometry?.location;
  return {
    street_address: [streetNumber, route].filter(Boolean).join(" ").trim(),
    city,
    state,
    zip,
    country,
    latitude: loc ? loc.lat() : undefined,
    longitude: loc ? loc.lng() : undefined,
    formatted_address: place.formatted_address ?? "",
  };
}

/** Google Places provider. Attribution container is provided by the caller. */
function createGoogleProvider(
  apiKey: string,
  countryCode: string,
  attribution: HTMLElement
): AddressProvider {
  let autocomplete: GAutocompleteService | null = null;
  let places: GPlacesService | null = null;
  let sessionToken: object | undefined;

  const ensure = async (): Promise<void> => {
    await loadGoogleMaps(apiKey);
    const ns = getGoogle()?.maps?.places;
    if (!ns) throw new Error("Google Places unavailable");
    if (!autocomplete) autocomplete = new ns.AutocompleteService();
    if (!places) places = new ns.PlacesService(attribution);
    if (!sessionToken) sessionToken = new ns.AutocompleteSessionToken();
  };

  return {
    id: "google",
    ready: ensure,
    async search(query: string): Promise<AddressSuggestion[]> {
      await ensure();
      const svc = autocomplete;
      if (!svc) throw new Error("Google Places unavailable");
      return new Promise<AddressSuggestion[]>((resolve, reject) => {
        svc.getPlacePredictions(
          {
            input: query,
            componentRestrictions: { country: countryCode.toLowerCase() },
            types: ["address"],
            sessionToken,
          },
          (predictions, status) => {
            const ok = getGoogle()?.maps?.places?.PlacesServiceStatus.OK;
            if (status !== ok && predictions == null) {
              // ZERO_RESULTS is reported with a null list — treat as empty.
              if (status && status.toUpperCase().includes("ZERO")) {
                resolve([]);
                return;
              }
              reject(new Error(`Places status: ${status}`));
              return;
            }
            resolve((predictions ?? []).map((p) => ({ id: p.place_id, label: p.description })));
          }
        );
      });
    },
    async details(id: string): Promise<AddressParts> {
      await ensure();
      const svc = places;
      if (!svc) throw new Error("Google Places unavailable");
      return new Promise<AddressParts>((resolve, reject) => {
        svc.getDetails(
          {
            placeId: id,
            fields: ["address_components", "formatted_address", "geometry"],
            sessionToken,
          },
          (result, status) => {
            const ok = getGoogle()?.maps?.places?.PlacesServiceStatus.OK;
            if (status !== ok || !result) {
              reject(new Error(`Place details status: ${status}`));
              return;
            }
            // Start a fresh session after a completed selection (billing best practice).
            sessionToken = undefined;
            resolve(parseGooglePlace(result));
          }
        );
      });
    },
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  id,
  name,
  placeholder = "Start typing an address…",
  disabled,
  className,
  country = "US",
}: AddressAutocompleteProps) {
  const attributionRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<AddressProvider | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [status, setStatus] = useState<QueryStatus>("idle");
  const [open, setOpen] = useState(false);
  // Once the provider fails, fall back to manual entry for the rest of the session.
  const [providerFailed, setProviderFailed] = useState(false);

  // A key + a "google" provider selection enables autocomplete; otherwise manual.
  const providerEnabled = useMemo(
    () => ADDRESS_PROVIDER === "google" && GOOGLE_MAPS_API_KEY.length > 0 && !providerFailed,
    [providerFailed]
  );

  const getProvider = useCallback((): AddressProvider | null => {
    if (!providerEnabled) return null;
    if (providerRef.current) return providerRef.current;
    if (!attributionRef.current) return null;
    providerRef.current = createGoogleProvider(
      GOOGLE_MAPS_API_KEY,
      country,
      attributionRef.current
    );
    return providerRef.current;
  }, [providerEnabled, country]);

  const runSearch = useCallback(
    (query: string) => {
      const provider = getProvider();
      if (!provider) return;
      const seq = ++requestSeq.current;
      setStatus("loading");
      setOpen(true);
      provider
        .search(query)
        .then((results) => {
          if (seq !== requestSeq.current) return; // stale response
          setSuggestions(results);
          setStatus(results.length === 0 ? "no-results" : "results");
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setSuggestions([]);
          setStatus("error");
          setProviderFailed(true); // degrade to manual for the rest of the session
        });
    },
    [getProvider]
  );

  const handleInput = (next: string) => {
    onChange(next);
    if (!providerEnabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < MIN_QUERY) {
      setSuggestions([]);
      setStatus("idle");
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(next.trim()), DEBOUNCE_MS);
  };

  const handlePick = async (suggestion: AddressSuggestion) => {
    const provider = getProvider();
    setOpen(false);
    setStatus("idle");
    setSuggestions([]);
    if (!provider) return;
    try {
      const parts = await provider.details(suggestion.id);
      onSelect(parts);
    } catch {
      // Detail lookup failed — keep whatever the user typed; do not block.
      setProviderFailed(true);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => {
          if (providerEnabled && suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // Delay so a click on a suggestion registers before closing.
          blurRef.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {/* Google attribution / PlacesService host (kept out of layout flow). */}
      <div ref={attributionRef} className="hidden" aria-hidden="true" />

      {providerEnabled && open && status !== "idle" && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {status === "loading" && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching addresses…</p>
          )}
          {status === "error" && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Address lookup unavailable — you can type the address manually.
            </p>
          )}
          {status === "no-results" && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No matches — you can type the address manually.
            </p>
          )}
          {status === "results" && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-blue-light hover:text-primary"
                    // onMouseDown fires before input blur, so selection is not lost.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void handlePick(s);
                    }}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
