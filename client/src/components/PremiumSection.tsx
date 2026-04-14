import { Building2, Heart, DollarSign, RotateCcw, ArrowRight, Star } from "lucide-react";

const PREMIUM_SERVICES = [
  {
    icon: Building2,
    title: "Connect with Local Contractors",
    description:
      "Get matched with pre-vetted aging-in-place certified contractors in your area. Licensed, insured, and experienced with senior home modifications.",
    cta: "Find Contractors Near Me",
    badge: "Free Matching",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  {
    icon: Heart,
    title: "Occupational Therapy Consultation",
    description:
      "Connect with a certified occupational therapist (OT) for an in-home visit. OTs specialize in home modification planning and fall prevention strategies.",
    cta: "Schedule OT Consultation",
    badge: "Insurance May Cover",
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-200",
  },
  {
    icon: DollarSign,
    title: "Insurance & Subsidy Programs",
    description:
      "Many home modifications are covered by Medicare, Medicaid, AARP, or state programs. We'll help identify programs you qualify for based on your profile.",
    cta: "Check My Eligibility",
    badge: "Up to $10,000 Available",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
  },
  {
    icon: Star,
    title: "3D Redesign Mockups",
    description:
      "Work with a certified aging-in-place designer to see virtual before/after renderings of recommended modifications before any work begins.",
    cta: "Request a 3D Mockup",
    badge: "Visual Planning",
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
  },
  {
    icon: RotateCcw,
    title: "Recurring Safety Reassessments",
    description:
      "Schedule automatic reassessments every 6 months. As mobility or health changes, new hazards emerge. Stay ahead of risk with regular AI-powered check-ins.",
    cta: "Schedule Reassessment",
    badge: "Every 6 Months",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
];

export default function PremiumSection() {
  return (
    <div className="space-y-5">
      <div className="text-center pb-2">
        <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-sm font-medium px-4 py-2 rounded-full mb-3">
          <Star className="w-3.5 h-3.5" />
          Premium Services — Coming Soon
        </div>
        <p className="text-warm-500 text-sm max-w-lg mx-auto">
          We're building a network of trusted professionals to help turn your
          assessment findings into real improvements.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {PREMIUM_SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <div
              key={service.title}
              className={`border rounded-2xl p-6 shadow-sm relative overflow-hidden ${service.bg}`}
            >
              <div className="absolute top-3 right-3">
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full bg-white/80 ${service.color}`}>
                  {service.badge}
                </span>
              </div>

              <Icon className={`w-6 h-6 ${service.color} mb-3`} />
              <h3 className={`text-base font-semibold mb-2 ${service.color}`}>
                {service.title}
              </h3>
              <p className="text-sm text-warm-600 leading-relaxed mb-4">
                {service.description}
              </p>
              <button
                disabled
                className="inline-flex items-center gap-2 text-sm font-medium text-warm-400 cursor-not-allowed"
              >
                {service.cta}
                <ArrowRight className="w-3.5 h-3.5" />
                <span className="text-xs text-warm-300 ml-1">(Coming soon)</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-brand-50 border border-brand-200 rounded-2xl p-6 text-center">
        <p className="text-warm-700 text-sm">
          <span className="font-semibold text-warm-900">Interested in early access?</span>{" "}
          These premium features are in development. Join our waitlist to be
          notified when they launch.
        </p>
        <button disabled className="btn-primary mt-3 opacity-50 cursor-not-allowed text-sm">
          Join Waitlist
        </button>
      </div>
    </div>
  );
}
