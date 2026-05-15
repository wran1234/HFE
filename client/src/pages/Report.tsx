import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  HeartHandshake,
  ClipboardList,
  Brain,
  FileText,
} from "lucide-react";
import {
  HazardObservation,
  AssessmentReport,
  ROOM_NAMES,
  RoomId,
  CareNote,
  CareNoteAuthorRole,
  CareNoteSummary,
  CareNoteType,
  IndependencePlanOwner,
  IndependencePlanItem,
  IndependencePlanPriority,
  RecommendationActionStatus,
  RecommendationEvidence,
  RecommendationEvidenceType,
  FollowUpCheckIn,
  ServiceRequest,
  ServiceRequestStatus,
  SuggestedServiceRequest,
} from "../lib/types";
import { loadReport } from "../lib/reportSerializer";
import { getShareableUrl, decodeReportFromHash } from "../lib/reportSerializer";
import {
  addCareNote,
  addRecommendationEvidence,
  createServiceRequest,
  fetchReport,
  generateServiceRequestSuggestions,
  getCareNoteSummary,
  getPreventionSummary,
  listFamilyFollowUps,
  listServiceRequests,
  listRecommendationEvidence,
  listCareNotes,
  submitFamilyFollowUp,
  trackAnalyticsEvent,
  updateRecommendationStatus,
  updateServiceRequest,
} from "../lib/apiClient";
import { toAssessmentReport } from "../lib/reportTransform";
import ShoppingList from "../components/ShoppingList";
import ContractorScope from "../components/ContractorScope";
import PremiumSection from "../components/PremiumSection";
import ScoreRing from "../components/ScoreRing";
import { loadProfile } from "../lib/userProfile";
import ReportHeader from "../components/report/ReportHeader";
import ReportTabBar from "../components/report/ReportTabBar";
import type { TabId } from "../components/report/ReportTabBar";

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
          <p className="text-xs font-semibold text-warm-400 mb-1">What we noticed</p>
          <p className="text-sm text-warm-900 leading-relaxed">{obs.hazard}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-warm-400 mb-1">Why this matters</p>
          <p className="text-sm text-warm-700 leading-relaxed">{obs.risk}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-warm-400 mb-1">What to do</p>
          <p className="text-sm text-warm-700 leading-relaxed">{obs.recommendation}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-warm-400">Risk without action</span>
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

const riskLabel: Record<string, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  urgent: "Urgent",
};

const riskClass = (risk?: string) => {
  if (risk === "urgent") return "bg-red-50 text-red-700 border-red-200";
  if (risk === "high") return "bg-amber-50 text-amber-700 border-amber-200";
  if (risk === "moderate") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-green-50 text-green-700 border-green-200";
};

const impactClass = (impact?: string) => {
  if (impact === "high") return "bg-green-50 text-green-700 border-green-200";
  if (impact === "medium") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-warm-50 text-warm-600 border-warm-200";
};

