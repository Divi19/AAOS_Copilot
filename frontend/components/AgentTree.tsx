"use client";

import { useEffect, useState } from "react";
import { getAgentHierarchy, AgentInfo, AgentHierarchyData } from "../lib/api";

// SVG connector lines for a row of N children under a centered root
function ConnectorLines({ n, color }: { n: number; color: string }) {
  if (n === 0) return null;
  // Each child gets flex:1, so centers are at (2i+1)/(2n) * 100%
  const childCenters = Array.from({ length: n }, (_, i) => ((2 * i + 1) / (2 * n)) * 100);
  const leftPct = childCenters[0];
  const rightPct = childCenters[childCenters.length - 1];

  return (
    <svg width="100%" height="36" style={{ display: "block", overflow: "visible" }}>
      {/* Root stem down to midline */}
      <line x1="50%" y1="0" x2="50%" y2="18" stroke={color} strokeWidth="1" strokeOpacity="0.35" />
      {/* Horizontal bar spanning child centers */}
      <line
        x1={`${leftPct}%`} y1="18"
        x2={`${rightPct}%`} y2="18"
        stroke={color} strokeWidth="1" strokeOpacity="0.35"
      />
      {/* Vertical stem down to each child */}
      {childCenters.map((cx, i) => (
        <line
          key={i}
          x1={`${cx}%`} y1="18"
          x2={`${cx}%`} y2="36"
          stroke={color} strokeWidth="1" strokeOpacity="0.35"
        />
      ))}
    </svg>
  );
}

function AgentNode({
  info,
  isRoot = false,
  isComingSoon = false,
}: {
  info: AgentInfo;
  isRoot?: boolean;
  isComingSoon?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = info.status === "active";
  const color = isComingSoon ? "#8b90a0" : isActive ? "#4edea3" : "#8b90a0";
  const borderColor = isComingSoon
    ? "rgba(65,71,84,0.2)"
    : isActive
    ? expanded ? "rgba(78,222,163,0.45)" : "rgba(78,222,163,0.2)"
    : "rgba(65,71,84,0.2)";

  return (
    <div
      style={{
        background: isComingSoon
          ? "rgba(19,27,46,0.3)"
          : expanded
          ? "rgba(34,42,61,0.85)"
          : "rgba(22,31,52,0.7)",
        border: `1px solid ${borderColor}`,
        borderRadius: isRoot ? "12px" : "10px",
        padding: isRoot ? "10px 12px" : "8px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        cursor: isComingSoon ? "default" : "pointer",
        transition: "all 0.2s",
        opacity: isComingSoon ? 0.5 : 1,
        boxShadow:
          expanded && isActive
            ? `0 0 14px rgba(78,222,163,0.12)`
            : "none",
        userSelect: "none",
        width: "100%",
      }}
      onClick={() => {
        if (!isComingSoon) setExpanded((v) => !v);
      }}
    >
      {/* Icon + badge row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: isRoot ? "20px" : "17px",
            color,
            fontVariationSettings: "'FILL' 1",
            flexShrink: 0,
          }}
        >
          {info.icon}
        </span>
        <span
          style={{
            fontSize: "7px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: isComingSoon ? "#8b90a0" : isActive ? "#4edea3" : "#8b90a0",
            background: isComingSoon
              ? "rgba(65,71,84,0.15)"
              : isActive
              ? "rgba(78,222,163,0.1)"
              : "rgba(65,71,84,0.15)",
            padding: "1px 5px",
            borderRadius: "2px",
            fontFamily: "Space Grotesk, system-ui",
            flexShrink: 0,
          }}
        >
          {isComingSoon ? "SOON" : "ACTIVE"}
        </span>
      </div>

      {/* Name */}
      <span
        style={{
          fontSize: isRoot ? "9px" : "8px",
          fontWeight: 700,
          color: isComingSoon ? "#8b90a0" : "#dae2fd",
          fontFamily: "Space Grotesk, system-ui",
          textAlign: "center",
          letterSpacing: "0.06em",
          lineHeight: 1.2,
          width: "100%",
        } as React.CSSProperties}
      >
        {info.name.toUpperCase()}
      </span>

      {/* Expanded: description + tools */}
      {expanded && !isComingSoon && (
        <div
          style={{
            width: "100%",
            marginTop: "6px",
            paddingTop: "6px",
            borderTop: "1px solid rgba(65,71,84,0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
          }}
        >
          {info.description && (
            <p
              style={{
                margin: 0,
                fontSize: "9px",
                color: "#a0a8bc",
                lineHeight: 1.45,
                fontFamily: "Space Grotesk, system-ui",
              }}
            >
              {info.description}
            </p>
          )}
          {info.tools && info.tools.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
              {info.tools.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: "7px",
                    padding: "1px 5px",
                    borderRadius: "2px",
                    background: "rgba(152,203,255,0.07)",
                    border: "1px solid rgba(152,203,255,0.15)",
                    color: "#98cbff",
                    fontFamily: "Space Grotesk, system-ui",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentTree() {
  const [data, setData] = useState<AgentHierarchyData | null>(null);

  useEffect(() => {
    getAgentHierarchy()
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div
        style={{
          padding: "16px",
          fontSize: "10px",
          color: "#8b90a0",
          fontFamily: "Space Grotesk, system-ui",
          letterSpacing: "0.1em",
          textAlign: "center",
        }}
      >
        Loading agents...
      </div>
    );
  }

  const { hierarchy, agents } = data;
  const rootInfo = agents[hierarchy.root];
  const activeChildren = hierarchy.active_sub_agents
    .map((id) => ({ id, info: agents[id] }))
    .filter((a) => a.info);
  const lineColor = "#98cbff";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0px",
        width: "100%",
      }}
    >
      {/* Root node */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: "140px" }}>
          {rootInfo && (
            <AgentNode info={rootInfo} isRoot />
          )}
        </div>
      </div>

      {/* Connectors: root → active children */}
      {activeChildren.length > 0 && (
        <ConnectorLines n={activeChildren.length} color={lineColor} />
      )}

      {/* Active children row */}
      {activeChildren.length > 0 && (
        <div style={{ display: "flex", gap: "5px" }}>
          {activeChildren.map(({ id, info }) => (
            <div
              key={id}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch" }}
            >
              <AgentNode info={info} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
