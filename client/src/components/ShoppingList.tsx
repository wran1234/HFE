import { HazardObservation } from "../lib/types";
import { ShoppingCart, Wrench, ExternalLink } from "lucide-react";
import { apiFetch, trackAnalyticsEvent } from "../lib/apiClient";
import { useState } from "react";
import { AFFILIATE_PRODUCT_MAP, AffiliateProduct } from "../lib/affiliateProducts";

interface ShoppingListProps {
  observations: HazardObservation[];
  sessionId?: string;
  reportId?: string;
}

export default function ShoppingList({ observations, sessionId, reportId }: ShoppingListProps) {
  const [loadingProduct, setLoadingProduct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const relevantProducts = observations
    .flatMap((observation) => {
      const categoryProducts = AFFILIATE_PRODUCT_MAP[observation.category] ?? [];
      const exactMatches = observation.hazardType
        ? categoryProducts.filter((product) => product.forHazard === observation.hazardType)
        : [];
      return exactMatches.length ? exactMatches : categoryProducts.slice(0, 2);
    })
    .filter((product, index, products) => products.findIndex((item) => item.name === product.name) === index);

  const diyCost = relevantProducts
    .filter((p) => p.isDIY)
    .reduce((sum, p) => {
      const max = parseInt(p.priceRange.split("–")[1]?.replace(/[^0-9]/g, "") ?? "0");
      return sum + max;
    }, 0);

  const proItems = relevantProducts.filter((p) => !p.isDIY);

  const handleAffiliateClick = async (product: AffiliateProduct) => {
    if (loadingProduct === product.name) return;
    setError(null);
    setLoadingProduct(product.name);
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      void trackAnalyticsEvent({
        eventName: "affiliate_click_started",
        sessionId,
        reportId,
        metadata: {
          productName: product.name,
          category: product.category,
        },
      }).catch(() => undefined);
      await apiFetch("/api/affiliate-clicks", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          reportId,
          productName: product.name,
          category: product.category,
          affiliateUrl: product.affiliateUrl,
        }),
      });
    } catch {
      setError("Unable to track click right now. Opening Amazon anyway.");
    }
    if (popup) {
      popup.location.href = product.affiliateUrl;
    } else {
      window.open(product.affiliateUrl, "_blank", "noopener,noreferrer");
    }
    setTimeout(() => setLoadingProduct((current) => (current === product.name ? null : current)), 1200);
  };

  if (relevantProducts.length === 0) {
    return (
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center py-10 text-warm-600">
        <ShoppingCart aria-hidden="true" className="w-10 h-10 mx-auto mb-3" />
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
          <ShoppingCart aria-hidden="true" className="w-4 h-4 text-green-600" />
          <h3 className="font-semibold text-warm-900">DIY Shopping List</h3>
          <span className="ml-auto text-xs text-warm-600">Curated items; fallback links open Amazon search</span>
        </div>
        <div className="space-y-2">
          {relevantProducts.filter(p => p.isDIY).map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-warm-50 border border-warm-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-warm-100 rounded text-xs flex items-center justify-center text-warm-500">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-900 group-hover:text-brand-700">{p.name}</p>
                  <p className="text-xs text-warm-400">
                    {[p.brand, p.category, p.linkType === "product" ? "Exact product" : "Amazon search"].filter(Boolean).join(" - ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-green-600">{p.priceRange}</span>
                <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-medium">DIY</span>
                  <button
                    type="button"
                    onClick={() => void handleAffiliateClick(p)}
                    disabled={loadingProduct === p.name}
                    className="inline-flex items-center gap-1 text-xs bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    {loadingProduct === p.name ? "Opening..." : p.linkType === "product" ? "View item" : "Search Amazon"}
                    <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
              </div>
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-amber-700 mt-3">{error}</p>}
      </div>

      {/* Pro-install items */}
      {proItems.length > 0 && (
        <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Wrench aria-hidden="true" className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-warm-900">Professional Installation Required</h3>
          </div>
          <div className="space-y-2">
            {proItems.map((p, i) => (
              <a
                key={i}
                href={p.affiliateUrl}
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
                  <ExternalLink aria-hidden="true" className="w-3.5 h-3.5 text-warm-300 group-hover:text-amber-400" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-warm-600 text-center">
        Links open Amazon product or search pages. HFE does not earn a commission from these links.
      </p>
    </div>
  );
}
