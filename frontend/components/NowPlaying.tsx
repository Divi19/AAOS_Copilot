"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNowPlaying,
  NowPlayingData,
  previousTrack,
  nextTrack,
  seekTrack,
  pauseTrack,
  resumeTrack,
} from "../lib/api";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// Small icon button styled for the dark theme
function CtrlBtn({
  icon,
  onClick,
  label,
  size = 18,
}: {
  icon: string;
  onClick: () => void;
  label: string;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#c1c6d7",
        transition: "color 0.15s",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#dae2fd")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#c1c6d7")}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: `${size}px`, fontVariationSettings: "'FILL' 1" }}
      >
        {icon}
      </span>
    </button>
  );
}

export default function NowPlaying() {
  const [track, setTrack] = useState<NowPlayingData | null>(null);
  // localProgress smooths the seek bar between 5-second polls
  const [localProgress, setLocalProgress] = useState(0);

  // Reference values kept in sync with each poll so the tick closure stays fresh
  const progressAtPollRef = useRef(0);
  const pollWallTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);

  // ── Polling ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getNowPlaying();
        // Show the widget when a track is loaded, even if paused
        const loaded = !!(data.track_name);
        setTrack(loaded ? data : null);

        if (loaded) {
          const prog = data.progress_ms ?? 0;
          progressAtPollRef.current = prog;
          pollWallTimeRef.current = Date.now();
          isPlayingRef.current = data.is_playing;
          durationRef.current = data.duration_ms ?? 0;
          setLocalProgress(prog);
        }
      } catch {
        // silently fail — Spotify may not be configured yet
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Smooth progress tick (250 ms) ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!isPlayingRef.current) return;
      const elapsed = Date.now() - pollWallTimeRef.current;
      const estimated = Math.min(
        progressAtPollRef.current + elapsed,
        durationRef.current
      );
      setLocalProgress(estimated);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!track) return;
    if (track.is_playing) {
      await pauseTrack();
      isPlayingRef.current = false;
      setTrack((t) => t ? { ...t, is_playing: false } : t);
    } else {
      await resumeTrack();
      isPlayingRef.current = true;
      pollWallTimeRef.current = Date.now();
      progressAtPollRef.current = localProgress;
      setTrack((t) => t ? { ...t, is_playing: true } : t);
    }
  }, [track, localProgress]);

  const handlePrev = useCallback(async () => {
    await previousTrack();
    // Let the next poll pick up the new track
  }, []);

  const handleNext = useCallback(async () => {
    await nextTrack();
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!track?.duration_ms) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ms = Math.floor(pct * track.duration_ms);
      setLocalProgress(ms);
      progressAtPollRef.current = ms;
      pollWallTimeRef.current = Date.now();
      seekTrack(ms);
    },
    [track?.duration_ms]
  );

  if (!track) return null;

  const duration = track.duration_ms ?? 0;
  const progressPct = duration > 0 ? (localProgress / duration) * 100 : 0;

  return (
    <div
      style={{
        background: "rgba(10,16,30,0.92)",
        border: "1px solid rgba(152,203,255,0.12)",
        borderRadius: "12px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        width: "240px",
        overflow: "hidden",
      }}
    >
      {/* ── Top: album art + track info ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 14px 8px 10px",
        }}
      >
        {/* Album art */}
        {track.album_art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.album_art_url}
            alt="Album art"
            width={56}
            height={56}
            style={{
              borderRadius: "6px",
              flexShrink: 0,
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "6px",
              flexShrink: 0,
              background: "rgba(65,71,84,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "24px", opacity: 0.4 }} aria-hidden="true">♪</span>
          </div>
        )}

        {/* Track info */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              marginBottom: "3px",
            }}
          >
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: track.is_playing ? "#4edea3" : "#8b90a0",
                boxShadow: track.is_playing ? "0 0 4px #4edea3" : "none",
                flexShrink: 0,
                transition: "background 0.3s",
              }}
            />
            <span
              style={{
                fontSize: "8px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: track.is_playing ? "#4edea3" : "#8b90a0",
                fontFamily: "Space Grotesk, system-ui",
                transition: "color 0.3s",
              }}
            >
              {track.is_playing ? "Now Playing" : "Paused"}
            </span>
          </div>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#dae2fd",
              fontFamily: "Space Grotesk, system-ui",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "-0.01em",
            }}
            title={track.track_name}
          >
            {track.track_name}
          </div>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 500,
              color: "#8b90a0",
              fontFamily: "Inter, system-ui",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: "2px",
            }}
            title={track.artist_name}
          >
            {track.artist_name}
          </div>
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div
        style={{
          height: "1px",
          background: "rgba(65,71,84,0.2)",
          margin: "0 10px",
        }}
      />

      {/* ── Controls row ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "6px 14px 4px",
        }}
      >
        <CtrlBtn icon="skip_previous" label="Previous track" onClick={handlePrev} />
        <CtrlBtn
          icon={track.is_playing ? "pause" : "play_arrow"}
          label={track.is_playing ? "Pause" : "Play"}
          onClick={handlePlayPause}
          size={22}
        />
        <CtrlBtn icon="skip_next" label="Next track" onClick={handleNext} />
      </div>

      {/* ── Seek bar + time ──────────────────────────────────────── */}
      <div style={{ padding: "2px 12px 10px" }}>
        {/* Seek track */}
        <div
          onClick={handleSeek}
          role="slider"
          aria-label="Seek"
          aria-valuenow={Math.floor(localProgress / 1000)}
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration / 1000)}
          style={{
            width: "100%",
            height: "3px",
            background: "rgba(65,71,84,0.5)",
            borderRadius: "2px",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, progressPct)}%`,
              height: "100%",
              background: "#4edea3",
              borderRadius: "2px",
              transition: "width 0.25s linear",
            }}
          />
        </div>

        {/* Time labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "4px",
          }}
        >
          <span
            style={{
              fontSize: "9px",
              color: "#8b90a0",
              fontFamily: "Space Grotesk, system-ui",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatMs(localProgress)}
          </span>
          <span
            style={{
              fontSize: "9px",
              color: "#8b90a0",
              fontFamily: "Space Grotesk, system-ui",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatMs(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
