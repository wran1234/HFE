import { SeniorProfile, UserProfile } from "./types";

const PROFILE_KEY = "hfe_profile";
const REFERRAL_KEY = "hfe_referral_context";

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

export function saveReferralContext(referral: { referralId: string; referralCode: string; pilotCohortId?: string; seniorName?: string }): void {
  sessionStorage.setItem(REFERRAL_KEY, JSON.stringify(referral));
}

export function loadReferralContext(): { referralId: string; referralCode: string; pilotCohortId?: string; seniorName?: string } | null {
  try {
    const raw = sessionStorage.getItem(REFERRAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function buildSeniorProfile(profile: Partial<UserProfile>): SeniorProfile {
  const age = Number(profile.age ?? 0);
  const medicationCount = Number(profile.medicationCount ?? 0);
  const fallCount = Number(profile.fallHistoryCount ?? 0);
  return {
    seniorName: profile.subjectName,
    relationshipToUser: profile.assessmentFor === "family" ? "adult_child_or_family" : "self",
    ageRange: age >= 85 ? "85_plus" : age >= 75 ? "75_84" : age >= 65 ? "65_74" : age > 0 ? "under_65" : "unknown",
    livingArrangement: profile.livesAlone ? "alone" : "with_family",
    mobilityLevel:
      profile.mobilityLevel === "wheelchair"
        ? "wheelchair"
        : profile.mobilityLevel === "walker" || profile.mobilityLevel === "cane"
        ? "cane_walker"
        : profile.mobilityLevel === "independent"
        ? "independent"
        : "unknown",
    priorFalls: fallCount >= 2 ? "multiple" : fallCount === 1 ? "one" : "none",
    chronicConditions: profile.seniorProfile?.chronicConditions ?? [],
    medicationComplexity: medicationCount >= 6 ? "high" : medicationCount >= 3 ? "medium" : "low",
    memoryConcerns: profile.seniorProfile?.memoryConcerns ?? "none",
    visionConcerns: profile.visionImpaired,
    hearingConcerns: profile.seniorProfile?.hearingConcerns,
    emergencyContactName: profile.seniorProfile?.emergencyContactName,
    emergencyContactPhone: profile.seniorProfile?.emergencyContactPhone,
    primaryCaregiver: profile.seniorProfile?.primaryCaregiver,
  };
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
