from typing import List
from models import Action, ActionResult, VehicleState, Location
from state import get_state

def execute_plan(actions: List[Action]) -> List[ActionResult]:
    state = get_state()
    results = []
    
    for action in actions:
        result = execute_action(action, state)
        results.append(result)
        
    return results

def execute_action(action: Action, state: VehicleState) -> ActionResult:
    tool = action.tool
    params = action.parameters
    
    try:
        if tool == "getVehicleState":
            return ActionResult(
                success=True,
                message="Vehicle state retrieved",
                new_state=state.model_dump()
            )
            
        elif tool == "scheduleDeparture":
            time = params.get("time")
            if not time:
                return ActionResult(success=False, message="Missing 'time' parameter")
            state.scheduled_departure_time = time
            return ActionResult(success=True, message=f"Departure scheduled for {time}")
            
        elif tool == "navigateTo":
            lat = params.get("lat")
            lng = params.get("lng")
            name = params.get("name")
            if lat is None or lng is None:
                return ActionResult(success=False, message="Missing 'lat' or 'lng' parameters")
            state.destination = Location(lat=lat, lng=lng, name=name)
            return ActionResult(success=True, message=f"Navigating to {name or f'{lat},{lng}'}")
            
        elif tool == "preconditionBattery":
            enabled = params.get("enabled", True)
            state.is_preconditioning = enabled
            status_str = "started" if enabled else "stopped"
            return ActionResult(success=True, message=f"Battery preconditioning {status_str}")
            
        elif tool == "setClimate":
            on = params.get("on", True)
            temp = params.get("temp", state.climate_temp)
            state.climate_on = on
            state.climate_temp = temp
            status_str = "on" if on else "off"
            return ActionResult(success=True, message=f"Climate set to {status_str} at {temp}°C")
            
        elif tool == "lockVehicle":
            locked = params.get("locked", True)
            state.is_locked = locked
            status_str = "locked" if locked else "unlocked"
            return ActionResult(success=True, message=f"Vehicle is now {status_str}")

        elif tool == "setChildLock":
            enabled = params.get("enabled", True)
            state.child_lock_on = enabled
            status_str = "engaged — rear doors can't be opened from inside" if enabled else "disengaged"
            return ActionResult(success=True, message=f"Child lock {status_str}")
            
        elif tool == "setVehicleMode":
            mode = params.get("mode", "normal")
            state.vehicle_mode = mode
            
            # Real-World Macro: Camp Mode automatically utilizes the air suspension to auto-level the car!
            if mode.lower() == "camp":
                state.suspension_level = "low"
                
            return ActionResult(success=True, message=f"Vehicle mode set to {mode.capitalize()} mode")

        elif tool == "controlEnclosures":
            msgs = []
            if "frunk" in params:
                state.frunk_open = params["frunk"]
                msgs.append(f"Frunk {'open' if state.frunk_open else 'closed'}")
            if "trunk" in params:
                state.trunk_open = params["trunk"]
                msgs.append(f"Trunk {'open' if state.trunk_open else 'closed'}")
            return ActionResult(success=True, message=", ".join(msgs) if msgs else "No enclosure parameters provided")
            
        elif tool == "setSuspension":
            level = params.get("level", "standard")
            state.suspension_level = level
            return ActionResult(success=True, message=f"Suspension set to {level.capitalize()}")

        elif tool == "setSeatHeating":
            driver = params.get("driver", 0)
            passenger = params.get("passenger", 0)
            state.seat_heating_driver = driver
            state.seat_heating_passenger = passenger
            return ActionResult(success=True, message=f"Seat heating set — driver: level {driver}, passenger: level {passenger}")

        elif tool == "setSeatVentilation":
            driver = params.get("driver", 0)
            passenger = params.get("passenger", 0)
            state.seat_ventilation_driver = driver
            state.seat_ventilation_passenger = passenger
            return ActionResult(success=True, message=f"Seat ventilation set — driver: level {driver}, passenger: level {passenger}")

        elif tool == "setAirPurification":
            enabled = params.get("enabled", True)
            state.air_purification_on = enabled
            return ActionResult(success=True, message=f"Air purification {'enabled' if enabled else 'disabled'}")

        elif tool == "setRecirculation":
            enabled = params.get("enabled", True)
            state.recirculation_on = enabled
            return ActionResult(success=True, message=f"Air recirculation {'on — using cabin air' if enabled else 'off — using outside air'}")

        elif tool == "setAQI":
            aqi = params.get("aqi", None)
            state.aqi = aqi
            return ActionResult(success=True, message=f"AQI updated to {aqi}")

        else:
            return ActionResult(success=False, message=f"Unknown tool: {tool}")
            
    except Exception as e:
        return ActionResult(success=False, message=f"Execution failed: {str(e)}")