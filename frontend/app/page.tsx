"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVehicleState, sendVoiceCommand, toggleConnectivity, VoiceCallbacks } from "../lib/api";
import SpotifyPlayer, { PlayerStatus } from "../components/SpotifyPlayer";
import NowPlaying from "../components/NowPlaying";
import AgentTree from "../components/AgentTree";

interface SpeechRecognitionAPI extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventAPI) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
interface SpeechRecognitionEventAPI {
  resultIndex: number;
  results: { [key: number]: { isFinal: boolean; 0: { transcript: string } }; length: number };
}
interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => SpeechRecognitionAPI;
  webkitSpeechRecognition?: new () => SpeechRecognitionAPI;
}

interface VehicleState {
  is_locked: boolean;
  climate_on: boolean;
  climate_temp: number;
  battery_level: number;
  is_preconditioning: boolean;
  vehicle_mode: string;
  frunk_open: boolean;
  trunk_open: boolean;
  suspension_level: string;
  connectivity_mode?: string;
  camp_mode?: boolean;
}

function getModeColor(mode: string | undefined): string {
  switch (mode?.toLowerCase()) {
    case "camp": return "#4edea3";
    case "dog": return "#fbbf24";
    case "sport": return "#f87171";
    case "eco": return "#86efac";
    case "normal": return "#98cbff";
    default: return "#98cbff";
  }
}

function getSuspColor(level: string | undefined): string {
  switch (level?.toLowerCase()) {
    case "low": return "#8b90a0";
    case "high": return "#4edea3";
    case "standard": return "#98cbff";
    default: return "#98cbff";
  }
}

function getSuspWheelColor(level: string | undefined): string {
  switch (level?.toLowerCase()) {
    case "low": return "#8b90a0";
    case "high": return "#4edea3";
    case "standard": return "#8b90a0";
    default: return "#8b90a0";
  }
}

// ─── Car SVG ─────────────────────────────────────────────────────────────────

