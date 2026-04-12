from google.adk.agents import Agent
from agents.shared_tools import send_slack_message, create_calendar_block

office_agent = Agent(
    name="office_agent",
    model="gemini-2.5-flash",
    instruction="""You are a workspace assistant. You manage the user's office tasks:
- Sending Slack messages to the team.
- Creating calendar blocks for deep work or meetings.
Always confirm the task is completed gracefully.""",
    tools=[send_slack_message, create_calendar_block],
    output_key="office_status"
)
