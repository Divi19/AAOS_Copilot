const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getVehicleState() {
    const res = await fetch(`${BASE_URL}/vehicle/state`);
    return res.json();
}

export async function sendVoiceCommand(transcript: string) {
    const res = await fetch(`${BASE_URL}/vehicle/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
    });
    return res.json();
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