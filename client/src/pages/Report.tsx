import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Download,
  RotateCcw,
  Printer,
  ArrowRight,
  Calendar,
  Camera,
  Share2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  TrendingDown,
  Wallet,
  Star,
  User,
} from "lucide-react";
import {
  HazardObservation,
  AssessmentReport,
  ROOM_NAMES,
  RoomId,
} from "../lib/types";
import { loadReport } from "../lib/reportSerializer";
import { getShareableUrl, decodeReportFromHash } from "../lib/reportSerializer";
import { fetchReport } from "../lib/apiClient";
import { toAssessmentReport } from "../lib/reportTransform";
import ShoppingList from "../components/ShoppingList";
import ContractorScope from "../components/ContractorScope";
import PremiumSection from "../components/PremiumSection";
import { loadProfile } from "../lib/userProfile";

// ── Score ring ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#EBE5DA" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-warm-900">{score}</span>
        <span className="text-xs text-warm-500">/100</span>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getSafetyScore(obs: HazardObservation[]): number {
  if (obs.length === 0) return 97;
  const deductions = obs.reduce((d, o) => {
    return d + (o.priority === "high" ? 14 : o.priority === "medium" ? 6 : 2);
  }, 0);
  return Math.max(10, 100 - deductions);
}

function groupByRoom(obs: HazardObservation[]): Record<RoomId, HazardObservation[]> {
  const groups: Record<string, HazardObservation[]> = {};
  obs.forEach((o) => {
    if (!groups[o.room]) groups[o.room] = [];
    groups[o.room].push(o);
  });
  return groups as Record<RoomId, HazardObservation[]>;
}

const URGENCY_ORDER: Record<string, number> = {
  immediate: 0,
  "30-days": 1,
  "90-days": 2,
  recommended: 3,
};

// ── Room section ───────────────────────────────────────────────────────────────

