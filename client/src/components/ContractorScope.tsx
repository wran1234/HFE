import { HazardObservation } from "../lib/types";
import { Hammer, Zap, Wrench, User, Copy, Check, Send, CheckCircle, ExternalLink, Globe, Loader2, MapPin, Phone, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch, ContractorSuggestion, findContractorSuggestions, trackAnalyticsEvent } from "../lib/apiClient";

const TRADE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; description: string }> = {
  "general-contractor": {
    label: "General Contractor",
    icon: Hammer,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    description: "Structural modifications, stair rails, doorway widening, outdoor railing",
  },
  electrician: {
    label: "Electrician",
    icon: Zap,
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    description: "Outlet placement, dedicated circuits, lighting upgrades, switch placement",
  },
  plumber: {
    label: "Plumber",
    icon: Wrench,
    color: "text-cyan-700",
    bg: "bg-cyan-50 border-cyan-200",
    description: "Walk-in shower conversion, tub removal, grab bar backing installation",
  },
  handyman: {
    label: "Handyman",
    icon: User,
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    description: "Grab bar installation, threshold ramps, non-structural modifications",
  },
};

interface ContractorScopeProps {
  observations: HazardObservation[];
  sessionId?: string;
}

export default function ContractorScope({ observations, sessionId }: ContractorScopeProps) {
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [findingContractors, setFindingContractors] = useState(false);
  const [suggestions, setSuggestions] = useState<ContractorSuggestion[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "email" | "zipCode" | "preferredContact", string>>>({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    zipCode: "",
    preferredContact: "either",
    projectUrgency: "",
    estimatedBudget: "",
    notes: "",
  });
  const openedTrackedRef = useRef(false);

  const proJobs = observations.filter((o) => !o.isDIY && o.trade);

  useEffect(() => {
    if (window.location.hash === "#contractor-lead-form") {
      setShowForm(true);
      setTimeout(() => {
        document.getElementById("contractor-lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, []);

  useEffect(() => {
    if (!showForm || openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    void trackAnalyticsEvent({
      eventName: "contractor_form_opened",
      sessionId,
      reportId: sessionId,
      metadata: {
        source: window.location.hash === "#contractor-lead-form" ? "hash" : "button",
      },
    }).catch(() => undefined);
  }, [showForm, sessionId]);

  const byTrade = proJobs.reduce<Record<string, HazardObservation[]>>((acc, obs) => {
    const t = obs.trade!;
    if (!acc[t]) acc[t] = [];
    acc[t].push(obs);
    return acc;
  }, {});
  const neededTrades = Object.keys(byTrade);

  const handleFindContractors = async () => {
    setSuggestionError(null);
    if (!sessionId) {
      setSuggestionError("Save or open this report from a session before searching for local contractors.");
      return;
    }
    if (!/^\d{5}(-\d{4})?$/.test(form.zipCode.trim())) {
      setSuggestionError("Enter a 5-digit ZIP code to find nearby contractors.");
      return;
    }
    setFindingContractors(true);
    try {
      const response = await findContractorSuggestions(sessionId, {
        zipCode: form.zipCode.trim(),
        trades: neededTrades,
      });
      setSuggestions(response.suggestions);
      if (response.suggestions.length === 0) {
        setSuggestionError("No highly rated contractor suggestions were found for this ZIP code. Try a nearby ZIP code or use the scope when contacting local providers.");
      }
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : "Unable to find contractor suggestions right now.");
    } finally {
      setFindingContractors(false);
    }
  };

  const generateScopeText = () => {
    const lines: string[] = [
      "HOME SAFETY RENOVATION — SCOPE OF WORK",
      "=".repeat(45),
      "",
    ];
    Object.entries(byTrade).forEach(([trade, items]) => {
      const cfg = TRADE_CONFIG[trade];
      lines.push(`\n${cfg?.label.toUpperCase() ?? trade.toUpperCase()}`);
      lines.push("-".repeat(35));
      items.forEach((item, i) => {
        lines.push(`${i + 1}. ${item.location}: ${item.recommendation}`);
        lines.push(`   Est. Cost: ${item.costMin != null ? `$${item.costMin}–$${item.costMax}` : "TBD"}`);
        lines.push(`   Priority: ${item.urgency}`);
      });
    });
    lines.push("\nGenerated by HFE — Home Fall & Safety Evaluator");
    return lines.join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateScopeText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const nextErrors: Partial<Record<"name" | "email" | "zipCode" | "preferredContact", string>> = {};
    const emailValue = form.email.trim().toLowerCase();
    if (!form.name.trim()) nextErrors.name = "Name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) nextErrors.email = "Valid email is required.";
    if (!/^\d{5}(-\d{4})?$/.test(form.zipCode.trim())) nextErrors.zipCode = "Zip code must be 5 digits.";
    if (!["email", "phone", "either"].includes(form.preferredContact)) nextErrors.preferredContact = "Select a preferred contact method.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/contractor-leads", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          zipCode: form.zipCode.trim(),
          preferredContact: form.preferredContact,
          notes: form.notes.trim() || undefined,
          projectUrgency: form.projectUrgency || undefined,
          estimatedBudget: form.estimatedBudget || undefined,
          scopeText: generateScopeText(),
          sessionId,
        }),
      });
      void trackAnalyticsEvent({
        eventName: "contractor_lead_submitted",
        sessionId,
        reportId: sessionId,
        metadata: {
          status: "success",
          zipCode: form.zipCode.trim(),
          preferredContact: form.preferredContact,
          projectUrgency: form.projectUrgency || null,
          estimatedBudget: form.estimatedBudget || null,
        },
      }).catch(() => undefined);
      setSubmitted(true);
    } catch (err) {
      void trackAnalyticsEvent({
        eventName: "contractor_lead_submitted",
        sessionId,
        reportId: sessionId,
        metadata: {
          status: "failed",
        },
      }).catch(() => undefined);
      setFormError(err instanceof Error ? err.message : "Unable to submit right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (proJobs.length === 0) {
    return (
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center py-10 text-warm-600">
        <Hammer aria-hidden="true" className="w-10 h-10 mx-auto mb-3" />
        <p>No professional installation items identified — most fixes are DIY.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-warm-500 text-sm">
          {proJobs.length} item{proJobs.length !== 1 ? "s" : ""} require professional installation across {Object.keys(byTrade).length} trade{Object.keys(byTrade).length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={handleCopy}
          aria-label={copied ? "Scope copied to clipboard" : "Copy scope of work to clipboard"}
          className="inline-flex items-center gap-1.5 py-2 px-4 text-xs bg-white border border-warm-200 text-warm-700 hover:bg-warm-50 rounded-xl font-medium transition-colors"
        >
          {copied ? <Check aria-hidden="true" className="w-3.5 h-3.5 text-green-600" /> : <Copy aria-hidden="true" className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy Scope"}
        </button>
      </div>

      {/* By trade */}
      {Object.entries(byTrade).map(([trade, items]) => {
        const cfg = TRADE_CONFIG[trade] ?? TRADE_CONFIG.handyman;
        const Icon = cfg.icon;
        const totalMin = items.reduce((s, i) => s + (i.costMin ?? 0), 0);
        const totalMax = items.reduce((s, i) => s + (i.costMax ?? 0), 0);

        return (
          <div key={trade} className={`border rounded-2xl p-6 shadow-sm ${cfg.bg}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon aria-hidden="true" className={`w-5 h-5 ${cfg.color}`} />
                <h3 className={`font-semibold ${cfg.color}`}>{cfg.label}</h3>
              </div>
              <span className="text-sm font-semibold text-warm-700">
                Est. ${totalMin.toLocaleString()}–${totalMax.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-warm-500 mb-4">{cfg.description}</p>

            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={item.id} className="p-3 bg-white/70 rounded-xl border border-white/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-warm-400 mt-0.5 shrink-0">{i + 1}.</span>
                      <div>
                        <p className="text-sm font-medium text-warm-900">{item.location}</p>
                        <p className="text-xs text-warm-500 mt-0.5">{item.recommendation}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-warm-700">
                        {item.costMin != null ? `$${item.costMin}–$${item.costMax}` : "—"}
                      </p>
                      <span
                        className={`text-[10px] font-medium ${
                          item.urgency === "immediate"
                            ? "text-red-600"
                            : item.urgency === "30-days"
                            ? "text-amber-600"
                            : "text-warm-400"
                        }`}
                      >
                        {item.urgency}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="p-4 bg-warm-100 border border-warm-200 rounded-xl">
        <p className="text-xs text-warm-500 leading-relaxed">
          <span className="text-warm-700 font-medium">How to use this scope:</span> Copy this document and share it with contractors when requesting quotes. Ask each contractor to provide itemized pricing for each line item. Get at least 3 quotes for any job over $500.
        </p>
      </div>

      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-warm-900">Suggested nearby contractors</h3>
            <p className="text-sm text-warm-500 mt-1">
              Find well-rated local options for the trades in this scope. HFE shows public search results for comparison; always verify license, insurance, reviews, and references.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="contractor-zip" className="sr-only">ZIP code for contractor search</label>
            <input
              id="contractor-zip"
              type="text"
              inputMode="numeric"
              value={form.zipCode}
              onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
              className="w-28 text-sm border border-warm-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="ZIP"
            />
            <button
              type="button"
              onClick={() => void handleFindContractors()}
              disabled={findingContractors || neededTrades.length === 0}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              {findingContractors ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" /> : <MapPin aria-hidden="true" className="w-3.5 h-3.5" />}
              {findingContractors ? "Searching..." : "Find Nearby"}
            </button>
          </div>
        </div>
        {suggestionError && <p role="alert" className="text-xs text-amber-700 mt-3">{suggestionError}</p>}
        {suggestions.length > 0 && (
          <div className="mt-4 grid md:grid-cols-2 gap-3">
            {suggestions.map((contractor) => {
              const cfg = TRADE_CONFIG[contractor.trade] ?? TRADE_CONFIG.handyman;
              return (
                <div key={contractor.id} className="rounded-xl border border-warm-200 bg-warm-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-warm-900">{contractor.name}</p>
                      <p className="text-xs text-warm-500 mt-0.5">{cfg.label}</p>
                    </div>
                    {contractor.rating && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        <Star aria-hidden="true" className="w-3 h-3 fill-current" />
                        {contractor.rating.toFixed(1)}
                        {contractor.reviewCount ? ` (${contractor.reviewCount})` : ""}
                      </span>
                    )}
                  </div>
                  {contractor.address && <p className="mt-2 text-xs text-warm-500">{contractor.address}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {contractor.phone && (
                      <a href={`tel:${contractor.phone}`} className="inline-flex items-center gap-1 text-xs font-semibold text-warm-700 hover:text-warm-900">
                        <Phone aria-hidden="true" className="w-3.5 h-3.5" /> Call
                      </a>
                    )}
                    {contractor.websiteUrl && (
                      <a href={contractor.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-warm-700 hover:text-warm-900">
                        <Globe aria-hidden="true" className="w-3.5 h-3.5" /> Website
                      </a>
                    )}
                    {(contractor.profileUrl || contractor.sourceUrl) && (
                      <a href={contractor.profileUrl || contractor.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
                        <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" /> View listing
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contractor matching CTA */}
      {!submitted ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-blue-800 mb-1">Get matched with local contractors</h3>
              <p className="text-sm text-blue-600">
                Send your scope to HFE so a care coordinator or partner can help with follow-through. This does not replace checking contractor license, insurance, and references.
              </p>
            </div>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                aria-expanded={showForm}
                aria-controls="contractor-lead-form"
                className="shrink-0 inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                <Send aria-hidden="true" className="w-3.5 h-3.5" />
                Request Matches
              </button>
            )}
          </div>

          {showForm && (
            <form id="contractor-lead-form" onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cl-name" className="block text-xs font-medium text-blue-800 mb-1">Full name *</label>
                  <input
                    id="cl-name"
                    type="text"
                    required
                    aria-required="true"
                    aria-describedby={fieldErrors.name ? "cl-name-error" : undefined}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Jane Smith"
                  />
                  {fieldErrors.name && <p id="cl-name-error" role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="cl-zip" className="block text-xs font-medium text-blue-800 mb-1">Zip code *</label>
                  <input
                    id="cl-zip"
                    type="text"
                    inputMode="numeric"
                    required
                    aria-required="true"
                    pattern="\d{5}(-\d{4})?"
                    aria-describedby={fieldErrors.zipCode ? "cl-zip-error" : undefined}
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="94103"
                  />
                  {fieldErrors.zipCode && <p id="cl-zip-error" role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.zipCode}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cl-email" className="block text-xs font-medium text-blue-800 mb-1">Email *</label>
                  <input
                    id="cl-email"
                    type="email"
                    required
                    aria-required="true"
                    aria-describedby={fieldErrors.email ? "cl-email-error" : undefined}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="you@example.com"
                  />
                  {fieldErrors.email && <p id="cl-email-error" role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label htmlFor="cl-phone" className="block text-xs font-medium text-blue-800 mb-1">Phone <span className="font-normal">(optional)</span></label>
                  <input
                    id="cl-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cl-contact" className="block text-xs font-medium text-blue-800 mb-1">Preferred contact *</label>
                  <select
                    id="cl-contact"
                    required
                    aria-required="true"
                    aria-describedby={fieldErrors.preferredContact ? "cl-contact-error" : undefined}
                    value={form.preferredContact}
                    onChange={(e) => setForm({ ...form, preferredContact: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="either">Either</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                  </select>
                  {fieldErrors.preferredContact && <p id="cl-contact-error" role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.preferredContact}</p>}
                </div>
                <div>
                  <label htmlFor="cl-urgency" className="block text-xs font-medium text-blue-800 mb-1">How soon do you need help?</label>
                  <select
                    id="cl-urgency"
                    value={form.projectUrgency}
                    onChange={(e) => setForm({ ...form, projectUrgency: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">Select (optional)</option>
                    <option value="immediately">Immediately</option>
                    <option value="within_30_days">Within 30 days</option>
                    <option value="within_3_months">Within 3 months</option>
                    <option value="just_researching">Just researching</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cl-budget" className="block text-xs font-medium text-blue-800 mb-1">Estimated budget?</label>
                  <select
                    id="cl-budget"
                    value={form.estimatedBudget}
                    onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">Select (optional)</option>
                    <option value="under_500">Under $500</option>
                    <option value="500_2000">$500–$2,000</option>
                    <option value="2000_5000">$2,000–$5,000</option>
                    <option value="over_5000">Over $5,000</option>
                    <option value="unsure">Unsure</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cl-notes" className="block text-xs font-medium text-blue-800 mb-1">Notes <span className="font-normal">(optional)</span></label>
                  <input
                    id="cl-notes"
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Best time to call, urgency, etc."
                  />
                </div>
              </div>
              {formError && (
                <p role="alert" className="text-xs text-red-600">{formError}</p>
              )}
              <p className="text-xs text-blue-700">
                By submitting, you agree that your contact information may be shared with relevant home safety professionals.
              </p>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
                >
                  {submitting ? "Sending…" : "Send My Scope"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-start gap-4">
          <CheckCircle aria-hidden="true" className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">Request received!</p>
            <p className="text-sm text-green-700 mt-1">
              We'll follow up within 1–2 business days about contractor coordination options in your area. Check your email for a copy of your scope.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
