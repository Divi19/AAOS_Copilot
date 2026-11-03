"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVehicleState, sendVoiceCommand, toggleConnectivity, VoiceCallbacks, getAgentHierarchy, synthesizeSpeech } from "../lib/api";
import SpotifyPlayer, { PlayerStatus } from "../components/SpotifyPlayer";
import NowPlaying from "../components/NowPlaying";
import AgentTree from "../components/AgentTree";
import CarView from "../components/CarView";
import type { VehicleState } from "../lib/vehicleState";

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

interface ConversationExchange {
  id: string;
  transcript: string;
  agentMessage: string;
  executionTime: number | null;
  timestamp: Date;
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

// ─── TTS helper — wraps raw LINEAR16 PCM in a WAV container for decodeAudioData ──

function pcmToWav(pcmBuffer: ArrayBuffer, sampleRate = 24000): ArrayBuffer {
  const pcm = new Uint8Array(pcmBuffer);
  const wav = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(wav);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true);            // PCM chunk size
  v.setUint16(20, 1, true);             // PCM format
  v.setUint16(22, 1, true);             // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);             // block align
  v.setUint16(34, 16, true);            // bits per sample
  str(36, "data"); v.setUint32(40, pcm.length, true);
  new Uint8Array(wav).set(pcm, 44);
  return wav;
}

// ─── Voice capture tuning ─────────────────────────────────────────────────────

