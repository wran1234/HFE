import { IndependencePlanItem, SeniorProfile, ServiceRequest, SuggestedServiceRequest } from "../domain/types";

const hasExisting = (
  existing: ServiceRequest[],
  suggestion: SuggestedServiceRequest
): boolean =>
  existing.some((request) =>
    request.recommendationActionId
      ? request.recommendationActionId === suggestion.recommendationActionId && request.serviceType === suggestion.serviceType
      : request.serviceType === suggestion.serviceType && request.title === suggestion.title
  );

const suggestionFromPlanItem = (item: IndependencePlanItem): SuggestedServiceRequest | null => {
  const text = `${item.section} ${item.title} ${item.recommendedAction}`.toLowerCase();
  if (
    item.owner === "contractor" ||
    text.includes("grab bar") ||
    text.includes("anti-slip") ||
    text.includes("non-slip") ||
    text.includes("lighting") ||
    text.includes("handrail")
  ) {
    return {
      serviceType: "home_modification",
      title: `Home modification request: ${item.title}`,
      description: item.recommendedAction,
      priority: item.priority,
      recommendationActionId: item.id,
      whyThisHelps: "A contractor or home-modification provider can turn this prevention recommendation into a scoped home safety update.",
    };
  }
  if (text.includes("mobility") || text.includes("balance") || text.includes("transfer")) {
    return {
      serviceType: "rehab_evaluation",
      title: `Rehab evaluation request: ${item.title}`,
      description: item.recommendedAction,
      priority: item.priority,
      recommendationActionId: item.id,
      whyThisHelps: "A rehab or mobility evaluation can support safer routines without this tool making medical determinations.",
    };
  }
  if (text.includes("check-in") || text.includes("check in") || text.includes("routine")) {
    return {
      serviceType: "family_checkin",
      title: `Family check-in: ${item.title}`,
      description: item.recommendedAction,
      priority: item.priority,
      recommendationActionId: item.id,
      whyThisHelps: "A predictable family check-in supports aging-at-home coordination and family peace of mind.",
    };
  }
  if (text.includes("memory") || text.includes("cognitive")) {
    return {
      serviceType: "memory_support",
      title: `Memory support: ${item.title}`,
      description: item.recommendedAction,
      priority: item.priority,
      recommendationActionId: item.id,
      whyThisHelps: "Memory support requests help coordinate routines and safety cues without diagnosing a condition.",
    };
  }
  if (item.owner === "clinician" || text.includes("medication")) {
    return {
      serviceType: "clinician_followup",
      title: `Clinician follow-up: ${item.title}`,
      description: item.recommendedAction,
      priority: item.priority,
      recommendationActionId: item.id,
      whyThisHelps: "A clinician follow-up can review wellness or routine concerns with appropriate professional judgment.",
    };
  }
  if (item.owner === "caregiver" || item.owner === "insurer_or_care_coordinator") {
    return {
      serviceType: "caregiver_visit",
      title: `Caregiver support request: ${item.title}`,
      description: item.recommendedAction,
      priority: item.priority,
      recommendationActionId: item.id,
      whyThisHelps: "Caregiver support can help execute practical prevention steps and reduce family coordination load.",
    };
  }
  return null;
};

export function generateServiceRequestSuggestions(input: {
  plan: IndependencePlanItem[];
  profile?: SeniorProfile;
  existingRequests: ServiceRequest[];
}): SuggestedServiceRequest[] {
  const suggestions: SuggestedServiceRequest[] = [];
  for (const item of input.plan) {
    const suggestion = suggestionFromPlanItem(item);
    if (suggestion && !hasExisting(input.existingRequests, suggestion)) suggestions.push(suggestion);
  }

  const urgent = input.plan.some((item) => item.priority === "immediate");
  if (input.profile?.livingArrangement === "alone" && urgent) {
    const smartMonitoring: SuggestedServiceRequest = {
      serviceType: "smart_monitoring",
      title: "Smart monitoring coordination request",
      description: "Discuss a non-invasive monitoring or check-in option for urgent aging-at-home risk support.",
      priority: "this_week",
      whyThisHelps: "This supports timely awareness for families and care coordinators without adding a hardware integration in HFE.",
    };
    const familyCheckin: SuggestedServiceRequest = {
      serviceType: "family_checkin",
      title: "Urgent family check-in schedule",
      description: "Set a short-term check-in rhythm while immediate prevention actions are being completed.",
      priority: "immediate",
      whyThisHelps: "A clear check-in plan helps families notice changes and coordinate next steps.",
    };
    if (!hasExisting(input.existingRequests, smartMonitoring)) suggestions.push(smartMonitoring);
    if (!hasExisting(input.existingRequests, familyCheckin)) suggestions.push(familyCheckin);
  }

  if (["mild", "moderate", "severe"].includes(input.profile?.memoryConcerns ?? "")) {
    const memorySupport: SuggestedServiceRequest = {
      serviceType: "memory_support",
      title: "Memory support coordination request",
      description: "Coordinate supportive routines, home safety cues, and professional follow-up when appropriate.",
      priority: input.profile?.memoryConcerns === "severe" ? "this_week" : "this_month",
      whyThisHelps: "This provides care coordination support without diagnosing memory conditions.",
    };
    const clinicianFollowup: SuggestedServiceRequest = {
      serviceType: "clinician_followup",
      title: "Clinician follow-up for memory/routine concerns",
      description: "Discuss observed memory or routine changes with a qualified clinician when appropriate.",
      priority: input.profile?.memoryConcerns === "severe" ? "this_week" : "this_month",
      whyThisHelps: "Professional evaluation can interpret concerns; HFE remains a non-diagnostic coordination tool.",
    };
    if (!hasExisting(input.existingRequests, memorySupport)) suggestions.push(memorySupport);
    if (!hasExisting(input.existingRequests, clinicianFollowup)) suggestions.push(clinicianFollowup);
  }

  if (input.profile?.medicationComplexity === "high") {
    const medicationFollowup: SuggestedServiceRequest = {
      serviceType: "clinician_followup",
      title: "Medication routine follow-up",
      description: "Discuss medication complexity and daily routine support with a clinician or care coordinator.",
      priority: "this_week",
      whyThisHelps: "Medication complexity can affect daily routines and should be reviewed by appropriate professionals.",
    };
    if (!hasExisting(input.existingRequests, medicationFollowup)) suggestions.push(medicationFollowup);
  }

  return suggestions.slice(0, 12);
}
