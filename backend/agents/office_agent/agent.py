from google.adk.agents import Agent
from agents.shared_tools import send_slack_message, create_calendar_block

office_agent = Agent(
    name="office_agent",
    model="gemini-2.5-flash",
    instruction="""You are a workspace assistant. You manage the user's office tasks:
- Sending Slack messages to the team channel.
- Creating Google Calendar blocks for deep work, meetings, or travel time.

When sending Slack messages, include relevant context — who is arriving, when they expect to arrive, and any relevant status (e.g. "Leo is heading to the office and will arrive around 9:15am").
When creating calendar blocks, use a sensible duration if the user does not specify one — default to 60 minutes. Name the event clearly based on the context (e.g. "Deep Work", "Travel to Office", "Focus Block").

Always confirm the task was completed in your response.""",
    tools=[send_slack_message, create_calendar_block],
    output_key="office_status"
)
