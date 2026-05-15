import {
  FinalHazard,
  FamilyDashboard,
  EstimatedPreventionImpact,
  ExportablePreventionSummary,
  IndependencePlanItem,
  IndependenceRiskLevel,
  IndependenceRiskScore,
  MemorySupportChecklist,
  PreventionSummary,
  Recommendation,
  SeniorProfile,
  CareNoteSummary,
  ServiceRequest,
  ConsentState,
  AssessmentReview,
} from "./types";

const NON_MEDICAL_DISCLAIMER =
  "This tool provides risk support and care coordination guidance only. It is not medical advice, a diagnosis, or a substitute for evaluation by qualified professionals.";

const levelFromScore = (score: number): IndependenceRiskLevel => {
  if (score >= 9) return "urgent";
  if (score >= 6) return "high";
  if (score >= 3) return "moderate";
  return "low";
};

const maxLevel = (...levels: IndependenceRiskLevel[]): IndependenceRiskLevel => {
  const order: Record<IndependenceRiskLevel, number> = { low: 0, moderate: 1, high: 2, urgent: 3 };
  return levels.reduce((max, level) => (order[level] > order[max] ? level : max), "low");
};

const priorityForRisk = (risk: IndependenceRiskLevel): IndependencePlanItem["priority"] => {
  if (risk === "urgent") return "immediate";
  if (risk === "high") return "this_week";
  if (risk === "moderate") return "this_month";
  return "monitor";
};

const profileSummary = (profile?: SeniorProfile): string => {
  if (!profile) return "Senior profile has not been completed yet.";
  const name = profile.seniorName || "Parent";
  return `${name}: age range ${profile.ageRange.replace("_", "-")}, living arrangement ${profile.livingArrangement.replace(/_/g, " ")}, mobility ${profile.mobilityLevel.replace(/_/g, " ")}, prior falls ${profile.priorFalls}.`;
};

export const estimatePreventionImpact = (input: {
  section?: string;
  title?: string;
  hazardType?: string;
  owner?: string;
}): EstimatedPreventionImpact => {
  const text = `${input.section ?? ""} ${input.title ?? ""} ${input.hazardType ?? ""}`.toLowerCase();
  if (
    text.includes("grab_bar") ||
    text.includes("grab bar") ||
    text.includes("anti-slip") ||
    text.includes("non-slip") ||
    text.includes("lighting") ||
    text.includes("night")
  ) {
    return "high";
  }
  if (
    text.includes("clutter") ||
    text.includes("rug") ||
    text.includes("cord") ||
    text.includes("emergency") ||
    text.includes("check-in") ||
    text.includes("memory") ||
    input.owner === "caregiver" ||
    input.owner === "insurer_or_care_coordinator"
  ) {
    return "medium";
  }
  return "low";
};

