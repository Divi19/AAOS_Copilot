"use client";

import { useEffect, useRef, useState } from "react";
import { getVehicleState, sendVoiceCommand, toggleConnectivity } from "../lib/api";

interface SpeechRecognitionAPI extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventAPI) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
interface SpeechRecognitionEventAPI {
  results: { 0: { 0: { transcript: string } } };
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

function CarVisualization({ state }: { state: VehicleState | null }) {
  const suspensionGap =
    state?.suspension_level === "low" ? 2
      : state?.suspension_level === "high" ? 12
        : 6;

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

      {/* Wheels */}
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

      {/* Car body */}
      <path d="M 110 42 C 85 42, 55 52, 42 68 C 32 80, 30 96, 30 110 L 30 290 C 30 310, 32 326, 42 336 C 55 352, 85 360, 110 360 C 135 360, 165 352, 178 336 C 188 326, 190 310, 190 290 L 190 110 C 190 96, 188 80, 178 68 C 165 52, 135 42, 110 42 Z"
        fill="url(#bodyGrad)" stroke="#2d3449" strokeWidth="1.5" filter="url(#carShadow)" />

      {/* Hood / frunk */}
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

      {/* Headlights */}
      <ellipse cx={68} cy={72} rx={28} ry={12} fill="url(#hlGlow)" />
      <ellipse cx={152} cy={72} rx={28} ry={12} fill="url(#hlGlow)" />
      <rect x={48} y={67} width={28} height={10} rx={3} fill="#98cbff" opacity="0.9" filter="url(#lightGlow)" />
      <rect x={144} y={67} width={28} height={10} rx={3} fill="#98cbff" opacity="0.9" filter="url(#lightGlow)" />

      {/* Cabin */}
      <rect x={55} y={140} width={110} height={120} rx={12} fill="#111c36" stroke="#2d3449" strokeWidth="1" />
      <rect x={72} y={155} width={76} height={48} rx={7} fill="#0b1326" stroke="#1e293b" strokeWidth="0.5" opacity="0.9" />

      {/* Windshield base */}
      <path d="M 62 140 L 158 140 L 152 110 L 68 110 Z" fill="#003354" fillOpacity="0.5" stroke="#98cbff" strokeWidth="0.5" opacity="0.7" />

      {/* Climate tint */}
      {climateOn && climateOpacity > 0 && (
        <path d="M 62 140 L 158 140 L 152 110 L 68 110 Z" fill={climateColor} fillOpacity={climateOpacity} className="climateFlow" />
      )}

      {/* Rear window */}
      <path d="M 62 260 L 158 260 L 152 290 L 68 290 Z" fill="#003354" fillOpacity="0.5" stroke="#98cbff" strokeWidth="0.5" opacity="0.7" />

      {/* Door seams */}
      <line x1={32} y1={175} x2={32} y2={225} stroke="#2d3449" strokeWidth="0.8" />
      <line x1={188} y1={175} x2={188} y2={225} stroke="#2d3449" strokeWidth="0.8" />
      <line x1={37} y1={200} x2={183} y2={200} stroke="#1e293b" strokeWidth="0.6" />

      {/* Lock highlights */}
      {isLocked && (
        <>
          <rect x={31} y={148} width={8} height={80} rx={3} fill="#fbbf24" fillOpacity="0.25" stroke="#fbbf24" strokeWidth="1.2" strokeOpacity="0.8" className="lockPulse" filter="url(#softGlow)" />
          <rect x={181} y={148} width={8} height={80} rx={3} fill="#fbbf24" fillOpacity="0.25" stroke="#fbbf24" strokeWidth="1.2" strokeOpacity="0.8" className="lockPulse" filter="url(#softGlow)" />
        </>
      )}

      {/* Tail lights */}
      <ellipse cx={68} cy={330} rx={28} ry={12} fill="url(#tlGlow)" />
      <ellipse cx={152} cy={330} rx={28} ry={12} fill="url(#tlGlow)" />
      <rect x={48} y={325} width={28} height={10} rx={3} fill="#ef4444" opacity="0.9" filter="url(#lightGlow)" />
      <rect x={144} y={325} width={28} height={10} rx={3} fill="#ef4444" opacity="0.9" filter="url(#lightGlow)" />

      {/* Frunk open glow */}
      {frunkOpen && (
        <>
          <ellipse cx={110} cy={348} rx={40} ry={10} fill="url(#frunkGlowRad)" />
          <rect x={68} y={338} width={84} height={14} rx={4} fill="#fbbf24" fillOpacity="0.18" stroke="#fbbf24" strokeWidth="0.8" strokeOpacity="0.5" filter="url(#softGlow)" />
        </>
      )}

      {/* Mode badges */}
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
    </svg>
  );
}

