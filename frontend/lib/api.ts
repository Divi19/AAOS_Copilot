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