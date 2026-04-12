"use client";

import { useEffect, useState } from "react";
import { getVehicleState, toggleConnectivity } from "../lib/api";

interface VehicleState {
  is_locked: boolean;
  climate_on: boolean;
  climate_temp: number;
  battery_level: number;
  vehicle_mode: string;
  frunk_open: boolean;
  suspension_level: string;
  connectivity_mode?: string;
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

export default function Dashboard() {
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [backendError, setBackendError] = useState(false);
  const [tunnelLoading, setTunnelLoading] = useState(false);

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

  const isCloud = (vehicleState?.connectivity_mode ?? "cloud") === "cloud";
  const lockColor = vehicleState?.is_locked ? "#fbbf24" : "#ffb4ab";
  const tempColor = (vehicleState?.climate_temp ?? 22) < 20 ? "#98cbff" : (vehicleState?.climate_temp ?? 22) <= 23 ? "#4edea3" : "#fbbf24";
  const battColor = (vehicleState?.battery_level ?? 0) > 50 ? "#4edea3" : (vehicleState?.battery_level ?? 0) > 20 ? "#fbbf24" : "#ffb4ab";
  const frunkColor = vehicleState?.frunk_open ? "#fbbf24" : "#8b90a0";
  const suspColor = getSuspColor(vehicleState?.suspension_level);
  const modeColor = getModeColor(vehicleState?.vehicle_mode);

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

      <div style={{ background: "#0b1326", minHeight: "100vh", height: "100vh", display: "flex", flexDirection: "column", color: "#dae2fd", fontFamily: "Inter, system-ui", overflow: "hidden" }}>

        <header style={{ background: "#0b1326", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: "64px", flexShrink: 0, borderBottom: "1px solid rgba(65,71,84,0.2)" }}>
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
              style={{ padding: "6px 14px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(34,42,61,0.8)", border: "1px solid rgba(65,71,84,0.35)", color: "#dae2fd", cursor: "pointer", fontFamily: "Space Grotesk, system-ui" }}
            >{tunnelLoading ? "..." : isCloud ? "Simulate Tunnel" : "Restore Cloud"}</button>
          </div>
        </header>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <aside style={{ width: "300px", flexShrink: 0, background: "rgba(19,27,46,0.6)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(65,71,84,0.15)", display: "flex", flexDirection: "column", padding: "20px", gap: "10px" }}>
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

          <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at center, #131b2e 0%, #0b1326 100%)" }}>
            <p style={{ color: "#8b90a0", fontFamily: "Space Grotesk, system-ui" }}>Car visualization coming soon</p>
          </section>
        </div>
      </div>
    </>
  );
}