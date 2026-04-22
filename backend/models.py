from pydantic import BaseModel
from typing import Optional, Dict, Any

class VehicleState(BaseModel):
    is_locked: bool = True
    climate_on: bool = False
    climate_temp: float = 20.0
    battery_level: float = 80.0
    is_preconditioning: bool = False
    destination: Optional[Any] = None
    scheduled_departure_time: Optional[str] = None
    vehicle_mode: str = "normal"
    frunk_open: bool = False
    trunk_open: bool = False
    suspension_level: str = "standard"

class Location(BaseModel):
    lat: float
    lng: float
    name: Optional[str] = None

class Action(BaseModel):
    tool: str
    parameters: Dict[str, Any]

class ActionResult(BaseModel):
    success: bool
    message: str
    new_state: Optional[Dict[str, Any]] = None