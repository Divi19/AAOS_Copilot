from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AAOS AI Copilot Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/vehicle/state")
def get_vehicle_state():
    return {"message": "vehicle state placeholder"}

@app.get("/agents")
def get_agent_registry():
    return {"agents": []}

@app.post("/vehicle/voice")
async def execute_voice_command():
    return {"message": "voice command received"}

@app.post("/vehicle/reset")
def reset_vehicle_state():
    return {"message": "state reset"}