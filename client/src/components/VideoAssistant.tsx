import { useEffect, useRef, useState, useCallback, useReducer } from "react";

// ── SpeechRecognition types ───────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Send,
  FileText,
  StopCircle,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Volume2,
  Camera,
  ChevronRight,
} from "lucide-react";
import { HFEWebSocketClient } from "../lib/wsClient";
import {
  HazardObservation,
  SnapshotData,
  UserProfile,
  RoomId,
  AssessmentReport,
  ROOM_NAMES,
  buildRoomSequence,
} from "../lib/types";
import { toAssessmentReport } from "../lib/reportTransform";
import RoomProgressBar from "./RoomProgressBar";

interface ChatMessage {
  id: string;
  role: "user" | "ai" | "system";
  text: string;
  timestamp: number;
}

// ── Room state machine ────────────────────────────────────────────────────────

interface RoomState {
  currentRoom: RoomId;
  completedRooms: RoomId[];
}

type RoomAction =
  | { type: "ADVANCE"; room: RoomId }
  | { type: "RESET"; firstRoom: RoomId };

function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "ADVANCE":
      return {
        currentRoom: action.room,
        completedRooms: state.completedRooms.includes(state.currentRoom)
          ? state.completedRooms
          : [...state.completedRooms, state.currentRoom],
      };
    case "RESET":
      return { currentRoom: action.firstRoom, completedRooms: [] };
    default:
      return state;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const FRAME_INTERVAL_MS = 1500;

interface VideoAssistantProps {
  profile: UserProfile;
  onReportReady: (report: AssessmentReport) => void;
}

