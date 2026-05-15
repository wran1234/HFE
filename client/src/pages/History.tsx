import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReports, listSessions } from "../lib/apiClient";

interface SessionItem {
  id: string;
  createdAt: string;
  startedAt: string;
  status: string;
  city?: string;
  currentRoom?: string;
  overallRiskLevel?: string;
  reportAvailable: boolean;
}

interface ReportItem {
  sessionId: string;
  createdAt: string;
  riskLevel?: string;
  hazardCount?: number;
  roomCount?: number;
  summary?: string;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null);
  const [reportsCursor, setReportsCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listSessions({ limit: 20 }), listReports({ limit: 20 })])
      .then(([sessionResponse, reportResponse]) => {
        setSessions(sessionResponse.sessions);
        setReports(reportResponse.reports);
        setSessionsCursor(sessionResponse.nextCursor);
        setReportsCursor(reportResponse.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load history.");
      })
      .finally(() => setLoading(false));
  }, []);

  function loadMoreSessions() {
    if (!sessionsCursor || loadingMoreSessions) return;
    setLoadingMoreSessions(true);
    listSessions({ limit: 20, cursor: sessionsCursor })
      .then((res) => {
        setSessions((prev) => [...prev, ...res.sessions]);
        setSessionsCursor(res.nextCursor);
      })
      .catch(() => setError("Failed to load more sessions. Please try again."))
      .finally(() => setLoadingMoreSessions(false));
  }

  function loadMoreReports() {
    if (!reportsCursor || loadingMoreReports) return;
    setLoadingMoreReports(true);
    listReports({ limit: 20, cursor: reportsCursor })
      .then((res) => {
        setReports((prev) => [...prev, ...res.reports]);
        setReportsCursor(res.nextCursor);
      })
      .catch(() => setError("Failed to load more reports. Please try again."))
      .finally(() => setLoadingMoreReports(false));
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 animate-pulse rounded-lg" />
          <div className="h-9 w-40 bg-gray-200 animate-pulse rounded-xl" />
        </div>

        {/* Sessions card skeleton */}
        <div className="bg-white border border-warm-200 rounded-2xl p-6">
          <div className="h-5 w-24 bg-gray-200 animate-pulse rounded mb-4" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 bg-warm-50 rounded-lg border border-warm-200 flex items-center justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-32 bg-gray-200 animate-pulse rounded" />
                  <div className="h-3 w-56 bg-gray-200 animate-pulse rounded" />
                </div>
                <div className="h-4 w-20 bg-gray-200 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Reports card skeleton */}
        <div className="bg-white border border-warm-200 rounded-2xl p-6">
          <div className="h-5 w-20 bg-gray-200 animate-pulse rounded mb-4" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3 bg-warm-50 rounded-lg border border-warm-200 flex items-center justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-28 bg-gray-200 animate-pulse rounded" />
                  <div className="h-3 w-44 bg-gray-200 animate-pulse rounded" />
                </div>
                <div className="h-4 w-12 bg-gray-200 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600 text-sm">Failed to load session history. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-warm-900 font-display">Inspection History</h1>
        <Link to="/onboarding" className="btn-primary">
          Start New Assessment
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white border border-warm-200 rounded-2xl p-6 text-warm-500">
          No inspections yet. Start your first walkthrough to generate a report.
        </div>
      ) : (
        <div className="bg-white border border-warm-200 rounded-2xl p-6">
          <h2 className="text-lg text-warm-900 font-semibold mb-3">Sessions</h2>
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="p-3 bg-warm-50 rounded-lg border border-warm-200 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-warm-900 font-medium">Session {session.id.slice(-8)}</p>
                  <p className="text-xs text-warm-500">
                    {new Date(session.createdAt).toLocaleString()} · {session.status}
                    {session.city ? ` · ${session.city}` : ""}
                    {session.overallRiskLevel ? ` · risk ${session.overallRiskLevel}` : ""}
                  </p>
                </div>
                {session.reportAvailable ? (
                  <Link to={`/report/${encodeURIComponent(session.id)}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                    Open report
                  </Link>
                ) : (
                  <span className="text-xs text-warm-400">No report yet</span>
                )}
              </div>
            ))}
          </div>
          {sessionsCursor && (
            <div className="mt-3 text-center">
              <button
                onClick={loadMoreSessions}
                disabled={loadingMoreSessions}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
              >
                {loadingMoreSessions ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-warm-200 rounded-2xl p-6">
        <h2 className="text-lg text-warm-900 font-semibold mb-3">Reports</h2>
        {reports.length === 0 ? (
          <p className="text-warm-500 text-sm">No finalized reports yet.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div key={`${report.sessionId}-${report.createdAt}`} className="p-3 bg-warm-50 rounded-lg border border-warm-200 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-warm-900 font-medium">Report {report.sessionId.slice(-8)}</p>
                  <p className="text-xs text-warm-500">
                    {new Date(report.createdAt).toLocaleString()}
                    {report.riskLevel ? ` · risk ${report.riskLevel}` : ""}
                    {report.hazardCount !== undefined ? ` · ${report.hazardCount} hazards` : ""}
                  </p>
                </div>
                <Link to={`/report/${encodeURIComponent(report.sessionId)}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
        {reportsCursor && (
          <div className="mt-3 text-center">
            <button
              onClick={loadMoreReports}
              disabled={loadingMoreReports}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
            >
              {loadingMoreReports ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
