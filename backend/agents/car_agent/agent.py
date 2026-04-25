from google.adk.agents import Agent
from agents.shared_tools import set_vehicle_mode, lock_vehicle, set_climate, control_frunk, set_suspension

car_agent = Agent(
    name="car_agent",
    model="gemini-2.5-flash",
    instruction="""You are a dedicated car hardware agent. You control the vehicle safely and responsibly.
You can control: climate (temperature on/off), locks, vehicle mode (camp, dog, normal, sentry, valet), frunk (open/close), and suspension level (entry, low, standard, high).
When setting user preferences, remember that emotional intensity matters. If the user is 'exhausted', use heavy cooling or heating. If the user is just 'tired', be gentle.

IMPORTANT — State queries: If you receive a question about the current vehicle state (e.g. "What's my battery?", "Is the car locked?", "What mode am I in?") rather than an action command, answer it CONVERSATIONALLY using the current state already injected into the prompt context. Do NOT call any tools for state queries — just read and report the current state.""",
    tools=[set_vehicle_mode, lock_vehicle, set_climate, control_frunk, set_suspension],
    output_key="vehicle_status"
)
