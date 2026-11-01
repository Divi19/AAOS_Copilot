from google.adk.agents import Agent
from agents.model_config import MODEL, thinking_planner
from agents.shared_tools import send_slack_message, create_calendar_block

office_agent = Agent(
    name="office_agent",
    model=MODEL,
    planner=thinking_planner(),
    instruction="""You are a workspace assistant. You manage the user's office tasks:
- Sending Slack messages to the team channel.
- Creating Google Calendar blocks for deep work, meetings, or travel time.

When sending Slack messages, include relevant context — who is arriving, when they expect to arrive, and any relevant status (e.g. "Leo is heading to the office and will arrive around 9:15am").
When creating calendar blocks, use a sensible duration if the user does not specify one — default to 60 minutes. Name the event clearly based on the context (e.g. "Deep Work", "Travel to Office", "Focus Block").

Always confirm the task was completed in your response.

You MUST always call send_slack_message when a Slack or team message is requested — never say you cannot send messages and never ask what the message should say. Infer a natural professional message from the user's request context. If the user says "message the team that I'm listening to music" call send_slack_message with "Leo is currently listening to music" — do not ask for clarification. Never tell the user you cannot do something that your tools support.

You are only responsible for Slack messages and calendar blocks. Never comment on music, vehicle controls, or any other domain. If the user's request mentions those alongside an office task, ignore them completely and only handle the office portion.""",
    tools=[send_slack_message, create_calendar_block],
    output_key="office_status"
)
