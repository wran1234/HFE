import { prisma } from "../db/prisma";

async function run(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "production") {
    throw new Error("Refusing to run demo seed in production.");
  }
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_DEMO_SEED=true to run this demo seed script.");
  }

  const now = new Date();
  const analyticsEvents = [
    "report_viewed",
    "affiliate_click_started",
    "affiliate_click_saved",
    "contractor_form_opened",
    "contractor_lead_submitted",
    "contractor_lead_saved",
  ] as const;

  await prisma.affiliateClick.createMany({
    data: [
      {
        productName: "LED Motion-Sensor Night Lights 6-pack",
        category: "Lighting",
        affiliateUrl: "https://www.amazon.com/s?k=LED+Motion-Sensor+Night+Lights+6-pack",
      },
      {
        productName: "Non-Slip Bath Mat Set 2-pack",
        category: "Bathroom Safety",
        affiliateUrl: "https://www.amazon.com/s?k=Non-Slip+Bath+Mat+Set+2-pack",
      },
      {
        productName: "Threshold Entry Ramps 2-pack",
        category: "Flooring & Tripping",
        affiliateUrl: "https://www.amazon.com/s?k=Threshold+Entry+Ramps+2-pack",
      },
    ],
  });

  await prisma.contractorLead.createMany({
    data: [
      {
        name: "Alice Demo",
        email: "alice.demo@example.com",
        phone: "5551112222",
        zipCode: "10001",
        preferredContact: "email",
        notes: "Interested in bathroom modifications.",
        scopeText: "Install grab bars and anti-slip flooring.",
        status: "new",
        projectUrgency: "within_30_days",
        estimatedBudget: "2000_5000",
        internalNotes: "Send follow-up this week.",
      },
      {
        name: "Brian Demo",
        email: "brian.demo@example.com",
        phone: "5553334444",
        zipCode: "94103",
        preferredContact: "phone",
        notes: "Needs stair rail retrofit.",
        scopeText: "Install stair handrails and improve lighting.",
        status: "contacted",
        projectUrgency: "immediately",
        estimatedBudget: "over_5000",
        internalNotes: "Quoted by partner contractor.",
      },
      {
        name: "Carol Demo",
        email: "carol.demo@example.com",
        phone: "5557778888",
        zipCode: "60601",
        preferredContact: "either",
        notes: "Still researching options.",
        scopeText: "General home fall-prevention improvements.",
        status: "qualified",
        projectUrgency: "just_researching",
        estimatedBudget: "unsure",
        internalNotes: "Nurture via email sequence.",
      },
    ],
  });

  await prisma.analyticsEvent.createMany({
    data: analyticsEvents.map((eventName, idx) => ({
      eventName,
      createdAt: new Date(now.getTime() - idx * 5 * 60 * 1000),
      metadata: {
        seed: true,
        source: "beta-demo-seed",
      },
    })),
  });

  console.info("[DEMO_SEED] Created demo affiliate clicks, contractor leads, and analytics events.");
}

run()
  .catch((error) => {
    console.error(`[DEMO_SEED] failed: ${String(error)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