export default function VideoAssistant({ profile, onReportReady }: VideoAssistantProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<HFEWebSocketClient | null>(null);
  const wsUnsubRef = useRef<(() => void) | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const snapshotsRef = useRef<SnapshotData[]>([]);
  const aiSummaryRef = useRef<string>("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNextTimeRef = useRef(0);
  const aiAudioEndTimerRef = useRef<number | null>(null);
  const aiSpeakingRef = useRef(false);

  const roomSequence = buildRoomSequence(profile);
  const [roomState, dispatchRoom] = useReducer(roomReducer, {
    currentRoom: roomSequence[0] ?? "entryway",
    completedRooms: [],
  });

  const [status, setStatus] = useState<
    "idle" | "connecting" | "active" | "ending"
  >("idle");
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [observations, setObservations] = useState<HazardObservation[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [missingViews, setMissingViews] = useState<string[]>([]);
  const [completionScore, setCompletionScore] = useState(0);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [snapshotFlash, setSnapshotFlash] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef<SpeechRecognition | null>(null);
  const speechActiveRef = useRef(false); // true when we WANT recognition running

  const addMessage = useCallback((role: ChatMessage["role"], text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        role,
        text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const ensureAudioContext = useCallback(async () => {
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
      audioNextTimeRef.current = audioContextRef.current.currentTime;
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playAiAudioChunk = useCallback(async (base64Audio: string, mimeType: string) => {
    const audioContext = await ensureAudioContext();
    if (!audioContext) return;

    if (aiAudioEndTimerRef.current !== null) {
      window.clearTimeout(aiAudioEndTimerRef.current);
      aiAudioEndTimerRef.current = null;
    }
    aiSpeakingRef.current = true;
    speechRef.current?.stop();
    setIsListening(false);

    const rateMatch = /rate=(\d+)/i.exec(mimeType);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const frameCount = Math.floor(bytes.byteLength / 2);
    if (frameCount <= 0) return;
    const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const startAt = Math.max(audioContext.currentTime + 0.03, audioNextTimeRef.current);
    source.start(startAt);
    audioNextTimeRef.current = startAt + buffer.duration;
  }, [ensureAudioContext]);

  const stopAiAudio = useCallback(() => {
    if (aiAudioEndTimerRef.current !== null) {
      window.clearTimeout(aiAudioEndTimerRef.current);
      aiAudioEndTimerRef.current = null;
    }
    aiSpeakingRef.current = false;
    if (audioContextRef.current) {
      audioNextTimeRef.current = audioContextRef.current.currentTime;
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: "environment" }, // rear camera on mobile
        },
        audio: true,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraOn(true);
      setIsMicOn(true);
    } catch {
      addMessage("system", "Camera access denied. Please enable camera permissions.");
    }
  };

  const stopCamera = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOn(false);
    setIsMicOn(false);
  };

  const captureFrame = useCallback((quality = 0.5): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 640, 480);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.split(",")[1];
  }, []);

  // Frame capture loop
  const startFrameCapture = useCallback(() => {
    frameTimerRef.current = window.setInterval(() => {
      const frame = captureFrame(0.5);
      if (frame && wsRef.current?.isConnected) {
        wsRef.current.sendVideoFrame(frame);
      }
    }, FRAME_INTERVAL_MS);
  }, [captureFrame]);

  const stopFrameCapture = () => {
    if (frameTimerRef.current !== null) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
  };

  const startAssessment = async () => {
    if (!privacyConsent) {
      addMessage("system", "Please confirm camera and evidence consent before starting.");
      return;
    }
    const consentedProfile: UserProfile = {
      ...profile,
      consent: {
        consentAccepted: true,
        consentAcceptedAt: profile.consent?.consentAcceptedAt ?? new Date().toISOString(),
        consentVersion: profile.consent?.consentVersion ?? "parent-safety-consent-v1",
        recordingPermissionConfirmed: true,
        shareWithCareCoordinator: Boolean(profile.consent?.shareWithCareCoordinator),
        shareWithContractor: Boolean(profile.consent?.shareWithContractor),
        shareWithInsurer: Boolean(profile.consent?.shareWithInsurer),
      },
    };
    setStatus("connecting");
    addMessage("system", "Connecting to AI safety expert...");
    await ensureAudioContext();

    const client = new HFEWebSocketClient();
    wsRef.current = client;

    wsUnsubRef.current = client.onMessage((msg) => {
      switch (msg.type) {
        case "connected":
          // Immediately start session with profile
          client.startSession(consentedProfile, roomSequence);
          break;

        case "session_started":
          setSessionId(String(msg.payload.sessionId ?? ""));
          break;

        case "session_resumed":
          setSessionId(String(msg.payload.sessionId ?? ""));
          break;

        case "status":
          addMessage("system", String(msg.payload.message ?? ""));
          break;

        case "ai_message": {
          setIsAiTyping(false);
          const text = String(msg.payload.text ?? "");
          addMessage("ai", text);
          aiSummaryRef.current = text;
          break;
        }

        case "ai_message_chunk": {
          // Streaming chunk — append to the last AI message or start a new one
          setIsAiTyping(false);
          const chunk = String(msg.payload.text ?? "");
          setMessages((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].role === "ai") {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                text: updated[updated.length - 1].text + chunk,
              };
              return updated;
            }
            return [
              ...prev,
              {
                id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                role: "ai" as const,
                text: chunk,
                timestamp: Date.now(),
              },
            ];
          });
          break;
        }

        case "ai_audio_chunk": {
          void playAiAudioChunk(
            String(msg.payload.data ?? ""),
            String(msg.payload.mimeType ?? "audio/pcm;rate=24000")
          );
          break;
        }

        case "ai_typing": {
          setIsAiTyping(true);
          break;
        }

        case "observation": {
          const obs = msg.payload as unknown as HazardObservation;
          setObservations((prev) => {
            if (prev.some((o) => o.id === obs.id)) return prev;
            return [...prev, obs];
          });
          break;
        }

        case "room_change": {
          const room = String(msg.payload.room ?? "") as RoomId;
          dispatchRoom({ type: "ADVANCE", room });
          setMissingViews([]);
          addMessage(
            "system",
            `Now assessing: ${String(msg.payload.roomName ?? room)}`
          );
          break;
        }

        case "inspection_state":
          setMissingViews((msg.payload.missingViews ?? []) as string[]);
          setCompletionScore(Number(msg.payload.completionScore ?? 0));
          break;

        case "follow_up_prompt": {
          const prompts = (msg.payload.prompts ?? []) as string[];
          if (prompts.length) addMessage("system", prompts.join(" • "));
          break;
        }

        case "missing_views": {
          const missing = (msg.payload.missingViews ?? []) as string[];
          setMissingViews(missing);
          if (missing.length) addMessage("system", `Please show: ${missing.join(", ")}`);
          break;
        }

        case "snapshot_request": {
          const hazardId = String(msg.payload.hazardId ?? "");
          const label = String(msg.payload.label ?? "");
          // Capture snapshot immediately
          setTimeout(() => {
            const frame = captureFrame(0.6);
            if (frame) {
              setSnapshotFlash(true);
              setTimeout(() => setSnapshotFlash(false), 600);
              const snap: SnapshotData = {
                hazardId,
                base64: frame,
                label,
                room: roomState.currentRoom,
              };
              snapshotsRef.current = [...snapshotsRef.current, snap];
              // Attach snapshot to matching observation
              setObservations((prev) =>
                prev.map((o) =>
                  o.id === hazardId ? { ...o, snapshotBase64: frame } : o
                )
              );
            }
          }, 200);
          break;
        }

        case "turn_complete":
          setIsAiTyping(false);
          {
            const audioContext = audioContextRef.current;
            const delayMs = audioContext
              ? Math.max(150, (audioNextTimeRef.current - audioContext.currentTime) * 1000 + 200)
              : 500;
            if (aiAudioEndTimerRef.current !== null) {
              window.clearTimeout(aiAudioEndTimerRef.current);
            }
            aiAudioEndTimerRef.current = window.setTimeout(() => {
              aiSpeakingRef.current = false;
              aiAudioEndTimerRef.current = null;
              if (speechActiveRef.current) startContinuousSpeech();
            }, delayMs);
          }
          break;

        case "report_ready": {
          const backendReport = msg.payload.report as Parameters<typeof toAssessmentReport>[0];
          const report = toAssessmentReport(backendReport, profile);
          report.observations = report.observations.map((obs) => ({
            ...obs,
            snapshotBase64: snapshotsRef.current.find((s) => s.hazardId === obs.id)?.base64,
          }));
          onReportReady(report);
          break;
        }

        case "error":
          stopAiAudio();
          if (String(msg.payload.message ?? "") === "Internal server error.") {
            addMessage("system", "Something went wrong. Please end the session and try again.");
          } else {
            addMessage("system", `Error: ${String(msg.payload.message ?? "")}`);
          }
          setStatus("idle");
          break;
      }
    });

    try {
      await client.connect();
      await startCamera();
      setStatus("active");
      setIsAiTyping(true);
      startFrameCapture();
      dispatchRoom({ type: "RESET", firstRoom: roomSequence[0] ?? "entryway" });
      // Auto-start voice input — seamless conversation from the start
      const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (SR && !isIOS) {
        startContinuousSpeech();
      } else {
        addMessage("system", isIOS
          ? "Voice input isn't supported on iOS. Type your messages, or use Chrome on Android for hands-free voice."
          : "Voice input not available in this browser. Use Chrome or Edge for hands-free voice.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect. Is the server running?";
      addMessage("system", message);
      setStatus("idle");
    }
  };

  const sendMessage = (overrideText?: string) => {
    const text = (overrideText ?? textInput).trim();
    if (!text || !wsRef.current?.isConnected) return;
    addMessage("user", text);
    wsRef.current.sendTextMessage(text);
    setTextInput("");
    setIsAiTyping(true);
  };

  const startContinuousSpeech = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    speechActiveRef.current = true;

    const recognition = new SR();
    recognition.continuous = false; // restart manually so mic stays hot
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = (event.results[0]?.[0]?.transcript ?? "").trim();
      if (transcript) {
        // Direct call — don't go through textInput state
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            role: "user" as const,
            text: transcript,
            timestamp: Date.now(),
          },
        ]);
        wsRef.current?.sendTextMessage(transcript);
        setIsAiTyping(true);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      // Restart after transient errors (no-speech, audio-capture) if still active
      if (speechActiveRef.current && !aiSpeakingRef.current) {
        setTimeout(() => {
          if (speechActiveRef.current && !aiSpeakingRef.current) startContinuousSpeech();
        }, 800);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart as long as the session is active
      if (speechActiveRef.current && !aiSpeakingRef.current) {
        setTimeout(() => {
          if (speechActiveRef.current && !aiSpeakingRef.current) startContinuousSpeech();
        }, 300);
      }
    };

    speechRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // Already started — ignore
    }
  }, [setMessages, setIsAiTyping]);

  const stopSpeech = useCallback(() => {
    speechActiveRef.current = false;
    speechRef.current?.stop();
    speechRef.current = null;
    setIsListening(false);
  }, []);

  const toggleSpeech = () => {
    if (!isMicOn) return; // mic muted — don't start recognition
    if (speechActiveRef.current) {
      stopSpeech();
    } else {
      const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!SR) {
        addMessage("system", "Speech recognition not supported. Use Chrome or Edge.");
        return;
      }
      startContinuousSpeech();
    }
  };

  const generateReport = () => {
    const allowIncomplete = completionScore < 60
      ? window.confirm("This assessment is incomplete. The report may miss hazards in rooms or views not captured. Generate it anyway?")
      : false;
    if (completionScore < 60 && !allowIncomplete) return;
    setStatus("ending");
    addMessage("system", "Completing assessment and generating your safety report...");
    wsRef.current?.requestReport(allowIncomplete);
    setIsAiTyping(true);
  };

  const stopAssessment = () => {
    stopSpeech();
    stopAiAudio();
    stopFrameCapture();
    stopCamera();
    wsUnsubRef.current?.();
    wsUnsubRef.current = null;
    wsRef.current?.endSession();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("idle");
    setIsAiTyping(false);
    addMessage("system", "Assessment stopped.");
  };

  useEffect(() => {
    return () => {
      speechActiveRef.current = false;
      speechRef.current?.stop();
      stopAiAudio();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      stopFrameCapture();
      stopCamera();
      wsUnsubRef.current?.();
      wsUnsubRef.current = null;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const highCount = observations.filter((o) => o.priority === "high").length;
  const medCount = observations.filter((o) => o.priority === "medium").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Room progress */}
      {status === "active" && (
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Assessment Progress
            </p>
            <p className="text-xs text-slate-500">
              {roomState.completedRooms.length}/{roomSequence.length} rooms complete
            </p>
          </div>
          <RoomProgressBar
            sequence={roomSequence}
            currentRoom={roomState.currentRoom}
            completedRooms={roomState.completedRooms}
          />
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
            <p className="text-sm font-medium text-brand-300">
              Currently: {ROOM_NAMES[roomState.currentRoom]}
            </p>
            {missingViews.length > 0 && (
              <span className="text-xs text-amber-400">
                Missing: {missingViews.slice(0, 2).join(", ")}
              </span>
            )}
            {status === "active" && (
              <button
                onClick={() => wsRef.current?.sendTextMessage(`Let's move to the next room.`)}
                className="ml-auto text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
              >
                Next room <ChevronRight aria-hidden="true" className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Video + Controls */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Video */}
          <div
            className={`relative bg-slate-900 rounded-2xl overflow-hidden aspect-video border transition-colors ${
              snapshotFlash ? "border-brand-400" : "border-slate-800"
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!isCameraOn ? "hidden" : ""}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {!isCameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-500">
                <VideoOff aria-hidden="true" className="w-16 h-16" />
                <p className="text-lg font-medium">Camera is off</p>
                {status === "idle" && (
                  <p className="text-sm">Click "Start Assessment" below</p>
                )}
              </div>
            )}

            {isCameraOn && (
              <>
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    LIVE
                  </div>
                  {isMicOn && (
                    <div className="flex items-center gap-1.5 bg-slate-900/80 text-slate-300 text-xs px-2 py-1 rounded-full border border-slate-700">
                      <Volume2 aria-hidden="true" className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {snapshotFlash && (
                  <div className="absolute inset-0 bg-white/20 flex items-center justify-center motion-safe:animate-fade-in pointer-events-none" aria-live="polite" aria-atomic="true">
                    <div className="flex items-center gap-2 bg-white/90 text-slate-900 px-4 py-2 rounded-full text-sm font-semibold">
                      <Camera aria-hidden="true" className="w-4 h-4" />
                      Snapshot captured
                    </div>
                  </div>
                )}

                {observations.length > 0 && (
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    {highCount > 0 && (
                      <div className="badge-high text-[10px]">
                        <AlertTriangle aria-hidden="true" className="w-3 h-3 mr-1" />
                        {highCount} urgent
                      </div>
                    )}
                    {medCount > 0 && (
                      <div className="badge-medium text-[10px]">{medCount} medium</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Controls */}
          <div className="card">
            <div className="flex flex-wrap items-center gap-3">
              {status === "idle" && (
                <label className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    I understand this AI-assisted walkthrough uses my camera and may store evidence snapshots for my report. HFE is not a medical, emergency, occupational therapy, or contractor assessment, and I can stop the session at any time.
                  </span>
                </label>
              )}
              {status === "idle" && (
                <button onClick={startAssessment} disabled={!privacyConsent} className={`btn-primary ${!privacyConsent ? "opacity-60 cursor-not-allowed" : ""}`}>
                  <Video aria-hidden="true" className="w-4 h-4" />
                  Start Assessment
                </button>
              )}

              {status === "connecting" && (
                <button disabled className="btn-primary opacity-60 cursor-not-allowed">
                  <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                  Connecting...
                </button>
              )}

              {status === "active" && (
                <>
                  <button
                    onClick={() => {
                      if (isMicOn) {
                        mediaStreamRef.current
                          ?.getAudioTracks()
                          .forEach((t) => (t.enabled = false));
                        stopSpeech();
                      } else {
                        mediaStreamRef.current
                          ?.getAudioTracks()
                          .forEach((t) => (t.enabled = true));
                        startContinuousSpeech();
                      }
                      setIsMicOn((v) => !v);
                    }}
                    aria-pressed={isMicOn}
                    className={isMicOn ? "btn-secondary" : "btn-danger"}
                  >
                    {isMicOn ? <Mic aria-hidden="true" className="w-4 h-4" /> : <MicOff aria-hidden="true" className="w-4 h-4" />}
                    {isMicOn ? "Mute" : "Unmute"}
                  </button>

                  <button onClick={generateReport} className="btn-primary">
                    <FileText aria-hidden="true" className="w-4 h-4" />
                    Generate Report
                  </button>

                  <button onClick={stopAssessment} className="btn-secondary">
                    <StopCircle aria-hidden="true" className="w-4 h-4" />
                    Stop
                  </button>
                </>
              )}

              {status === "ending" && (
                <div className="flex items-center gap-2 text-brand-400" aria-live="polite">
                  <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">
                    Analyzing findings and building report...
                  </span>
                </div>
              )}
            </div>

            {/* Text input */}
            {status === "active" && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={toggleSpeech}
                  aria-label={speechActiveRef.current ? "Mute voice input" : "Enable voice input"}
                  aria-pressed={speechActiveRef.current}
                  className={`py-2.5 px-3 rounded-xl border font-medium text-sm motion-safe:transition-all ${
                    isListening
                      ? "bg-brand-600 border-brand-500 text-white motion-safe:animate-pulse"
                      : speechActiveRef.current
                      ? "bg-slate-700 border-slate-600 text-slate-300"
                      : "bg-slate-800 border-slate-700 text-slate-500 hover:text-white hover:border-slate-600"
                  }`}
                >
                  {speechActiveRef.current ? <Mic aria-hidden="true" className="w-4 h-4" /> : <MicOff aria-hidden="true" className="w-4 h-4" />}
                </button>
                <input
                  type="text"
                  aria-label="Message to AI safety expert"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={isListening ? "Listening..." : "Speak or type a message"}
                  className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!textInput.trim()}
                  aria-label="Send message"
                  className="btn-primary py-2.5 px-4 disabled:opacity-40"
                >
                  <Send aria-hidden="true" className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Chat + Hazards */}
        <div className="flex flex-col gap-4">
          {/* AI Chat */}
          <div className="card flex flex-col" style={{ maxHeight: "380px" }}>
            <div className="flex items-center gap-2 mb-3">
              <div aria-hidden="true" className="w-2 h-2 bg-brand-400 rounded-full motion-safe:animate-pulse-slow" />
              <h3 className="text-sm font-semibold text-slate-300">AI Safety Expert</h3>
              {sessionId && (
                <span className="text-[10px] text-slate-500">Session {sessionId.slice(-6)}</span>
              )}
              {snapshotsRef.current.length > 0 && (
                <span className="ml-auto text-xs text-slate-500">
                  <Camera aria-hidden="true" className="w-3 h-3 inline mr-1" />
                  {snapshotsRef.current.length} photo{snapshotsRef.current.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div aria-live="polite" aria-label="AI Safety Expert conversation" className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
              {messages.length === 0 && (
                <p className="text-slate-600 text-sm text-center py-8">
                  Start the assessment to begin
                </p>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`motion-safe:animate-fade-in ${
                    msg.role === "system"
                      ? "text-slate-500 text-xs text-center italic"
                      : msg.role === "user"
                      ? "flex justify-end"
                      : ""
                  }`}
                >
                  {msg.role === "system" && <p>{msg.text}</p>}
                  {msg.role === "user" && (
                    <div className="bg-brand-700/40 border border-brand-600/30 text-brand-100 text-sm px-3 py-2 rounded-xl max-w-[90%]">
                      {msg.text}
                    </div>
                  )}
                  {msg.role === "ai" && (
                    <div className="bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 rounded-xl leading-relaxed">
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}

              {isAiTyping && (
                <div className="flex items-center gap-2 text-slate-500 text-sm" role="status" aria-label="AI is analyzing">
                  <div aria-hidden="true" className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full motion-safe:animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full motion-safe:animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full motion-safe:animate-bounce" />
                  </div>
                  <span>AI is analyzing...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Hazard log */}
          <div className="card flex flex-col" style={{ maxHeight: "300px" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">Hazards Found</h3>
              <span className="text-xs text-slate-500">{observations.length} total</span>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1">
              {observations.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-slate-600">
                  <CheckCircle aria-hidden="true" className="w-8 h-8" />
                  <p className="text-xs text-center">No hazards yet</p>
                </div>
              ) : (
                observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="flex items-start gap-2 p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/50 motion-safe:animate-slide-up"
                  >
                    <div className="flex flex-col items-start gap-1 shrink-0">
                      <span
                        className={
                          obs.priority === "high"
                            ? "badge-high text-[10px]"
                            : obs.priority === "medium"
                            ? "badge-medium text-[10px]"
                            : "badge-low text-[10px]"
                        }
                      >
                        {obs.adjustedSeverity}/10
                      </span>
                      {obs.snapshotBase64 && (
                        <Camera aria-hidden="true" className="w-3 h-3 text-brand-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-slate-400">
                        {ROOM_NAMES[obs.room]} · {obs.category}
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                        {obs.hazard}
                      </p>
                      <p className="text-[10px] text-red-400 mt-0.5">
                        {obs.fallProbability}% fall probability
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
