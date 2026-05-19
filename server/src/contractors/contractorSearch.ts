export interface ContractorSearchResult {
  trade: string;
  zipCode: string;
  provider: "google_places" | "google_maps_search";
  externalId?: string;
  name: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  phone?: string;
  websiteUrl?: string;
  profileUrl?: string;
  sourceUrl?: string;
}

const TRADE_QUERY: Record<string, string> = {
  "general-contractor": "aging in place home modification contractor",
  electrician: "licensed electrician lighting safety senior home",
  plumber: "bathroom safety remodel plumber grab bars",
  handyman: "handyman grab bar installation senior home safety",
};

const tradeLabel = (trade: string) => TRADE_QUERY[trade] ?? `${trade.replace(/-/g, " ")} contractor`;

const mapsSearchUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
};

export async function searchContractorsNearZip(input: {
  apiKey?: string;
  trade: string;
  zipCode: string;
  limit?: number;
}): Promise<ContractorSearchResult[]> {
  // Validate zip before embedding it in the external API query string.
  if (!/^\d{5}(-\d{4})?$/.test(input.zipCode)) {
    throw new Error("Invalid zipCode: must be a 5-digit US ZIP code.");
  }
  const query = `${tradeLabel(input.trade)} near ${input.zipCode}`;
  const limit = input.limit ?? 5;
  if (!input.apiKey) {
    return [{
      trade: input.trade,
      zipCode: input.zipCode,
      provider: "google_maps_search",
      name: `Search Google Maps for ${tradeLabel(input.trade)}`,
      sourceUrl: mapsSearchUrl(query),
      profileUrl: mapsSearchUrl(query),
    }];
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.rating",
        "places.userRatingCount",
        "places.websiteUri",
        "places.googleMapsUri",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: query,
      includedType: "general_contractor",
      maxResultCount: Math.min(Math.max(limit * 2, 1), 10),
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Places search failed: ${response.status}`);
  }

  const body = await response.json() as { places?: GooglePlace[] };
  return (body.places ?? [])
    .map((place): ContractorSearchResult => ({
      trade: input.trade,
      zipCode: input.zipCode,
      provider: "google_places",
      externalId: place.id,
      name: place.displayName?.text ?? "Local contractor",
      rating: place.rating,
      reviewCount: place.userRatingCount,
      address: place.formattedAddress,
      phone: place.nationalPhoneNumber,
      websiteUrl: place.websiteUri,
      profileUrl: place.googleMapsUri,
      sourceUrl: place.googleMapsUri,
    }))
    .filter((place) => place.name && (place.rating ?? 0) >= 4)
    .sort((a, b) => ((b.rating ?? 0) * 1000 + (b.reviewCount ?? 0)) - ((a.rating ?? 0) * 1000 + (a.reviewCount ?? 0)))
    .slice(0, limit);
}
