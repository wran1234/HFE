import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  User,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  PersonStanding,
  Accessibility,
  Eye,
  Pill,
  Home,
  AlertTriangle,
  Check,
} from "lucide-react";
import { UserProfile, HouseType, MobilityLevel } from "../lib/types";
import { saveProfile } from "../lib/userProfile";

const TOTAL_STEPS = 5;

interface StepProps {
  profile: Partial<UserProfile>;
  setProfile: React.Dispatch<React.SetStateAction<Partial<UserProfile>>>;
}

function Step1({ profile, setProfile }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-warm-900 mb-2 font-display">Who is this assessment for?</h2>
        <p className="text-warm-500">This helps us personalize the AI's guidance and report.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(["self", "family"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setProfile((p) => ({ ...p, assessmentFor: option }))}
            className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all ${
              profile.assessmentFor === option
                ? "border-brand-600 bg-brand-50 text-warm-900"
                : "border-warm-200 bg-white text-warm-600 hover:border-warm-300"
            }`}
          >
            {option === "self" ? (
              <User className="w-10 h-10" />
            ) : (
              <Users className="w-10 h-10" />
            )}
            <div>
              <p className="font-semibold text-base">
                {option === "self" ? "For Myself" : "For a Family Member"}
              </p>
              <p className={`text-xs mt-1 ${profile.assessmentFor === option ? "text-warm-500" : "text-warm-400"}`}>
                {option === "self"
                  ? "I'll be walking through my own home"
                  : "I'm assessing a parent or loved one's home"}
              </p>
            </div>
            {profile.assessmentFor === option && (
              <div className="w-5 h-5 bg-brand-600 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      {profile.assessmentFor === "family" && (
        <div className="animate-fade-in">
          <label className="block text-sm font-medium text-warm-600 mb-2">
            Their first name (optional)
          </label>
          <input
            type="text"
            value={profile.subjectName ?? ""}
            onChange={(e) =>
              setProfile((p) => ({ ...p, subjectName: e.target.value }))
            }
            placeholder="e.g. Mom, Dad, or their name"
            className="w-full bg-white border border-warm-200 text-warm-900 placeholder-warm-400 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-colors"
          />
        </div>
      )}
    </div>
  );
}

function Step2({ profile, setProfile }: StepProps) {
  const subject = profile.assessmentFor === "family" && profile.subjectName
    ? profile.subjectName
    : "the resident";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-warm-900 mb-2 font-display">About {subject}</h2>
        <p className="text-warm-500">Age and living situation significantly affect fall risk scoring.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">Age</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={50}
            max={100}
            value={profile.age ?? 70}
            onChange={(e) =>
              setProfile((p) => ({ ...p, age: parseInt(e.target.value) }))
            }
            className="flex-1 h-2 bg-warm-200 rounded-full appearance-none cursor-pointer accent-brand-600"
          />
          <div className="w-16 text-center bg-warm-100 border border-warm-200 rounded-xl py-2 px-3 text-warm-900 font-bold text-lg">
            {profile.age ?? 70}
          </div>
        </div>
        <div className="flex justify-between text-xs text-warm-400 mt-1">
          <span>50</span><span>75</span><span>100</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">
          Living situation
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { val: true, label: "Lives alone", sub: "No one else in the home" },
            { val: false, label: "Lives with others", sub: "Partner, family, or caregiver" },
          ].map(({ val, label, sub }) => (
            <button
              key={String(val)}
              onClick={() => setProfile((p) => ({ ...p, livesAlone: val }))}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                profile.livesAlone === val
                  ? "border-brand-600 bg-brand-50 text-warm-900"
                  : "border-warm-200 bg-white text-warm-600 hover:border-warm-300"
              }`}
            >
              <p className="font-semibold">{label}</p>
              <p className={`text-xs mt-0.5 ${profile.livesAlone === val ? "text-warm-500" : "text-warm-400"}`}>{sub}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step3({ profile, setProfile }: StepProps) {
  const options: { val: MobilityLevel; label: string; sub: string; icon: React.ElementType }[] = [
    { val: "independent", label: "Independent", sub: "No mobility aids needed", icon: PersonStanding },
    { val: "cane", label: "Uses a Cane", sub: "Occasional balance support", icon: PersonStanding },
    { val: "walker", label: "Uses a Walker", sub: "Regular support required", icon: Accessibility },
    { val: "wheelchair", label: "Wheelchair User", sub: "Full-time chair mobility", icon: Accessibility },
  ];

  const fallOptions = [
    { val: 0, label: "No falls", sub: "No falls in the past year" },
    { val: 1, label: "1 fall", sub: "One fall in the past year" },
    { val: 2, label: "2 falls", sub: "Two falls in the past year" },
    { val: 3, label: "3 or more", sub: "Including recent hospitalization" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-warm-900 mb-2 font-display">Mobility & Fall History</h2>
        <p className="text-warm-500">This is the strongest predictor of future fall risk.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">Mobility level</label>
        <div className="grid grid-cols-2 gap-3">
          {options.map(({ val, label, sub, icon: Icon }) => (
            <button
              key={val}
              onClick={() => setProfile((p) => ({ ...p, mobilityLevel: val }))}
              className={`text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${
                profile.mobilityLevel === val
                  ? "border-brand-600 bg-brand-50 text-warm-900"
                  : "border-warm-200 bg-white text-warm-600 hover:border-warm-300"
              }`}
            >
              <Icon className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className={`text-xs mt-0.5 ${profile.mobilityLevel === val ? "text-warm-500" : "text-warm-400"}`}>{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">
          Falls in the past year
        </label>
        <div className="grid grid-cols-4 gap-2">
          {fallOptions.map(({ val, sub }) => (
            <button
              key={val}
              onClick={() => setProfile((p) => ({ ...p, fallHistoryCount: val }))}
              className={`text-center p-3 rounded-xl border-2 transition-all ${
                profile.fallHistoryCount === val
                  ? val >= 2
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-brand-600 bg-brand-50 text-warm-900"
                  : "border-warm-200 bg-white text-warm-600 hover:border-warm-300"
              }`}
            >
              <p className="font-bold text-lg">{val === 3 ? "3+" : val}</p>
              <p className="text-[10px] text-warm-400 mt-0.5 leading-tight">{sub.split(" ")[0]} {sub.split(" ")[1]}</p>
            </button>
          ))}
        </div>
        {(profile.fallHistoryCount ?? 0) >= 3 && (
          <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Multiple falls indicate very high risk. This assessment will prioritize urgent interventions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Step4({ profile, setProfile }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-warm-900 mb-2 font-display">Health Factors</h2>
        <p className="text-warm-500">Vision and medications affect how hazards are scored.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">Vision</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { val: false, label: "Normal vision", sub: "No vision impairment" },
            { val: true, label: "Vision impaired", sub: "Glasses, low vision, or partial blindness" },
          ].map(({ val, label, sub }) => (
            <button
              key={String(val)}
              onClick={() => setProfile((p) => ({ ...p, visionImpaired: val }))}
              className={`text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${
                profile.visionImpaired === val
                  ? "border-brand-600 bg-brand-50 text-warm-900"
                  : "border-warm-200 bg-white text-warm-600 hover:border-warm-300"
              }`}
            >
              <Eye className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className={`text-xs mt-0.5 ${profile.visionImpaired === val ? "text-warm-500" : "text-warm-400"}`}>{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">
          Daily medications{" "}
          <span className="text-warm-400 font-normal">(approximate number)</span>
        </label>
        <div className="flex items-center gap-4">
          <Pill className="w-5 h-5 text-warm-400 shrink-0" />
          <input
            type="range"
            min={0}
            max={12}
            value={profile.medicationCount ?? 0}
            onChange={(e) =>
              setProfile((p) => ({
                ...p,
                medicationCount: parseInt(e.target.value),
              }))
            }
            className="flex-1 h-2 bg-warm-200 rounded-full appearance-none cursor-pointer accent-brand-600"
          />
          <div className="w-12 text-center bg-warm-100 border border-warm-200 rounded-xl py-2 px-2 text-warm-900 font-bold">
            {profile.medicationCount ?? 0}
          </div>
        </div>
        {(profile.medicationCount ?? 0) >= 4 && (
          <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            4+ medications may affect balance and reaction time. Lighting and trip hazards will be weighted higher.
          </p>
        )}
      </div>
    </div>
  );
}

function Step5({ profile, setProfile }: StepProps) {
  const houseTypes: { val: HouseType; label: string; sub: string }[] = [
    { val: "single-story", label: "Single-Story Home", sub: "No interior stairs" },
    { val: "multi-story", label: "Multi-Story Home", sub: "Multiple floors with stairs" },
    { val: "apartment", label: "Apartment / Condo", sub: "Elevator building, no exterior steps" },
    { val: "condo", label: "Townhouse / Condo", sub: "Multi-level unit with stairs" },
  ];

  const hasStairsDefault =
    profile.houseType === "multi-story" || profile.houseType === "condo";
  const hasOutdoorDefault = profile.houseType !== "apartment";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-warm-900 mb-2 font-display">About the Home</h2>
        <p className="text-warm-500">This determines which rooms the AI will assess.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-warm-600 mb-3">Home type</label>
        <div className="grid grid-cols-2 gap-3">
          {houseTypes.map(({ val, label, sub }) => (
            <button
              key={val}
              onClick={() =>
                setProfile((p) => ({
                  ...p,
                  houseType: val,
                  hasStairs:
                    val === "multi-story" || val === "condo" ? true : false,
                  hasOutdoorSteps: val !== "apartment",
                }))
              }
              className={`text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${
                profile.houseType === val
                  ? "border-brand-600 bg-brand-50 text-warm-900"
                  : "border-warm-200 bg-white text-warm-600 hover:border-warm-300"
              }`}
            >
              <Home className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className={`text-xs mt-0.5 ${profile.houseType === val ? "text-warm-500" : "text-warm-400"}`}>{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {profile.houseType && (
        <div className="animate-fade-in space-y-3">
          <label className="block text-sm font-medium text-warm-600">
            Confirm what to assess
          </label>
          {[
            {
              key: "hasStairs" as const,
              label: "Include staircase assessment",
              sub: "Home has interior stairs",
              defaultVal: hasStairsDefault,
            },
            {
              key: "hasOutdoorSteps" as const,
              label: "Include outdoor step assessment",
              sub: "Has exterior steps or entry steps",
              defaultVal: hasOutdoorDefault,
            },
          ].map(({ key, label, sub }) => (
            <label key={key} className="flex items-center justify-between p-4 bg-warm-50 border border-warm-200 rounded-xl cursor-pointer hover:border-warm-300 transition-colors">
              <div>
                <p className="text-sm font-medium text-warm-900">{label}</p>
                <p className="text-xs text-warm-400 mt-0.5">{sub}</p>
              </div>
              <div
                onClick={() =>
                  setProfile((p) => ({ ...p, [key]: !p[key] }))
                }
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  profile[key] ? "bg-brand-600" : "bg-warm-300"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform mt-0.5 ${
                    profile[key] ? "translate-x-6 ml-0.5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_PROFILE: Partial<UserProfile> = {
  assessmentFor: "self",
  age: 70,
  livesAlone: false,
  mobilityLevel: "independent",
  fallHistoryCount: 0,
  visionImpaired: false,
  medicationCount: 0,
  hasStairs: false,
  hasOutdoorSteps: true,
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Partial<UserProfile>>(DEFAULT_PROFILE);

  const isStepValid = () => {
    switch (step) {
      case 1: return !!profile.assessmentFor;
      case 2: return profile.age !== undefined && profile.livesAlone !== undefined;
      case 3: return profile.mobilityLevel !== undefined && profile.fallHistoryCount !== undefined;
      case 4: return profile.visionImpaired !== undefined && profile.medicationCount !== undefined;
      case 5: return !!profile.houseType;
      default: return true;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      const complete = profile as UserProfile;
      saveProfile(complete);
      navigate("/assessment");
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-warm-900 font-display">HFE Assessment Setup</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i + 1 < step
                  ? "bg-brand-500"
                  : i + 1 === step
                  ? "bg-brand-400"
                  : "bg-warm-200"
              }`}
            />
          ))}
        </div>
        <p className="text-center text-warm-400 text-xs mb-6">
          Step {step} of {TOTAL_STEPS}
        </p>

        {/* Step content */}
        <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm animate-fade-in">
          {step === 1 && <Step1 profile={profile} setProfile={setProfile} />}
          {step === 2 && <Step2 profile={profile} setProfile={setProfile} />}
          {step === 3 && <Step3 profile={profile} setProfile={setProfile} />}
          {step === 4 && <Step4 profile={profile} setProfile={setProfile} />}
          {step === 5 && <Step5 profile={profile} setProfile={setProfile} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-warm-200 bg-white text-warm-700 hover:bg-warm-50 font-semibold transition-all disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!isStepValid()}
            className="btn-primary py-2.5 px-6 disabled:opacity-40"
          >
            {step === TOTAL_STEPS ? (
              <>
                Start Assessment
                <ShieldCheck className="w-4 h-4" />
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
