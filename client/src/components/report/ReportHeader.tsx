import {
  ShieldCheck,
  Calendar,
  User,
  Share2,
  Check,
  Printer,
  Download,
  FileText,
  RotateCcw,
  Copy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AssessmentReport } from "../../lib/types";

interface ReportHeaderProps {
  report: AssessmentReport;
  subjectName: string;
  shareUrl: string | null;
  copied: boolean;
  loadError: string | null;
  onShare: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onOpenPreventionExport: () => void;
}

const btnLight =
  "inline-flex items-center gap-1.5 py-2 px-3 text-sm bg-white border border-warm-200 text-warm-700 hover:bg-warm-50 rounded-xl font-medium transition-colors";

export default function ReportHeader({
  report,
  subjectName,
  shareUrl,
  copied,
  loadError,
  onShare,
  onPrint,
  onDownload,
  onOpenPreventionExport,
}: ReportHeaderProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-brand-600" />
            <h1 className="text-2xl font-bold text-warm-900 font-display">
              Parent Safety &amp; Independence Report
            </h1>
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
          <button onClick={onShare} className={btnLight}>
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Share2 className="w-4 h-4" />
            )}
            {copied ? "Link Copied!" : "Share Report"}
          </button>
          <button onClick={onPrint} className={btnLight}>
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>
          <button onClick={onDownload} className={btnLight}>
            <Download className="w-4 h-4" />
            Download
          </button>
          <button onClick={onOpenPreventionExport} className={btnLight}>
            <FileText className="w-4 h-4" />
            Share / Export Prevention Summary
          </button>
          <button
            onClick={() => navigate("/onboarding")}
            className="btn-primary py-2 px-3 text-sm gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            New Assessment
          </button>
        </div>
      </div>

      {/* Share URL banner */}
      {shareUrl && (
        <div className="flex items-center gap-3 p-3.5 bg-brand-50 border border-brand-200 rounded-xl mb-5 animate-fade-in no-print">
          <Copy className="w-4 h-4 text-brand-600 shrink-0" />
          <p className="text-xs text-warm-700 truncate flex-1 font-mono">{shareUrl}</p>
          <span className="text-xs text-green-600 shrink-0">Copied to clipboard</span>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-sm text-amber-800 no-print">
          {loadError}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-white border border-warm-200 rounded-xl p-3 mb-5 text-xs text-warm-600">
        Your report is powered by AI analysis and is intended as a practical guide for families
        — not a medical diagnosis or substitute for a professional assessment. If you assess
        someone else's home, make sure they know and agree. For emergencies, call 911.
        <span className="block mt-2 font-semibold text-warm-800">
          {report.assessmentReview?.reviewStatus === "reviewed"
            ? "Reviewed by care coordinator"
            : report.assessmentReview?.reviewStatus === "needs_followup"
              ? "Needs follow-up review by a care coordinator"
              : report.assessmentReview?.reviewStatus === "rejected"
                ? "Assessment review rejected; verify before sharing"
                : "AI-powered analysis — not yet reviewed by a care coordinator."}
        </span>
      </div>
    </>
  );
}
