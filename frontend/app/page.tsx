"use client";

import { useState } from "react";

interface VehicleState {
  is_locked: boolean;
  climate_on: boolean;
  climate_temp: number;
  battery_level: number;
  vehicle_mode: string;
}

export default function Dashboard() {
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);

  return (
    <div>
      <h1>KINETIC OBSERVATORY</h1>
      <p>Vehicle Dashboard</p>
    </div>
  );
}