export function buildIndependenceRiskScore(input: {
  profile?: SeniorProfile;
  finalHazards: FinalHazard[];
}): IndependenceRiskScore {
  const { profile, finalHazards } = input;
  const hazards = finalHazards.filter((hazard) => hazard.priority !== "low");
  const unresolvedHazardCount = hazards.length;
  const bathroomStairsLighting = hazards.filter((hazard) =>
    hazard.roomType === "bathroom" ||
    hazard.roomType === "stairs" ||
    hazard.hazardType === "poor_lighting" ||
    hazard.hazardType === "missing_grab_bar" ||
    hazard.hazardType === "unsafe_stairs"
  ).length;

  let fall = Math.min(unresolvedHazardCount, 5) + Math.min(bathroomStairsLighting * 2, 6);
  let daily = Math.min(unresolvedHazardCount, 4);
  let caregiver = 0;
  let cognitive = 0;
  const explanations: string[] = [];

  if (profile?.ageRange === "85_plus") {
    fall += 2;
    daily += 1;
    explanations.push("Age 85+ increases the need for prevention planning and routine support.");
  } else if (profile?.ageRange === "75_84") {
    fall += 1;
  }

  if (profile?.livingArrangement === "alone") {
    daily += 2;
    caregiver += 2;
    explanations.push("Living alone makes clear check-ins and emergency plans more important.");
  }

  if (profile?.priorFalls === "multiple") {
    fall += 4;
    caregiver += 1;
    explanations.push("Multiple prior falls call for prompt fall-prevention support.");
  } else if (profile?.priorFalls === "one") {
    fall += 2;
  }

  if (profile?.mobilityLevel === "cane_walker") fall += 2;
  if (profile?.mobilityLevel === "needs_help") {
    fall += 3;
    daily += 2;
    caregiver += 2;
  }
  if (profile?.mobilityLevel === "wheelchair" || profile?.mobilityLevel === "mostly_bedbound") {
    daily += 3;
    caregiver += 3;
  }

  if (profile?.medicationComplexity === "high") {
    daily += 2;
    caregiver += 1;
    explanations.push("High medication complexity is worth reviewing with a clinician or care coordinator.");
  } else if (profile?.medicationComplexity === "medium") {
    daily += 1;
  }

  if (profile?.memoryConcerns === "severe") {
    cognitive += 5;
    daily += 2;
    caregiver += 3;
    explanations.push("Severe memory concerns may require professional evaluation and a stronger supervision plan.");
  } else if (profile?.memoryConcerns === "moderate") {
    cognitive += 3;
    daily += 1;
    caregiver += 2;
  } else if (profile?.memoryConcerns === "mild") {
    cognitive += 1;
  }

  if (profile?.visionConcerns) fall += 1;
  if (bathroomStairsLighting > 0) {
    explanations.push("Bathroom, stairs, and lighting findings are major drivers of preventable home risk.");
  }
  if (unresolvedHazardCount >= 5) {
    explanations.push("Several unresolved home safety items increase overall independence risk.");
  }
  if (explanations.length === 0) {
    explanations.push("Current profile and home findings suggest routine monitoring and practical prevention steps.");
  }

  const fallRisk = levelFromScore(fall);
  const dailyLivingRisk = levelFromScore(daily);
  const caregiverBurdenRisk = levelFromScore(caregiver);
  const cognitiveSupportRisk = levelFromScore(cognitive);
  const overallIndependenceRisk = maxLevel(fallRisk, dailyLivingRisk, caregiverBurdenRisk, cognitiveSupportRisk);

  return {
    overallIndependenceRisk,
    fallRisk,
    dailyLivingRisk,
    caregiverBurdenRisk,
    cognitiveSupportRisk,
    explanationBullets: explanations,
    nonMedicalDisclaimer: NON_MEDICAL_DISCLAIMER,
  };
}

