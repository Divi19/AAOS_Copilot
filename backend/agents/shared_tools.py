from models import Action
from executor import execute_action
from state import get_state

def set_vehicle_mode(mode: str) -> str:
    """Sets the vehicle hardware mode (e.g. camp, dog, normal)."""
    result = execute_action(Action(tool="setVehicleMode", parameters={"mode": mode}), get_state())
    return result.message

def lock_vehicle(locked: bool) -> str:
    """Locks or unlocks the vehicle."""
    result = execute_action(Action(tool="lockVehicle", parameters={"locked": locked}), get_state())
    return result.message

def set_climate(on: bool, temp: float = 20.0) -> str:
    """Turns the climate control on or off, and sets the temperature."""
    result = execute_action(Action(tool="setClimate", parameters={"on": on, "temp": temp}), get_state())
    return result.message

def control_frunk(open: bool) -> str:
    """Opens or closes the frunk (front trunk)."""
    result = execute_action(Action(tool="controlEnclosures", parameters={"frunk": open}), get_state())
    return result.message

def set_suspension(level: str) -> str:
    """Sets the suspension level (entry, low, standard, high)."""
    result = execute_action(Action(tool="setSuspension", parameters={"level": level}), get_state())
    return result.message

def send_slack_message(message: str) -> str:
    """Sends a Slack message about arriving at the office or task completion."""
    return f"Slack message sent: {message}"

def create_calendar_block(event_name: str, duration_minutes: int) -> str:
    """Creates a calendar block for the user."""
    return f"Calendar block created: {event_name} for {duration_minutes} minutes"