function RoomSection({ roomId, obs }: { roomId: RoomId; obs: HazardObservation[] }) {
  const [expanded, setExpanded] = useState(true);
  const sorted = [...obs].sort(
    (a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
  );

  return (
    <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm room-section print:break-inside-avoid">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between mb-0 no-print:mb-0"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-warm-900 text-base">
            {ROOM_NAMES[roomId]}
          </h3>
          <span className="text-warm-400 text-xs">{obs.length} finding{obs.length !== 1 ? "s" : ""}</span>
          {obs.some((o) => o.priority === "high") && (
            <span className="badge-high text-[10px]">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Urgent
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-warm-400 no-print" />
        ) : (
          <ChevronDown className="w-4 h-4 text-warm-400 no-print" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 animate-fade-in">
          {sorted.map((obs) => (
            <HazardCard key={obs.id} obs={obs} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hazard card ────────────────────────────────────────────────────────────────

function HazardCard({ obs }: { obs: HazardObservation }) {
  const urgencyColors: Record<string, string> = {
    immediate: "text-red-600 bg-red-50 border-red-200",
    "30-days": "text-amber-700 bg-amber-50 border-amber-200",
    "90-days": "text-blue-700 bg-blue-50 border-blue-200",
    recommended: "text-warm-600 bg-warm-100 border-warm-200",
  };
  const urgencyLabel: Record<string, string> = {
    immediate: "Act Immediately",
    "30-days": "Within 30 Days",
    "90-days": "Within 90 Days",
    recommended: "Recommended",
  };

  return (
    <div className="p-4 bg-warm-50 rounded-xl border border-warm-200">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${urgencyColors[obs.urgency]}`}
        >
          {urgencyLabel[obs.urgency]}
        </span>
        <span
          className={obs.priority === "high" ? "badge-high" : obs.priority === "medium" ? "badge-medium" : "badge-low"}
        >
          Severity {obs.adjustedSeverity}/10
        </span>
        <span className="text-xs text-warm-400">{obs.category}</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs font-semibold text-warm-400 mb-1">HAZARD</p>
          <p className="text-sm text-warm-900 leading-relaxed">{obs.hazard}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-warm-400 mb-1">WHY IT'S DANGEROUS</p>
          <p className="text-sm text-warm-700 leading-relaxed">{obs.risk}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-warm-400 mb-1">RECOMMENDATION</p>
          <p className="text-sm text-warm-700 leading-relaxed">{obs.recommendation}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-warm-400">Fall Probability</span>
            <span className="text-sm font-bold text-red-600">{obs.fallProbability}%</span>
          </div>
          <div className="w-full bg-warm-200 rounded-full h-1.5">
            <div
              className="bg-red-500 h-1.5 rounded-full"
              style={{ width: `${obs.fallProbability}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-warm-400">Risk Reduction if Fixed</span>
            <span className="text-sm font-bold text-green-600">{obs.riskReductionPercent != null ? `−${obs.riskReductionPercent}%` : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-warm-400">Estimated Cost</span>
            <span className="text-sm font-semibold text-warm-700">
              ${obs.costMin === 0 ? "Free" : `${obs.costMin}–$${obs.costMax}`}
            </span>
          </div>
        </div>
      </div>

      {/* Snapshot */}
      {(obs.snapshotBase64 || obs.evidenceImageUrl) && (
        <div className="mt-3 pt-3 border-t border-warm-200">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="w-3.5 h-3.5 text-brand-500" />
            <span className="text-xs text-warm-400">Captured during assessment</span>
          </div>
          <img
            src={obs.snapshotBase64 ? `data:image/jpeg;base64,${obs.snapshotBase64}` : obs.evidenceImageUrl}
            alt="Hazard snapshot"
            className="rounded-lg w-full max-w-xs object-cover border border-warm-200"
            style={{ imageRendering: "auto", transform: obs.snapshotBase64 ? "scaleX(-1)" : "none" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = "overview" | "rooms" | "shopping" | "contractor" | "action" | "premium";

export default function ReportPage() {
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("sessionId");
    const profile = loadProfile();
    if (sessionId && profile) {
      fetchReport(sessionId)
        .then((response) => {
          setReport(toAssessmentReport(response.report as Parameters<typeof toAssessmentReport>[0], profile));
        })
        .catch(() => {
          // fallback to local session report below
        });
    }

    // Check for shared report in URL hash
    const hash = window.location.hash;
    if (hash.startsWith("#share=")) {
      const decoded = decodeReportFromHash(hash.slice(7));
      if (decoded) {
        setReport(decoded);
        return;
      }
    }
    const stored = loadReport();
    if (stored) setReport(stored);
  }, []);

  const handleShare = () => {
    if (!report) return;
    const url = getShareableUrl(report);
    setShareUrl(url);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handlePrint = () => window.print();

  const handleDownload = () => {
    if (!report) return;
    const obs = report.observations;
    const lines = [
      "HOME FALL & SAFETY EVALUATOR — ASSESSMENT REPORT",
      "=".repeat(52),
      `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
      `Resident: ${report.profile.assessmentFor === "family" ? report.profile.subjectName ?? "Family member" : "Self"}, Age ${report.profile.age}`,
      `Safety Score: ${getSafetyScore(obs)}/100`,
      "",
      `HAZARDS: ${obs.length} total | ${obs.filter(o => o.priority === "high").length} high | ${obs.filter(o => o.priority === "medium").length} medium | ${obs.filter(o => o.priority === "low").length} low`,
      "",
      report.aiSummary ? `AI ASSESSMENT SUMMARY:\n${report.aiSummary}\n` : "",
      ...Object.entries(groupByRoom(obs)).flatMap(([room, roomObs]) => [
        `\n${ROOM_NAMES[room as RoomId]?.toUpperCase() ?? room}`,
        "-".repeat(40),
        ...roomObs.flatMap((o, i) => [
          `${i + 1}. [${o.urgency.toUpperCase()} | ${o.adjustedSeverity}/10] ${o.hazard}`,
          `   Location: ${o.location}`,
          `   Risk: ${o.risk}`,
          `   Fix: ${o.recommendation}`,
          `   Cost: $${o.costMin}–$${o.costMax} | Risk reduction: ${o.riskReductionPercent}%`,
        ]),
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HFE_Report_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
        <ShieldCheck className="w-20 h-20 text-warm-300" />
        <div>
          <h1 className="text-2xl font-bold text-warm-900 mb-2 font-display">No Report Found</h1>
          <p className="text-warm-500 mb-6">Complete a home assessment to generate your personalized report.</p>
        </div>
        <Link to="/onboarding" className="btn-primary">
          Start Assessment <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const obs = report.observations;
  const score = getSafetyScore(obs);
  const byRoom = groupByRoom(obs);
  const highObs = obs.filter((o) => o.priority === "high");
  const medObs = obs.filter((o) => o.priority === "medium");
  const lowObs = obs.filter((o) => o.priority === "low");
  const scoreLabel =
    score >= 80 ? "Good" : score >= 60 ? "Needs Improvement" : "Unsafe — Act Now";
  const scoreColor =
    score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600";

  const subjectName =
    report.profile.assessmentFor === "family" && report.profile.subjectName
      ? report.profile.subjectName
      : "the resident";

  const totalCostMin = obs.reduce((s, o) => s + (o.costMin ?? 0), 0);
  const totalCostMax = obs.reduce((s, o) => s + (o.costMax ?? 0), 0);
  const avgRiskReduction =
    obs.length > 0
      ? Math.round(obs.reduce((s, o) => s + (o.riskReductionPercent ?? 0), 0) / obs.length)
      : 0;

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "rooms", label: "Room Findings" },
    { id: "shopping", label: "Shopping List" },
    { id: "contractor", label: "Contractor Scope" },
    { id: "action", label: "Action Plan" },
    { id: "premium", label: "Premium Services" },
  ];

  const btnLight = "inline-flex items-center gap-1.5 py-2 px-3 text-sm bg-white border border-warm-200 text-warm-700 hover:bg-warm-50 rounded-xl font-medium transition-colors";

  return (
    <div className="min-h-screen bg-warm-50 px-4 sm:px-6 lg:px-8 py-8" ref={printRef}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8 no-print">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-brand-600" />
              <h1 className="text-2xl font-bold text-warm-900 font-display">Safety Assessment Report</h1>
            </div>
            <div className="flex items-center gap-3 text-warm-400 text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(report.generatedAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {subjectName}, age {report.profile.age}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleShare} className={btnLight}>
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
              {copied ? "Link Copied!" : "Share Report"}
            </button>
            <button onClick={handlePrint} className={btnLight}>
              <Printer className="w-4 h-4" />
              Print / PDF
            </button>
            <button onClick={handleDownload} className={btnLight}>
              <Download className="w-4 h-4" />
              Download
            </button>
            <button onClick={() => navigate("/onboarding")} className="btn-primary py-2 px-3 text-sm gap-1.5">
              <RotateCcw className="w-4 h-4" />
              New Assessment
            </button>
          </div>
        </div>

        {/* Share URL */}
        {shareUrl && (
          <div className="flex items-center gap-3 p-3.5 bg-brand-50 border border-brand-200 rounded-xl mb-5 animate-fade-in no-print">
            <Copy className="w-4 h-4 text-brand-600 shrink-0" />
            <p className="text-xs text-warm-700 truncate flex-1 font-mono">{shareUrl}</p>
            <span className="text-xs text-green-600 shrink-0">Copied to clipboard</span>
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm col-span-2 flex items-center gap-6">
            <ScoreRing score={score} />
            <div>
              <p className="text-warm-400 text-xs mb-1">Overall Safety Score</p>
              <p className={`text-xl font-bold ${scoreColor}`}>{scoreLabel}</p>
              <p className="text-warm-500 text-sm mt-1">
                {obs.length} hazard{obs.length !== 1 ? "s" : ""} identified
              </p>
              {report.aiSummary && (
                <p className="text-warm-400 text-xs mt-2 leading-relaxed max-w-xs line-clamp-2">
                  "{report.aiSummary}"
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center border-red-200">
            <Flame className="w-7 h-7 text-red-500 mx-auto mb-1" />
            <span className="text-3xl font-extrabold text-red-600">{highObs.length}</span>
            <p className="text-xs text-warm-400 mt-1">High Priority</p>
          </div>

          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center border-amber-200">
            <AlertCircle className="w-7 h-7 text-amber-500 mx-auto mb-1" />
            <span className="text-3xl font-extrabold text-amber-600">{medObs.length}</span>
            <p className="text-xs text-warm-400 mt-1">Medium Priority</p>
          </div>
        </div>

        {/* Impact stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center">
            <TrendingDown className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-green-600">{avgRiskReduction}%</p>
            <p className="text-xs text-warm-400">Avg. Risk Reduction if Fixed</p>
          </div>
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center">
            <Wallet className="w-5 h-5 text-brand-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-brand-600">
              ${totalCostMin.toLocaleString()}–${totalCostMax.toLocaleString()}
            </p>
            <p className="text-xs text-warm-400">Total Investment Range</p>
          </div>
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center">
            <Camera className="w-5 h-5 text-warm-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-warm-900">
              {obs.filter((o) => o.snapshotBase64).length}
            </p>
            <p className="text-xs text-warm-400">Hazard Photos Captured</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-warm-100 p-1 rounded-xl border border-warm-200 mb-6 overflow-x-auto no-print">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white text-warm-900 shadow"
                  : "text-warm-500 hover:text-warm-700"
              }`}
            >
              {tab.label}
              {tab.id === "premium" && (
                <Star className="w-2.5 h-2.5 inline ml-1 text-amber-500" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="animate-fade-in">
          {/* Overview */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {obs.length === 0 ? (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center py-12">
                  <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-warm-900 mb-2">Excellent Home Safety</h3>
                  <p className="text-warm-500 text-sm max-w-sm mx-auto">
                    No significant hazards were detected. Consider running a new assessment in 6 months.
                  </p>
                </div>
              ) : (
                <>
                  {/* Room heatmap */}
                  <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-semibold text-warm-900 mb-3">Room-by-Room Risk Heatmap</h3>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(byRoom).map(([room, roomObs]) => {
                        const maxSeverity = Math.max(...roomObs.map((o) => o.adjustedSeverity ?? 0));
                        const bg =
                          maxSeverity >= 8
                            ? "bg-red-50 border-red-200"
                            : maxSeverity >= 6
                            ? "bg-amber-50 border-amber-200"
                            : "bg-green-50 border-green-200";
                        const textColor =
                          maxSeverity >= 8 ? "text-red-600" : maxSeverity >= 6 ? "text-amber-600" : "text-green-600";

                        return (
                          <button
                            key={room}
                            onClick={() => setActiveTab("rooms")}
                            className={`text-left p-3 rounded-xl border transition-all hover:scale-[1.02] ${bg}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-semibold text-warm-900">
                                {ROOM_NAMES[room as RoomId]}
                              </p>
                              <span className={`text-lg font-extrabold ${textColor}`}>
                                {maxSeverity}
                              </span>
                            </div>
                            <p className="text-xs text-warm-500">
                              {roomObs.length} issue{roomObs.length !== 1 ? "s" : ""} ·{" "}
                              {roomObs.filter((o) => o.priority === "high").length} urgent
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top 3 urgent */}
                  <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-semibold text-warm-900 mb-3 flex items-center gap-2">
                      <Flame className="w-4 h-4 text-red-500" />
                      Most Urgent Findings
                    </h3>
                    <div className="space-y-3">
                      {[...obs]
                        .sort((a, b) => b.adjustedSeverity - a.adjustedSeverity)
                        .slice(0, 3)
                        .map((o, i) => (
                          <div
                            key={o.id}
                            className="flex items-start gap-3 p-3 bg-warm-50 rounded-xl border border-warm-200"
                          >
                            <div className="w-7 h-7 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-xs text-warm-400">
                                  {ROOM_NAMES[o.room]} · {o.category}
                                </p>
                              </div>
                              <p className="text-sm text-warm-900 font-medium truncate">{o.hazard}</p>
                              <p className="text-xs text-warm-500 mt-0.5">{o.recommendation}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-red-600">{o.adjustedSeverity ?? "—"}/10</p>
                              <p className="text-xs text-warm-400">{o.fallProbability != null ? `${o.fallProbability}% risk` : ""}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                    <button
                      onClick={() => setActiveTab("rooms")}
                      className="mt-3 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
                    >
                      View all {obs.length} findings <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Room Findings */}
          {activeTab === "rooms" && (
            <div className="space-y-4">
              {Object.keys(byRoom).length === 0 ? (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-center py-10 text-warm-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500" />
                  <p>No hazards found in any room.</p>
                </div>
              ) : (
                Object.entries(byRoom).map(([room, roomObs]) => (
                  <RoomSection
                    key={room}
                    roomId={room as RoomId}
                    obs={roomObs}
                  />
                ))
              )}
            </div>
          )}

          {/* Shopping list */}
          {activeTab === "shopping" && <ShoppingList observations={obs} />}

          {/* Contractor scope */}
          {activeTab === "contractor" && <ContractorScope observations={obs} />}

          {/* Action plan */}
          {activeTab === "action" && (
            <div className="space-y-5">
              {/* Immediate */}
              <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-warm-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  Immediate Actions
                </h3>
                {highObs.length === 0 ? (
                  <p className="text-warm-400 text-sm">No urgent items. Great!</p>
                ) : (
                  <div className="space-y-3">
                    {highObs.map((o, i) => (
                      <div key={o.id} className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <div className="w-7 h-7 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-warm-900">{o.location}</p>
                          <p className="text-sm text-warm-700 leading-relaxed">{o.recommendation}</p>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-xs text-red-600">{o.fallProbability}% fall risk</span>
                            <span className="text-xs text-green-600">−{o.riskReductionPercent}% if fixed</span>
                            <span className="text-xs text-warm-400">${o.costMin}–${o.costMax}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 30-day */}
              <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-warm-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Schedule Within 30 Days
                </h3>
                {medObs.length === 0 ? (
                  <p className="text-warm-400 text-sm">No medium-priority items.</p>
                ) : (
                  <div className="space-y-2">
                    {medObs.map((o, i) => (
                      <div key={o.id} className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-warm-900">{o.location}</p>
                          <p className="text-sm text-warm-700">{o.recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ongoing */}
              {lowObs.length > 0 && (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-warm-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Ongoing Improvements
                  </h3>
                  <div className="space-y-2">
                    {lowObs.map((o, i) => (
                      <div key={o.id} className="flex gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                        <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-warm-900">{o.location}</p>
                          <p className="text-sm text-warm-700">{o.recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total investment */}
              <div className="bg-brand-50 border border-brand-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-warm-900 mb-4">Total Estimated Investment</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: "High Priority", obs: highObs, color: "text-red-600" },
                    { label: "Medium Priority", obs: medObs, color: "text-amber-600" },
                    { label: "Low Priority", obs: lowObs, color: "text-green-600" },
                  ].map(({ label, obs: items, color }) => (
                    <div key={label}>
                      <p className={`text-xl font-extrabold ${color}`}>
                        ${items.reduce((s, o) => s + o.costMin, 0).toLocaleString()}
                        –${items.reduce((s, o) => s + o.costMax, 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-warm-500 mt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-warm-400 text-center mt-4">
                  Estimates vary by region and contractor. DIY items can significantly reduce costs.
                </p>
              </div>
            </div>
          )}

          {/* Premium */}
          {activeTab === "premium" && (
            <PremiumSection
              onScrollToContractor={() => setActiveTab("contractor")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
