import type { VehicleState } from "../lib/vehicleState";

function getSuspWheelColor(level: string | undefined): string {
  switch (level?.toLowerCase()) {
    case "low": return "#8b90a0";
    case "high": return "#4edea3";
    case "standard": return "#8b90a0";
    default: return "#8b90a0";
  }
}

// ─── Car SVG ─────────────────────────────────────────────────────────────────

export default function CarVisualization2D({ state }: { state: VehicleState | null }) {
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
