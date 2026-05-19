import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, CheckCircle, FileText, ImagePlus, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import {
  createInspectionSession,
  finalizeInspectionSession,
  markRoomProgress,
  uploadRoomPhotoEvidence,
} from "../lib/apiClient";
import { saveReport } from "../lib/reportSerializer";
import { toAssessmentReport } from "../lib/reportTransform";
import { buildRoomSequence, ROOM_NAMES, RoomId, UserProfile } from "../lib/types";
import { buildSeniorProfile, getRiskLabel, loadProfile } from "../lib/userProfile";

type Concern = {
  hazardType: string;
  label: string;
};

type ViewPrompt = {
  key: string;
  title: string;
  detail: string;
  concerns: Concern[];
};

const ROOM_PROMPTS: Record<RoomId, ViewPrompt[]> = {
  entryway: [
    {
      key: "wide_view",
      title: "Entry overview",
      detail: "Stand back and capture the doorway, floor, threshold, and first few steps inside.",
      concerns: [
        { hazardType: "high_threshold", label: "Raised threshold" },
        { hazardType: "poor_lighting", label: "Dim entry lighting" },
        { hazardType: "clutter_trip_hazard", label: "Shoes, cords, or clutter" },
      ],
    },
    {
      key: "floor_surfaces",
      title: "Floor and threshold",
      detail: "Capture rugs, mats, uneven surfaces, or transition strips near the entry.",
      concerns: [
        { hazardType: "loose_rug", label: "Loose rug or mat" },
        { hazardType: "uneven_floor", label: "Uneven floor" },
        { hazardType: "high_threshold", label: "Threshold lip" },
      ],
    },
  ],
  living_room: [
    {
      key: "walking_path",
      title: "Main walking path",
      detail: "Capture the route from the entry or hallway through the room.",
      concerns: [
        { hazardType: "clutter_trip_hazard", label: "Clutter or cords" },
        { hazardType: "narrow_walkway", label: "Narrow walkway" },
        { hazardType: "loose_rug", label: "Loose rug" },
      ],
    },
    {
      key: "floor_surfaces",
      title: "Floor surfaces",
      detail: "Show rugs, furniture edges, floor transitions, and common turning areas.",
      concerns: [
        { hazardType: "loose_rug", label: "Loose rug edge" },
        { hazardType: "uneven_floor", label: "Uneven floor" },
        { hazardType: "poor_lighting", label: "Low lighting" },
      ],
    },
  ],
  bedroom: [
    {
      key: "nighttime_path",
      title: "Nighttime route",
      detail: "Capture the path from bed to doorway or bathroom route.",
      concerns: [
        { hazardType: "poor_lighting", label: "Dim nighttime route" },
        { hazardType: "clutter_trip_hazard", label: "Items near bed path" },
        { hazardType: "loose_rug", label: "Loose rug" },
      ],
    },
    {
      key: "walking_path",
      title: "Bed transfer area",
      detail: "Show the bed edge, floor area, and nearby furniture used for support.",
      concerns: [
        { hazardType: "narrow_walkway", label: "Limited space" },
        { hazardType: "clutter_trip_hazard", label: "Trip hazards" },
        { hazardType: "uneven_floor", label: "Uneven surface" },
      ],
    },
  ],
  bathroom: [
    {
      key: "transfer_support",
      title: "Toilet and shower support",
      detail: "Capture toilet, tub/shower entry, wall support, and any grab bars.",
      concerns: [
        { hazardType: "missing_grab_bar", label: "Missing grab bar" },
        { hazardType: "slippery_floor", label: "Wet or slick surface" },
        { hazardType: "high_threshold", label: "Tub or shower lip" },
      ],
    },
    {
      key: "floor_surfaces",
      title: "Bathroom floor",
      detail: "Show mats, tile, doorway transition, and the main standing area.",
      concerns: [
        { hazardType: "slippery_floor", label: "Slippery floor" },
        { hazardType: "loose_rug", label: "Loose bath mat" },
        { hazardType: "poor_lighting", label: "Low lighting" },
      ],
    },
  ],
  kitchen: [
    {
      key: "walking_path",
      title: "Kitchen walking path",
      detail: "Capture the route through counters, fridge, sink, and table area.",
      concerns: [
        { hazardType: "clutter_trip_hazard", label: "Clutter or cords" },
        { hazardType: "slippery_floor", label: "Slick floor" },
        { hazardType: "narrow_walkway", label: "Narrow route" },
      ],
    },
    {
      key: "cooking_area",
      title: "Sink and cooking area",
      detail: "Show floor near sink/stove and frequently used items.",
      concerns: [
        { hazardType: "slippery_floor", label: "Wet floor risk" },
        { hazardType: "clutter_trip_hazard", label: "Items on floor" },
        { hazardType: "poor_lighting", label: "Poor task lighting" },
      ],
    },
  ],
  stairs: [
    {
      key: "stairs",
      title: "Full stair view",
      detail: "Capture stairs from the bottom or top, including both sides if possible.",
      concerns: [
        { hazardType: "unsafe_stairs", label: "Uneven or steep stairs" },
        { hazardType: "missing_handrail", label: "Missing/weak handrail" },
        { hazardType: "poor_lighting", label: "Poor stair lighting" },
      ],
    },
    {
      key: "floor_surfaces",
      title: "Steps and landing",
      detail: "Show step edges, landing, rugs, and any loose surfaces.",
      concerns: [
        { hazardType: "loose_rug", label: "Loose runner or mat" },
        { hazardType: "uneven_floor", label: "Uneven landing" },
        { hazardType: "clutter_trip_hazard", label: "Items on stairs" },
      ],
    },
  ],
  exterior_entry: [
    {
      key: "exterior_entry",
      title: "Outdoor entry",
      detail: "Capture porch, outdoor steps, ramp, railings, and walking surface.",
      concerns: [
        { hazardType: "outdoor_step_risk", label: "Outdoor step risk" },
        { hazardType: "missing_handrail", label: "No outdoor rail" },
        { hazardType: "poor_lighting", label: "Poor exterior lighting" },
      ],
    },
    {
      key: "floor_surfaces",
      title: "Outdoor surface",
      detail: "Show mats, uneven surfaces, drainage, or slippery areas.",
      concerns: [
        { hazardType: "slippery_floor", label: "Slippery surface" },
        { hazardType: "uneven_floor", label: "Uneven outdoor surface" },
        { hazardType: "high_threshold", label: "Door threshold" },
      ],
    },
  ],
};

const fileToResizedBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read photo."));
    reader.onload = () => {
      image.onload = () => {
        const max = 1100;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to process photo."));
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78).split(",")[1]);
      };
      image.onerror = () => reject(new Error("Unable to load photo."));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export default function AssessmentPage() {
  const navigate = useNavigate();
  const profile = loadProfile();
  const sessionPromiseRef = useRef<Promise<string> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomId | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<Record<string, string>>({});
  const [selectedConcerns, setSelectedConcerns] = useState<Record<string, string[]>>({});
  const [privacyConsent, setPrivacyConsent] = useState(Boolean(profile?.consent?.consentAccepted && profile?.consent?.recordingPermissionConfirmed));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) navigate("/onboarding", { replace: true });
  }, [profile, navigate]);

  const roomSequence = useMemo(() => (profile ? buildRoomSequence(profile) : []), [profile]);

  useEffect(() => {
    if (!activeRoom && roomSequence[0]) setActiveRoom(roomSequence[0]);
  }, [activeRoom, roomSequence]);

  if (!profile || !activeRoom) return null;

  const riskInfo = getRiskLabel(profile);
  const subject = profile.assessmentFor === "family" && profile.subjectName ? profile.subjectName : "the resident";
  const totalPrompts = roomSequence.reduce((count, room) => count + ROOM_PROMPTS[room].length, 0);
  const uploadedCount = Object.keys(uploadedKeys).length;
  const activeIndex = roomSequence.indexOf(activeRoom);

  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    const consent = {
      consentAccepted: true,
      consentAcceptedAt: profile.consent?.consentAcceptedAt ?? new Date().toISOString(),
      consentVersion: profile.consent?.consentVersion ?? "parent-safety-consent-v1",
      recordingPermissionConfirmed: true,
      shareWithCareCoordinator: Boolean(profile.consent?.shareWithCareCoordinator),
      shareWithContractor: Boolean(profile.consent?.shareWithContractor),
      shareWithInsurer: Boolean(profile.consent?.shareWithInsurer),
    };
    const createSession = createInspectionSession({
      residentAge: profile.age,
      mobilityAid: profile.mobilityLevel === "independent" ? "none" : profile.mobilityLevel,
      fallHistory: profile.fallHistoryCount,
      nightBathroomTrips: Boolean(profile.nightBathroomTrips),
      seniorProfile: {
        ...buildSeniorProfile(profile),
        ...(profile.seniorProfile ?? {}),
      },
      consent,
      pilotCohortId: profile.pilotCohortId,
      referralId: profile.referralId,
    }).then((response) => {
      setSessionId(response.session.id);
      return response.session.id;
    }).finally(() => {
      sessionPromiseRef.current = null;
    });
    sessionPromiseRef.current = createSession;
    return createSession;
  };

  const toggleConcern = (key: string, hazardType: string) => {
    setSelectedConcerns((current) => {
      const existing = current[key] ?? [];
      const next = existing.includes(hazardType)
        ? existing.filter((item) => item !== hazardType)
        : [...existing, hazardType];
      return { ...current, [key]: next };
    });
  };

  const handlePhoto = async (room: RoomId, prompt: ViewPrompt, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!privacyConsent) {
      setError("Please confirm permission before uploading home photos.");
      return;
    }
    const key = `${room}:${prompt.key}`;
    setBusyKey(key);
    setError(null);
    try {
      const id = await ensureSession();
      const base64Image = await fileToResizedBase64(file);
      const response = await uploadRoomPhotoEvidence(id, {
        roomType: room,
        viewKey: prompt.key,
        base64Image,
        concerns: selectedConcerns[key] ?? [],
      });
      setUploadedKeys((current) => ({ ...current, [key]: response.photo.publicUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload photo.");
    } finally {
      setBusyKey(null);
    }
  };

  const skipRoom = async (room: RoomId) => {
    const id = await ensureSession();
    await markRoomProgress(id, room, {
      capturedViews: [],
      missingViews: ROOM_PROMPTS[room].map((prompt) => prompt.key),
      coverageStatus: "skipped",
    });
    const next = roomSequence[activeIndex + 1];
    if (next) setActiveRoom(next);
  };

  const generateReport = async () => {
    setFinalizing(true);
    setError(null);
    try {
      const id = await ensureSession();
      const allowIncomplete = uploadedCount < Math.ceil(totalPrompts * 0.6);
      const response = await finalizeInspectionSession(id, allowIncomplete);
      const report = toAssessmentReport(response.report as Parameters<typeof toAssessmentReport>[0], profile as UserProfile);
      saveReport(report);
      navigate(`/report/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate report.");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck aria-hidden="true" className="w-5 h-5 text-brand-600" />
              <h1 className="text-2xl font-bold text-warm-900">Photo Safety Assessment</h1>
            </div>
            <p className="text-sm text-warm-500">
              Take a few photos of key areas for {subject}. HFE turns them into prevention support, family safety actions, and care coordination documentation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`text-sm font-semibold ${riskInfo.color}`}>{riskInfo.label}</div>
            <Link to="/assessment/live" className="btn-secondary py-2 px-3 text-xs">
              Use live walkthrough instead
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
          <label className="flex items-start gap-3 text-sm text-warm-700">
            <input
              type="checkbox"
              checked={privacyConsent}
              onChange={(event) => setPrivacyConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span>
              I have permission to photograph this home or living space. I understand this provides prevention and care-coordination support, not medical advice, diagnosis, emergency response, or a professional inspection.
            </span>
          </label>
        </div>

        <div className="grid lg:grid-cols-[260px_1fr] gap-6">
          <aside className="rounded-2xl border border-warm-200 bg-white p-4 shadow-sm h-fit">
            <p className="text-xs font-semibold uppercase tracking-wide text-warm-500 mb-3">Rooms</p>
            <div className="space-y-2">
              {roomSequence.map((room) => {
                const prompts = ROOM_PROMPTS[room];
                const done = prompts.filter((prompt) => uploadedKeys[`${room}:${prompt.key}`]).length;
                return (
                  <button
                    key={room}
                    type="button"
                    onClick={() => setActiveRoom(room)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      activeRoom === room ? "border-brand-300 bg-brand-50" : "border-warm-200 bg-white hover:bg-warm-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-warm-900">{ROOM_NAMES[room]}</span>
                      {done === prompts.length && <CheckCircle aria-hidden="true" className="w-4 h-4 text-green-600" />}
                    </div>
                    <p className="text-xs text-warm-500 mt-1">{done}/{prompts.length} photos</p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-warm-900">{ROOM_NAMES[activeRoom]}</h2>
                  <p className="text-sm text-warm-500">Upload each photo. The AI will review visible hazards; the buttons are optional family notes.</p>
                </div>
                <p className="text-sm font-semibold text-brand-700">{uploadedCount}/{totalPrompts} photos captured</p>
              </div>
            </div>

            {ROOM_PROMPTS[activeRoom].map((prompt) => {
              const key = `${activeRoom}:${prompt.key}`;
              const uploaded = uploadedKeys[key];
              const selected = selectedConcerns[key] ?? [];
              return (
                <div key={key} className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                  <div className="grid md:grid-cols-[1fr_220px] gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Camera aria-hidden="true" className="w-4 h-4 text-brand-600" />
                        <h3 className="font-semibold text-warm-900">{prompt.title}</h3>
                      </div>
                      <p className="text-sm text-warm-600 mb-4">{prompt.detail}</p>
                      <div className="flex flex-wrap gap-2">
                        {prompt.concerns.map((concern) => (
                          <button
                            key={concern.hazardType}
                            type="button"
                            aria-pressed={selected.includes(concern.hazardType)}
                            onClick={() => toggleConcern(key, concern.hazardType)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              selected.includes(concern.hazardType)
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100"
                            }`}
                          >
                            {concern.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-warm-600 mt-3">Optional: tap anything you already notice. The photo will still be reviewed even if you leave these blank.</p>
                    </div>
                    <label
                      aria-label={uploaded ? `${prompt.title} — photo saved. Click to replace.` : `Upload photo for ${prompt.title}`}
                      className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                        uploaded ? "border-green-300 bg-green-50" : "border-warm-300 bg-warm-50 hover:bg-warm-100"
                      }`}
                    >
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void handlePhoto(activeRoom, prompt, event)} />
                      {busyKey === key ? (
                        <Loader2 aria-hidden="true" className="w-7 h-7 animate-spin text-brand-600" />
                      ) : uploaded ? (
                        <>
                          <CheckCircle aria-hidden="true" className="w-7 h-7 text-green-600" />
                          <span className="mt-2 text-sm font-semibold text-green-800">Photo saved</span>
                        </>
                      ) : (
                        <>
                          <ImagePlus aria-hidden="true" className="w-7 h-7 text-brand-600" />
                          <span className="mt-2 text-sm font-semibold text-warm-800">Upload photo</span>
                          <span className="mt-1 text-xs text-warm-600">Camera or library</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              );
            })}

            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

            <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
              <button type="button" onClick={() => void skipRoom(activeRoom)} className="btn-secondary py-2 px-3 text-sm">
                Skip this room
              </button>
              <div className="flex flex-wrap gap-3">
                {roomSequence[activeIndex + 1] && (
                  <button type="button" onClick={() => setActiveRoom(roomSequence[activeIndex + 1])} className="btn-secondary py-2 px-3 text-sm">
                    Next room
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void generateReport()}
                  disabled={finalizing || !privacyConsent || uploadedCount === 0}
                  className="btn-primary py-2 px-4 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {finalizing ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <FileText aria-hidden="true" className="w-4 h-4" />}
                  {finalizing ? "Generating report..." : "Generate prevention report"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
              <div className="flex items-start gap-2">
                <UploadCloud aria-hidden="true" className="w-4 h-4 mt-0.5" />
                <p>
                  Photo assessment is designed for families and care partners who need a calmer flow than live video. Photos are used for prevention support and care coordination documentation, not diagnosis or guaranteed outcome claims.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
