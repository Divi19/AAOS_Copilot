from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from models import VehicleState
from state import get_state, reset_state
import json, os, time
from typing import Optional, List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environments
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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

GCP_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
GCP_REGION = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
try:
    vertexai.init(project=GCP_PROJECT, location=GCP_REGION)
except Exception as e:
    print(f"Warning: {e}")

session_service = InMemorySessionService()

class VoicePayload(BaseModel):
    prompt: Optional[str] = None
    transcript: Optional[str] = None

AGENT_REGISTRY = {
    "supervisor_agent": {"name": "Supervisor", "icon": "hub", "description": "Routes intents to specialized sub-agents", "status": "active", "model": "gemini-2.5-flash", "type": "router"},
    "car_agent": {"name": "Car Agent", "icon": "directions_car", "description": "Controls vehicle hardware: climate, locks, suspension, modes", "status": "active", "model": "gemini-2.5-flash", "type": "specialist", "tools": ["set_climate", "lock_vehicle", "set_vehicle_mode", "control_frunk", "set_suspension"]},
    "office_agent": {"name": "Office Agent", "icon": "business_center", "description": "Manages workspace: Slack messages, calendar blocks", "status": "active", "model": "gemini-2.5-flash", "type": "specialist", "tools": ["send_slack_message", "create_calendar_block"]},
    "rental_agent": {"name": "Rental Agent", "icon": "car_rental", "description": "Fleet check-in/out, damage reports, customer handoff", "status": "coming_soon", "model": "gemini-2.5-flash", "type": "specialist", "tools": ["check_in_vehicle", "generate_damage_report"]},
    "truck_agent": {"name": "Truck Agent", "icon": "local_shipping", "description": "HOS compliance, route optimization, load management", "status": "coming_soon", "model": "gemini-2.5-flash", "type": "specialist", "tools": ["check_hos_status", "optimize_route"]},
    "fleet_agent": {"name": "Fleet Manager", "icon": "monitoring", "description": "OEM-level telemetry, predictive maintenance, recall management", "status": "coming_soon", "model": "gemini-2.5-flash", "type": "specialist", "tools": ["get_fleet_health", "schedule_maintenance"]}
}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/vehicle/state")
def get_vehicle_state():
    return get_state().model_dump()

@app.get("/agents")
def get_agent_registry():
    return {"hierarchy": {"root": "supervisor_agent", "active_sub_agents": ["car_agent", "office_agent"], "planned_sub_agents": ["rental_agent", "truck_agent", "fleet_agent"]}, "agents": AGENT_REGISTRY}

@app.post("/vehicle/voice")
async def execute_voice_command(voice: VoicePayload):
    start_time = time.time()
    user_text = voice.prompt or voice.transcript or ""
    if not user_text.strip():
        raise HTTPException(status_code=400, detail="No voice input provided.")
    
    driver_memory = {"name": "Leo", "preferences": {"climate_hot": 22.0, "climate_cold": 28.0, "slack_channel": "#office-arrivals"}}
    context_str = f"Current State: {get_state().model_dump_json()}\nDriver Memory: {json.dumps(driver_memory)}\nUser Request: {user_text}"
    
    try:
        session = session_service.create_session(app_name="vehicle_copilot", user_id="demo_user")
        runner = Runner(agent=supervisor_agent, app_name="vehicle_copilot", session_service=session_service)
        final_answer = ""
        tools_called = []
        agent_trace = []
        
        async for event in runner.run_async(user_id="demo_user", session_id=session.id, new_message=types.Content(role="user", parts=[types.Part(text=context_str)])):
            agent_name = getattr(event, 'agent_name', 'unknown')
            tool_name = None
            if hasattr(event, 'tool_call') and event.tool_call:
                tool_name = event.tool_call.name
            if not tool_name and hasattr(event, 'content') and event.content:
                for part in (event.content.parts or []):
                    if hasattr(part, 'function_call') and part.function_call:
                        tool_name = part.function_call.name
                        break
            
            if tool_name:
                tools_called.append({"agent": agent_name, "tool": tool_name})
                agent_trace.append({"type": "tool_call", "agent": agent_name, "tool": tool_name, "timestamp": round(time.time() - start_time, 2)})
            elif agent_name != 'unknown' and not any(t.get('agent') == agent_name for t in agent_trace):
                agent_trace.append({"type": "activation", "agent": agent_name, "timestamp": round(time.time() - start_time, 2)})
            
            if event.is_final_response():
                final_answer = event.content.parts[0].text if event.content and event.content.parts else ""
        
        execution_time = round(time.time() - start_time, 2)
        return {
            "message": final_answer, "tools_called": tools_called, "agent_trace": agent_trace, 
            "execution_time_seconds": execution_time, "final_state": get_state().model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/vehicle/reset")
def reset_vehicle_state():
    return reset_state().model_dump()
