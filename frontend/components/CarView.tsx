"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import CarVisualization2D from "./CarVisualization2D";
import CarLoading from "./CarLoading";
import type { VehicleState } from "../lib/vehicleState";

// three.js only runs in the browser, and is loaded after the rest of the dashboard
const Car3D = dynamic(() => import("./Car3D"), { ssr: false, loading: () => <CarLoading /> });

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Falls back to the 2D car if the 3D view throws (e.g. the WebGL context can't be created). */
class FallbackOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[CarView] 3D car failed, showing the 2D car instead:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The dashboard's car: the 3D hologram where WebGL is available, otherwise the original 2D car. */
export default function CarView({ state }: { state: VehicleState | null }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability check, client only
  useEffect(() => setWebgl(hasWebGL()), []);

  if (webgl === false) return <CarVisualization2D state={state} />;

  // Fills the canvas area behind the overlays (now playing, conversation, mic), so nothing else moves
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {webgl === null ? (
        <CarLoading />
      ) : (
        <FallbackOnError fallback={<CarVisualization2D state={state} />}>
          <Car3D state={state} />
        </FallbackOnError>
      )}
    </div>
  );
}
