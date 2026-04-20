import { Building2, Heart, DollarSign, RotateCcw, ArrowRight, Star, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

// State → program mappings for subsidy eligibility
const STATE_PROGRAMS: Record<string, { name: string; url: string; description: string }[]> = {
  default: [
    { name: "HUD Title 1 Home Improvement Loans", url: "https://www.hud.gov/program_offices/housing/sfh/title", description: "Low-interest loans for home modifications, no equity required." },
    { name: "USDA Rural Repair and Rehabilitation Grants", url: "https://www.rd.usda.gov/programs-services/single-family-housing-programs/single-family-housing-repair-loans-grants", description: "Grants up to $10,000 for rural homeowners 62+ with very low income." },
    { name: "Area Agency on Aging", url: "https://www.n4a.org/", description: "Local agencies that fund home modification programs. Search by zip." },
    { name: "NCOA BenefitsCheckUp", url: "https://www.benefitscheckup.org/", description: "Free tool to find benefits programs in your area." },
  ],
  CA: [
    { name: "CA PACE Program", url: "https://www.calhfa.ca.gov/homeownership/programs/pace.htm", description: "Property Assessed Clean Energy — can cover accessibility modifications." },
    { name: "CA Department of Aging Programs", url: "https://www.aging.ca.gov/", description: "State-funded programs for in-home support and modifications." },
  ],
  NY: [
    { name: "NY Medicaid Home Modification Program", url: "https://www.health.ny.gov/", description: "Covers modifications for Medicaid-eligible residents." },
    { name: "NY State Office for the Aging", url: "https://aging.ny.gov/", description: "Connects residents to local modification assistance programs." },
  ],
  TX: [
    { name: "TX Department of Housing and Community Affairs", url: "https://www.tdhca.state.tx.us/", description: "HOME Investment Partnerships Program for low-income homeowners." },
    { name: "TX RISE Program", url: "https://www.tdhca.state.tx.us/", description: "Rebuilding Initiative for Stronger Economies — home repair grants." },
  ],
  FL: [
    { name: "FL SHIP Program", url: "https://floridahousing.org/FHFC_Wave2/media/AllDocs/Programs/SHIP/SHIP-at-a-Glance.pdf", description: "State Housing Initiatives Partnership — local modification grants." },
    { name: "FL Elder Affairs", url: "https://elderaffairs.org/", description: "Connects seniors to local home modification assistance." },
  ],
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

function SubsidyChecker() {
  const [state, setState] = useState("");
  const [age, setAge] = useState("");
  const [isVet, setIsVet] = useState(false);
  const [checked, setChecked] = useState(false);

  const programs = checked
    ? [
        ...(STATE_PROGRAMS[state] ?? []),
        ...STATE_PROGRAMS.default,
        ...(isVet
          ? [{ name: "VA Home Improvements and Structural Alterations (HISA)", url: "https://www.va.gov/housing-assistance/home-loans/", description: "Up to $6,800 for service-connected or $2,000 for non-service-connected disabilities." }]
          : []
        ),
        ...(Number(age) >= 62
          ? [{ name: "AARP Home Fit Guide + Local Referrals", url: "https://www.aarp.org/livable-communities/info-2020/aarp-home-fit-guide.html", description: "AARP connects members to local programs for home modification." }]
          : []
        ),
      ]
    : [];

  return (
    <div className="mt-4 space-y-4">
      {!checked ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-green-800 mb-1">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full text-sm border border-green-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Select state…</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-green-800 mb-1">Age of resident</label>
              <input
                type="number"
                min="18"
                max="110"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full text-sm border border-green-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                placeholder="e.g. 72"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-green-800 cursor-pointer">
            <input
              type="checkbox"
              checked={isVet}
              onChange={(e) => setIsVet(e.target.checked)}
              className="rounded"
            />
            Resident is a U.S. veteran
          </label>
          <button
            onClick={() => { if (state && age) setChecked(true); }}
            disabled={!state || !age}
            className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
          >
            Check My Eligibility
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-green-800 font-medium">
            {programs.length} programs found for {state}, age {age}{isVet ? ", veteran" : ""}:
          </p>
          {programs.map((prog, i) => (
            <a
              key={i}
              href={prog.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 bg-white rounded-xl border border-green-200 hover:border-green-400 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800 group-hover:text-green-900">{prog.name}</p>
                <p className="text-xs text-warm-500 mt-0.5">{prog.description}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
            </a>
          ))}
          <button
            onClick={() => setChecked(false)}
            className="text-xs text-green-700 hover:text-green-900 underline"
          >
            Check a different profile
          </button>
        </div>
      )}
    </div>
  );
}

interface PremiumService {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  cta: string;
  badge: string;
  color: string;
  bg: string;
  action: "contractor" | "subsidy" | "reassess" | "ot" | "3d";
}

const PREMIUM_SERVICES: PremiumService[] = [
  {
    id: "contractor",
    icon: Building2,
    title: "Connect with Local Contractors",
    description: "Get matched with pre-vetted aging-in-place certified contractors in your area. Licensed, insured, and experienced with senior home modifications.",
    cta: "Find Contractors Near Me",
    badge: "Free Matching",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    action: "contractor",
  },
  {
    id: "subsidy",
    icon: DollarSign,
    title: "Insurance & Subsidy Programs",
    description: "Many home modifications are covered by Medicare, Medicaid, AARP, or state programs. Check what programs you qualify for based on your state and age.",
    cta: "Check My Eligibility",
    badge: "Up to $10,000 Available",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    action: "subsidy",
  },
  {
    id: "reassess",
    icon: RotateCcw,
    title: "Recurring Safety Reassessments",
    description: "Schedule automatic reassessments every 6 months. As mobility or health changes, new hazards emerge. Stay ahead of risk with regular AI-powered check-ins.",
    cta: "Start a New Assessment",
    badge: "Every 6 Months",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    action: "reassess",
  },
  {
    id: "ot",
    icon: Heart,
    title: "Occupational Therapy Consultation",
    description: "Connect with a certified occupational therapist (OT) for an in-home visit. OTs specialize in home modification planning and fall prevention strategies.",
    cta: "Schedule OT Consultation",
    badge: "Insurance May Cover",
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-200",
    action: "ot",
  },
  {
    id: "3d",
    icon: Star,
    title: "3D Redesign Mockups",
    description: "Work with a certified aging-in-place designer to see virtual before/after renderings of recommended modifications before any work begins.",
    cta: "Request a 3D Mockup",
    badge: "Visual Planning",
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
    action: "3d",
  },
];

interface PremiumSectionProps {
  onScrollToContractor?: () => void;
}

export default function PremiumSection({ onScrollToContractor }: PremiumSectionProps) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const handleAction = (service: PremiumService) => {
    if (service.action === "contractor") {
      onScrollToContractor?.();
    } else if (service.action === "reassess") {
      navigate("/");
    } else {
      toggle(service.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center pb-2">
        <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-sm font-medium px-4 py-2 rounded-full mb-3">
          <Star className="w-3.5 h-3.5" />
          Next Steps
        </div>
        <p className="text-warm-500 text-sm max-w-lg mx-auto">
          Turn your assessment findings into real improvements with these resources.
        </p>
      </div>

      <div className="space-y-3">
        {PREMIUM_SERVICES.map((service) => {
          const Icon = service.icon;
          const isExpanded = expandedId === service.id;
          const isExpandable = service.action === "subsidy" || service.action === "ot" || service.action === "3d";

          return (
            <div key={service.id} className={`border rounded-2xl shadow-sm overflow-hidden ${service.bg}`}>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${service.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-sm font-semibold ${service.color}`}>{service.title}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/80 ${service.color}`}>
                        {service.badge}
                      </span>
                    </div>
                    <p className="text-xs text-warm-600 leading-relaxed">{service.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => handleAction(service)}
                    className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors bg-white/70 hover:bg-white border border-white/80 ${service.color}`}
                  >
                    {service.cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {isExpandable && (
                    <button
                      onClick={() => toggle(service.id)}
                      className={`text-xs flex items-center gap-1 ${service.color} opacity-70 hover:opacity-100`}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? "Hide" : "Show details"}
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable content */}
              {isExpanded && service.action === "subsidy" && (
                <div className="border-t border-green-200 bg-green-50/50 px-5 pb-5">
                  <SubsidyChecker />
                </div>
              )}
              {isExpanded && service.action === "ot" && (
                <div className="border-t border-pink-200 bg-pink-50/50 px-5 pb-5 pt-4">
                  <p className="text-sm text-warm-600 mb-3">Find a certified occupational therapist in your area:</p>
                  <div className="space-y-2">
                    <a href="https://www.aota.org/practice/consumers/otas-in-your-area" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-white rounded-xl border border-pink-200 hover:border-pink-400 transition-colors group">
                      <div>
                        <p className="text-sm font-medium text-pink-800">AOTA OT Locator</p>
                        <p className="text-xs text-warm-500">American Occupational Therapy Association — official OT finder</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-pink-400" />
                    </a>
                    <a href="https://www.homemods.org/resources/find-a-specialist" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-white rounded-xl border border-pink-200 hover:border-pink-400 transition-colors group">
                      <div>
                        <p className="text-sm font-medium text-pink-800">HomeMods.org Specialist Finder</p>
                        <p className="text-xs text-warm-500">Certified aging-in-place specialists (CAPS) by location</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-pink-400" />
                    </a>
                  </div>
                </div>
              )}
              {isExpanded && service.action === "3d" && (
                <div className="border-t border-purple-200 bg-purple-50/50 px-5 pb-5 pt-4">
                  <p className="text-sm text-warm-600 mb-3">Find a Certified Aging-in-Place Specialist (CAPS) designer:</p>
                  <a href="https://www.nahb.org/nahb-community/designations-and-certifications/caps" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-white rounded-xl border border-purple-200 hover:border-purple-400 transition-colors group">
                    <div>
                      <p className="text-sm font-medium text-purple-800">NAHB CAPS Designer Directory</p>
                      <p className="text-xs text-warm-500">National Association of Home Builders — certified aging-in-place designers</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
