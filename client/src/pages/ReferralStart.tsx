import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { getReferral, updateReferralStatus } from "../lib/apiClient";
import type { PartnerReferral } from "../lib/types";
import { saveReferralContext } from "../lib/userProfile";

export default function ReferralStartPage() {
  const { referralCode = "" } = useParams();
  const navigate = useNavigate();
  const [referral, setReferral] = useState<PartnerReferral | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!referralCode) return;
    void getReferral(referralCode)
      .then((response) => setReferral(response.referral))
      .catch(() => setError("This pilot invitation link is unavailable or has been cancelled."));
  }, [referralCode]);

  const start = async () => {
    if (!referral) return;
    saveReferralContext({
      referralId: referral.id,
      referralCode: referral.referralCode,
      pilotCohortId: referral.pilotCohortId,
      seniorName: referral.seniorName,
    });
    await updateReferralStatus(referral.referralCode, "started_onboarding").catch(() => undefined);
    navigate("/onboarding");
  };

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white border border-warm-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-warm-500">Parent Safety Assessment</p>
            <h1 className="text-2xl font-bold text-warm-900 font-display">Help your parent stay safer and more independent at home.</h1>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <>
            <p className="text-warm-600 mb-4">
              This assessment provides prevention and care-coordination support, not medical advice.
              {referral?.partnerDisplayName ? ` Offered through ${referral.partnerDisplayName}.` : ""}
            </p>
            {referral?.cohortName && <p className="text-sm text-brand-700 mb-4">Part of care partner pilot: {referral.cohortName}</p>}
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 mb-6">
              You can choose whether to share your results with the care partner. This tool is not diagnostic. Emergency situations require local emergency or medical services. Please confirm permission before recording another person or private living space.
            </div>
            <button type="button" onClick={() => void start()} disabled={!referral} className="btn-primary py-3 px-5 disabled:opacity-50">
              Start Parent Safety Assessment <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
