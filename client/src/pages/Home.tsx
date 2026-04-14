import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle } from "lucide-react";

const STATS = [
  { value: "3M+",  label: "Older adults treated for fall injuries every year in the US" },
  { value: "32K",  label: "Deaths from falls among adults 65+ each year" },
  { value: "800K", label: "Hospitalizations per year from fall-related injuries" },
  { value: "95%",  label: "Of hip fractures in the elderly are caused by falls" },
];

const STEPS = [
  {
    num: "1",
    title: "Walk & Show",
    desc: "Walk through your home while your camera streams live to Gemini AI. Show each room, staircase, bathroom, and entry.",
  },
  {
    num: "2",
    title: "Real-Time Analysis",
    desc: "The AI instantly identifies hazards as you walk — tracking every concern with location, risk level, and severity.",
  },
  {
    num: "3",
    title: "Get Your Report",
    desc: "Receive a prioritized, room-by-room safety plan with specific product recommendations and action steps.",
  },
];

const HAZARDS = [
  {
    emoji: "💡",
    bg: "bg-amber-50",
    title: "Poor Lighting",
    description:
      "Dim corridors, staircases, and bathrooms are a leading cause of falls. Older eyes need 3× more light than younger adults to see clearly at night.",
    fix: "Motion-activated night lights can reduce nighttime falls by up to 40%",
  },
  {
    emoji: "🪜",
    bg: "bg-red-50",
    title: "Unsafe Stairs",
    description:
      "Stairs without handrails on both sides account for 1 in 4 fall-related hospitalizations in adults over 65.",
    fix: "Proper handrails and stair lighting prevent the majority of staircase accidents",
  },
  {
    emoji: "🚿",
    bg: "bg-sage-100",
    title: "Bathroom Hazards",
    description:
      "The bathroom is the most dangerous room for elderly individuals — wet surfaces, high tubs, and lack of support bars create life-threatening conditions.",
    fix: "Grab bars alone reduce bathroom falls by 45%",
  },
  {
    emoji: "🏠",
    bg: "bg-orange-50",
    title: "Trip Hazards",
    description:
      "Loose rugs, raised thresholds, and clutter are responsible for over 30% of all in-home falls.",
    fix: "Securing loose rugs eliminates one of the most preventable fall causes entirely",
  },
  {
    emoji: "♿",
    bg: "bg-purple-50",
    title: "Accessibility Barriers",
    description:
      "Narrow doorways and cramped spaces prevent safe navigation with walkers, canes, or wheelchairs.",
    fix: "Offset hinges can gain 2\" of clearance — enough for most mobility aids",
  },
  {
    emoji: "🚪",
    bg: "bg-brand-100",
    title: "Outdoor Entry",
    description:
      "Wet or icy outdoor steps without railings are especially dangerous in rain and winter conditions.",
    fix: "Anti-slip coatings and railings prevent injuries before entering the home",
  },
];

const TESTIMONIALS = [
  {
    quote: "I did the walkthrough for my mom's house on a Sunday afternoon. The report identified three things I'd walked past for years. We fixed all of them that week.",
    name: "Sarah M.",
    role: "Daughter, San Jose CA",
  },
  {
    quote: "My dad fell last winter. After that I needed to do something. This was the first tool that felt like it was built for people like me — not for hospitals.",
    name: "James T.",
    role: "Son, Austin TX",
  },
  {
    quote: "The bathroom section was incredibly specific — it even caught the lack of a grab bar near the toilet. My occupational therapist said it was exactly the right call.",
    name: "Linda K.",
    role: "Caregiver, Portland OR",
  },
];

const TRUST_ITEMS = [
  "Free to use",
  "AI-powered real-time analysis",
  "Room-by-room safety plan",
  "Shareable PDF report",
  "No app download needed",
];