export function buildIndependencePlan(input: {
  profile?: SeniorProfile;
  finalHazards: FinalHazard[];
  recommendations: Recommendation[];
  riskScore: IndependenceRiskScore;
}): IndependencePlanItem[] {
  const { profile, finalHazards, recommendations, riskScore } = input;
  const recByHazard = new Map(recommendations.map((rec) => [rec.finalHazardId, rec]));
  const homeSafetyItems = finalHazards.slice(0, 8).map((hazard): IndependencePlanItem => {
    const rec = recByHazard.get(hazard.id);
    const contractorOwner = ["missing_handrail", "unsafe_stairs", "outdoor_step_risk", "narrow_walkway"].includes(hazard.hazardType);
    return {
      id: rec?.id ?? hazard.id,
      section: hazard.roomType === "bathroom" || hazard.hazardType === "poor_lighting" ? "Bathroom & Nighttime Safety" : "Home Safety",
      title: rec?.title ?? "Address home safety finding",
      whyItMatters: hazard.reason || "This issue can make daily movement at home harder or less predictable.",
      recommendedAction: rec?.description ?? "Review the finding and choose a practical fix.",
      priority: hazard.priority === "critical" ? "immediate" : hazard.priority === "high" ? "this_week" : hazard.priority === "medium" ? "this_month" : "monitor",
      owner: contractorOwner ? "contractor" : "family",
      status: rec?.actionStatus ?? "pending",
      dueDate: rec?.dueDate,
      completedAt: rec?.completedAt,
      skippedReason: rec?.skippedReason,
      evidenceCount: rec?.evidenceCount ?? 0,
      estimatedPreventionImpact: rec?.estimatedPreventionImpact ?? estimatePreventionImpact({
        section: hazard.roomType,
        title: rec?.title,
        hazardType: hazard.hazardType,
        owner: contractorOwner ? "contractor" : "family",
      }),
      relatedRoom: hazard.roomType,
      relatedObservationIds: [hazard.id],
    };
  });

  const supportive: IndependencePlanItem[] = [
    {
      id: "mobility-fall-prevention",
      section: "Mobility & Fall Prevention",
      title: "Review walking support and transfer routines",
      whyItMatters: "Small changes to walking paths and transfer routines can reduce avoidable risk.",
      recommendedAction: "Discuss mobility support with a clinician, therapist, or care coordinator if balance, transfers, or prior falls are concerns.",
      priority: priorityForRisk(riskScore.fallRisk),
      owner: "clinician",
      status: "pending",
      evidenceCount: 0,
      estimatedPreventionImpact: estimatePreventionImpact({ title: "mobility fall prevention", owner: "clinician" }),
    },
    {
      id: "medication-daily-routine",
      section: "Medication & Daily Routine",
      title: "Create a simple daily routine check",
      whyItMatters: "Consistent routines help families spot missed medications, meals, hydration, or appointments.",
      recommendedAction: "Use a shared checklist and discuss medication complexity with a clinician when changes or mistakes are noticed.",
      priority: profile?.medicationComplexity === "high" ? "this_week" : "this_month",
      owner: "family",
      status: "pending",
      evidenceCount: 0,
      estimatedPreventionImpact: "medium",
    },
    {
      id: "memory-support",
      section: "Cognitive / Memory Support",
      title: "Set up memory-support cues",
      whyItMatters: "Labels, calendars, and routine reminders can support independence without making the home feel clinical.",
      recommendedAction: "Add gentle cues for medications, cooking, appointments, and exits. Consider professional evaluation if changes are increasing.",
      priority: profile?.memoryConcerns === "severe" || profile?.memoryConcerns === "moderate" ? "this_week" : "monitor",
      owner: "family",
      status: "pending",
      evidenceCount: 0,
      estimatedPreventionImpact: "medium",
    },
    {
      id: "family-checkins",
      section: "Social & Family Check-ins",
      title: "Agree on a check-in rhythm",
      whyItMatters: "Predictable check-ins build trust and help changes get noticed early.",
      recommendedAction: "Choose who checks in, how often, and what to ask about: meals, medications, mood, mobility, and new home hazards.",
      priority: riskScore.overallIndependenceRisk === "urgent" ? "immediate" : "this_week",
      owner: "family",
      status: "pending",
      evidenceCount: 0,
      estimatedPreventionImpact: "medium",
    },
    {
      id: "emergency-preparedness",
      section: "Emergency Preparedness",
      title: "Confirm emergency plan",
      whyItMatters: "A clear plan reduces confusion when something urgent happens.",
      recommendedAction: "Confirm emergency contacts, access instructions, medication list location, and when to call local emergency or medical services.",
      priority: riskScore.overallIndependenceRisk === "urgent" ? "immediate" : "this_week",
      owner: "family",
      status: "pending",
      evidenceCount: 0,
      estimatedPreventionImpact: "medium",
    },
    {
      id: "caregiver-professional-support",
      section: "Caregiver / Professional Support",
      title: "Decide where professional support would help",
      whyItMatters: "Professional support can improve caregiver productivity and reduce family stress.",
      recommendedAction: "Consider a care coordinator, home care visit, contractor, rehab evaluation, or clinician follow-up based on the top risks.",
      priority: priorityForRisk(maxLevel(riskScore.caregiverBurdenRisk, riskScore.dailyLivingRisk)),
      owner: "insurer_or_care_coordinator",
      status: "pending",
      evidenceCount: 0,
      estimatedPreventionImpact: "medium",
    },
  ];

  return [...homeSafetyItems, ...supportive];
}

