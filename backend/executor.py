from typing import List
from models import Action, ExecutionResult, VehicleState, Location
from state import get_state

def execute_plan(actions: List[Action]) -> List[ExecutionResult]:
    state = get_state()
    results = []
    
    for action in actions:
        result = execute_action(action, state)
        results.append(result)
        
    return results

def execute_action(action: Action, state: VehicleState) -> ExecutionResult:
    tool = action.tool
    params = action.parameters
    
    if tool == "getVehicleState":
        return ExecutionResult(tool=tool, status="success", message="Vehicle state retrieved", result_data=state.model_dump())
    
    elif tool == "setClimate":
        on = params.get("on", True)
        temp = params.get("temp", state.climate_temp)
        state.climate_on = on
        state.climate_temp = temp
        return ExecutionResult(tool=tool, status="success", message=f"Climate set to {'on' if on else 'off'} at {temp}°C")
    
    elif tool == "lockVehicle":
        locked = params.get("locked", True)
        state.is_locked = locked
        return ExecutionResult(tool=tool, status="success", message=f"Vehicle is now {'locked' if locked else 'unlocked'}")
    
    elif tool == "navigateTo":
        lat = params.get("lat")
        lng = params.get("lng")
        name = params.get("name")
        state.destination = Location(lat=lat, lng=lng, name=name)
        return ExecutionResult(tool=tool, status="success", message=f"Navigating to {name or f'{lat},{lng}'}")
    
    elif tool == "setVehicleMode":
        mode = params.get("mode", "normal")
        state.vehicle_mode = mode
        return ExecutionResult(tool=tool, status="success", message=f"Vehicle mode set to {mode.capitalize()} mode")
    
    else:
        return ExecutionResult(tool=tool, status="error", message=f"Unknown tool: {tool}")