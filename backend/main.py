from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from models import VehicleState
from state import get_state, reset_state
import json
import os
import time
from typing import Optional, List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# CRITICAL: Load .env BEFORE importing ADK agents — they read env vars at import time
load_dotenv()
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "smartvehicle-agent")
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
GCP_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "smartvehicle-agent")
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

# Serve the Next.js static frontend (when deployed as unified container)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