export function buildExportablePreventionSummary(input: {
  sessionId: string;
  generatedAt: string;
  profile?: SeniorProfile;
  riskScore: IndependenceRiskScore;
  plan: IndependencePlanItem[];
  careNotesSummary: CareNoteSummary;
  serviceRequests?: ServiceRequest[];
  consent?: ConsentState;
  assessmentReview?: AssessmentReview;
}): ExportablePreventionSummary {
  const completedActionCount = input.plan.filter((item) => item.status === "completed" || item.status === "skipped").length;
  const pendingActionCount = input.plan.length - completedActionCount;
  const sorted = [...input.plan].sort((a, b) => {
    const order = { immediate: 0, this_week: 1, this_month: 2, monitor: 3 };
    return order[a.priority] - order[b.priority];
  });
  return {
    sessionId: input.sessionId,
    generatedAt: input.generatedAt,
    seniorProfileSummary: profileSummary(input.profile),
    risks: {
      overallIndependenceRisk: input.riskScore.overallIndependenceRisk,
      fallRisk: input.riskScore.fallRisk,
      dailyLivingRisk: input.riskScore.dailyLivingRisk,
      cognitiveSupportRisk: input.riskScore.cognitiveSupportRisk,
      caregiverBurdenRisk: input.riskScore.caregiverBurdenRisk,
    },
    topRiskDrivers: input.riskScore.explanationBullets.slice(0, 5),
    topRecommendedActions: sorted.slice(0, 5),
    completedActionCount,
    pendingActionCount,
    careNotesSummary: input.careNotesSummary,
    contractorHomeModificationNeeds: sorted
      .filter((item) => item.owner === "contractor")
      .slice(0, 5)
      .map((item) => item.title),
    caregiverProfessionalSupportNeeds: sorted
      .filter((item) => item.owner === "caregiver" || item.owner === "clinician" || item.owner === "insurer_or_care_coordinator")
      .slice(0, 5)
      .map((item) => item.title),
    recommendedServiceCategories: Array.from(new Set(input.serviceRequests?.map((request) => request.serviceType) ?? [])),
    activeServiceRequests: (input.serviceRequests ?? []).filter((request) => !["completed", "cancelled"].includes(request.status)),
    scheduledOrCompletedServiceRequests: (input.serviceRequests ?? []).filter((request) => request.status === "scheduled" || request.status === "completed"),
    consent: input.consent,
    assessmentReview: input.assessmentReview,
    nonMedicalDisclaimer: NON_MEDICAL_DISCLAIMER,
    consentPrivacyNote: "Share this summary only with permission from the parent/senior or authorized decision-maker. Avoid including private home images or personal care details unless sharing is appropriate.",
  };
}

export function buildMemorySupportChecklist(profile?: SeniorProfile): MemorySupportChecklist {
  const show = ["mild", "moderate", "severe"].includes(profile?.memoryConcerns ?? "");
  return {
    show,
    title: "Memory & Cognitive Support",
    education: "These signs may be worth discussing with a clinician, especially when they are new, increasing, or affecting safety at home.",
    checklistItems: [
      "Repeated confusion or getting lost",
      "Medication mistakes",
      "Unsafe cooking",
      "Wandering risk",
      "Missed appointments",
      "Increased agitation",
      "Caregiver burnout",
    ],
    routineSuggestions: [
      "Use a visible daily calendar and simple medication routine.",
      "Keep frequently used items in consistent, labeled places.",
      "Schedule check-ins around meals, bedtime, and appointments.",
    ],
    homeSafetySuggestions: [
      "Reduce stove and appliance risks with clear routines and supervision when needed.",
      "Improve nighttime lighting between bedroom and bathroom.",
      "Keep exits, stairs, and outdoor steps easy to see and free of clutter.",
    ],
    familyCommunicationTips: [
      "Use calm, specific observations instead of labels.",
      "Agree on who follows up when a concern is noticed.",
      "Share care notes with clinicians or care coordinators when appropriate.",
    ],
    disclaimer: "This tool is not a diagnostic assessment and does not diagnose dementia or any medical condition.",
  };
}

