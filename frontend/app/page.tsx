"use client";

import { useEffect, useState } from "react";
import { getVehicleState, toggleConnectivity } from "../lib/api";

interface VehicleState {
  is_locked: boolean;
  climate_on: boolean;
  climate_temp: number;
  battery_level: number;
  vehicle_mode: string;
  connectivity_mode?: string;
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

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <div style={{ background: "#0b1326", minHeight: "100vh", height: "100vh", display: "flex", flexDirection: "column", color: "#dae2fd", fontFamily: "Inter, system-ui", overflow: "hidden" }}>

        {/* Top Bar */}
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

        {/* Main Content Placeholder */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <aside style={{ width: "300px", background: "rgba(19,27,46,0.6)", borderRight: "1px solid rgba(65,71,84,0.15)", padding: "20px" }}>
            <p style={{ color: "#8b90a0", fontSize: "12px" }}>Sidebar — vehicle stats coming soon</p>
          </aside>
          <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at center, #131b2e 0%, #0b1326 100%)" }}>
            <p style={{ color: "#8b90a0" }}>Car visualization coming soon</p>
          </section>
        </div>
      </div>
    </>
  );
}