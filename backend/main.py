from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from models import VehicleState
from state import get_state, reset_state
import json
import os
import time
import requests as http_requests
from typing import Optional, List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import spotify_state

# CRITICAL: Load .env BEFORE importing ADK agents — they read env vars at import time
load_dotenv()
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "aaos-vehicle-system")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "1")

import vertexai
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from agents.supervisor_agent.agent import supervisor_agent

app = FastAPI(title="AAOS AI Copilot Backend")

# Allow Frontend UI to connect (Next.js on :3000 and any deployed URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === ENTERPRISE PIPELINE: Vertex AI ===
GCP_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "aaos-vehicle-system")
GCP_REGION = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")

print("Initializing Vertex AI Enterprise Infrastructure...")
try:
    vertexai.init(project=GCP_PROJECT, location=GCP_REGION)
    print(f"Vertex AI initialized successfully! (project={GCP_PROJECT}, region={GCP_REGION})")
except Exception as e:
    print(f"Warning: Vertex AI not fully configured: {e}")

session_service = InMemorySessionService()

# Accept BOTH formats: frontend sends {transcript}, old UI sends {prompt}
class VoicePayload(BaseModel):
    prompt: Optional[str] = None
    transcript: Optional[str] = None

# === AGENT HIERARCHY METADATA (for frontend Agent Info Panel) ===
AGENT_REGISTRY = {
    "supervisor_agent": {
        "name": "Supervisor",
        "icon": "hub",
        "description": "Routes intents to specialized sub-agents",
        "status": "active",
        "model": "gemini-2.5-flash",
        "type": "router"
    },
    "car_agent": {
        "name": "Car Agent",
        "icon": "directions_car",
        "description": "Controls vehicle hardware: climate, locks, suspension, modes",
        "status": "active",
        "model": "gemini-2.5-flash",
        "type": "specialist",
        "tools": ["set_climate", "lock_vehicle", "set_vehicle_mode", "control_frunk", "set_suspension"]
    },
    "office_agent": {
        "name": "Office Agent",
        "icon": "business_center",
        "description": "Manages workspace: Slack messages, calendar blocks",
        "status": "active",
        "model": "gemini-2.5-flash",
        "type": "specialist",
        "tools": ["send_slack_message", "create_calendar_block"]
    },
    "rental_agent": {
        "name": "Rental Agent",
        "icon": "car_rental",
        "description": "Manages fleet check-in/out, damage reports, customer handoff",
        "status": "coming_soon",
        "model": "gemini-2.5-flash",
        "type": "specialist",
        "tools": ["check_in_vehicle", "generate_damage_report", "handoff_to_customer"]
    },
    "truck_agent": {
        "name": "Truck Agent",
        "icon": "local_shipping",
        "description": "Assists drivers with HOS compliance, route optimization, load management",
        "status": "coming_soon",
        "model": "gemini-2.5-flash",
        "type": "specialist",
        "tools": ["check_hos_status", "optimize_route", "log_cargo_weight"]
    },
    "fleet_agent": {
        "name": "Fleet Manager",
        "icon": "fleet_management",
        "description": "OEM-level fleet telemetry, predictive maintenance, recall management",
        "status": "coming_soon",
        "model": "gemini-2.5-flash",
        "type": "specialist",
        "tools": ["get_fleet_health", "schedule_maintenance", "issue_recall"]
    }
}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/vehicle/state")
def get_vehicle_state():
    return get_state().model_dump()

@app.get("/agents")
def get_agent_registry():
    """Returns the full agent hierarchy for the frontend info panel."""
    return {
        "hierarchy": {
            "root": "supervisor_agent",
            "active_sub_agents": ["car_agent", "office_agent"],
            "planned_sub_agents": ["rental_agent", "truck_agent", "fleet_agent"]
        },
        "agents": AGENT_REGISTRY
    }

