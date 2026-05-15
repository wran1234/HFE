const amazonUrl = (searchTerm: string) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}`;

const amazonProductUrl = (asin: string) =>
  `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;

export interface AffiliateProduct {
  name: string;
  brand?: string;
  asin?: string;
  priceRange: string;
  category: string;
  isDIY: boolean;
  forHazard: string;
  affiliateUrl: string;
  linkType?: "product" | "search";
}

const product = (input: Omit<AffiliateProduct, "affiliateUrl" | "linkType"> & { searchTerm?: string; affiliateUrl?: string }): AffiliateProduct => ({
  ...input,
  affiliateUrl: input.affiliateUrl ?? (input.asin ? amazonProductUrl(input.asin) : amazonUrl(input.searchTerm ?? input.name)),
  linkType: input.asin || input.affiliateUrl ? "product" : "search",
});

// Centralized affiliate product catalog.
// Internal note: replace placeholder search links with real Associates links when available.
export const AFFILIATE_PRODUCT_MAP: Record<string, AffiliateProduct[]> = {
  "Grab Bars": [
    product({ name: "ADA-Compliant Stainless Grab Bar 18\"", priceRange: "$25–$60", category: "Grab Bars", isDIY: false, forHazard: "missing_grab_bar" }),
    product({ name: "Suction-Cup Grab Bar No Drilling", priceRange: "$30–$50", category: "Grab Bars", isDIY: true, forHazard: "missing_grab_bar" }),
    product({ name: "Floor-to-Ceiling Tension Safety Pole", priceRange: "$80–$120", category: "Grab Bars", isDIY: true, forHazard: "missing_grab_bar" }),
  ],
  "Stairs & Steps": [
    product({ name: "Non-Slip Stair Treads 15-pack", priceRange: "$40–$60", category: "Stairs & Steps", isDIY: true, forHazard: "unsafe_stairs" }),
    product({ name: "Indoor Handrail Kit Adjustable Steel", priceRange: "$80–$150", category: "Stairs & Steps", isDIY: false, forHazard: "missing_handrail" }),
    product({ name: "High-Contrast Step Edge Tape", priceRange: "$12–$20", category: "Stairs & Steps", isDIY: true, forHazard: "unsafe_stairs" }),
    product({ name: "Stair Step Night Lights Battery", priceRange: "$35–$55", category: "Stairs & Steps", isDIY: true, forHazard: "poor_lighting" }),
  ],
  "Bathroom Safety": [
    product({ name: "Non-Slip Bath Mat Set 2-pack", priceRange: "$18–$35", category: "Bathroom Safety", isDIY: true, forHazard: "loose_rug" }),
    product({ name: "Non-Slip Tub Treads Stickers", priceRange: "$12–$20", category: "Bathroom Safety", isDIY: true, forHazard: "slippery_floor" }),
    product({ name: "Raised Toilet Seat with Arm Rails", priceRange: "$35–$65", category: "Bathroom Safety", isDIY: true, forHazard: "missing_grab_bar" }),
    product({ name: "Handheld Showerhead with Hose", priceRange: "$25–$60", category: "Bathroom Safety", isDIY: true, forHazard: "missing_grab_bar" }),
    product({ name: "Shower Chair with Back and Arms", priceRange: "$45–$90", category: "Bathroom Safety", isDIY: true, forHazard: "missing_grab_bar" }),
    product({ name: "Walk-In Shower Conversion Kit", priceRange: "$800–$3,000+", category: "Bathroom Safety", isDIY: false, forHazard: "high_threshold" }),
  ],
  "Flooring & Tripping": [
    product({ name: "Non-Slip Rug Pad Grippers 8-pack", priceRange: "$15–$25", category: "Flooring & Tripping", isDIY: true, forHazard: "loose_rug" }),
    product({ name: "Threshold Entry Ramps 2-pack", priceRange: "$45–$70", category: "Flooring & Tripping", isDIY: true, forHazard: "high_threshold" }),
    product({ name: "Cord Covers Cable Management Kit", priceRange: "$15–$30", category: "Flooring & Tripping", isDIY: true, forHazard: "clutter_trip_hazard" }),
    product({ name: "Cable Clips and Wall Cord Organizer", priceRange: "$8–$18", category: "Flooring & Tripping", isDIY: true, forHazard: "clutter_trip_hazard" }),
  ],
  "Lighting": [
    product({ name: "LED Motion-Sensor Night Lights 6-pack", priceRange: "$22–$35", category: "Lighting", isDIY: true, forHazard: "poor_lighting" }),
    product({ name: "Battery-Operated Under-Bed Sensor Light", priceRange: "$18–$30", category: "Lighting", isDIY: true, forHazard: "poor_lighting" }),
    product({ name: "Bright LED Pathway Lights 10-pack", priceRange: "$35–$55", category: "Lighting", isDIY: true, forHazard: "poor_lighting" }),
    product({ name: "Smart Plug Timer for Lamps", priceRange: "$15–$25", category: "Lighting", isDIY: true, forHazard: "poor_lighting" }),
  ],
  "Accessibility": [
    product({ name: "Door Offset Hinges Pair", priceRange: "$20–$35", category: "Accessibility", isDIY: true, forHazard: "narrow_walkway" }),
    product({ name: "Door Lever Handle Replacement Set", priceRange: "$35–$60", category: "Accessibility", isDIY: true, forHazard: "narrow_walkway" }),
  ],
  "Outdoor Safety": [
    product({ name: "Anti-Slip Tape for Outdoor Steps 30ft", priceRange: "$12–$25", category: "Outdoor Safety", isDIY: true, forHazard: "outdoor_step_risk" }),
    product({ name: "Aluminum Exterior Handrail Kit", priceRange: "$100–$180", category: "Outdoor Safety", isDIY: false, forHazard: "missing_handrail" }),
    product({ name: "Solar Motion-Sensor Porch Light", priceRange: "$30–$60", category: "Outdoor Safety", isDIY: true, forHazard: "poor_lighting" }),
  ],
};