const SILENCE_MS = 2000;   // send the command after this long with no new speech
const NO_SPEECH_MS = 10000; // stop listening if nothing is heard at all

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [backendError, setBackendError] = useState(false);
  const [listening, setListening] = useState(false);
  const [conversations, setConversations] = useState<ConversationExchange[]>([]);
  const [currentExchange, setCurrentExchange] = useState<ConversationExchange | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [audioStatus, setAudioStatus] = useState<PlayerStatus>("connecting");
  const [processing, setProcessing] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [completedAgents, setCompletedAgents] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const listeningRef = useRef(false);
  const cancelJobRef = useRef<(() => void) | null>(null);
  const agentSubIdsRef = useRef<string[]>([]);
  const completedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentExchangeRef = useRef<ConversationExchange | null>(null);
  // Speech heard so far: committedText survives browser-initiated restarts, sessionText is the live session
  const committedTextRef = useRef("");
  const sessionTextRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAudioStatusChange = useCallback((status: PlayerStatus) => {
    setAudioStatus(status);
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (listeningRef.current) return;
    const audioBase64 = await synthesizeSpeech(text);
    if (!audioBase64) return;
    try {
      setIsSpeaking(true);
      const pcm = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const wav = pcmToWav(pcm.buffer);
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(wav);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => { setIsSpeaking(false); ctx.close(); };
      source.start();
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  useEffect(() => {
    getAgentHierarchy()
      .then(data => { agentSubIdsRef.current = data.hierarchy.active_sub_agents; })
      .catch(() => {});
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

  // Sends one finished voice command to the agents and wires up the result callbacks
  const submitCommand = (text: string) => {
    if (completedClearRef.current) clearTimeout(completedClearRef.current);
    setActiveAgents(agentSubIdsRef.current);
    setCompletedAgents([]);
    setProcessing(true);

    const newExchange: ConversationExchange = {
      id: crypto.randomUUID(),
      transcript: text,
      agentMessage: "",
      executionTime: null,
      timestamp: new Date(),
    };
    currentExchangeRef.current = newExchange;
    setCurrentExchange(newExchange);

    const callbacks: VoiceCallbacks = {
      onAgentResult: (agent, message) => {
        setActiveAgents(prev => prev.filter(a => a !== agent));
        setCompletedAgents(prev => prev.includes(agent) ? prev : [...prev, agent]);
        const label = agent
          .replace("_agent", "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase());
        if (currentExchangeRef.current) {
          const updated: ConversationExchange = {
            ...currentExchangeRef.current,
            agentMessage: currentExchangeRef.current.agentMessage
              ? `${currentExchangeRef.current.agentMessage}\n[${label}] ${message}`
              : `[${label}] ${message}`,
          };
          currentExchangeRef.current = updated;
          setCurrentExchange(updated);
        }
      },
      onFinal: (finalResponse) => {
        const res = finalResponse as Record<string, unknown>;
        let finalMessage = currentExchangeRef.current?.agentMessage ?? "";
        if (res.intent === "direct_answer" && typeof res.message === "string" && res.message) {
          finalMessage = res.message;
        }
        const execTime = typeof res.execution_time_seconds === "number" ? res.execution_time_seconds : null;
        if (res.final_state) {
          setVehicleState(res.final_state as VehicleState);
        }
        if (currentExchangeRef.current) {
          const finalized: ConversationExchange = {
            ...currentExchangeRef.current,
            agentMessage: finalMessage,
            executionTime: execTime,
          };
          setConversations(prev => [finalized, ...prev].slice(0, 5));
        }
        currentExchangeRef.current = null;
        setCurrentExchange(null);
        setActiveAgents([]);
        setProcessing(false);
        completedClearRef.current = setTimeout(() => setCompletedAgents([]), 3000);
        const messageToSpeak = typeof res.message === "string" ? res.message : "";
        if (messageToSpeak) speakResponse(messageToSpeak);
      },
      onError: (error) => {
        if (currentExchangeRef.current) {
          const errMsg = currentExchangeRef.current.agentMessage
            ? `${currentExchangeRef.current.agentMessage}\nError: ${error}`
            : `Error: ${error}`;
          const finalized: ConversationExchange = {
            ...currentExchangeRef.current,
            agentMessage: errMsg,
            executionTime: null,
          };
          setConversations(prev => [finalized, ...prev].slice(0, 5));
          currentExchangeRef.current = null;
          setCurrentExchange(null);
        }
        setActiveAgents([]);
        setCompletedAgents([]);
        setProcessing(false);
      },
    };

    // conversations is newest-first; send oldest-first so the backend's history[-3:] is the latest 3
    const history = [...conversations].reverse().map(c => ({
      transcript: c.transcript,
      agentMessage: c.agentMessage,
    }));
    const cancel = sendVoiceCommand(text, history, callbacks);
    cancelJobRef.current = cancel;
  };

  const clearVoiceTimers = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
    silenceTimerRef.current = null;
    noSpeechTimerRef.current = null;
  };

  // Ends the listening session; when send is true, everything heard is submitted as one command
  const stopListening = (send: boolean) => {
    clearVoiceTimers();
    const text = `${committedTextRef.current} ${sessionTextRef.current}`.replace(/\s+/g, " ").trim();
    committedTextRef.current = "";
    sessionTextRef.current = "";
    listeningRef.current = false;
    setListening(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    if (send && text) submitCommand(text);
  };

  useEffect(() => () => {
    clearVoiceTimers();
    recognitionRef.current?.stop();
  }, []);

  const toggleListening = () => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const SpeechRecognitionImpl = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return;

    // Cancel in-flight job if processing
    if (processing && cancelJobRef.current) {
      cancelJobRef.current();
      cancelJobRef.current = null;
      setProcessing(false);
      setActiveAgents([]);
      setCompletedAgents([]);
      return;
    }

    // Second click while listening sends what was heard straight away
    if (listeningRef.current) {
      stopListening(true);
      return;
    }

    // Start listening — one command per click, sent after SILENCE_MS of quiet
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventAPI) => {
      // results holds every phrase of this session (final and interim), so rebuild the whole transcript
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        parts.push(event.results[i][0].transcript);
      }
      sessionTextRef.current = parts.join(" ");

      if (noSpeechTimerRef.current) {
        clearTimeout(noSpeechTimerRef.current);
        noSpeechTimerRef.current = null;
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => stopListening(true), SILENCE_MS);
    };

    recognition.onend = () => {
      if (!listeningRef.current || recognitionRef.current !== recognition) return;
      // The browser ended the session on its own (e.g. a long pause) — keep what was heard and resume
      committedTextRef.current = `${committedTextRef.current} ${sessionTextRef.current}`;
      sessionTextRef.current = "";
      try {
        recognition.start();
      } catch {
        stopListening(true);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      // no-speech / aborted end the session normally — onend resumes it
      if (event.error === "no-speech" || event.error === "aborted") return;
      // Fatal error (e.g. mic permission denied) — stop without sending a partial command
      stopListening(false);
    };

    committedTextRef.current = "";
    sessionTextRef.current = "";
    noSpeechTimerRef.current = setTimeout(() => stopListening(false), NO_SPEECH_MS);
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
  const hasConversation = conversations.length > 0 || currentExchange !== null;
  const isCurrentExpanded = currentExchange ? expandedIds.has(currentExchange.id) : false;

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
            {isSpeaking && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(19,27,46,0.8)", padding: "3px 10px", borderRadius: "4px", border: "1px solid rgba(65,71,84,0.25)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "#4edea3", animation: "agentPulse 1.2s ease-in-out infinite", fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: "#c1c6d7", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>Speaking</span>
              </div>
            )}
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
          <aside style={{ width: "300px", flexShrink: 0, background: "rgba(19,27,46,0.6)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(65,71,84,0.15)", display: "flex", flexDirection: "column", padding: "20px 20px", gap: "10px", overflowY: "auto" }}>
            <div style={{ marginBottom: "4px", paddingLeft: "4px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.2em", color: "#dae2fd", textTransform: "uppercase", fontFamily: "Space Grotesk, system-ui" }}>VEHICLE</div>
              <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#a0a8bc", textTransform: "uppercase", marginTop: "2px", fontFamily: "Space Grotesk, system-ui" }}>SYSTEMS NOMINAL</div>
            </div>
            {sideCard("lock", "Lock", vehicleState?.is_locked ? "SECURED" : "UNLOCKED", vehicleState?.is_locked ? "SECURE" : "OPEN", lockColor, vehicleState?.is_locked ?? false)}
            {sideCard("child_care", "Child Lock", vehicleState?.child_lock_on ? "ENGAGED" : "OFF", "REAR DOORS", "#fbbf24", vehicleState?.child_lock_on ?? false)}
            {sideCard("thermostat", "Climate", vehicleState?.climate_temp ? `${vehicleState.climate_temp}°C` : "—", vehicleState?.climate_on ? "ACTIVE" : "OFF", tempColor, vehicleState?.climate_on ?? false)}
            {sideCard("battery_charging_full", "Battery", vehicleState?.battery_level ? `${vehicleState.battery_level}%` : "—", vehicleState?.battery_level ? `${Math.round(vehicleState.battery_level * 3.5)} MI RANGE` : "—", battColor, (vehicleState?.battery_level ?? 0) > 20)}
            {sideCard("directions_car", "Frunk", vehicleState?.frunk_open ? "OPEN" : "CLOSED", "CARGO AREA", frunkColor, vehicleState?.frunk_open ?? false)}
            {sideCard("tune", "Suspension", vehicleState?.suspension_level ?? "—", `LEVEL: ${(vehicleState?.suspension_level ?? "standard").toUpperCase()}`, suspColor, vehicleState?.suspension_level === "high")}
            {sideCard("speed", "Mode", vehicleState?.vehicle_mode ?? "—", `${(vehicleState?.vehicle_mode ?? "normal").toUpperCase()} MODE`, modeColor, vehicleState?.vehicle_mode === "camp" || vehicleState?.vehicle_mode === "dog")}
            {sideCard("airline_seat_recline_extra", "Seat Heat", (vehicleState?.seat_heating_driver ?? 0) > 0 ? `Driver L${vehicleState!.seat_heating_driver}` : "OFF", (vehicleState?.seat_heating_driver ?? 0) > 0 ? "ACTIVE" : "OFF", "#fbbf24", (vehicleState?.seat_heating_driver ?? 0) > 0)}
            {sideCard("mode_fan", "Seat Vent", (vehicleState?.seat_ventilation_driver ?? 0) > 0 ? `Driver L${vehicleState!.seat_ventilation_driver}` : "OFF", (vehicleState?.seat_ventilation_driver ?? 0) > 0 ? "ACTIVE" : "OFF", "#98cbff", (vehicleState?.seat_ventilation_driver ?? 0) > 0)}
            {sideCard("air_purifier_gen", "Air Quality", vehicleState?.aqi ? `AQI ${vehicleState.aqi}` : "—", vehicleState?.air_purification_on ? "PURIFYING" : "STANDARD", vehicleState?.air_purification_on ? "#4edea3" : "#8b90a0", vehicleState?.air_purification_on ?? false)}
            {sideCard("sync_alt", "Air Flow", vehicleState?.recirculation_on ? "RECIRCULATING" : "OUTSIDE AIR", vehicleState?.recirculation_on ? "CABIN AIR" : "FRESH AIR", "#98cbff", vehicleState?.recirculation_on ?? false)}
          </aside>

          {/* Center Canvas */}
          <section style={{ flex: 1, position: "relative", background: "radial-gradient(circle at center, #131b2e 0%, #0b1326 100%)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.08, pointerEvents: "none", backgroundImage: "radial-gradient(#98cbff 0.5px, transparent 0.5px)", backgroundSize: "40px 40px" }} />
            <div style={{ position: "absolute", top: "40px", left: "40px", width: "40px", height: "40px", borderLeft: "2px solid rgba(152,203,255,0.3)", borderTop: "2px solid rgba(152,203,255,0.3)", borderRadius: "4px 0 0 0" }} />
            <div style={{ position: "absolute", top: "40px", right: "40px", width: "40px", height: "40px", borderRight: "2px solid rgba(152,203,255,0.3)", borderTop: "2px solid rgba(152,203,255,0.3)", borderRadius: "0 4px 0 0" }} />
            <div style={{ position: "absolute", bottom: "40px", left: "40px", width: "40px", height: "40px", borderLeft: "2px solid rgba(152,203,255,0.3)", borderBottom: "2px solid rgba(152,203,255,0.3)", borderRadius: "0 0 0 4px" }} />
            <div style={{ position: "absolute", bottom: "40px", right: "40px", width: "40px", height: "40px", borderRight: "2px solid rgba(152,203,255,0.3)", borderBottom: "2px solid rgba(152,203,255,0.3)", borderRadius: "0 0 4px 0" }} />

            <CarView state={vehicleState} />

            {/* Now Playing — bottom left of canvas */}
            <div style={{ position: "absolute", bottom: "40px", left: "40px", zIndex: 20 }}>
              <NowPlaying />
            </div>

            {/* Conversation history panel */}
            {hasConversation && (
              <div style={{ position: "absolute", top: "56px", right: "56px", width: "260px", maxWidth: "260px", maxHeight: "55vh", overflowY: "auto", scrollBehavior: "smooth", background: "rgba(10,16,30,0.92)", border: "1px solid rgba(152,203,255,0.15)", borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", backdropFilter: "blur(16px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", zIndex: 20 }}>

                {/* In-progress exchange */}
                {currentExchange && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#98cbff", flexShrink: 0, marginTop: "1px" }}>record_voice_over</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                        <span style={{
                          fontSize: "12px", color: "#bcc7de", fontStyle: "italic", lineHeight: 1.4,
                          ...(isCurrentExpanded ? {} : {
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          } as React.CSSProperties),
                        }}>&ldquo;{currentExchange.transcript}&rdquo;</span>
                        <button
                          onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(currentExchange.id) ? n.delete(currentExchange.id) : n.add(currentExchange.id); return n; })}
                          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "11px", color: "#8b90a0", fontFamily: "Space Grotesk, system-ui", letterSpacing: "0.03em" }}
                        >{isCurrentExpanded ? "Show less" : "Read more"}</button>
                      </div>
                    </div>
                    {processing && (
                      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4edea3", flexShrink: 0, animation: "agentPulse 1.2s ease-in-out infinite" }} />
                        <span style={{ fontSize: "11px", color: "#4edea3", fontFamily: "Space Grotesk, system-ui", fontWeight: 600, letterSpacing: "0.06em" }}>Agents working...</span>
                      </div>
                    )}
                    {currentExchange.agentMessage && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#4edea3", flexShrink: 0, marginTop: "1px" }}>smart_toy</span>
                        <span style={{ fontSize: "13px", color: "#dae2fd", lineHeight: 1.5, fontFamily: "Space Grotesk, system-ui", fontWeight: 500, whiteSpace: "pre-line" }}>{currentExchange.agentMessage}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Past exchanges */}
                {conversations.map((exchange, index) => {
                  const isFirst = index === 0 && !currentExchange;
                  const isExpanded = expandedIds.has(exchange.id);
                  return (
                    <div key={exchange.id} style={{ opacity: isFirst ? 1 : 0.7 }}>
                      {(currentExchange !== null || index > 0) && (
                        <div style={{ height: "1px", background: "rgba(152,203,255,0.08)", margin: "10px 0" }} />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#98cbff", flexShrink: 0, marginTop: "1px" }}>record_voice_over</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                            <span style={{
                              fontSize: "12px", color: "#bcc7de", fontStyle: "italic", lineHeight: 1.4,
                              ...(isExpanded ? {} : {
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              } as React.CSSProperties),
                            }}>&ldquo;{exchange.transcript}&rdquo;</span>
                            <button
                              onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(exchange.id) ? n.delete(exchange.id) : n.add(exchange.id); return n; })}
                              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "11px", color: "#8b90a0", fontFamily: "Space Grotesk, system-ui", letterSpacing: "0.03em" }}
                            >{isExpanded ? "Show less" : "Read more"}</button>
                          </div>
                        </div>
                        {exchange.agentMessage && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#4edea3", flexShrink: 0, marginTop: "1px" }}>smart_toy</span>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span style={{ fontSize: "13px", color: "#dae2fd", lineHeight: 1.5, fontFamily: "Space Grotesk, system-ui", fontWeight: 500, whiteSpace: "pre-line" }}>{exchange.agentMessage}</span>
                              <span style={{ fontSize: "10px", color: "#8b90a0", fontFamily: "Space Grotesk, system-ui", letterSpacing: "0.04em" }}>
                                {exchange.executionTime != null ? `${exchange.executionTime}s · ` : ""}
                                {exchange.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

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
            <AgentTree activeAgents={activeAgents} completedAgents={completedAgents} processing={processing} />
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