function CarVisualization({ state }: { state: VehicleState | null }) {
  const suspensionGap =
    state?.suspension_level === "low" ? 2
      : state?.suspension_level === "high" ? 12
        : 6;

  const isOffline = (state?.connectivity_mode ?? "cloud") !== "cloud";
  const mode = state?.vehicle_mode?.toLowerCase() ?? "normal";
  const isCampMode = state?.camp_mode || mode === "camp";
  const isDogMode = mode === "dog";
  const isNormalMode = mode === "normal";
  const frunkOpen = state?.frunk_open === true;
  const isLocked = state?.is_locked === true;
  const climateOn = state?.climate_on === true;
  const climateTemp = state?.climate_temp ?? 22;
  const wheelColor = getSuspWheelColor(state?.suspension_level);

  const isHot = climateTemp > 23;
  const climateColor = isHot ? "#fbbf24" : "#60a5fa";
  const climateOpacity = climateOn
    ? climateTemp < 18 ? 0.65
      : climateTemp < 22 ? 0.55
        : climateTemp < 26 ? 0.5
          : 0.6
    : 0;

  return (
    <svg width="280" height="480" viewBox="0 0 220 400" xmlns="http://www.w3.org/2000/svg" style={{ filter: "drop-shadow(0 0 32px rgba(152,203,255,0.15))" }}>
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2744" />
          <stop offset="100%" stopColor="#111c36" />
        </linearGradient>
        <radialGradient id="hlGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#98cbff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#98cbff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tlGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="frunkGlowRad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <filter id="carShadow">
          <feDropShadow dx="0" dy="4" stdDeviation="10" floodColor="#98cbff" floodOpacity="0.12" />
        </filter>
        <filter id="lightGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <style>{`
        @keyframes campPulse { 0%,100%{opacity:0.15} 50%{opacity:0.5} }
        @keyframes frunkGlowAnim { 0%,100%{opacity:0.7} 50%{opacity:1} }
        @keyframes modePulse { 0%,100%{opacity:0.1} 50%{opacity:0.35} }
        @keyframes lockPulse { 0%,100%{opacity:0.7} 50%{opacity:1} }
        @keyframes climateFlow { 0%{opacity:0.85} 50%{opacity:1} 100%{opacity:0.85} }
        .campPulse { animation: campPulse 2s ease-in-out infinite; }
        .frunkGlowAnim { animation: frunkGlowAnim 1.5s ease-in-out infinite; }
        .modePulse { animation: modePulse 2.5s ease-in-out infinite; }
        .lockPulse { animation: lockPulse 1.8s ease-in-out infinite; }
        .climateFlow { animation: climateFlow 2.5s ease-in-out infinite; }
      `}</style>

      <line x1={8} y1={20} x2={8} y2={38} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={8} y1={20} x2={26} y2={20} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={212} y1={20} x2={212} y2={38} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={212} y1={20} x2={194} y2={20} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={8} y1={380} x2={8} y2={362} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={8} y1={380} x2={26} y2={380} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={212} y1={380} x2={212} y2={362} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={212} y1={380} x2={194} y2={380} stroke="#98cbff" strokeWidth="1" opacity="0.4" />
      <line x1={16} y1={80} x2={16} y2={320} stroke="#98cbff" strokeWidth="0.4" strokeDasharray="3 9" opacity="0.3" />
      <line x1={204} y1={80} x2={204} y2={320} stroke="#98cbff" strokeWidth="0.4" strokeDasharray="3 9" opacity="0.3" />

      <rect x={8 - suspensionGap} y={80} width={30} height={70} rx={9} fill="#0f1c35" stroke={wheelColor} strokeWidth="1.5" />
      <circle cx={23 - suspensionGap} cy={115} r={11} fill="#1a2744" stroke={wheelColor} strokeWidth="0.8" />
      <line x1={23 - suspensionGap} y1={104} x2={23 - suspensionGap} y2={115} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <line x1={12 - suspensionGap} y1={115} x2={34 - suspensionGap} y2={115} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <circle cx={23 - suspensionGap} cy={115} r={3.5} fill="#060e20" />

      <rect x={182 + suspensionGap} y={80} width={30} height={70} rx={9} fill="#0f1c35" stroke={wheelColor} strokeWidth="1.5" />
      <circle cx={197 + suspensionGap} cy={115} r={11} fill="#1a2744" stroke={wheelColor} strokeWidth="0.8" />
      <line x1={197 + suspensionGap} y1={104} x2={197 + suspensionGap} y2={115} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <line x1={186 + suspensionGap} y1={115} x2={208 + suspensionGap} y2={115} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <circle cx={197 + suspensionGap} cy={115} r={3.5} fill="#060e20" />

      <rect x={8 - suspensionGap} y={250} width={30} height={70} rx={9} fill="#0f1c35" stroke={wheelColor} strokeWidth="1.5" />
      <circle cx={23 - suspensionGap} cy={285} r={11} fill="#1a2744" stroke={wheelColor} strokeWidth="0.8" />
      <line x1={23 - suspensionGap} y1={274} x2={23 - suspensionGap} y2={285} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <line x1={12 - suspensionGap} y1={285} x2={34 - suspensionGap} y2={285} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <circle cx={23 - suspensionGap} cy={285} r={3.5} fill="#060e20" />

      <rect x={182 + suspensionGap} y={250} width={30} height={70} rx={9} fill="#0f1c35" stroke={wheelColor} strokeWidth="1.5" />
      <circle cx={197 + suspensionGap} cy={285} r={11} fill="#1a2744" stroke={wheelColor} strokeWidth="0.8" />
      <line x1={197 + suspensionGap} y1={274} x2={197 + suspensionGap} y2={285} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <line x1={186 + suspensionGap} y1={285} x2={208 + suspensionGap} y2={285} stroke={wheelColor} strokeWidth="0.6" opacity="0.7" />
      <circle cx={197 + suspensionGap} cy={285} r={3.5} fill="#060e20" />

      <path d="M 110 42 C 85 42, 55 52, 42 68 C 32 80, 30 96, 30 110 L 30 290 C 30 310, 32 326, 42 336 C 55 352, 85 360, 110 360 C 135 360, 165 352, 178 336 C 188 326, 190 310, 190 290 L 190 110 C 190 96, 188 80, 178 68 C 165 52, 135 42, 110 42 Z"
        fill="url(#bodyGrad)" stroke="#2d3449" strokeWidth="1.5" filter="url(#carShadow)" />
      <path d="M 110 52 C 88 52, 61 61, 49 75 C 40 86, 38 100, 38 113 L 38 287 C 38 306, 40 320, 49 329 C 61 343, 88 350, 110 350 C 132 350, 159 343, 171 329 C 180 320, 182 306, 182 287 L 182 113 C 182 100, 180 86, 171 75 C 159 61, 132 52, 110 52 Z"
        fill="none" stroke="#1e293b" strokeWidth="0.6" opacity="0.6" />

      {frunkOpen ? (
        <>
          <rect x={58} y={58} width={104} height={44} rx={8} fill="#003354" stroke="#98cbff" strokeWidth="1.2" className="frunkGlowAnim" />
          <text x="110" y="84" textAnchor="middle" fill="#98cbff" fontSize="8" fontWeight="bold" fontFamily="Space Grotesk, system-ui" letterSpacing="2">OPEN</text>
        </>
      ) : (
        <>
          <rect x={58} y={54} width={104} height={44} rx={8} fill="#111c36" stroke="#2d3449" strokeWidth="1" />
          <line x1={84} y1={58} x2={84} y2={94} stroke="#1e293b" strokeWidth="0.5" opacity="0.7" />
          <line x1={136} y1={58} x2={136} y2={94} stroke="#1e293b" strokeWidth="0.5" opacity="0.7" />
        </>
      )}

      <ellipse cx={68} cy={72} rx={28} ry={12} fill="url(#hlGlow)" />
      <ellipse cx={152} cy={72} rx={28} ry={12} fill="url(#hlGlow)" />
      <rect x={48} y={67} width={28} height={10} rx={3} fill="#98cbff" opacity="0.9" filter="url(#lightGlow)" />
      <rect x={144} y={67} width={28} height={10} rx={3} fill="#98cbff" opacity="0.9" filter="url(#lightGlow)" />
      <line x1={76} y1={72} x2={144} y2={72} stroke="#98cbff" strokeWidth="0.4" opacity="0.2" />

      <rect x={55} y={140} width={110} height={120} rx={12} fill="#111c36" stroke="#2d3449" strokeWidth="1" />
      <rect x={72} y={155} width={76} height={48} rx={7} fill="#0b1326" stroke="#1e293b" strokeWidth="0.5" opacity="0.9" />

      <path d="M 62 140 L 158 140 L 152 110 L 68 110 Z" fill="#003354" fillOpacity="0.5" stroke="#98cbff" strokeWidth="0.5" opacity="0.7" />

      {climateOn && climateOpacity > 0 && (
        <path
          d="M 62 140 L 158 140 L 152 110 L 68 110 Z"
          fill={climateColor}
          fillOpacity={climateOpacity}
          className="climateFlow"
        />
      )}

      <line x1={75} y1={114} x2={149} y2={114} stroke="white" strokeWidth="0.5" opacity="0.08" />

      <path d="M 62 260 L 158 260 L 152 290 L 68 290 Z" fill="#003354" fillOpacity="0.5" stroke="#98cbff" strokeWidth="0.5" opacity="0.7" />

      <line x1={32} y1={175} x2={32} y2={225} stroke="#2d3449" strokeWidth="0.8" />
      <line x1={188} y1={175} x2={188} y2={225} stroke="#2d3449" strokeWidth="0.8" />
      <line x1={37} y1={200} x2={183} y2={200} stroke="#1e293b" strokeWidth="0.6" />

      {isLocked && (
        <>
          <rect x={31} y={148} width={8} height={80} rx={3} fill="#fbbf24" fillOpacity="0.25" stroke="#fbbf24" strokeWidth="1.2" strokeOpacity="0.8" className="lockPulse" filter="url(#softGlow)" />
          <rect x={181} y={148} width={8} height={80} rx={3} fill="#fbbf24" fillOpacity="0.25" stroke="#fbbf24" strokeWidth="1.2" strokeOpacity="0.8" className="lockPulse" filter="url(#softGlow)" />
        </>
      )}

      <ellipse cx={68} cy={330} rx={28} ry={12} fill="url(#tlGlow)" />
      <ellipse cx={152} cy={330} rx={28} ry={12} fill="url(#tlGlow)" />
      <rect x={48} y={325} width={28} height={10} rx={3} fill="#ef4444" opacity="0.9" filter="url(#lightGlow)" />
      <rect x={144} y={325} width={28} height={10} rx={3} fill="#ef4444" opacity="0.9" filter="url(#lightGlow)" />
      <line x1={76} y1={330} x2={144} y2={330} stroke="#ef4444" strokeWidth="0.4" opacity="0.2" />

      {frunkOpen && (
        <>
          <ellipse cx={110} cy={348} rx={40} ry={10} fill="url(#frunkGlowRad)" />
          <rect x={68} y={338} width={84} height={14} rx={4} fill="#fbbf24" fillOpacity="0.18" stroke="#fbbf24" strokeWidth="0.8" strokeOpacity="0.5" filter="url(#softGlow)" />
        </>
      )}

      {isCampMode && (
        <>
          <circle cx={110} cy={200} r={95} fill="none" stroke="#4edea3" strokeWidth="0.6" opacity="0.3" className="campPulse" />
          <circle cx={110} cy={200} r={82} fill="none" stroke="#4edea3" strokeWidth="0.3" opacity="0.15" className="campPulse" />
          <rect x={70} y={192} width={80} height={18} rx={4} fill="#002113" opacity="0.95" />
          <text x="110" y="205" textAnchor="middle" fill="#4edea3" fontSize="10" fontWeight="bold" fontFamily="Space Grotesk, system-ui" letterSpacing="2">CAMP MODE</text>
        </>
      )}
      {isDogMode && !isCampMode && (
        <>
          <circle cx={110} cy={200} r={90} fill="none" stroke="#fbbf24" strokeWidth="0.6" opacity="0.25" className="modePulse" />
          <rect x={74} y={192} width={72} height={18} rx={4} fill="#1a1000" opacity="0.95" />
          <text x="110" y="205" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold" fontFamily="Space Grotesk, system-ui" letterSpacing="2">DOG MODE</text>
        </>
      )}
      {isNormalMode && !isCampMode && !isDogMode && (
        <>
          <rect x={70} y={192} width={80} height={18} rx={4} fill="#0a1020" opacity="0.85" />
          <text x="110" y="205" textAnchor="middle" fill="#98cbff" fontSize="10" fontWeight="bold" fontFamily="Space Grotesk, system-ui" letterSpacing="2">NORMAL</text>
        </>
      )}

      {isOffline && (
        <g>
          <rect x={65} y={218} width={90} height={20} rx={4} fill="#1a0a00" opacity="0.95" />
          <rect x={65} y={218} width={90} height={20} rx={4} fill="none" stroke="#f59e0b" strokeWidth="0.5" opacity="0.6" />
          <text x="110" y="232" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="bold" fontFamily="Space Grotesk, system-ui" letterSpacing="2">OFFLINE</text>
        </g>
      )}
    </svg>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [backendError, setBackendError] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [lastExecutionTime, setLastExecutionTime] = useState<number | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [audioStatus, setAudioStatus] = useState<PlayerStatus>("connecting");
  const [processing, setProcessing] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const listeningRef = useRef(false);
  const cancelJobRef = useRef<(() => void) | null>(null);

  const handleAudioStatusChange = useCallback((status: PlayerStatus) => {
    setAudioStatus(status);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getVehicleState();
        setVehicleState(data);
        setBackendError(false);
      } catch {
        setBackendError(true);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  const toggleListening = () => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const SpeechRecognitionImpl = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return;

    // Cancel in-flight job if processing — keep listening so user can speak again
    if (processing && cancelJobRef.current) {
      cancelJobRef.current();
      cancelJobRef.current = null;
      setProcessing(false);
      return;
    }

    // Stop if already listening
    if (listeningRef.current && recognitionRef.current) {
      listeningRef.current = false;
      setListening(false);
      recognitionRef.current.stop();
      recognitionRef.current = null;
      return;
    }

    // Start listening
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventAPI) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript;
          setTranscript(text);
          setTranscriptExpanded(false);
          setAgentMessage("");
          setProcessing(true);

          const callbacks: VoiceCallbacks = {
            onAgentResult: (agent, message) => {
              const label = agent
                .replace("_agent", "")
                .replace(/_/g, " ")
                .replace(/\b\w/g, c => c.toUpperCase());
              setAgentMessage(prev => prev ? `${prev}\n[${label}] ${message}` : `[${label}] ${message}`);
            },
            onFinal: (finalResponse) => {
              const res = finalResponse as Record<string, unknown>;
              if (res.intent === "direct_answer" && typeof res.message === "string" && res.message) {
                setAgentMessage(res.message);
              }
              if (typeof res.execution_time_seconds === "number") {
                setLastExecutionTime(res.execution_time_seconds);
              }
              if (res.final_state) {
                setVehicleState(res.final_state as VehicleState);
              }
              setProcessing(false);
            },
            onError: (error) => {
              setAgentMessage(prev => prev ? `${prev}\nError: ${error}` : `Error: ${error}`);
              setProcessing(false);
            },
          };

          const cancel = sendVoiceCommand(text, callbacks);
          cancelJobRef.current = cancel;
        }
      }
    };

    recognition.onend = () => {
      // Restart automatically if still in listening mode
      if (listeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch { }
      }
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "no-speech") {
        // Restart on silence — don't stop
        if (listeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch { }
        }
      } else {
        // Fatal error — stop
        listeningRef.current = false;
        setListening(false);
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);
    recognition.start();
  };

  const isCloud = (vehicleState?.connectivity_mode ?? "cloud") === "cloud";
  const lockColor = vehicleState?.is_locked ? "#fbbf24" : "#ffb4ab";
  const tempColor = (vehicleState?.climate_temp ?? 22) < 20 ? "#98cbff" : (vehicleState?.climate_temp ?? 22) <= 23 ? "#4edea3" : "#fbbf24";
  const battColor = (vehicleState?.battery_level ?? 0) > 50 ? "#4edea3" : (vehicleState?.battery_level ?? 0) > 20 ? "#fbbf24" : "#ffb4ab";
  const frunkColor = vehicleState?.frunk_open ? "#fbbf24" : "#8b90a0";
  const suspColor = getSuspColor(vehicleState?.suspension_level);
  const modeColor = getModeColor(vehicleState?.vehicle_mode);
  const hasConversation = !!(transcript || agentMessage || processing);

  const sideCard = (icon: string, label: string, value: string, subtext: string, color: string, isActive = false) => (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: isActive ? "rgba(34,42,61,0.9)" : "rgba(19,27,46,0.6)",
      borderRadius: "12px", padding: "16px",
      border: isActive ? `1px solid ${color}66` : "1px solid rgba(65,71,84,0.3)",
      boxShadow: isActive ? `0 0 15px ${color}22` : "none",
      transition: "all 0.2s", backdropFilter: "blur(12px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "auto" }}>
        <span className="material-symbols-outlined" style={{ fontSize: "20px", color: isActive ? color : "#8b90a0", fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: isActive ? color : "#8b90a0", fontFamily: "Space Grotesk, system-ui" }}>{subtext}</span>
      </div>
      <div style={{ marginTop: "12px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.02em", textTransform: "uppercase", color: "#dae2fd", fontFamily: "Space Grotesk, system-ui" }}>{label}</div>
        <div style={{ fontSize: "10px", fontWeight: 700, color: isActive ? color : "#8b90a0", marginTop: "2px", fontFamily: "Space Grotesk, system-ui" }}>{value}</div>
      </div>
    </div>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <div style={{ background: "#0b1326", minHeight: "100vh", height: "100vh", display: "flex", flexDirection: "column", color: "#dae2fd", fontFamily: "Inter, system-ui", overflow: "hidden", position: "relative" }}>

        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #4edea3, transparent)", boxShadow: "0 0 10px #4edea3", zIndex: 50 }} />

        {/* Top Bar */}
        <header style={{ background: "#0b1326", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: "64px", flexShrink: 0, position: "relative", zIndex: 40, borderBottom: "1px solid rgba(65,71,84,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.2em", color: "#dae2fd", fontFamily: "Space Grotesk, system-ui" }}>KINETIC OBSERVATORY</span>
            <div style={{ width: "1px", height: "16px", background: "rgba(65,71,84,0.4)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(19,27,46,0.8)", padding: "3px 10px", borderRadius: "4px", border: "1px solid rgba(65,71,84,0.25)" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isCloud ? "#4edea3" : "#ffb4ab", boxShadow: isCloud ? "0 0 5px #4edea3" : "0 0 5px #ffb4ab" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: "#c1c6d7", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>
                {isCloud ? "Cloud Connected" : "Offline — Edge Mode"}
              </span>
            </div>
            <div style={{ width: "1px", height: "16px", background: "rgba(65,71,84,0.4)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(19,27,46,0.8)", padding: "3px 10px", borderRadius: "4px", border: "1px solid rgba(65,71,84,0.25)" }}>
              <span style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: audioStatus === "ready" ? "#4edea3" : audioStatus === "error" ? "#ffb4ab" : "#8b90a0",
                boxShadow: audioStatus === "ready" ? "0 0 5px #4edea3" : audioStatus === "error" ? "0 0 5px #ffb4ab" : "none",
              }} />
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: "#c1c6d7", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>
                {audioStatus === "ready" ? "AAOS Audio Ready" : audioStatus === "error" ? "Audio Error" : "Connecting Audio"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {backendError && <span style={{ fontSize: "10px", color: "#6b7280" }}>Backend unreachable</span>}
            <button
              onClick={async () => { setTunnelLoading(true); await toggleConnectivity(); setTunnelLoading(false); }}
              style={{ padding: "6px 14px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(34,42,61,0.8)", border: "1px solid rgba(65,71,84,0.35)", color: "#dae2fd", cursor: "pointer", fontFamily: "Space Grotesk, system-ui", whiteSpace: "nowrap" }}
            >{tunnelLoading ? "..." : isCloud ? "Simulate Tunnel" : "Restore Cloud"}</button>
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(to bottom, rgba(78,222,163,0.1), transparent)" }} />
        </header>

        {/* Main Content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Left Sidebar */}
          <aside style={{ width: "300px", flexShrink: 0, background: "rgba(19,27,46,0.6)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(65,71,84,0.15)", display: "flex", flexDirection: "column", padding: "20px 20px", gap: "10px" }}>
            <div style={{ marginBottom: "4px", paddingLeft: "4px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.2em", color: "#dae2fd", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>VEHICLE</div>
              <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#a0a8bc", textTransform: "uppercase", marginTop: "2px", fontFamily: "Space Grotesk, system-ui" }}>SYSTEMS NOMINAL</div>
            </div>
            {sideCard("lock", "Lock", vehicleState?.is_locked ? "SECURED" : "UNLOCKED", vehicleState?.is_locked ? "SECURE" : "OPEN", lockColor, vehicleState?.is_locked ?? false)}
            {sideCard("thermostat", "Climate", vehicleState?.climate_temp ? `${vehicleState.climate_temp}°C` : "—", vehicleState?.climate_on ? "ACTIVE" : "OFF", tempColor, vehicleState?.climate_on ?? false)}
            {sideCard("battery_charging_full", "Battery", vehicleState?.battery_level ? `${vehicleState.battery_level}%` : "—", vehicleState?.battery_level ? `${Math.round(vehicleState.battery_level * 3.5)} MI RANGE` : "—", battColor, (vehicleState?.battery_level ?? 0) > 20)}
            {sideCard("directions_car", "Frunk", vehicleState?.frunk_open ? "OPEN" : "CLOSED", "CARGO AREA", frunkColor, vehicleState?.frunk_open ?? false)}
            {sideCard("tune", "Suspension", vehicleState?.suspension_level ?? "—", `LEVEL: ${(vehicleState?.suspension_level ?? "standard").toUpperCase()}`, suspColor, vehicleState?.suspension_level === "high")}
            {sideCard("speed", "Mode", vehicleState?.vehicle_mode ?? "—", `${(vehicleState?.vehicle_mode ?? "normal").toUpperCase()} MODE`, modeColor, vehicleState?.vehicle_mode === "camp" || vehicleState?.vehicle_mode === "dog")}
          </aside>

          {/* Center Canvas */}
          <section style={{ flex: 1, position: "relative", background: "radial-gradient(circle at center, #131b2e 0%, #0b1326 100%)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.08, pointerEvents: "none", backgroundImage: "radial-gradient(#98cbff 0.5px, transparent 0.5px)", backgroundSize: "40px 40px" }} />
            <div style={{ position: "absolute", top: "40px", left: "40px", width: "40px", height: "40px", borderLeft: "2px solid rgba(152,203,255,0.3)", borderTop: "2px solid rgba(152,203,255,0.3)", borderRadius: "4px 0 0 0" }} />
            <div style={{ position: "absolute", top: "40px", right: "40px", width: "40px", height: "40px", borderRight: "2px solid rgba(152,203,255,0.3)", borderTop: "2px solid rgba(152,203,255,0.3)", borderRadius: "0 4px 0 0" }} />
            <div style={{ position: "absolute", bottom: "40px", left: "40px", width: "40px", height: "40px", borderLeft: "2px solid rgba(152,203,255,0.3)", borderBottom: "2px solid rgba(152,203,255,0.3)", borderRadius: "0 0 0 4px" }} />
            <div style={{ position: "absolute", bottom: "40px", right: "40px", width: "40px", height: "40px", borderRight: "2px solid rgba(152,203,255,0.3)", borderBottom: "2px solid rgba(152,203,255,0.3)", borderRadius: "0 0 4px 0" }} />

            <CarVisualization state={vehicleState} />

            {/* Now Playing — bottom left of canvas */}
            <div style={{ position: "absolute", bottom: "40px", left: "40px", zIndex: 20 }}>
              <NowPlaying />
            </div>

            {/* Conversation panel */}
            {hasConversation && (
              <div style={{ position: "absolute", top: "56px", right: "56px", width: "260px", maxWidth: "260px", maxHeight: "55vh", overflowY: "auto", background: "rgba(10,16,30,0.92)", border: "1px solid rgba(152,203,255,0.15)", borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", backdropFilter: "blur(16px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", zIndex: 20 }}>
                {transcript && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#98cbff", flexShrink: 0, marginTop: "1px" }}>record_voice_over</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                      <span style={{
                        fontSize: "12px", color: "#bcc7de", fontStyle: "italic", lineHeight: 1.4,
                        ...(transcriptExpanded ? {} : {
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        } as React.CSSProperties),
                      }}>&ldquo;{transcript}&rdquo;</span>
                      <button
                        onClick={() => setTranscriptExpanded(prev => !prev)}
                        style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "11px", color: "#8b90a0", fontFamily: "Space Grotesk, system-ui", letterSpacing: "0.03em" }}
                      >
                        {transcriptExpanded ? "Show less" : "Read more"}
                      </button>
                    </div>
                  </div>
                )}
                {processing && (
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4edea3", flexShrink: 0, animation: "agentPulse 1.2s ease-in-out infinite" }} />
                    <span style={{ fontSize: "11px", color: "#4edea3", fontFamily: "Space Grotesk, system-ui", fontWeight: 600, letterSpacing: "0.06em" }}>Agents working...</span>
                  </div>
                )}
                {agentMessage && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#4edea3", flexShrink: 0, marginTop: "1px" }}>smart_toy</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "13px", color: "#dae2fd", lineHeight: 1.5, fontFamily: "Space Grotesk, system-ui", fontWeight: 500, whiteSpace: "pre-line" }}>{agentMessage}</span>
                      {lastExecutionTime != null && (
                        <span style={{ fontSize: "10px", color: "#8b90a0", fontFamily: "Space Grotesk, system-ui", letterSpacing: "0.04em" }}>
                          Agent responded in {lastExecutionTime}s
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mic button */}
            <div style={{ position: "absolute", bottom: "40px", right: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", inset: "-12px", borderRadius: "50%", background: listening ? "rgba(152,203,255,0.12)" : "transparent", filter: "blur(16px)", transition: "all 0.5s" }} />
                {listening && (
                  <>
                    <div style={{ position: "absolute", inset: "-6px", borderRadius: "50%", border: "1.5px solid rgba(152,203,255,0.5)", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
                    <div style={{ position: "absolute", inset: "-18px", borderRadius: "50%", border: "1px solid rgba(152,203,255,0.2)", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.3s" }} />
                  </>
                )}
                <button
                  onClick={toggleListening}
                  aria-label="Toggle voice recognition"
                  style={{ position: "relative", width: "96px", height: "96px", borderRadius: "50%", background: "rgba(45,52,73,0.95)", border: "2.5px solid rgba(255,255,255,0.88)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s", boxShadow: listening ? "0 0 0 2.5px rgba(255,255,255,0.88), 0 0 30px rgba(152,203,255,0.6), 0 0 60px rgba(152,203,255,0.2)" : "0 0 0 2.5px rgba(255,255,255,0.88), 0 0 20px rgba(152,203,255,0.25)" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "44px", color: listening ? "#98cbff" : "white", fontVariationSettings: "'FILL' 1", transition: "color 0.2s" }}>mic</span>
                </button>
              </div>
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", color: processing ? "#4edea3" : listening ? "#98cbff" : "#a0a8bc", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui", transition: "color 0.3s" }}>
                {processing ? "Processing..." : listening ? "Listening..." : "Assistant Ready"}
              </span>
            </div>
          </section>

          {/* Right Sidebar — Agent Hierarchy */}
          <aside style={{ width: "264px", flexShrink: 0, background: "rgba(19,27,46,0.6)", backdropFilter: "blur(20px)", borderLeft: "1px solid rgba(65,71,84,0.15)", display: "flex", flexDirection: "column", padding: "20px 14px", gap: "12px", overflowY: "auto" }}>
            <div style={{ paddingLeft: "2px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.2em", color: "#dae2fd", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>AGENT NETWORK</div>
              <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#a0a8bc", textTransform: "uppercase", marginTop: "2px", fontFamily: "Space Grotesk, system-ui" }}>CLICK NODE TO EXPAND</div>
            </div>
            <AgentTree />
          </aside>
        </div>

        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at center, transparent 0%, rgba(6,14,32,0.35) 100%)", zIndex: 10 }} />

        <SpotifyPlayer onStatusChange={handleAudioStatusChange} />

        <style>{`
          @keyframes ping { 0%{transform:scale(1);opacity:0.8;} 80%,100%{transform:scale(1.5);opacity:0;} }
          @keyframes agentPulse { 0%,100%{opacity:0.35} 50%{opacity:1} }
          .material-symbols-outlined { font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; }
        `}</style>
      </div>
    </>
  );
}