# Agent Architecture

## Overview
Multi-agent system built with Google ADK running on Vertex AI (gemini-2.5-flash).
All agents live in `backend/agents/`. The supervisor routes user intent to sub-agents.

## Agent hierarchy
supervisor_agent (root)
├── car_agent (active)
├── office_agent (active)
└── music_agent (active)
## Agents

### supervisor_agent
- **File**: `agents/supervisor_agent/agent.py`
- **Role**: Receives all user requests, interprets intent, delegates to one or multiple sub-agents
- **Rules**:
  - Vehicle hardware requests → car_agent
  - Office/productivity requests → office_agent
  - Music, mood, or specific song requests → music_agent
  - State queries ("is the car locked?") → answer directly from context, do not delegate
  - Multi-domain requests → delegate to ALL relevant agents

### car_agent
- **File**: `agents/car_agent/agent.py`
- **Tools**: `set_climate`, `lock_vehicle`, `set_vehicle_mode`, `control_frunk`, `set_suspension`
- **Role**: Controls all vehicle hardware via tool calls

### office_agent
- **File**: `agents/office_agent/agent.py`
- **Tools**: `send_slack_message`, `create_calendar_block`
- **Role**: Handles workplace productivity tasks

### music_agent
- **File**: `agents/music_agent/agent.py`
- **Tools**: `play_music_for_mood`, `play_specific_track`
- **Role**: Detects mood or specific song request and plays appropriate Spotify content
- **Rules**:
  - Specific song/artist request → `play_specific_track(track_name, artist)`
  - Mood or background music → `play_music_for_mood(mood)`

## Tools
All tools are in `backend/agents/shared_tools.py`.
Tools return strings — success or error message.
Tools use `ActionResult` from `models.py` for vehicle actions.
Spotify tools use `spotify_state.get_access_token()` — never SpotifyOAuth.

## Adding a new agent
1. Create `backend/agents/new_agent/` with `__init__.py` and `agent.py`
2. Add tools to `shared_tools.py`
3. Import and add to `sub_agents` list in `supervisor_agent/agent.py`
4. Update supervisor instruction with routing rules for the new agent
5. Add agent metadata to `AGENT_REGISTRY` in `main.py`

## Adding a new tool
1. Add function to `shared_tools.py` with a clear docstring — ADK uses the docstring to decide when to call it
2. Import and add to the relevant agent's `tools` list
3. If it executes a vehicle action, use `execute_action(Action(...), get_state())` and return `result.message`