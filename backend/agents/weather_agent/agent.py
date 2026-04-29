from google.adk.agents import Agent
from agents.shared_tools import get_weather_and_adjust, get_weather_info

weather_agent = Agent(
    name="weather_agent",
    model="gemini-2.0-flash",
    instruction="""You are the in-vehicle weather agent. You monitor weather conditions and proactively adjust the vehicle for driver comfort and safety. If the user asks about weather use get_weather_info. If the user wants you to check conditions and adjust the car, or if weather context is provided, use get_weather_and_adjust. Always use coordinates when available. Default to the driver's current city if no location is specified. Never comment on music, vehicle modes, or office tasks.""",
    tools=[get_weather_and_adjust, get_weather_info],
)
