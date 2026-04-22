"use client";

import { useEffect, useState } from "react";
import { getNowPlaying, NowPlayingData } from "../lib/api";

export default function NowPlaying() {
  const [track, setTrack] = useState<NowPlayingData | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getNowPlaying();
        setTrack(data.is_playing ? data : null);
      } catch {
        // Silently fail — nothing is playing or Spotify isn't configured
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  if (!track) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "rgba(10,16,30,0.92)",
        border: "1px solid rgba(152,203,255,0.12)",
        borderRadius: "12px",
        padding: "10px 14px 10px 10px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        width: "220px",
        overflow: "hidden",
      }}
    >
      {/* Album art */}
      {track.album_art_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.album_art_url}
          alt="Album art"
          width={52}
          height={52}
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
            width: 52,
            height: 52,
            borderRadius: "6px",
            flexShrink: 0,
            background: "rgba(65,71,84,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{ fontSize: "22px", opacity: 0.5 }}
            aria-hidden="true"
          >
            ♪
          </span>
        </div>
      )}

      {/* Track info */}
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* Playing indicator + track name */}
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
              background: "#4edea3",
              boxShadow: "0 0 4px #4edea3",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#4edea3",
              fontFamily: "Space Grotesk, system-ui",
            }}
          >
            Now Playing
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
  );
}