export default function Dashboard() {
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [backendError, setBackendError] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [lastTools, setLastTools] = useState<{ agent: string; tool: string }[]>([]);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);

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
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: SpeechRecognitionEventAPI) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      sendVoiceCommand(text)
        .then((res) => {
          if (res.tools_called) setLastTools(res.tools_called);
          if (res.message) setAgentMessage(res.message);
        })
        .catch(() => { });
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const isCloud = (vehicleState?.connectivity_mode ?? "cloud") === "cloud";
  const lockColor = vehicleState?.is_locked ? "#fbbf24" : "#ffb4ab";
  const tempColor = (vehicleState?.climate_temp ?? 22) < 20 ? "#98cbff" : (vehicleState?.climate_temp ?? 22) <= 23 ? "#4edea3" : "#fbbf24";
  const battColor = (vehicleState?.battery_level ?? 0) > 50 ? "#4edea3" : (vehicleState?.battery_level ?? 0) > 20 ? "#fbbf24" : "#ffb4ab";
  const frunkColor = vehicleState?.frunk_open ? "#fbbf24" : "#8b90a0";
  const suspColor = getSuspColor(vehicleState?.suspension_level);
  const modeColor = getModeColor(vehicleState?.vehicle_mode);
  const hasConversation = !!(transcript || agentMessage);

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

        <header style={{ background: "#0b1326", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: "64px", flexShrink: 0, position: "relative", zIndex: 40, borderBottom: "1px solid rgba(65,71,84,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <span style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.2em", color: "#dae2fd", fontFamily: "Space Grotesk, system-ui" }}>KINETIC OBSERVATORY</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(19,27,46,0.8)", padding: "3px 10px", borderRadius: "4px", border: "1px solid rgba(65,71,84,0.25)" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isCloud ? "#4edea3" : "#ffb4ab" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: "#c1c6d7", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>
                {isCloud ? "Cloud Connected" : "Offline — Edge Mode"}
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
        </header>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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

          <section style={{ flex: 1, position: "relative", background: "radial-gradient(circle at center, #131b2e 0%, #0b1326 100%)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CarVisualization state={vehicleState} />

            {/* Conversation panel */}
            {hasConversation && (
              <div style={{ position: "absolute", top: "56px", right: "56px", width: "280px", background: "rgba(10,16,30,0.92)", border: "1px solid rgba(152,203,255,0.15)", borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", backdropFilter: "blur(16px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", zIndex: 20 }}>
                {transcript && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#98cbff", flexShrink: 0 }}>record_voice_over</span>
                    <span style={{ fontSize: "12px", color: "#bcc7de", fontStyle: "italic", lineHeight: 1.4 }}>&ldquo;{transcript}&rdquo;</span>
                  </div>
                )}
                {agentMessage && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#4edea3", flexShrink: 0, marginTop: "1px" }}>smart_toy</span>
                    <span style={{ fontSize: "13px", color: "#dae2fd", lineHeight: 1.5, fontFamily: "Space Grotesk, system-ui", fontWeight: 500 }}>{agentMessage}</span>
                  </div>
                )}
              </div>
            )}

            {/* Mic button */}
            <div style={{ position: "absolute", bottom: "40px", right: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
              <div style={{ position: "relative" }}>
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
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", color: listening ? "#98cbff" : "#a0a8bc", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui", transition: "color 0.3s" }}>
                {listening ? "Listening..." : "Assistant Ready"}
              </span>
            </div>
          </section>
        </div>

        <style>{`
          @keyframes ping { 0%{transform:scale(1);opacity:0.8;} 80%,100%{transform:scale(1.5);opacity:0;} }
          .material-symbols-outlined { font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; }
        `}</style>
      </div>
    </>
  );
}