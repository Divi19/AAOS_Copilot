"use client";

import { useEffect, useRef, useState } from "react";
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

export type PlayerStatus = "connecting" | "ready" | "error";

interface SpotifyPlayerProps {
  onStatusChange?: (status: PlayerStatus, errorMessage?: string) => void;
}

export default function SpotifyPlayer({ onStatusChange }: SpotifyPlayerProps) {
  const [, setStatus] = useState<PlayerStatus>("connecting");
  // Keep a stable ref to the latest callback so the effect closure never goes stale
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; });

  useEffect(() => {
    let player: SpotifySdkPlayer | null = null;
    let cancelled = false;

    function notify(status: PlayerStatus, errorMessage?: string) {
      if (!cancelled) {
        setStatus(status);
        onStatusChangeRef.current?.(status, errorMessage);
      }
    }

    async function initPlayer() {
      let token: string;
      try {
        token = await getSpotifyToken();
      } catch (err) {
        if (cancelled) return;
        console.error("[SpotifyPlayer] Failed to fetch access token:", err);
        notify("error", "Could not fetch Spotify token");
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
            notify("ready");
          } catch (err) {
            console.error("[SpotifyPlayer] Failed to register device:", err);
            notify("error", "Could not register device with backend");
          }
        });

        player.addListener("not_ready", ({ device_id }) => {
          console.warn("[SpotifyPlayer] Device went offline:", device_id);
          notify("connecting");
        });

        player.addListener("initialization_error", ({ message }) => {
          console.error("[SpotifyPlayer] Init error:", message);
          notify("error", message);
        });

        player.addListener("authentication_error", ({ message }) => {
          console.error("[SpotifyPlayer] Auth error:", message);
          notify("error", message);
        });

        player.addListener("account_error", ({ message }) => {
          console.error("[SpotifyPlayer] Account error:", message);
          notify("error", message);
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

  // No DOM output — status is surfaced via the onStatusChange callback to page.tsx
  return null;
}
