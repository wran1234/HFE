import { RecommendationPriority, HazardType, SeverityLevel } from "../domain/enums";
import { FinalHazard, Recommendation } from "../domain/types";

interface RecommendationTemplate {
  fixType: string;
  title: string;
  description: string;
  estimatedCostMin: number;
  estimatedCostMax: number;
  materials: string[];
  installationComplexity: "easy" | "moderate" | "complex";
}

const templates: Record<HazardType, RecommendationTemplate> = {
  poor_lighting: {
    fixType: "lighting_upgrade",
    title: "Install motion-sensor night lights",
    description: "Add night lighting along travel routes, especially bedroom-to-bathroom paths.",
    estimatedCostMin: 20,
    estimatedCostMax: 120,
    materials: ["motion sensor night lights", "LED bulbs"],
    installationComplexity: "easy",
  },
  missing_handrail: {
    fixType: "handrail_installation",
    title: "Install secure handrail",
    description: "Install code-compliant handrails on exposed steps and transitions.",
    estimatedCostMin: 120,
    estimatedCostMax: 600,
    materials: ["handrail kit", "mounting anchors", "stud screws"],
    installationComplexity: "moderate",
  },
  slippery_floor: {
    fixType: "non_slip_treatment",
    title: "Apply non-slip treatment",
    description: "Use anti-slip coating or mats in wet and smooth floor zones.",
    estimatedCostMin: 25,
    estimatedCostMax: 220,
    materials: ["non-slip coating", "bath mat", "adhesive strips"],
    installationComplexity: "easy",
  },
  loose_rug: {
    fixType: "rug_removal",
    title: "Remove or secure loose rug",
    description: "Remove loose rugs or secure with non-slip backing and edge tape.",
    estimatedCostMin: 0,
    estimatedCostMax: 60,
    materials: ["rug gripper", "double-sided carpet tape"],
    installationComplexity: "easy",
  },
  clutter_trip_hazard: {
    fixType: "pathway_clearance",
    title: "Clear pathway obstructions",
    description: "Maintain a minimum clear walking path and remove floor-level clutter.",
    estimatedCostMin: 0,
    estimatedCostMax: 80,
    materials: ["storage bins", "cable organizer"],
    installationComplexity: "easy",
  },
  narrow_walkway: {
    fixType: "walkway_widening",
    title: "Widen walkway / remove obstructions",
    description: "Reconfigure furniture to ensure safe turning and aid-assisted movement.",
    estimatedCostMin: 0,
    estimatedCostMax: 300,
    materials: ["furniture sliders", "layout markers"],
    installationComplexity: "moderate",
  },
  high_threshold: {
    fixType: "threshold_modification",
    title: "Reduce threshold height",
    description: "Install beveled transition ramps or reduce abrupt threshold lips.",
    estimatedCostMin: 20,
    estimatedCostMax: 250,
    materials: ["threshold ramp", "transition strip"],
    installationComplexity: "moderate",
  },
  missing_grab_bar: {
    fixType: "grab_bar_installation",
    title: "Add grab bar beside toilet/shower",
    description: "Install anchored grab bars in key bathroom transfer zones.",
    estimatedCostMin: 80,
    estimatedCostMax: 350,
    materials: ["grab bars", "anchors", "sealant"],
    installationComplexity: "moderate",
  },
  unsafe_stairs: {
    fixType: "stair_safety_upgrade",
    title: "Install second stair handrail",
    description: "Upgrade stairs with dual rails, high-visibility nosing, and consistent lighting.",
    estimatedCostMin: 150,
    estimatedCostMax: 800,
    materials: ["stair handrail", "nosing strips", "LED strip lights"],
    installationComplexity: "complex",
  },
  uneven_floor: {
    fixType: "floor_leveling",
    title: "Correct uneven floor transition",
    description: "Repair uneven flooring and remove abrupt grade changes across paths.",
    estimatedCostMin: 80,
    estimatedCostMax: 1200,
    materials: ["leveling compound", "floor patch kit"],
    installationComplexity: "complex",
  },
  outdoor_step_risk: {
    fixType: "exterior_entry_safety",
    title: "Improve exterior step safety",
    description: "Add rails and non-slip surface treatment on exterior entry steps.",
    estimatedCostMin: 120,
    estimatedCostMax: 700,
    materials: ["outdoor rail kit", "anti-slip tape", "weatherproof lighting"],
    installationComplexity: "moderate",
  },
};

const priorityFromSeverity = (severity: SeverityLevel): RecommendationPriority => {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
};

export function buildRecommendation(sessionId: string, hazard: FinalHazard): Recommendation {
  const template = templates[hazard.hazardType];
  const priority = priorityFromSeverity(hazard.severity);
  return {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    finalHazardId: hazard.id,
    hazardId: hazard.id,
    fixType: template.fixType,
    title: template.title,
    description: template.description,
    priority,
    estimatedCostMin: template.estimatedCostMin,
    estimatedCostMax: template.estimatedCostMax,
    materials: template.materials,
    materialsJson: template.materials,
    installationComplexity: template.installationComplexity,
  };
}
