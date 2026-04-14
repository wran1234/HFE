import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import VideoAssistant from "../components/VideoAssistant";
import { AssessmentReport } from "../lib/types";
import { loadProfile } from "../lib/userProfile";
import { saveReport } from "../lib/reportSerializer";
import { ShieldCheck, Lightbulb, ChevronDown, ChevronUp, Info } from "lucide-react";
import { useState } from "react";
import { getRiskLabel } from "../lib/userProfile";

const TIPS = [
  "Start at the front door and work room-by-room",
  "Pan slowly so the AI can analyze each area thoroughly",
  "Show all staircases from both top and bottom",
  "Point the camera at bathroom floors, tubs, and toilet areas",
  "Show hallways, especially nighttime lighting",
  "Demonstrate any rugs, thresholds, or uneven floors",
  "Include the garage and any exterior steps",
  "Keep your screen on — locking your phone will disconnect the session",
];

export default function AssessmentPage() {
  const navigate = useNavigate();
  const [tipsOpen, setTipsOpen] = useState(false);
  const profile = loadProfile();

  // Redirect to onboarding if no profile
  useEffect(() => {
    if (!profile) {
      navigate("/onboarding", { replace: true });
    }
  }, [profile, navigate]);

  if (!profile) return null;

  const riskInfo = getRiskLabel(profile);
  const subject =
    profile.assessmentFor === "family" && profile.subjectName
      ? profile.subjectName
      : "the resident";

  const handleReportReady = (report: AssessmentReport) => {
    saveReport(report);
    navigate("/report");
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-brand-400" />
              <h1 className="text-2xl font-bold text-white">Home Safety Assessment</h1>
            </div>
            <p className="text-slate-400 text-sm">
              Assessing home for{" "}
              <span className="text-white font-medium">{subject}</span>
              {profile.age > 0 && (
                <span className="text-slate-500"> · Age {profile.age}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`text-sm font-semibold ${riskInfo.color}`}>
              {riskInfo.label}
            </div>
            <button
              onClick={() => navigate("/onboarding")}
              className="btn-secondary py-2 px-3 text-xs"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Tips */}
        <div className="mb-5">
          <button
            onClick={() => setTipsOpen((v) => !v)}
            className="w-full flex items-center gap-3 p-3.5 bg-brand-900/30 border border-brand-700/40 rounded-xl text-left hover:bg-brand-900/50 transition-colors"
          >
            <Lightbulb className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="text-sm font-medium text-brand-300 flex-1">
              Walkthrough Tips
            </span>
            {tipsOpen ? (
              <ChevronUp className="w-4 h-4 text-brand-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-brand-400" />
            )}
          </button>
          {tipsOpen && (
            <div className="mt-2 p-4 bg-slate-900 border border-slate-800 rounded-xl animate-fade-in grid sm:grid-cols-2 gap-2">
              {TIPS.map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-brand-500 font-bold text-xs mt-0.5 shrink-0">{i + 1}.</span>
                  <p className="text-slate-400 text-sm">{tip}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Requirements */}
        <div className="flex items-start gap-3 p-3.5 bg-slate-900 border border-slate-700 rounded-xl mb-6 text-sm text-slate-400">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p>
            <span className="font-medium text-slate-300">Requirements:</span>{" "}
            Camera and microphone access required. Works best on desktop or tablet.
            The AI will guide you room by room automatically.
          </p>
        </div>

        <VideoAssistant profile={profile} onReportReady={handleReportReady} />
      </div>
    </div>
  );
}
