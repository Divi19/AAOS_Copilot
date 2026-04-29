from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from models import VehicleState
from state import get_state, reset_state
import json
import os
import time
import asyncio
import uuid
import traceback
import httpx
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
from agents.car_agent.agent import car_agent
from agents.office_agent.agent import office_agent
from agents.music_agent.agent import music_agent

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

# === PARALLEL AGENT INFRASTRUCTURE ===
# Each agent gets its own Runner + InMemorySessionService so concurrent requests
# never share session state across agents or across calls to the same agent.

supervisor_session_service = InMemorySessionService()
supervisor_runner = Runner(agent=supervisor_agent, app_name="vehicle_copilot", session_service=supervisor_session_service)

car_session_service = InMemorySessionService()
office_session_service = InMemorySessionService()
music_session_service = InMemorySessionService()

car_runner = Runner(agent=car_agent, app_name="vehicle_copilot", session_service=car_session_service)
office_runner = Runner(agent=office_agent, app_name="vehicle_copilot", session_service=office_session_service)
music_runner = Runner(agent=music_agent, app_name="vehicle_copilot", session_service=music_session_service)

AGENT_RUNNERS: Dict[str, Runner] = {
    "car_agent": car_runner,
    "office_agent": office_runner,
    "music_agent": music_runner,
}
AGENT_SESSION_SERVICES: Dict[str, InMemorySessionService] = {
    "car_agent": car_session_service,
    "office_agent": office_session_service,
    "music_agent": music_session_service,
}

# Driver profile injected into every agent context
DRIVER_MEMORY = {
    "name": "Leo",
    "preferences": {
        "climate_hot": 22.0,
        "climate_cold": 28.0,
        "slack_channel": "#office-arrivals"
    }
}

# Job store for polling-based agent execution
jobs: Dict[str, Any] = {}

# Accept BOTH formats: frontend sends {transcript}, old UI sends {prompt}
class VoicePayload(BaseModel):
    prompt: Optional[str] = None
    transcript: Optional[str] = None


