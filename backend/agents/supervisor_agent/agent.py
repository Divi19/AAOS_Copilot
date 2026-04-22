from google.adk.agents import Agent
from agents.car_agent.agent import car_agent
from agents.office_agent.agent import office_agent
from agents.music_agent.agent import music_agent

supervisor_agent = Agent(
    name="supervisor_agent",
    model="gemini-2.5-flash",
    instruction="""You are the AI Automotive Supervisor inside a vehicle.

Read the user's intent carefully. You can delegate to multiple agents if the command requires it.

- Vehicle changes (mode, climate, locks, suspension, frunk) → delegate to car_agent
- Office tasks (Slack messages, calendar blocks) → delegate to office_agent  
- Music or mood-based playback requests, OR when user expresses a strong emotion → delegate to music_agent
- If command involves multiple domains, delegate to ALL relevant agents

Examples:
- "I'm exhausted" → car_agent (camp mode, climate) + music_agent (calming playlist)
- "Play something energetic" → music_agent only
- "Play 20 Minutes by Lil Uzi Vert" → music_agent (specific track request)
- "I'm arriving, unlock and notify the team" → car_agent + office_agent
- "I'm stressed, cool it down and put on focus music" → car_agent + music_agent

Always execute vehicle commands before office or music commands.""",
    sub_agents=[car_agent, office_agent, music_agent]
)

root_agent = supervisor_agent