"use client";

import { useEffect, useState } from "react";
import { getVehicleState } from "../lib/api";

interface VehicleState {
  is_locked: boolean;
  climate_on: boolean;
  climate_temp: number;
  battery_level: number;
  vehicle_mode: string;
}

export default function Dashboard() {
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [backendError, setBackendError] = useState(false);

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

  return (
    <div style={{ background: "#0b1326", minHeight: "100vh", color: "#dae2fd", padding: "32px" }}>
      <h1>KINETIC OBSERVATORY</h1>
      {backendError && <p style={{ color: "#ffb4ab" }}>Backend unreachable</p>}
      {vehicleState ? (
        <pre>{JSON.stringify(vehicleState, null, 2)}</pre>
      ) : (
        <p>Loading vehicle state...</p>
      )}
    </div>
  );
}