async def run_agent(agent_name: str, sub_prompt: str, start_time: float) -> dict:
    """Run a single specialist agent with its targeted sub-prompt. Never raises — errors are caught and returned."""
    try:
        runner = AGENT_RUNNERS[agent_name]
        session_svc = AGENT_SESSION_SERVICES[agent_name]
        session = session_svc.create_session(app_name="vehicle_copilot", user_id="demo_user")

        # Each agent gets current state + driver memory, but only its own isolated sub-prompt
        agent_msg = (
            f"Current State: {get_state().model_dump_json()}\n"
            f"Driver Memory: {json.dumps(DRIVER_MEMORY)}\n"
            f"Your task: {sub_prompt}"
        )

        final_text = ""
        tools_called = []
        agent_trace = []
        current_agent = agent_name

        async for event in runner.run_async(
            user_id="demo_user",
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=agent_msg)])
        ):
            if hasattr(event, 'agent_name') and event.agent_name and event.agent_name != 'unknown':
                current_agent = event.agent_name

            tool_name = None
            tool_args = {}

            # Method 1: Direct tool_call attribute
            if hasattr(event, 'tool_call') and event.tool_call:
                tool_name = event.tool_call.name
                tool_args = dict(event.tool_call.args) if hasattr(event.tool_call, 'args') and event.tool_call.args else {}

            # Method 2: function_call inside content parts
            if not tool_name and hasattr(event, 'content') and event.content:
                for part in (event.content.parts or []):
                    if hasattr(part, 'function_call') and part.function_call:
                        tool_name = part.function_call.name
                        tool_args = dict(part.function_call.args) if hasattr(part.function_call, 'args') and part.function_call.args else {}
                        break

            # Method 3: function_response parts (tool results)
            if hasattr(event, 'content') and event.content:
                for part in (event.content.parts or []):
                    if hasattr(part, 'function_response') and part.function_response:
                        agent_trace.append({
                            "type": "tool_result",
                            "agent": current_agent,
                            "tool": part.function_response.name,
                            "status": "success",
                            "timestamp": round(time.time() - start_time, 2)
                        })

            if tool_name:
                print(f"🔧 [TOOL CALLED by {current_agent}]: {tool_name}({tool_args})")
                tools_called.append({"agent": current_agent, "tool": tool_name, "args": tool_args})
                agent_trace.append({
                    "type": "tool_call",
                    "agent": current_agent,
                    "tool": tool_name,
                    "args": tool_args,
                    "timestamp": round(time.time() - start_time, 2)
                })
            else:
                if not any(t.get('agent') == current_agent and t.get('type') == 'activation' for t in agent_trace):
                    agent_trace.append({
                        "type": "activation",
                        "agent": current_agent,
                        "timestamp": round(time.time() - start_time, 2)
                    })

            if event.is_final_response():
                final_text = event.content.parts[0].text if event.content and event.content.parts else ""
                print(f"✔ [{agent_name}] Final: {final_text[:120]}")

        return {
            "agent": agent_name,
            "message": final_text,
            "tools_called": tools_called,
            "agent_trace": agent_trace,
        }

    except Exception as e:
        print(f"❌ [{agent_name}] Error: {str(e)}")
        return {
            "agent": agent_name,
            "message": f"Agent error: {str(e)}",
            "tools_called": [],
            "agent_trace": [],
        }

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
    "music_agent": {
        "name": "Music Agent",
        "icon": "music_note",
        "description": "Controls mood-based and specific music playback via Spotify",
        "status": "active",
        "model": "gemini-2.5-flash",
        "type": "specialist",
        "tools": ["play_music_for_mood", "play_specific_track"]
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

async def cleanup_job(job_id: str):
    """Remove a completed job from the store after 5 minutes."""
    await asyncio.sleep(300)
    if job_id in jobs:
        del jobs[job_id]
        print(f"🧹 [CLEANUP] Job {job_id} removed from memory")


async def execute_agents_background(job_id: str, user_text: str, driver_memory: dict):
    """Run supervisor + specialist agents in the background, updating jobs[job_id] as each agent completes."""
    start_time = time.time()
    try:
        # ── Step 1: Supervisor classification ─────────────────────────────────
        context_str = (
            f"Current State: {get_state().model_dump_json()}\n"
            f"Driver Memory: {json.dumps(driver_memory)}\n"
            f"User Request: {user_text}"
        )
        sup_session = supervisor_session_service.create_session(app_name="vehicle_copilot", user_id="demo_user")
        sup_response = ""
        async for event in supervisor_runner.run_async(
            user_id="demo_user",
            session_id=sup_session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=context_str)])
        ):
            if event.is_final_response():
                sup_response = event.content.parts[0].text if event.content and event.content.parts else ""

        sup_response = sup_response.strip()
        if sup_response.startswith("```"):
            lines = sup_response.splitlines()
            sup_response = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()

        print(f"🧭 [BG:{job_id[:8]}] Supervisor: {sup_response[:120]}")

        # ── Step 2: Parse classification ──────────────────────────────────────
        agent_tasks: Dict[str, str] = {}
        direct_answer: Optional[str] = None
        try:
            parsed = json.loads(sup_response)
            if isinstance(parsed, dict):
                agent_tasks = {k: v for k, v in parsed.items() if k in AGENT_RUNNERS and isinstance(v, str)}
                if not agent_tasks and "direct_answer" in parsed:
                    direct_answer = str(parsed["direct_answer"])
            elif isinstance(parsed, list):
                agent_tasks = {n: user_text for n in parsed if n in AGENT_RUNNERS}
        except (json.JSONDecodeError, ValueError):
            if sup_response:
                direct_answer = sup_response

        # ── Step 3: Direct answers ────────────────────────────────────────────
        if direct_answer is not None:
            execution_time = round(time.time() - start_time, 2)
            jobs[job_id]["final"] = {
                "intent": "direct_answer",
                "confidence": 1.0,
                "message": direct_answer,
                "tools_called": [],
                "agent_trace": [],
                "execution_time_seconds": execution_time,
                "actions": [],
                "final_state": get_state().model_dump()
            }
            jobs[job_id]["status"] = "complete"
            asyncio.create_task(cleanup_job(job_id))
            return

        if not agent_tasks:
            print(f"⚠️ [BG:{job_id[:8]}] Empty classification — falling back to car_agent")
            agent_tasks = {"car_agent": user_text}

        print(f"🚀 [BG:{job_id[:8]}] Firing agents: {list(agent_tasks.keys())}")

        # ── Step 4: as_completed — append each result the moment it finishes ──
        async def run_with_name(name: str, sub_prompt: str):
            result = await asyncio.wait_for(run_agent(name, sub_prompt, start_time), timeout=30)
            return name, result

        coros = [run_with_name(name, sub_prompt) for name, sub_prompt in agent_tasks.items()]
        all_results: List[Dict[str, Any]] = []

        for coro in asyncio.as_completed(coros):
            try:
                agent_name, result = await coro
                jobs[job_id]["results"].append({
                    "agent": agent_name,
                    "message": result["message"],
                    "tools_called": result["tools_called"],
                    "agent_trace": result["agent_trace"],
                    "completed_at": round(time.time() - start_time, 2)
                })
                all_results.append(result)
                print(f"✔ [BG:{job_id[:8]}] {agent_name} done at {jobs[job_id]['results'][-1]['completed_at']}s")
            except Exception as e:
                print(f"❌ [BG:{job_id[:8]}] Agent error: {repr(e)}")
                print(f"❌ [BG:{job_id[:8]}] Traceback: {traceback.format_exc()}")

        # ── Step 5: Merge and finalise ────────────────────────────────────────
        all_tools_called: List[Dict[str, Any]] = []
        all_agent_trace: List[Dict[str, Any]] = []
        all_messages: List[str] = []

        for result in all_results:
            all_tools_called.extend(result.get("tools_called", []))
            all_agent_trace.extend(result.get("agent_trace", []))
            msg = result.get("message", "").strip()
            if msg:
                all_messages.append(msg)

        execution_time = round(time.time() - start_time, 2)
        jobs[job_id]["final"] = {
            "intent": "multi_agent_execution",
            "confidence": 1.0,
            "message": " ".join(all_messages),
            "tools_called": all_tools_called,
            "agent_trace": all_agent_trace,
            "execution_time_seconds": execution_time,
            "actions": [{"action": t["tool"], "value": "executed"} for t in all_tools_called],
            "final_state": get_state().model_dump()
        }
        jobs[job_id]["status"] = "complete"
        asyncio.create_task(cleanup_job(job_id))
        print(f"✅ [BG:{job_id[:8]}] Complete in {execution_time}s | Tools: {len(all_tools_called)}")

    except Exception as e:
        print(f"❌ [BG:{job_id[:8]}] Failed: {e}")
        jobs[job_id] = {"status": "error", "error": str(e), "results": [], "final": None}


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
            "active_sub_agents": ["car_agent", "office_agent", "music_agent"],
            "planned_sub_agents": ["rental_agent", "truck_agent", "fleet_agent"]
        },
        "agents": AGENT_REGISTRY
    }

