from models import Action, ActionResult, VehicleState

def execute_action(action: Action, state: VehicleState) -> ActionResult:
    tool = action.tool
    params = action.parameters
    
    if tool == "setClimate":
        state.climate_on = params.get("on", state.climate_on)
        state.climate_temp = params.get("temp", state.climate_temp)
        return ActionResult(success=True, message=f"Climate set to {state.climate_temp}°C")
        
    if tool == "lockVehicle":
        state.is_locked = params.get("locked", True)
        return ActionResult(success=True, message="Vehicle doors locked" if state.is_locked else "Vehicle doors unlocked")
        
    if tool == "controlEnclosures":
        if "frunk" in params: state.frunk_open = params["frunk"]
        return ActionResult(success=True, message="Frunk opened" if state.frunk_open else "Frunk closed")

    if tool == "setSuspension":
        state.suspension_level = params.get("level", "standard")
        return ActionResult(success=True, message=f"Suspension set to {state.suspension_level}")

    if tool == "setVehicleMode":
        state.vehicle_mode = params.get("mode", "normal")
        return ActionResult(success=True, message=f"Vehicle mode set to {state.vehicle_mode}")

    return ActionResult(success=False, message=f"Tool {tool} not found")