export default function HomePage() {
  return (
    <div className="animate-fade-in">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden min-h-[600px] flex items-end">
        {/* Full-bleed photo: elderly woman laughing with adult daughter */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(45,36,24,0.78) 40%, rgba(45,36,24,0.15) 100%), url('https://images.pexels.com/photos/3768131/pexels-photo-3768131.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop') center/cover no-repeat",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 w-full">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/90 text-xs font-medium px-4 py-2 rounded-full mb-7 tracking-wide">
            <span className="w-1.5 h-1.5 bg-brand-400 rounded-full" />
            Powered by Google Gemini AI
          </div>
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-normal text-white leading-[1.1] tracking-tight max-w-2xl mb-5">
            Their home should feel{" "}
            <em className="text-brand-300 not-italic italic">safe</em>
            <br />at every age
          </h1>
          <p className="text-white/75 text-lg md:text-xl leading-relaxed max-w-lg mb-9 font-light">
            Walk through any room with your phone. Our AI identifies fall hazards
            in real time and delivers a personalized safety plan in minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/onboarding" className="btn-primary text-base px-8 py-4 rounded-xl">
              Start Free Assessment
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-medium text-base transition-colors"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="bg-white border-b border-warm-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display text-4xl md:text-5xl font-medium text-brand-600 mb-1 tracking-tight">
                  {stat.value}
                </div>
                <div className="text-xs text-warm-500 leading-snug max-w-[140px] mx-auto">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <div className="bg-sage-100 border-y border-sage-200 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sage-600 text-sm font-medium">
                <CheckCircle className="w-4 h-4 text-sage-400 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-warm-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Left: steps */}
            <div>
              <p className="text-xs font-bold tracking-[2px] uppercase text-brand-600 mb-4">
                How It Works
              </p>
              <h2 className="font-display text-4xl md:text-5xl font-normal text-warm-900 leading-[1.15] tracking-tight mb-4">
                Three steps to a{" "}
                <em className="italic text-brand-600">safer</em> home
              </h2>
              <p className="text-warm-600 text-lg leading-relaxed mb-10 max-w-md">
                A 15-minute guided walkthrough is all it takes. No equipment,
                no appointment, no expertise needed.
              </p>
              <div className="space-y-8">
                {STEPS.map((step) => (
                  <div key={step.num} className="flex gap-5 items-start">
                    <div className="w-10 h-10 min-w-[40px] rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-display text-lg font-semibold">
                      {step.num}
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-medium text-warm-900 mb-1 tracking-tight">
                        {step.title}
                      </h3>
                      <p className="text-warm-600 text-sm leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10">
                <Link to="/onboarding" className="btn-primary">
                  Begin Your Walkthrough
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Right: photo — caregiver + senior reviewing report on laptop */}
            <div
              className="rounded-2xl overflow-hidden shadow-2xl shadow-warm-900/10 aspect-[4/5] w-full"
              style={{
                backgroundImage:
                  "url('https://images.pexels.com/photos/7551644/pexels-photo-7551644.jpeg?auto=compress&cs=tinysrgb&w=900&h=1100&fit=crop')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Hazards ── */}
      <section id="hazards" className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
            <div>
              <p className="text-xs font-bold tracking-[2px] uppercase text-brand-600 mb-4">
                Common Hazards
              </p>
              <h2 className="font-display text-4xl md:text-5xl font-normal text-warm-900 leading-[1.15] tracking-tight">
                What puts your family<br />at{" "}
                <em className="italic text-brand-600">greatest risk</em>
              </h2>
            </div>
            <p className="text-warm-600 text-base leading-relaxed max-w-sm md:text-right">
              Our AI detects all of these in real time during your walkthrough.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {HAZARDS.map((hazard) => (
              <div
                key={hazard.title}
                className="bg-warm-50 border border-warm-200 rounded-2xl p-7 hover:shadow-lg hover:shadow-warm-900/5 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className={`w-11 h-11 ${hazard.bg} rounded-xl flex items-center justify-center text-xl mb-5`}>
                  {hazard.emoji}
                </div>
                <h3 className="font-display text-xl font-medium text-warm-900 mb-3 tracking-tight">
                  {hazard.title}
                </h3>
                <p className="text-warm-600 text-sm leading-relaxed mb-4">
                  {hazard.description}
                </p>
                <div className="flex items-start gap-2 bg-sage-100 rounded-lg px-3 py-2.5">
                  <CheckCircle className="w-4 h-4 text-sage-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-sage-700 font-medium leading-relaxed">{hazard.fix}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 md:py-28 bg-brand-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold tracking-[2px] uppercase text-brand-200 mb-4">
            What families say
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-normal text-white leading-[1.15] tracking-tight mb-12">
            Peace of mind in{" "}
            <em className="italic text-brand-200">fifteen minutes</em>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-white/10 border border-white/20 rounded-2xl p-7"
              >
                <p className="font-display italic text-lg text-white/95 leading-relaxed mb-6">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-white/80">{t.name}</p>
                  <p className="text-xs text-white/50">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 md:py-32 bg-warm-50 text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold tracking-[2px] uppercase text-brand-600 mb-4">
            Get started today
          </p>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-normal text-warm-900 leading-[1.1] tracking-tight mb-6">
            Protect the people<br />you{" "}
            <em className="italic text-brand-600">love most</em>
          </h2>
          <p className="text-warm-600 text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            A 15-minute walkthrough can identify the changes needed to prevent
            life-changing injuries. It&apos;s free, thorough, and built for real families.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/onboarding" className="btn-primary text-base px-8 py-4 rounded-xl">
              Start Free Assessment
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#hazards"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-brand-600 text-brand-600 hover:bg-brand-50 font-semibold text-base transition-colors"
            >
              Learn About Hazards
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