@app.post("/vehicle/voice")
async def execute_voice_command(voice: VoicePayload):
    user_text = voice.prompt or voice.transcript or ""
    if not user_text.strip():
        raise HTTPException(status_code=400, detail="No voice input provided. Send 'prompt' or 'transcript'.")

    print(f"\n🎙️ [INCOMING VOICE PROMPT]: {user_text}")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "starting", "results": [], "final": None}
    asyncio.create_task(execute_agents_background(job_id, user_text, DRIVER_MEMORY))

    return {"job_id": job_id, "status": "starting"}


@app.get("/voice/status/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.post("/vehicle/reset")
def reset_vehicle_state():
    return reset_state().model_dump()


# ── Spotify Web Playback SDK endpoints ──────────────────────────────────────

class DevicePayload(BaseModel):
    device_id: str


async def _get_spotify_access_token() -> str:
    """Returns a valid Spotify access token (raises HTTPException on failure).

    Delegates to spotify_state.get_access_token() via asyncio.to_thread so that
    both the fast cache-hit path (dict lookup) and the rare cache-miss path
    (sync requests call) run off the event loop.
    """
    token = await asyncio.to_thread(spotify_state.get_access_token)
    if not token:
        raise HTTPException(
            status_code=500,
            detail="Spotify credentials not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN.",
        )
    return token


@app.get("/spotify/token")
async def get_spotify_token():
    """Returns a fresh Spotify access token using the stored refresh token."""
    return {"access_token": await _get_spotify_access_token()}


@app.post("/spotify/device")
def register_spotify_device(payload: DevicePayload):
    """Stores the Spotify Web Playback SDK device_id from the browser player."""
    spotify_state._spotify_device_id = payload.device_id
    print(f"🎵 [SPOTIFY] Browser player registered with device_id: {payload.device_id}")
    return {"status": "ok", "device_id": payload.device_id}


@app.get("/spotify/now-playing")
async def get_now_playing():
    """Returns the current Spotify track (playing or paused), or {is_playing: false} if nothing is loaded."""
    try:
        token = await _get_spotify_access_token()
    except HTTPException:
        return {"is_playing": False}

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(
            "https://api.spotify.com/v1/me/player/currently-playing",
            headers={"Authorization": f"Bearer {token}"},
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
async def spotify_previous():
    """Skip to the previous track on the stored device."""
    token = await _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            "https://api.spotify.com/v1/me/player/previous",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    return {"status": "ok"}


@app.post("/spotify/next")
async def spotify_next():
    """Skip to the next track on the stored device."""
    token = await _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            "https://api.spotify.com/v1/me/player/next",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    return {"status": "ok"}


@app.post("/spotify/seek")
async def spotify_seek(payload: SeekPayload):
    """Seek to a position (ms) on the stored device."""
    token = await _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params: dict = {"position_ms": payload.position_ms}
    if device_id:
        params["device_id"] = device_id
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.put(
            "https://api.spotify.com/v1/me/player/seek",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    return {"status": "ok"}


@app.post("/spotify/pause")
async def spotify_pause():
    """Pause playback on the stored device."""
    token = await _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.put(
            "https://api.spotify.com/v1/me/player/pause",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    return {"status": "ok"}


@app.post("/spotify/resume")
async def spotify_resume():
    """Resume playback on the stored device."""
    token = await _get_spotify_access_token()
    device_id = spotify_state._spotify_device_id
    params = {"device_id": device_id} if device_id else {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.put(
            "https://api.spotify.com/v1/me/player/play",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    return {"status": "ok"}

# Serve the Next.js static frontend (when deployed as unified container)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
    