function EvidencePanel({
  sessionId,
  item,
  onEvidenceAdded,
}: {
  sessionId?: string;
  item: IndependencePlanItem;
  onEvidenceAdded: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<RecommendationEvidence[]>([]);
  const [evidenceType, setEvidenceType] = useState<RecommendationEvidenceType>("note");
  const [note, setNote] = useState("");
  const [role, setRole] = useState("family" as const);

  useEffect(() => {
    if (!open || !sessionId) return;
    void listRecommendationEvidence(sessionId, item.id)
      .then((response) => setEvidence(response.evidence))
      .catch(() => undefined);
  }, [open, sessionId, item.id]);

  const submit = async () => {
    if (!sessionId || !note.trim()) return;
    const response = await addRecommendationEvidence(sessionId, item.id, {
      evidenceType,
      note,
      uploadedByRole: role,
    });
    setEvidence((current) => [response.evidence, ...current]);
    setNote("");
    onEvidenceAdded(item.id);
  };

  return (
    <div className="mt-3 border-t border-warm-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-semibold text-brand-700 hover:text-brand-800"
      >
        {open ? "Hide evidence timeline" : "Add evidence/update"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as RecommendationEvidenceType)}
              className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
            >
              <option value="note">General note</option>
              <option value="before_photo">Before photo / note</option>
              <option value="after_photo">After photo / note</option>
              <option value="contractor_update">Contractor update</option>
              <option value="caregiver_update">Caregiver update</option>
              <option value="other">Other</option>
            </select>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
            >
              <option value="family">Family</option>
              <option value="caregiver">Caregiver</option>
              <option value="contractor">Contractor</option>
              <option value="admin">Admin</option>
              <option value="other">Other</option>
            </select>
            <button type="button" onClick={submit} className="btn-secondary py-2 px-3 text-xs">Save update</button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add before/after note or service update. Image upload can be added later through existing evidence storage."
            className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm min-h-20"
          />
          <div className="space-y-2">
            {evidence.length === 0 ? (
              <p className="text-xs text-warm-400">No evidence updates yet. Add a before note, after note, contractor update, or caregiver update so the family and care team can see follow-through.</p>
            ) : evidence.map((entry) => (
              <div key={entry.id} className="p-3 rounded-xl border border-warm-200 bg-warm-50">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-warm-700">{entry.evidenceType.replace(/_/g, " ")} · {entry.uploadedByRole}</p>
                  <span className="text-xs text-warm-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                {entry.note && <p className="text-sm text-warm-700">{entry.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanItemCard({
  item,
  onStatusChange,
  onActionUpdate,
  sessionId,
  onEvidenceAdded,
}: {
  item: IndependencePlanItem;
  onStatusChange: (id: string, status: RecommendationActionStatus) => void;
  onActionUpdate: (id: string, updates: Partial<Pick<IndependencePlanItem, "owner" | "priority" | "dueDate" | "skippedReason">>) => void;
  sessionId?: string;
  onEvidenceAdded: (id: string) => void;
}) {
  return (
    <div className="p-4 bg-warm-50 border border-warm-200 rounded-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-semibold text-warm-900">{item.title}</p>
          <p className="text-xs text-warm-400 mt-0.5">{item.section} · {item.owner.replace(/_/g, " ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={item.status}
            onChange={(e) => onStatusChange(item.id, e.target.value as RecommendationActionStatus)}
            className="text-xs border border-warm-200 rounded-lg bg-warm-50 px-2 py-1.5 text-warm-700"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped</option>
          </select>
          <span className={`text-xs px-2 py-1.5 rounded-lg border ${impactClass(item.estimatedPreventionImpact)}`}>
            Estimated prevention impact: {item.estimatedPreventionImpact ?? "low"}
          </span>
        </div>
      </div>
      <p className="text-sm text-warm-600 leading-relaxed">{item.recommendedAction}</p>
      <p className="text-xs text-warm-400 mt-2">{item.whyItMatters}</p>
      <div className="grid sm:grid-cols-3 gap-2 mt-3">
        <select
          value={item.owner}
          onChange={(e) => onActionUpdate(item.id, { owner: e.target.value as IndependencePlanOwner })}
          className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
        >
          <option value="family">Family</option>
          <option value="caregiver">Caregiver</option>
          <option value="contractor">Contractor</option>
          <option value="clinician">Clinician</option>
          <option value="insurer_or_care_coordinator">Care coordinator</option>
        </select>
        <select
          value={item.priority}
          onChange={(e) => onActionUpdate(item.id, { priority: e.target.value as IndependencePlanPriority })}
          className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
        >
          <option value="immediate">Immediate</option>
          <option value="this_week">This week</option>
          <option value="this_month">This month</option>
          <option value="monitor">Monitor</option>
        </select>
        <input
          type="date"
          value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
          onChange={(e) => onActionUpdate(item.id, { dueDate: e.target.value || undefined })}
          className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
        />
      </div>
      {item.status === "completed" && (
        <p className={`text-xs mt-3 ${item.evidenceCount ? "text-green-700" : "text-amber-700"}`}>
          {item.evidenceCount ? `${item.evidenceCount} evidence update${item.evidenceCount !== 1 ? "s" : ""} attached` : "Completion evidence missing"}
        </p>
      )}
      <EvidencePanel sessionId={sessionId} item={item} onEvidenceAdded={onEvidenceAdded} />
    </div>
  );
}

function FamilyDashboardTab({
  report,
  onStatusChange,
  onActionUpdate,
  onEvidenceAdded,
}: {
  report: AssessmentReport;
  onStatusChange: (id: string, status: RecommendationActionStatus) => void;
  onActionUpdate: (id: string, updates: Partial<Pick<IndependencePlanItem, "owner" | "priority" | "dueDate" | "skippedReason">>) => void;
  onEvidenceAdded: (id: string) => void;
}) {
  const dashboard = report.familyDashboard;
  const risk = report.independenceRiskScore;
  const completedActions = (report.independencePlan ?? []).filter((item) => item.status === "completed" || item.status === "skipped").length;
  const openImmediate = (report.independencePlan ?? []).filter((item) => item.priority === "immediate" && item.status !== "completed" && item.status !== "skipped");
  if (!dashboard || !risk) {
    return (
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <p className="text-sm text-warm-500">Parent safety dashboard will appear on new reports.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <FamilyFollowUpPanel sessionId={report.sessionId} report={report} />
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-warm-900">Parent Safety Dashboard</h3>
            <p className="text-sm text-warm-500 mt-1">{dashboard.dignityFocusedCopy}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${riskClass(dashboard.overallIndependenceRisk)}`}>
            {riskLabel[dashboard.overallIndependenceRisk]} independence risk
          </span>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            ["Fall risk", risk.fallRisk],
            ["Daily living", risk.dailyLivingRisk],
            ["Caregiver load", risk.caregiverBurdenRisk],
            ["Memory support", risk.cognitiveSupportRisk],
          ].map(([label, value]) => (
            <div key={label} className={`p-3 rounded-xl border ${riskClass(value)}`}>
              <p className="text-xs opacity-75">{label}</p>
              <p className="font-bold mt-1">{riskLabel[value]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-warm-900 mb-3">Top Actions</h3>
          <div className="space-y-3">
            {dashboard.topUrgentActions.map((item) => (
              <PlanItemCard
                key={item.id}
                item={item}
                sessionId={report.sessionId}
                onStatusChange={onStatusChange}
                onActionUpdate={onActionUpdate}
                onEvidenceAdded={onEvidenceAdded}
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-warm-900 mb-3">Progress</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${Math.round((dashboard.completedActionCount / Math.max(dashboard.completedActionCount + dashboard.pendingActionCount, 1)) * 100)}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-warm-700">
                {dashboard.completedActionCount}/{dashboard.completedActionCount + dashboard.pendingActionCount}
              </span>
            </div>
            <p className="text-xs text-warm-400 mt-2">Completed or intentionally skipped actions.</p>
            <p className="text-sm text-warm-700 mt-3">
              Your family has completed {completedActions} of {(report.independencePlan ?? []).length} recommended actions.
              {openImmediate[0] ? ` The highest remaining priority is ${openImmediate[0].title}.` : " Keep monitoring and updating the plan as needs change."}
            </p>
          </div>
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-warm-900 mb-3">Family Check-in</h3>
            <p className="text-sm text-warm-700">{dashboard.nextRecommendedFamilyCheckIn}</p>
            <p className="text-xs text-warm-400 mt-2">{dashboard.emergencyPlanSummary}</p>
          </div>
        </div>
      </div>

      {dashboard.roomRiskOverview.length > 0 && (
        <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-warm-900 mb-3">Room-by-Room Risk Overview</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {dashboard.roomRiskOverview.map((room) => (
              <div key={room.roomType} className={`p-3 rounded-xl border ${riskClass(room.risk)}`}>
                <p className="text-sm font-semibold">{ROOM_NAMES[room.roomType]}</p>
                <p className="text-xs mt-1">{room.openIssueCount} open item{room.openIssueCount !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FamilyFollowUpPanel({ sessionId, report }: { sessionId?: string; report: AssessmentReport }) {
  const [followUps, setFollowUps] = useState<FollowUpCheckIn[]>([]);
  const [draft, setDraft] = useState({
    anyNewFalls: false,
    anyNearFalls: false,
    anyHospitalVisit: false,
    majorHomeFixCompleted: false,
    caregiverSupportAdded: false,
    medicationRoutineImproved: false,
    parentFeelsSafer: "unsure" as "yes" | "somewhat" | "no" | "unsure",
    familyFeelsMorePrepared: "unsure" as "yes" | "somewhat" | "no" | "unsure",
    notes: "",
    currentBiggestConcern: "",
    requestCareCoordinatorFollowup: false,
  });

  useEffect(() => {
    if (!sessionId) return;
    void listFamilyFollowUps(sessionId).then((response) => setFollowUps(response.followUps)).catch(() => undefined);
  }, [sessionId]);

  const pending = followUps.find((item) => item.status === "scheduled");
  const completed = followUps.filter((item) => item.status === "completed");
  const latest = completed[0] ?? followUps[0];
  const completedActions = (report.independencePlan ?? []).filter((item) => item.status === "completed" || item.status === "skipped").length;
  const openImmediate = (report.independencePlan ?? []).filter((item) => item.priority === "immediate" && item.status !== "completed" && item.status !== "skipped").length;

  const submit = async () => {
    if (!sessionId || !pending) return;
    const response = await submitFamilyFollowUp(sessionId, pending.id, draft);
    setFollowUps((current) => current.map((item) => item.id === pending.id ? response.followUp : item));
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-warm-900 mb-1">Family Follow-Up</h3>
        <p className="text-sm text-warm-500 mb-4">Help us understand how your parent is doing since the safety plan was created. This is self-reported information and not medical advice.</p>
        {pending ? (
          <div className="space-y-3">
            <p className="text-xs text-warm-500">Scheduled for {new Date(pending.scheduledFor).toLocaleDateString()}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ["anyNewFalls", "Any new falls?"],
                ["anyNearFalls", "Any near-falls?"],
                ["anyHospitalVisit", "Any hospital visit?"],
                ["majorHomeFixCompleted", "Major home fix completed?"],
                ["caregiverSupportAdded", "Caregiver support added?"],
                ["medicationRoutineImproved", "Medication routine improved?"],
                ["requestCareCoordinatorFollowup", "Request care coordinator follow-up?"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-warm-700 bg-warm-50 border border-warm-200 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={Boolean(draft[key as keyof typeof draft])} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))} className="w-4 h-4 accent-brand-600" />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={draft.parentFeelsSafer} onChange={(e) => setDraft((d) => ({ ...d, parentFeelsSafer: e.target.value as typeof draft.parentFeelsSafer }))} className="text-sm border border-warm-200 rounded-lg bg-white px-3 py-2">
                <option value="yes">Parent feels safer</option>
                <option value="somewhat">Parent feels somewhat safer</option>
                <option value="no">Parent does not feel safer</option>
                <option value="unsure">Unsure if parent feels safer</option>
              </select>
              <select value={draft.familyFeelsMorePrepared} onChange={(e) => setDraft((d) => ({ ...d, familyFeelsMorePrepared: e.target.value as typeof draft.familyFeelsMorePrepared }))} className="text-sm border border-warm-200 rounded-lg bg-white px-3 py-2">
                <option value="yes">Family feels more prepared</option>
                <option value="somewhat">Family feels somewhat prepared</option>
                <option value="no">Family does not feel more prepared</option>
                <option value="unsure">Unsure</option>
              </select>
            </div>
            <input value={draft.currentBiggestConcern} onChange={(e) => setDraft((d) => ({ ...d, currentBiggestConcern: e.target.value }))} placeholder="Current biggest concern" className="w-full text-sm border border-warm-200 rounded-lg bg-white px-3 py-2" />
            <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes" className="w-full text-sm border border-warm-200 rounded-lg bg-white px-3 py-2 min-h-20" />
            <p className="text-xs text-amber-700">If this is an emergency or immediate safety concern, contact local emergency or medical services.</p>
            <button type="button" onClick={() => void submit()} className="btn-primary py-2 px-3 text-sm">Submit follow-up</button>
          </div>
        ) : (
          <p className="text-sm text-warm-500">No scheduled family follow-up is open right now. A care coordinator can schedule 30/60/90-day check-ins from the admin dashboard for pilot tracking.</p>
        )}
      </div>
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-warm-900 mb-1">Progress Since Assessment</h3>
        <p className="text-sm text-warm-700">{completedActions} completed actions · {openImmediate} open immediate actions · {completed.length} follow-up check-in{completed.length !== 1 ? "s" : ""} submitted.</p>
        {latest?.currentBiggestConcern && <p className="text-sm text-warm-700 mt-2">Current biggest concern: {latest.currentBiggestConcern}</p>}
        <p className="text-sm text-warm-500 mt-3">
          {openImmediate > 0 ? "Suggested next step: finish or assign the remaining immediate action before moving to lower-priority tasks." : "Suggested next step: keep monitoring, add care notes when things change, and continue aging-at-home progress check-ins."}
        </p>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide">Timeline</p>
          <p className="text-xs text-warm-600">Initial assessment: {new Date(report.generatedAt).toLocaleDateString()}</p>
          <p className="text-xs text-warm-600">Risk score: {report.independenceRiskScore?.overallIndependenceRisk ?? "not available"}</p>
          {latest && <p className="text-xs text-warm-600">Latest self-reported update: {latest.completedAt ? new Date(latest.completedAt).toLocaleDateString() : latest.status}</p>}
          {latest?.newFallsReported && <p className="text-xs text-amber-700">New concern reported: fall</p>}
          {latest?.newHospitalVisitReported && <p className="text-xs text-amber-700">New concern reported: hospital visit</p>}
        </div>
      </div>
    </div>
  );
}

function CareNotesPanel({ sessionId }: { sessionId?: string }) {
  const [notes, setNotes] = useState<CareNote[]>([]);
  const [summary, setSummary] = useState<CareNoteSummary | null>(null);
  const [draft, setDraft] = useState<{
    noteType: CareNoteType;
    authorName: string;
    authorRole: CareNoteAuthorRole;
    body: string;
    observedChanges: string;
    concerns: string;
    followUpNeeded: boolean;
  }>({
    noteType: "family_check_in",
    authorName: "",
    authorRole: "family",
    body: "",
    observedChanges: "",
    concerns: "",
    followUpNeeded: false,
  });

  useEffect(() => {
    if (!sessionId) return;
    void listCareNotes(sessionId).then((response) => setNotes(response.notes)).catch(() => undefined);
  }, [sessionId]);

  const submit = async () => {
    if (!sessionId || !draft.body.trim()) return;
    const response = await addCareNote(sessionId, {
      ...draft,
      authorName: draft.authorName || undefined,
      observedChanges: draft.observedChanges || undefined,
      concerns: draft.concerns || undefined,
    });
    setNotes((current) => [response.note, ...current]);
    setDraft((current) => ({ ...current, body: "", observedChanges: "", concerns: "", followUpNeeded: false }));
  };

  const summarize = async () => {
    if (!sessionId) return;
    const response = await getCareNoteSummary(sessionId);
    setSummary(response.summary);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-warm-900 mb-1">Care Notes</h3>
        <p className="text-sm text-warm-500 mb-4">Track family check-ins, caregiver visits, contractor updates, and clinician notes.</p>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <select
            value={draft.noteType}
            onChange={(e) => setDraft((d) => ({ ...d, noteType: e.target.value as typeof draft.noteType }))}
            className="border border-warm-200 rounded-xl px-3 py-2 text-sm"
          >
            <option value="family_check_in">Family check-in</option>
            <option value="caregiver_visit">Caregiver visit</option>
            <option value="contractor_update">Contractor update</option>
            <option value="clinician_note">Clinician note</option>
            <option value="other">Other</option>
          </select>
          <input
            value={draft.authorName}
            onChange={(e) => setDraft((d) => ({ ...d, authorName: e.target.value }))}
            placeholder="Author name"
            className="border border-warm-200 rounded-xl px-3 py-2 text-sm"
          />
          <select
            value={draft.authorRole}
            onChange={(e) => setDraft((d) => ({ ...d, authorRole: e.target.value as typeof draft.authorRole }))}
            className="border border-warm-200 rounded-xl px-3 py-2 text-sm"
          >
            <option value="family">Family</option>
            <option value="caregiver">Caregiver</option>
            <option value="contractor">Contractor</option>
            <option value="clinician">Clinician</option>
            <option value="other">Other</option>
          </select>
        </div>
        <textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          placeholder="What happened during this check-in or visit?"
          className="w-full border border-warm-200 rounded-xl px-3 py-2 text-sm min-h-24 mb-3"
        />
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input
            value={draft.observedChanges}
            onChange={(e) => setDraft((d) => ({ ...d, observedChanges: e.target.value }))}
            placeholder="Observed changes"
            className="border border-warm-200 rounded-xl px-3 py-2 text-sm"
          />
          <input
            value={draft.concerns}
            onChange={(e) => setDraft((d) => ({ ...d, concerns: e.target.value }))}
            placeholder="Concerns"
            className="border border-warm-200 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-warm-600">
            <input
              type="checkbox"
              checked={draft.followUpNeeded}
              onChange={(e) => setDraft((d) => ({ ...d, followUpNeeded: e.target.checked }))}
              className="accent-brand-600"
            />
            Follow-up needed
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={summarize} className="btn-secondary py-2 px-3 text-sm">Generate family summary</button>
            <button type="button" onClick={submit} className="btn-primary py-2 px-3 text-sm">Add note</button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-warm-900 mb-3">Family Summary</h3>
          <p className="text-sm text-warm-700"><strong>Changed:</strong> {summary.whatChanged.join(" ")}</p>
          <p className="text-sm text-warm-700 mt-2"><strong>Needs attention:</strong> {summary.whatNeedsAttention.join(" ")}</p>
          <p className="text-sm text-warm-700 mt-2"><strong>Next:</strong> {summary.nextRecommendedAction}</p>
          <p className="text-xs text-warm-500 mt-3">{summary.disclaimer}</p>
        </div>
      )}

      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-warm-900 mb-3">Recent Notes</h3>
        {notes.length === 0 ? (
          <p className="text-sm text-warm-400">No care notes yet. Add a family check-in, caregiver visit, contractor update, or other note when something changes.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="p-3 bg-warm-50 border border-warm-200 rounded-xl">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-sm font-semibold text-warm-900">{note.noteType.replace(/_/g, " ")}</p>
                  <span className="text-xs text-warm-400">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-warm-700">{note.body}</p>
                {(note.concerns || note.followUpNeeded) && <p className="text-xs text-amber-700 mt-2">Follow-up: {note.concerns || "Requested"}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceRequestsPanel({
  sessionId,
  onScrollToContractor,
}: {
  sessionId?: string;
  onScrollToContractor: () => void;
}) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedServiceRequest[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    void listServiceRequests(sessionId)
      .then((response) => setRequests(response.serviceRequests))
      .catch(() => undefined);
  }, [sessionId]);

  const generate = async () => {
    if (!sessionId) return;
    const response = await generateServiceRequestSuggestions(sessionId);
    setSuggestions(response.suggestions);
    setRequests(response.existingRequests);
  };

  const createFromSuggestion = async (suggestion: SuggestedServiceRequest) => {
    if (!sessionId) return;
    const response = await createServiceRequest(sessionId, {
      ...suggestion,
      requestedByRole: "family",
      status: "requested",
    });
    setRequests((current) => [response.serviceRequest, ...current]);
    setSuggestions((current) => current.filter((item) => item !== suggestion));
  };

  const patchRequest = async (requestId: string, updates: Parameters<typeof updateServiceRequest>[1]) => {
    const response = await updateServiceRequest(requestId, updates);
    setRequests((current) => current.map((item) => item.id === requestId ? response.serviceRequest : item));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-warm-900">Care Network</h3>
            <p className="text-sm text-warm-500">Recommended service support for aging-at-home assistance and care coordination.</p>
          </div>
          <button type="button" onClick={generate} className="btn-primary py-2 px-3 text-sm">Generate suggestions</button>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-warm-400">Generate suggestions from the current prevention plan.</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {suggestions.map((suggestion) => (
              <div key={`${suggestion.serviceType}:${suggestion.title}`} className="p-4 rounded-xl border border-brand-200 bg-brand-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-warm-900">{suggestion.title}</p>
                    <p className="text-xs text-brand-700 mt-0.5">{suggestion.serviceType.replace(/_/g, " ")} · {suggestion.priority.replace("_", " ")}</p>
                  </div>
                  <button type="button" onClick={() => void createFromSuggestion(suggestion)} className="btn-secondary py-1.5 px-2 text-xs">Create request</button>
                </div>
                <p className="text-sm text-warm-700 mt-2">{suggestion.description}</p>
                <p className="text-xs text-warm-500 mt-2">{suggestion.whyThisHelps}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-warm-900 mb-3">Existing Service Requests</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-warm-400">No care coordination requests yet. Generate suggested service support above or create a request from a recommendation when the family is ready to coordinate help.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="p-4 rounded-xl border border-warm-200 bg-warm-50">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-warm-900">{request.title}</p>
                    <p className="text-xs text-warm-500 mt-0.5">
                      {request.serviceType.replace(/_/g, " ")} · {request.priority.replace("_", " ")}
                      {request.recommendationActionId ? " · linked recommendation" : ""}
                    </p>
                  </div>
                  <select
                    value={request.status}
                    onChange={(e) => void patchRequest(request.id, { status: e.target.value as ServiceRequestStatus })}
                    className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-1.5"
                  >
                    <option value="draft">Draft</option>
                    <option value="requested">Requested</option>
                    <option value="matched">Matched</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <p className="text-sm text-warm-700 mb-3">{request.description}</p>
                <div className="grid sm:grid-cols-3 gap-2 mb-3">
                  <input
                    type="datetime-local"
                    value={request.scheduledAt ? request.scheduledAt.slice(0, 16) : ""}
                    onChange={(e) => void patchRequest(request.id, { scheduledAt: e.target.value || null, status: e.target.value ? "scheduled" : request.status })}
                    className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
                  />
                  <input
                    value={request.providerName ?? ""}
                    onChange={(e) => void patchRequest(request.id, { providerName: e.target.value || null })}
                    placeholder="Provider name"
                    className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
                  />
                  <input
                    value={request.providerContact ?? ""}
                    onChange={(e) => void patchRequest(request.id, { providerContact: e.target.value || null })}
                    placeholder="Provider contact"
                    className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
                  />
                </div>
                <textarea
                  value={request.notes ?? ""}
                  onChange={(e) => void patchRequest(request.id, { notes: e.target.value || null })}
                  placeholder="Provider notes or care coordination details"
                  className="w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2 min-h-16"
                />
                {request.status === "completed" && (
                  <div className="mt-3 grid sm:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 text-xs text-warm-700 bg-white border border-warm-200 rounded-lg px-2 py-2">
                      <input
                        type="checkbox"
                        checked={request.completionVerified}
                        onChange={(e) => void patchRequest(request.id, {
                          completionVerified: e.target.checked,
                          completionVerifiedAt: e.target.checked ? new Date().toISOString() : null,
                          completionVerifiedBy: e.target.checked ? "family" : null,
                        })}
                        className="w-4 h-4 accent-brand-600"
                      />
                      Completion verified
                    </label>
                    <select
                      value={request.serviceQualityRating ?? ""}
                      onChange={(e) => void patchRequest(request.id, { serviceQualityRating: e.target.value ? Number(e.target.value) : null })}
                      className="text-xs border border-warm-200 rounded-lg bg-white px-2 py-2"
                    >
                      <option value="">Rating</option>
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Okay</option>
                      <option value="2">2 - Needs work</option>
                      <option value="1">1 - Poor</option>
                    </select>
                    <label className="flex items-center gap-2 text-xs text-warm-700 bg-white border border-warm-200 rounded-lg px-2 py-2">
                      <input
                        type="checkbox"
                        checked={request.providerFollowupNeeded}
                        onChange={(e) => void patchRequest(request.id, { providerFollowupNeeded: e.target.checked })}
                        className="w-4 h-4 accent-brand-600"
                      />
                      Follow-up needed
                    </label>
                    <textarea
                      value={request.familyFeedback ?? ""}
                      onChange={(e) => void patchRequest(request.id, { familyFeedback: e.target.value || null })}
                      placeholder="Family feedback on the completed service"
                      className="sm:col-span-3 w-full text-xs border border-warm-200 rounded-lg bg-white px-2 py-2 min-h-14"
                    />
                  </div>
                )}
                {(request.completionVerified || request.serviceQualityRating || request.familyFeedback) && (
                  <p className="text-xs text-warm-500 mt-2">
                    Quality: {request.completionVerified ? "completion verified" : "completion not verified"}
                    {request.serviceQualityRating ? ` · rating ${request.serviceQualityRating}/5` : ""}
                    {request.familyFeedback ? ` · ${request.familyFeedback}` : ""}
                  </p>
                )}
                {request.serviceType === "home_modification" && (
                  <button type="button" onClick={onScrollToContractor} className="mt-3 text-xs font-semibold text-brand-700 hover:text-brand-800">
                    Use existing Contractor Scope / Lead flow
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const navigate = useNavigate();
  const { sessionId: sessionIdParam } = useParams<{ sessionId?: string }>();
  const printRef = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = sessionIdParam;
    const profile = loadProfile();
    if (sessionId && profile) {
      fetchReport(sessionId)
        .then((response) => {
          setReport(toAssessmentReport(response.report as Parameters<typeof toAssessmentReport>[0], profile));
          setLoadError(null);
        })
        .catch(() => {
          setLoadError("We couldn't load the latest report from the server. Showing your saved local copy if available.");
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // Check for shared report in URL hash
    const hash = window.location.hash;
    if (hash.startsWith("#share=")) {
      const decoded = decodeReportFromHash(hash.slice(7));
      if (decoded) {
        setReport(decoded);
        setIsLoading(false);
        return;
      }
    }
    const stored = loadReport();
    if (stored) setReport(stored);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!report) return;
    void trackAnalyticsEvent({
      eventName: "report_viewed",
      sessionId: report.sessionId,
      reportId: report.sessionId,
      metadata: {
        observationCount: report.observations.length,
      },
    }).catch(() => undefined);
  }, [report]);

  const handleShare = () => {
    if (!report) return;
    const url = getShareableUrl(report);
    setShareUrl(url);
    // Guard against clipboard API being unavailable (non-HTTPS, denied permission).
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }).catch(() => {
        // Clipboard write failed — shareUrl is still displayed so the user can copy manually.
      });
    }
  };

  const handlePrint = () => window.print();

  const handleDownload = () => {
    if (!report) return;
    const obs = report.observations;
    const lines = [
      "HFE — PARENT SAFETY & INDEPENDENCE REPORT",
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

  const handlePlanStatusChange = (itemId: string, actionStatus: RecommendationActionStatus) => {
    if (!report) return;
    const nextPlan = (report.independencePlan ?? []).map((item) =>
      item.id === itemId ? { ...item, status: actionStatus, completedAt: actionStatus === "completed" ? new Date().toISOString() : item.completedAt } : item
    );
    const completed = nextPlan.filter((item) => item.status === "completed" || item.status === "skipped").length;
    setReport({
      ...report,
      independencePlan: nextPlan,
      familyDashboard: report.familyDashboard
        ? {
            ...report.familyDashboard,
            topUrgentActions: report.familyDashboard.topUrgentActions.map((item) =>
              item.id === itemId ? { ...item, status: actionStatus } : item
            ),
            completedActionCount: completed,
            pendingActionCount: nextPlan.length - completed,
          }
        : report.familyDashboard,
    });
    if (report.sessionId) {
      void updateRecommendationStatus(report.sessionId, itemId, actionStatus).catch(() => undefined);
    }
  };

  const handlePlanActionUpdate = (
    itemId: string,
    updates: Partial<Pick<IndependencePlanItem, "owner" | "priority" | "dueDate" | "skippedReason">>
  ) => {
    if (!report) return;
    const nextPlan = (report.independencePlan ?? []).map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    setReport({
      ...report,
      independencePlan: nextPlan,
      familyDashboard: report.familyDashboard
        ? {
            ...report.familyDashboard,
            topUrgentActions: report.familyDashboard.topUrgentActions.map((item) =>
              item.id === itemId ? { ...item, ...updates } : item
            ),
          }
        : report.familyDashboard,
    });
    if (report.sessionId) {
      void updateRecommendationStatus(report.sessionId, itemId, {
        actionOwner: updates.owner,
        actionPriority: updates.priority,
        dueDate: updates.dueDate ?? undefined,
        skippedReason: updates.skippedReason,
      }).catch(() => undefined);
    }
  };

  const handleEvidenceAdded = (itemId: string) => {
    if (!report) return;
    const bump = (item: IndependencePlanItem) =>
      item.id === itemId ? { ...item, evidenceCount: (item.evidenceCount ?? 0) + 1 } : item;
    setReport({
      ...report,
      independencePlan: (report.independencePlan ?? []).map(bump),
      familyDashboard: report.familyDashboard
        ? {
            ...report.familyDashboard,
            topUrgentActions: report.familyDashboard.topUrgentActions.map(bump),
          }
        : report.familyDashboard,
    });
  };

  const handleOpenPreventionExport = () => {
    if (!report?.sessionId) return;
    window.open(`/api/sessions/${encodeURIComponent(report.sessionId)}/prevention-summary.html`, "_blank", "noopener,noreferrer");
    void getPreventionSummary(report.sessionId).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header skeleton */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div className="space-y-2">
              <div className="h-8 w-80 bg-gray-200 animate-pulse rounded-lg" />
              <div className="h-4 w-56 bg-gray-200 animate-pulse rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-28 bg-gray-200 animate-pulse rounded-xl" />
              <div className="h-9 w-24 bg-gray-200 animate-pulse rounded-xl" />
            </div>
          </div>

          {/* Score ring + stats card skeleton */}
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-8">
              <div className="w-32 h-32 rounded-full bg-gray-200 animate-pulse" />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-20 bg-gray-200 animate-pulse rounded" />
                    <div className="h-6 w-16 bg-gray-200 animate-pulse rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card outlines skeleton */}
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="h-5 w-40 bg-gray-200 animate-pulse rounded" />
              <div className="h-4 w-full bg-gray-200 animate-pulse rounded" />
              <div className="h-4 w-5/6 bg-gray-200 animate-pulse rounded" />
              <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
        <ShieldCheck className="w-20 h-20 text-warm-300" />
        <div>
          <h1 className="text-2xl font-bold text-warm-900 mb-2 font-display">No Report Found</h1>
          <p className="text-warm-500 mb-2">Complete a home assessment to generate your personalized report.</p>
          {loadError && <p className="text-sm text-amber-700 mb-4">{loadError}</p>}
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
    score >= 80 ? "Good" : score >= 60 ? "Needs Improvement" : "Action Needed — Let's Fix This";
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
    { id: "dashboard", label: "Family Dashboard" },
    { id: "rooms", label: "Room Findings" },
    { id: "shopping", label: "Shopping List" },
    { id: "contractor", label: "Contractor Scope" },
    { id: "action", label: "Action Plan" },
    { id: "services", label: "Care Network" },
    { id: "care", label: "Care Notes" },
    { id: "prevention", label: "Prevention Summary" },
    { id: "premium", label: "Premium Services" },
  ];

  return (
    <div className="min-h-screen bg-warm-50 px-4 sm:px-6 lg:px-8 py-8" ref={printRef}>
      <div className="max-w-5xl mx-auto">
        <ReportHeader
          report={report}
          subjectName={subjectName}
          shareUrl={shareUrl}
          copied={copied}
          loadError={loadError}
          onShare={handleShare}
          onPrint={handlePrint}
          onDownload={handleDownload}
          onOpenPreventionExport={handleOpenPreventionExport}
        />

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

        {report.independenceRiskScore && (
          <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-bold text-warm-900">Independence Risk Score</h2>
                <p className="text-sm text-warm-500">Practical risk support for aging at home and family peace of mind.</p>
              </div>
              <span className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${riskClass(report.independenceRiskScore.overallIndependenceRisk)}`}>
                {riskLabel[report.independenceRiskScore.overallIndependenceRisk]} overall
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {report.independenceRiskScore.explanationBullets.slice(0, 4).map((bullet) => (
                <p key={bullet} className="text-sm text-warm-600 bg-warm-50 border border-warm-200 rounded-xl p-3">{bullet}</p>
              ))}
            </div>
          </div>
        )}

        {/* Opening narrative */}
        {obs.length > 0 && (
          <div className="border-l-4 border-brand-400 rounded-r-xl bg-warm-50 p-5 mb-6 animate-fade-in">
            <p className="text-sm text-warm-700 leading-relaxed">
              <span className="font-semibold text-warm-900">
                You completed the walkthrough of {subjectName}'s home.
              </span>{" "}
              {obs.length} area{obs.length !== 1 ? "s" : ""} came up for review
              {highObs.length > 0
                ? `, including ${highObs.length} worth addressing soon`
                : ""}
              .{" "}
              {score >= 80
                ? "The home looks good overall — these fixes will make it even safer."
                : score >= 60
                  ? "There are a few things worth addressing. Most are straightforward fixes."
                  : "Some important things came up. This report gives you a clear path forward."}
              {" "}Here's what we found, room by room.
            </p>
          </div>
        )}

        {/* Tabs */}
        <ReportTabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

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

          {/* Family Dashboard */}
          {activeTab === "dashboard" && (
            <FamilyDashboardTab
              report={report}
              onStatusChange={handlePlanStatusChange}
              onActionUpdate={handlePlanActionUpdate}
              onEvidenceAdded={handleEvidenceAdded}
            />
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
          {activeTab === "shopping" && (
            <ShoppingList
              observations={obs}
              sessionId={report.sessionId}
              reportId={report.sessionId}
            />
          )}

          {/* Contractor scope */}
          {activeTab === "contractor" && (
            <ContractorScope observations={obs} sessionId={report.sessionId} />
          )}

          {/* Action plan */}
          {activeTab === "action" && (
            <div className="space-y-5">
              {report.independencePlan && report.independencePlan.length > 0 && (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-warm-900 mb-1 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-brand-600" />
                    Independence Plan
                  </h3>
                  <p className="text-sm text-warm-500 mb-4">
                    Create a plan your family, caregiver, contractor, clinician, or care coordinator can act on.
                  </p>
                  <div className="space-y-5">
                    {(["immediate", "this_week", "this_month", "monitor"] as const).map((priority) => {
                      const items = report.independencePlan?.filter((item) => item.priority === priority) ?? [];
                      if (items.length === 0) return null;
                      return (
                        <section key={priority}>
                          <h4 className="text-sm font-semibold text-warm-700 mb-2">{priority.replace("_", " ")}</h4>
                          <div className="grid lg:grid-cols-2 gap-3">
                            {items.map((item) => (
                              <PlanItemCard
                                key={item.id}
                                item={item}
                                sessionId={report.sessionId}
                                onStatusChange={handlePlanStatusChange}
                                onActionUpdate={handlePlanActionUpdate}
                                onEvidenceAdded={handleEvidenceAdded}
                              />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}

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

          {/* Service requests */}
          {activeTab === "services" && (
            <ServiceRequestsPanel
              sessionId={report.sessionId}
              onScrollToContractor={() => {
                setActiveTab("contractor");
                setTimeout(() => {
                  document.getElementById("contractor-lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 0);
              }}
            />
          )}

          {/* Care notes */}
          {activeTab === "care" && (
            <CareNotesPanel sessionId={report.sessionId} />
          )}

          {/* Prevention summary */}
          {activeTab === "prevention" && (
            <div className="space-y-4">
              {report.memorySupportChecklist?.show && (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-warm-900 mb-2 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-brand-600" />
                    {report.memorySupportChecklist.title}
                  </h3>
                  <p className="text-sm text-warm-600 mb-4">{report.memorySupportChecklist.education}</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-warm-400 mb-2">SIGNS TO DISCUSS</p>
                      <ul className="space-y-2">
                        {report.memorySupportChecklist.checklistItems.map((item) => (
                          <li key={item} className="text-sm text-warm-700 flex gap-2">
                            <CheckCircle className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-3">
                      {[...report.memorySupportChecklist.routineSuggestions, ...report.memorySupportChecklist.familyCommunicationTips].slice(0, 5).map((item) => (
                        <p key={item} className="text-sm text-warm-700 bg-warm-50 border border-warm-200 rounded-xl p-3">{item}</p>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-warm-500 mt-4">{report.memorySupportChecklist.disclaimer}</p>
                </div>
              )}

              {report.preventionSummary ? (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-warm-900 mb-2 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand-600" />
                    Care Coordinator / Insurer Summary
                  </h3>
                  <p className="text-sm text-warm-500 mb-4">For sharing with a care coordinator, insurer, home care agency, contractor, or service provider.</p>
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-warm-400 mb-2">PROFILE</p>
                      <p className="text-sm text-warm-700 bg-warm-50 border border-warm-200 rounded-xl p-3">{report.preventionSummary.seniorProfileSummary}</p>
                      <p className="text-xs font-semibold text-warm-400 mt-4 mb-2">SERVICE CATEGORIES</p>
                      <div className="flex flex-wrap gap-2">
                        {report.preventionSummary.estimatedServiceCategoriesNeeded.map((item) => (
                          <span key={item} className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold">
                            {item.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-warm-400 mb-2">TOP INTERVENTIONS</p>
                      <ul className="space-y-2">
                        {report.preventionSummary.topRecommendedInterventions.slice(0, 6).map((item) => (
                          <li key={item} className="text-sm text-warm-700 flex gap-2">
                            <HeartHandshake className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-xs text-warm-500 mt-4">{report.preventionSummary.disclaimer}</p>
                </div>
              ) : (
                <div className="bg-white border border-warm-200 rounded-2xl p-6 shadow-sm text-sm text-warm-500">
                  Prevention Summary will appear on new reports.
                </div>
              )}
            </div>
          )}

          {/* Premium */}
          {activeTab === "premium" && (
            <PremiumSection
              onScrollToContractor={() => {
                setActiveTab("contractor");
                setTimeout(() => {
                  document.getElementById("contractor-lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 0);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
