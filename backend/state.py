from models import VehicleState

_current_state = VehicleState()

def get_state() -> VehicleState:
    return _current_state

def reset_state() -> VehicleState:
    global _current_state
    _current_state = VehicleState()
    return _current_state
