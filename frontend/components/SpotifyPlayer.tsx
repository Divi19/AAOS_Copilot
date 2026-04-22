"use client";

import { useEffect, useState } from "react";
import { getSpotifyToken, registerSpotifyDevice } from "../lib/api";

// Minimal typings for the Spotify Web Playback SDK globals
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SpotifySdkPlayer;
    };
  }
}

interface SpotifySdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: "ready", cb: (data: { device_id: string }) => void): void;
  addListener(event: "not_ready", cb: (data: { device_id: string }) => void): void;
  addListener(event: "initialization_error", cb: (data: { message: string }) => void): void;
  addListener(event: "authentication_error", cb: (data: { message: string }) => void): void;
  addListener(event: "account_error", cb: (data: { message: string }) => void): void;
}

type PlayerStatus = "connecting" | "ready" | "error";

export default function SpotifyPlayer() {
  const [status, setStatus] = useState<PlayerStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let player: SpotifySdkPlayer | null = null;
    let cancelled = false;

    async function initPlayer() {
      let token: string;
      try {
        token = await getSpotifyToken();
      } catch (err) {
        if (cancelled) return;
        console.error("[SpotifyPlayer] Failed to fetch access token:", err);
        setStatus("error");
        setErrorMessage("Could not fetch Spotify token");
        return;
      }

      function createPlayer() {
        if (cancelled || !window.Spotify) return;

        player = new window.Spotify.Player({
          name: "AAOS Copilot",
          getOAuthToken: (cb) => cb(token),
          volume: 0.8,
        });

        player.addListener("ready", async ({ device_id }) => {
          if (cancelled) return;
          try {
            await registerSpotifyDevice(device_id);
            setStatus("ready");
          } catch (err) {
            console.error("[SpotifyPlayer] Failed to register device:", err);
            setStatus("error");
            setErrorMessage("Could not register device with backend");
          }
        });

        player.addListener("not_ready", ({ device_id }) => {
          console.warn("[SpotifyPlayer] Device went offline:", device_id);
          if (!cancelled) setStatus("connecting");
        });

        player.addListener("initialization_error", ({ message }) => {
          console.error("[SpotifyPlayer] Init error:", message);
          if (!cancelled) { setStatus("error"); setErrorMessage(message); }
        });

        player.addListener("authentication_error", ({ message }) => {
          console.error("[SpotifyPlayer] Auth error:", message);
          if (!cancelled) { setStatus("error"); setErrorMessage(message); }
        });

        player.addListener("account_error", ({ message }) => {
          console.error("[SpotifyPlayer] Account error:", message);
          if (!cancelled) { setStatus("error"); setErrorMessage(message); }
        });

        player.connect();
      }

      // Handle both cases: SDK already loaded vs. still loading
      if (window.Spotify) {
        createPlayer();
      } else {
        window.onSpotifyWebPlaybackSDKReady = createPlayer;
      }
    }

    initPlayer();

    return () => {
      cancelled = true;
      player?.disconnect();
    };
  }, []);

  const label =
    status === "ready"
      ? "🎵 AAOS Audio Ready"
      : status === "error"
      ? `Audio error${errorMessage ? `: ${errorMessage}` : ""}`
      : "Connecting audio...";

  const color =
    status === "ready" ? "#4edea3" : status === "error" ? "#ffb4ab" : "#8b90a0";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        left: "16px",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        color,
        fontFamily: "Space Grotesk, system-ui",
        opacity: 0.8,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {label}
    </div>
  );
}
