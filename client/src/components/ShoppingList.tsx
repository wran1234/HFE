import { HazardObservation } from "../lib/types";
import { ShoppingCart, Wrench, ExternalLink } from "lucide-react";

// Replace YOUR-AFFILIATE-TAG with your Amazon Associates tag once approved.
// Apply at: https://affiliate-program.amazon.com
const AFFILIATE_TAG = import.meta.env.VITE_AMAZON_AFFILIATE_TAG || "YOUR-AFFILIATE-TAG";

const amazonUrl = (productName: string) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(productName)}&tag=${AFFILIATE_TAG}`;

interface Product {
  name: string;
  priceRange: string;
  category: string;
  isDIY: boolean;
  forHazard: string;
}

const PRODUCT_MAP: Record<string, Product[]> = {
  "Grab Bars": [
    { name: "ADA-Compliant Stainless Grab Bar 18\"", priceRange: "$25–$60", category: "Grab Bars", isDIY: false, forHazard: "missing_grab_bar" },
    { name: "Suction-Cup Grab Bar No Drilling", priceRange: "$30–$50", category: "Grab Bars", isDIY: true, forHazard: "missing_grab_bar" },
    { name: "Floor-to-Ceiling Tension Safety Pole", priceRange: "$80–$120", category: "Grab Bars", isDIY: true, forHazard: "missing_grab_bar" },
  ],
  "Stairs & Steps": [
    { name: "Non-Slip Stair Treads 15-pack", priceRange: "$40–$60", category: "Stairs & Steps", isDIY: true, forHazard: "no_stair_nosing" },
    { name: "Indoor Handrail Kit Adjustable Steel", priceRange: "$80–$150", category: "Stairs & Steps", isDIY: false, forHazard: "no_stair_railing" },
    { name: "High-Contrast Step Edge Tape", priceRange: "$12–$20", category: "Stairs & Steps", isDIY: true, forHazard: "no_stair_nosing" },
    { name: "Stair Step Night Lights Battery", priceRange: "$35–$55", category: "Stairs & Steps", isDIY: true, forHazard: "no_nightlight" },
  ],
  "Bathroom Safety": [
    { name: "Non-Slip Bath Mat Set 2-pack", priceRange: "$18–$35", category: "Bathroom Safety", isDIY: true, forHazard: "no_nonslip_bath" },
    { name: "Non-Slip Tub Treads Stickers", priceRange: "$12–$20", category: "Bathroom Safety", isDIY: true, forHazard: "no_nonslip_bath" },
    { name: "Raised Toilet Seat with Arm Rails", priceRange: "$35–$65", category: "Bathroom Safety", isDIY: true, forHazard: "missing_grab_bar" },
    { name: "Handheld Showerhead with Hose", priceRange: "$25–$60", category: "Bathroom Safety", isDIY: true, forHazard: "no_handheld_shower" },
    { name: "Fold-Down Teak Shower Bench", priceRange: "$70–$150", category: "Bathroom Safety", isDIY: true, forHazard: "no_shower_bench" },
    { name: "Walk-In Shower Conversion Kit", priceRange: "$800–$3,000+", category: "Bathroom Safety", isDIY: false, forHazard: "high_tub_entry" },
  ],
  "Flooring & Tripping": [
    { name: "Non-Slip Rug Pad Grippers 8-pack", priceRange: "$15–$25", category: "Flooring & Tripping", isDIY: true, forHazard: "loose_rug" },
    { name: "Threshold Entry Ramps 2-pack", priceRange: "$45–$70", category: "Flooring & Tripping", isDIY: true, forHazard: "high_threshold" },
    { name: "Cord Covers Cable Management Kit", priceRange: "$15–$30", category: "Flooring & Tripping", isDIY: true, forHazard: "cord_hazard" },
  ],
  "Lighting": [
    { name: "LED Motion-Sensor Night Lights 6-pack", priceRange: "$22–$35", category: "Lighting", isDIY: true, forHazard: "no_nightlight" },
    { name: "Battery-Operated Under-Bed Sensor Light", priceRange: "$18–$30", category: "Lighting", isDIY: true, forHazard: "poor_lighting" },
    { name: "Bright LED Pathway Lights 10-pack", priceRange: "$35–$55", category: "Lighting", isDIY: true, forHazard: "poor_lighting" },
    { name: "Smart Plug Timer for Lamps", priceRange: "$15–$25", category: "Lighting", isDIY: true, forHazard: "poor_lighting" },
  ],
  "Accessibility": [
    { name: "Door Offset Hinges Pair", priceRange: "$20–$35", category: "Accessibility", isDIY: true, forHazard: "narrow_doorway" },
    { name: "Door Lever Handle Replacement Set", priceRange: "$35–$60", category: "Accessibility", isDIY: true, forHazard: "narrow_doorway" },
  ],
  "Outdoor Safety": [
    { name: "Anti-Slip Tape for Outdoor Steps 30ft", priceRange: "$12–$25", category: "Outdoor Safety", isDIY: true, forHazard: "slippery_outdoor_steps" },
    { name: "Aluminum Exterior Handrail Kit", priceRange: "$100–$180", category: "Outdoor Safety", isDIY: false, forHazard: "no_outdoor_railing" },
    { name: "Solar Motion-Sensor Porch Light", priceRange: "$30–$60", category: "Outdoor Safety", isDIY: true, forHazard: "poor_lighting" },
  ],
};

interface ShoppingListProps {
  observations: HazardObservation[];
}

export default function ShoppingList({ observations }: ShoppingListProps) {
  const affectedCategories = [...new Set(observations.map((o) => o.category))];

  const relevantProducts = affectedCategories.flatMap(
    (cat) => PRODUCT_MAP[cat] ?? []
  );

  const diyCost = relevantProducts
    .filter((p) => p.isDIY)
    .reduce((sum, p) => {
      const max = parseInt(p.priceRange.split("–")[1]?.replace(/[^0-9]/g, "") ?? "0");
      return sum + max;
    }, 0);

  const proItems = relevantProducts.filter((p) => !p.isDIY);

  if (relevantProducts.length === 0) {
    return (
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center py-10 text-warm-400">
        <ShoppingCart className="w-10 h-10 mx-auto mb-3" />
        <p>Complete an assessment to generate your shopping list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-green-200 rounded-2xl p-6 shadow-sm text-center">
          <p className="text-2xl font-extrabold text-green-600">{relevantProducts.filter(p => p.isDIY).length}</p>
          <p className="text-xs text-warm-400 mt-1">DIY Items</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm text-center">
          <p className="text-2xl font-extrabold text-amber-600">{proItems.length}</p>
          <p className="text-xs text-warm-400 mt-1">Pro Install Needed</p>
        </div>
        <div className="bg-white border border-brand-200 rounded-2xl p-6 shadow-sm text-center">
          <p className="text-xl font-extrabold text-brand-600">~${diyCost}</p>
          <p className="text-xs text-warm-400 mt-1">Est. DIY Budget</p>
        </div>
      </div>

      {/* DIY items */}
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-4 h-4 text-green-600" />
          <h3 className="font-semibold text-warm-900">DIY Shopping List</h3>
          <span className="ml-auto text-xs text-warm-400">Links open Amazon search</span>
        </div>
        <div className="space-y-2">
          {relevantProducts.filter(p => p.isDIY).map((p, i) => (
            <a
              key={i}
              href={amazonUrl(p.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-warm-50 border border-warm-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-warm-100 rounded text-xs flex items-center justify-center text-warm-500">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-900 group-hover:text-brand-700">{p.name}</p>
                  <p className="text-xs text-warm-400">{p.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-green-600">{p.priceRange}</span>
                <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-medium">DIY</span>
                <ExternalLink className="w-3.5 h-3.5 text-warm-300 group-hover:text-brand-400" />
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Pro-install items */}
      {proItems.length > 0 && (
        <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-warm-900">Professional Installation Required</h3>
          </div>
          <div className="space-y-2">
            {proItems.map((p, i) => (
              <a
                key={i}
                href={amazonUrl(p.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-warm-50 border border-warm-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-warm-100 rounded text-xs flex items-center justify-center text-warm-500">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-warm-900">{p.name}</p>
                    <p className="text-xs text-warm-400">{p.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-amber-600">{p.priceRange}</span>
                  <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-medium">PRO</span>
                  <ExternalLink className="w-3.5 h-3.5 text-warm-300 group-hover:text-amber-400" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-warm-400 text-center">
        Links open Amazon product searches. HFE may earn a small commission on purchases at no extra cost to you.
      </p>
    </div>
  );
}
