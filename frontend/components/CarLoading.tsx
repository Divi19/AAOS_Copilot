/** Placeholder shown in the car panel while the 3D car loads. */
export default function CarLoading() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", color: "#8b90a0", fontFamily: "Space Grotesk, system-ui", animation: "agentPulse 1.2s ease-in-out infinite" }}>
        LOADING 3D VEHICLE…
      </span>
    </div>
  );
}