@app.post("/vehicle/voice")
async def execute_voice_command(voice: VoicePayload):
    start_time = time.time()
    
    # Accept either field name from the frontend
    user_text = voice.prompt or voice.transcript or ""
    
    if not user_text.strip():
        raise HTTPException(status_code=400, detail="No voice input provided. Send 'prompt' or 'transcript'.")
    
    print(f"\n🎙️ [INCOMING VOICE PROMPT]: {user_text}")
    
    # Pre-injecting driver memory and current state into the agent context
    driver_memory = {
        "name": "Leo",
        "preferences": {
            "climate_hot": 22.0,
            "climate_cold": 28.0,
            "slack_channel": "#office-arrivals"
        }
    }
    
    context_str = f"Current State: {get_state().model_dump_json()}\nDriver Memory: {json.dumps(driver_memory)}\nUser Request: {user_text}"

    try:
        session = session_service.create_session(app_name="vehicle_copilot", user_id="demo_user")
        runner = Runner(agent=supervisor_agent, app_name="vehicle_copilot", session_service=session_service)
        
        final_answer = ""
        tools_called = []
        agent_trace = []  # Detailed trace for the frontend panel
        
        current_agent = "supervisor_agent"
        async for event in runner.run_async(
            user_id="demo_user",
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=context_str)])
        ):
            # Update the current agent if the event provides a name
            if hasattr(event, 'agent_name') and event.agent_name and event.agent_name != 'unknown':
                current_agent = event.agent_name

            agent_name = current_agent
            
            # Track tool calls — handle multiple ADK event formats
            tool_name = None
            tool_args = {}
            
            # Method 1: Direct tool_call attribute
            if hasattr(event, 'tool_call') and event.tool_call:
                tool_name = event.tool_call.name
                tool_args = dict(event.tool_call.args) if hasattr(event.tool_call, 'args') and event.tool_call.args else {}
            
            # Method 2: Check content parts for function_call
            if not tool_name and hasattr(event, 'content') and event.content:
                for part in (event.content.parts or []):
                    if hasattr(part, 'function_call') and part.function_call:
                        tool_name = part.function_call.name
                        tool_args = dict(part.function_call.args) if hasattr(part.function_call, 'args') and part.function_call.args else {}
                        break
            
            # Method 3: Check for function_response parts (tool results)
            if hasattr(event, 'content') and event.content:
                for part in (event.content.parts or []):
                    if hasattr(part, 'function_response') and part.function_response:
                        resp_name = part.function_response.name
                        agent_trace.append({
                            "type": "tool_result",
                            "agent": agent_name,
                            "tool": resp_name,
                            "status": "success",
                            "timestamp": round(time.time() - start_time, 2)
                        })
            
            if tool_name:
                print(f"🔧 [TOOL CALLED by {agent_name}]: {tool_name}({tool_args})")
                tools_called.append({"agent": agent_name, "tool": tool_name, "args": tool_args})
                agent_trace.append({
                    "type": "tool_call",
                    "agent": agent_name,
                    "tool": tool_name,
                    "args": tool_args,
                    "timestamp": round(time.time() - start_time, 2)
                })
            elif agent_name != 'unknown':
                # Track agent activations (delegation events)
                if not any(t.get('agent') == agent_name and t.get('type') == 'activation' for t in agent_trace):
                    agent_trace.append({
                        "type": "activation",
                        "agent": agent_name,
                        "timestamp": round(time.time() - start_time, 2)
                    })
            
            if event.is_final_response():
                final_text = event.content.parts[0].text if event.content and event.content.parts else ""
                print(f"🧠 [FINAL DECISION]: {final_text}")
                final_answer = final_text
        
        execution_time = round(time.time() - start_time, 2)
        print(f"⏱️ Total execution: {execution_time}s | Tools: {len(tools_called)}")
        
        return {
            "intent": "multi_agent_execution",
            "confidence": 1.0,
            "message": final_answer,
            "tools_called": tools_called,
            "agent_trace": agent_trace,
            "execution_time_seconds": execution_time,
            "actions": [{"action": t["tool"], "value": "executed"} for t in tools_called],
            "final_state": get_state().model_dump()
        }
        
    except Exception as e:
        execution_time = round(time.time() - start_time, 2)
        print(f"ERROR ({execution_time}s): {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI Agent failed: {str(e)}")

