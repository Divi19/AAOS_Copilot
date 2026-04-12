from google.adk.agents import Agent
from agents.car_agent.agent import car_agent
from agents.office_agent.agent import office_agent

supervisor_agent = Agent(
    name="supervisor_agent",
    model="gemini-2.5-flash",
    instruction="""You are the AI Automotive Supervisor inside a vehicle.
Read the user's intent carefully. You can delegate to BOTH agents if the command requires it.
- If the user wants vehicle changes (mode, climate, locks, suspension, frunk), delegate to car_agent.
- If the user wants office tasks (Slack messages, calendar blocks), delegate to office_agent.
- If the command involves BOTH (e.g. 'arriving at office, set normal mode and notify team'), delegate to BOTH car_agent AND office_agent sequentially.
Always prioritize safety. Execute vehicle commands before office commands.""",
    sub_agents=[car_agent, office_agent]
)

root_agent = supervisor_agent