export function buildPreventionSummary(input: {
  profile?: SeniorProfile;
  riskScore: IndependenceRiskScore;
  plan: IndependencePlanItem[];
}): PreventionSummary {
  const topPlan = input.plan
    .filter((item) => item.priority === "immediate" || item.priority === "this_week")
    .slice(0, 6);
  const categories = new Set<PreventionSummary["estimatedServiceCategoriesNeeded"][number]>(["family_checkin"]);
  if (topPlan.some((item) => item.owner === "contractor")) categories.add("home_modification");
  if (topPlan.some((item) => item.owner === "caregiver")) categories.add("caregiver_visit");
  if (topPlan.some((item) => item.owner === "clinician")) categories.add("clinician_followup");
  if (input.riskScore.fallRisk === "high" || input.riskScore.fallRisk === "urgent") categories.add("rehab_evaluation");
  if (input.riskScore.overallIndependenceRisk === "high" || input.riskScore.overallIndependenceRisk === "urgent") categories.add("smart_monitoring");

  return {
    audience: ["insurer", "care_coordinator", "home_care_agency", "contractor", "family"],
    seniorProfileSummary: profileSummary(input.profile),
    topRiskDrivers: input.riskScore.explanationBullets.slice(0, 5),
    topRecommendedInterventions: topPlan.map((item) => item.title),
    interventionPriorityList: topPlan.map((item) => `${item.priority.replace("_", " ")}: ${item.recommendedAction}`),
    estimatedServiceCategoriesNeeded: Array.from(categories),
    beforeAfterSupport: {
      before: "Completion evidence and baseline photos can be attached in a future pilot.",
      after: "Completed action status and follow-up notes can be compared after interventions.",
    },
    disclaimer: NON_MEDICAL_DISCLAIMER,
  };
}

export function buildFamilyDashboard(input: {
  riskScore: IndependenceRiskScore;
  plan: IndependencePlanItem[];
  finalHazards: FinalHazard[];
  profile?: SeniorProfile;
}): FamilyDashboard {
  const topUrgentActions = [...input.plan]
    .sort((a, b) => {
      const order = { immediate: 0, this_week: 1, this_month: 2, monitor: 3 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 3);
  const roomRiskOverview = Array.from(
    input.finalHazards.reduce((map, hazard) => {
      const current = map.get(hazard.roomType) ?? { high: 0, count: 0 };
      current.count += 1;
      if (hazard.priority === "critical" || hazard.priority === "high") current.high += 1;
      map.set(hazard.roomType, current);
      return map;
    }, new Map<FinalHazard["roomType"], { high: number; count: number }>())
  ).map(([roomType, counts]) => ({
    roomType,
    risk: counts.high > 1 ? "high" as const : counts.high === 1 ? "moderate" as const : "low" as const,
    openIssueCount: counts.count,
  }));

  const completedActionCount = input.plan.filter((item) => item.status === "completed" || item.status === "skipped").length;
  const pendingActionCount = input.plan.length - completedActionCount;
  return {
    overallIndependenceRisk: input.riskScore.overallIndependenceRisk,
    topUrgentActions,
    completedActionCount,
    pendingActionCount,
    roomRiskOverview,
    nextRecommendedFamilyCheckIn: input.riskScore.overallIndependenceRisk === "urgent" ? "Today" : input.riskScore.overallIndependenceRisk === "high" ? "Within 48 hours" : "Within the next week",
    emergencyPlanSummary: input.profile?.emergencyContactName
      ? `Emergency contact on file: ${input.profile.emergencyContactName}. Call local emergency or medical services if there is immediate danger.`
      : "Add an emergency contact and call local emergency or medical services if there is immediate danger.",
    caregiverSupportSuggestions: [
      "Share the prevention plan with family members or a care coordinator.",
      "Use care notes after visits to track changes without over-medicalizing normal aging.",
      "Bring concerning patterns to a clinician instead of relying on this tool for medical decisions.",
    ],
    dignityFocusedCopy: "The goal is to help your parent stay safe and independent at home with practical changes your family, caregiver, or service provider can act on.",
  };
}
