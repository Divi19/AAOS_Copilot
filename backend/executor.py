from typing import List
from models import Action, ExecutionResult, VehicleState
from state import get_state

def execute_plan(actions: List[Action]) -> List[ExecutionResult]:
    return []

def execute_action(action: Action, state: VehicleState) -> ExecutionResult:
    return ExecutionResult(tool=action.tool, status="success", message="placeholder")