import { AssessmentReport } from "./types";

const REPORT_KEY = "hfe_report";
const SNAPSHOTS_KEY = "hfe_snapshots";

export function saveReport(report: AssessmentReport): void {
  // Separate snapshots from the main report to avoid sessionStorage limits
  const snapshots = report.observations
    .filter((o) => o.snapshotBase64)
    .map((o) => ({ id: o.id, base64: o.snapshotBase64! }));

  const reportWithoutSnapshots = {
    ...report,
    observations: report.observations.map((o) => ({
      ...o,
      snapshotBase64: undefined,
    })),
  };

  sessionStorage.setItem(REPORT_KEY, JSON.stringify(reportWithoutSnapshots));
  sessionStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function loadReport(): AssessmentReport | null {
  try {
    const raw = sessionStorage.getItem(REPORT_KEY);
    if (!raw) return null;
    const report = JSON.parse(raw) as AssessmentReport;

    // Re-attach snapshots
    const snapshotsRaw = sessionStorage.getItem(SNAPSHOTS_KEY);
    if (snapshotsRaw) {
      const snaps = JSON.parse(snapshotsRaw) as { id: string; base64: string }[];
      const snapMap = new Map(snaps.map((s) => [s.id, s.base64]));
      report.observations = report.observations.map((o) => ({
        ...o,
        snapshotBase64: snapMap.get(o.id),
      }));
    }

    return report;
  } catch {
    return null;
  }
}

export function encodeReportToHash(report: AssessmentReport): string {
  // Strip base64 snapshots to keep URL manageable
  const slim = {
    ...report,
    observations: report.observations.map((o) => ({
      ...o,
      snapshotBase64: undefined,
    })),
    snapshots: [],
  };
  try {
    return btoa(encodeURIComponent(JSON.stringify(slim)));
  } catch {
    return "";
  }
}

export function decodeReportFromHash(hash: string): AssessmentReport | null {
  try {
    return JSON.parse(decodeURIComponent(atob(hash))) as AssessmentReport;
  } catch {
    return null;
  }
}

export function getShareableUrl(report: AssessmentReport): string {
  const encoded = encodeReportToHash(report);
  const url = new URL(window.location.href);
  url.pathname = "/report";
  url.hash = `share=${encoded}`;
  return url.toString();
}
