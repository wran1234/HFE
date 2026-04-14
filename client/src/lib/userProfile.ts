import { UserProfile } from "./types";

const PROFILE_KEY = "hfe_profile";

export function saveProfile(profile: UserProfile): void {
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadProfile(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function clearProfile(): void {
  sessionStorage.removeItem(PROFILE_KEY);
}

export function getRiskLabel(profile: UserProfile): {
  label: string;
  color: string;
  score: number;
} {
  let score = 0;
  if (profile.age >= 80) score += 3;
  else if (profile.age >= 70) score += 2;
  else if (profile.age >= 65) score += 1;

  if (profile.mobilityLevel === "wheelchair") score += 3;
  else if (profile.mobilityLevel === "walker") score += 2;
  else if (profile.mobilityLevel === "cane") score += 1;

  score += Math.min(profile.fallHistoryCount * 2, 6);
  if (profile.visionImpaired) score += 1;
  if (profile.livesAlone) score += 1;
  if (profile.medicationCount >= 4) score += 1;

  if (score >= 8) return { label: "Very High Risk", color: "text-red-400", score };
  if (score >= 5) return { label: "High Risk", color: "text-orange-400", score };
  if (score >= 3) return { label: "Moderate Risk", color: "text-amber-400", score };
  return { label: "Lower Risk", color: "text-green-400", score };
}
