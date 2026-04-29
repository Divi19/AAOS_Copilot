const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getVehicleState() {
    const res = await fetch(`${BASE_URL}/vehicle/state`);
    return res.json();
}

export interface VoiceStreamCallbacks {
    onStatus?: (message: string) => void;
    onAgentResult?: (agent: string, message: string, tools_called: unknown[]) => void;
    onFinal?: (data: {
        message: string;
        tools_called: unknown[];
        agent_trace: unknown[];
        execution_time_seconds: number;
        final_state: unknown;
    }) => void;
    onError?: (error: string) => void;
}

export async function sendVoiceCommand(transcript: string, callbacks: VoiceStreamCallbacks = {}): Promise<void> {
    const res = await fetch(`${BASE_URL}/vehicle/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
    });

    if (!res.ok) {
        callbacks.onError?.(`Request failed: ${res.status}`);
        return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
        callbacks.onError?.("No response body");
        return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline SSE event boundaries
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
            for (const line of part.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                try {
                    const event = JSON.parse(line.slice(6));
                    switch (event.type) {
                        case "status":
                            callbacks.onStatus?.(event.message);
                            break;
                        case "agent_result":
                            callbacks.onAgentResult?.(event.agent, event.message, event.tools_called);
                            break;
                        case "agent_error":
                            callbacks.onError?.(`${event.agent}: ${event.message}`);
                            break;
                        case "final":
                            callbacks.onFinal?.(event);
                            break;
                    }
                } catch {
                    // Skip malformed JSON lines
                }
            }
        }
    }
}

export async function toggleConnectivity() {
    const res = await fetch(`${BASE_URL}/vehicle/connectivity/toggle`, {
        method: "POST",
    });
    return res.json();
}

export async function getSpotifyToken(): Promise<string> {
    const res = await fetch(`${BASE_URL}/spotify/token`);
    if (!res.ok) throw new Error(`Failed to fetch Spotify token: ${res.status}`);
    const data = await res.json();
    return data.access_token as string;
}

export async function registerSpotifyDevice(deviceId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/spotify/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
    });
    if (!res.ok) throw new Error(`Failed to register Spotify device: ${res.status}`);
}

export interface NowPlayingData {
    is_playing: boolean;
    track_name?: string;
    artist_name?: string;
    album_art_url?: string;
    progress_ms?: number;
    duration_ms?: number;
}

export async function getNowPlaying(): Promise<NowPlayingData> {
    const res = await fetch(`${BASE_URL}/spotify/now-playing`);
    if (!res.ok) throw new Error(`Failed to fetch now playing: ${res.status}`);
    return res.json();
}

export async function previousTrack(): Promise<void> {
    await fetch(`${BASE_URL}/spotify/previous`, { method: "POST" });
}

export async function nextTrack(): Promise<void> {
    await fetch(`${BASE_URL}/spotify/next`, { method: "POST" });
}

export async function seekTrack(position_ms: number): Promise<void> {
    await fetch(`${BASE_URL}/spotify/seek`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_ms }),
    });
}

export async function pauseTrack(): Promise<void> {
    await fetch(`${BASE_URL}/spotify/pause`, { method: "POST" });
}

export async function resumeTrack(): Promise<void> {
    await fetch(`${BASE_URL}/spotify/resume`, { method: "POST" });
}

export interface AgentInfo {
    name: string;
    icon: string;
    description: string;
    status: "active" | "coming_soon";
    model: string;
    type: string;
    tools?: string[];
}

export interface AgentHierarchyData {
    hierarchy: {
        root: string;
        active_sub_agents: string[];
        planned_sub_agents: string[];
    };
    agents: Record<string, AgentInfo>;
}

export async function getAgentHierarchy(): Promise<AgentHierarchyData> {
    const res = await fetch(`${BASE_URL}/agents`);
    if (!res.ok) throw new Error(`Failed to fetch agent hierarchy: ${res.status}`);
    return res.json();
}