@app.post("/vehicle/reset")
def reset_vehicle_state():
    return reset_state().model_dump()


# ── Spotify Web Playback SDK endpoints ──────────────────────────────────────

class DevicePayload(BaseModel):
    device_id: str


def _get_spotify_access_token() -> str:
    """Returns a valid Spotify access token (raises HTTPException on failure)."""
    token = spotify_state.get_access_token()
    if not token:
        raise HTTPException(
            status_code=500,
            detail="Spotify credentials not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN.",
        )
    return token


@app.get("/spotify/token")
def get_spotify_token():
    """Returns a fresh Spotify access token using the stored refresh token."""
    return {"access_token": _get_spotify_access_token()}


@app.post("/spotify/device")
def register_spotify_device(payload: DevicePayload):
    """Stores the Spotify Web Playback SDK device_id from the browser player."""
    spotify_state._spotify_device_id = payload.device_id
    print(f"🎵 [SPOTIFY] Browser player registered with device_id: {payload.device_id}")
    return {"status": "ok", "device_id": payload.device_id}


@app.get("/spotify/now-playing")
def get_now_playing():
    """Returns the current Spotify track (playing or paused), or {is_playing: false} if nothing is loaded."""
    try:
        token = _get_spotify_access_token()
    except HTTPException:
        return {"is_playing": False}

    response = http_requests.get(
        "https://api.spotify.com/v1/me/player/currently-playing",
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )

    # 204 = player is inactive / nothing loaded
    if response.status_code == 204 or not response.content:
        return {"is_playing": False}

    if response.status_code != 200:
        return {"is_playing": False}

    data = response.json()

    # No item means nothing is loaded at all — hide the widget
    if not data.get("item"):
        return {"is_playing": False}

    item = data["item"]
    artists = ", ".join(a["name"] for a in item.get("artists", []))
    images = item.get("album", {}).get("images", [])
    # Prefer the medium image (index 1) — ~300px, good balance for the widget
    album_art_url = images[1]["url"] if len(images) > 1 else (images[0]["url"] if images else None)

    return {
        "is_playing": data.get("is_playing", False),
        "track_name": item.get("name"),
        "artist_name": artists,
        "album_art_url": album_art_url,
        "progress_ms": data.get("progress_ms", 0),
        "duration_ms": item.get("duration_ms", 0),
    }


class SeekPayload(BaseModel):
    position_ms: int


@app.post("/spotify/previous")
def spotify_previous():
    """Skip to the previous track on the stored device."""
    token = _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    http_requests.post(
        "https://api.spotify.com/v1/me/player/previous",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=5,
    )
    return {"status": "ok"}


@app.post("/spotify/next")
def spotify_next():
    """Skip to the next track on the stored device."""
    token = _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    http_requests.post(
        "https://api.spotify.com/v1/me/player/next",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=5,
    )
    return {"status": "ok"}


@app.post("/spotify/seek")
def spotify_seek(payload: SeekPayload):
    """Seek to a position (ms) on the stored device."""
    token = _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params: dict = {"position_ms": payload.position_ms}
    if device_id:
        params["device_id"] = device_id
    http_requests.put(
        "https://api.spotify.com/v1/me/player/seek",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=5,
    )
    return {"status": "ok"}


@app.post("/spotify/pause")
def spotify_pause():
    """Pause playback on the stored device."""
    token = _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    http_requests.put(
        "https://api.spotify.com/v1/me/player/pause",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=5,
    )
    return {"status": "ok"}


@app.post("/spotify/resume")
def spotify_resume():
    """Resume playback on the stored device."""
    token = _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    http_requests.put(
        "https://api.spotify.com/v1/me/player/play",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=5,
    )
    return {"status": "ok"}

# Serve the Next.js static frontend (when deployed as unified container)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
    