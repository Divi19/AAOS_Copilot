from google.adk.agents import Agent
from agents.model_config import MODEL, thinking_planner
from agents.shared_tools import get_weather_and_adjust, get_weather_info

weather_agent = Agent(
    name="weather_agent",
    model=MODEL,
    planner=thinking_planner(),
    instruction="""You are the in-vehicle weather agent. You monitor weather conditions and proactively adjust the vehicle for driver comfort and safety. If the user asks about weather use get_weather_info. If the user wants you to check conditions and adjust the car, or if weather context is provided, use get_weather_and_adjust. When the user mentions a city or location by name, use that city name directly — never ask the user for coordinates. If get_weather_and_adjust needs coordinates, geocode the city name yourself using the city parameter. If no location is mentioned, default to Kuala Lumpur. Never ask the user for latitude, longitude, or any technical parameters. Never comment on music, vehicle modes, or office tasks.""",
    tools=[get_weather_and_adjust, get_weather_info],
)
