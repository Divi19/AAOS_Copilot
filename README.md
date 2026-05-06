<div align="center">

# 🚗 AAOS AI Copilot

**A production-grade, voice-first AI copilot for Android Automotive OS**  
*Built on Google ADK · Vertex AI · Gemini 2.5 Flash*

[![Python](https://img.shields.io/badge/Python-3.10-FFD43B?style=for-the-badge&logo=python&logoColor=black)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-00C7B7?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-E879F9?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Vertex AI](https://img.shields.io/badge/Vertex_AI-Gemini_2.5_Flash-FF6B35?style=for-the-badge&logo=google-cloud&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Google Cloud](https://img.shields.io/badge/Cloud_Run-GCP-34A853?style=for-the-badge&logo=google-cloud&logoColor=white)](https://cloud.google.com/run)
[![Spotify](https://img.shields.io/badge/Spotify-Web_SDK-1DB954?style=for-the-badge&logo=spotify&logoColor=white)](https://developer.spotify.com/)
[![Slack](https://img.shields.io/badge/Slack-Bot_API-4A154B?style=for-the-badge&logo=slack&logoColor=white)](https://api.slack.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](LICENSE)

</div>

---

## What Is This?

AAOS AI Copilot is a voice-driven, multi-agent AI system designed for in-vehicle environments. A single spoken sentence — *"I'm stressed, cool the car down, put on some focus music, and notify the team I'll be late"* — is simultaneously decomposed and executed across five specialist AI agents in parallel: the **Car Agent** adjusts climate and vehicle hardware, the **Music Agent** queues a Spotify playlist, the **Office Agent** fires a Slack message and creates a calendar block, the **Weather Agent** proactively calibrates suspension and cabin settings based on live atmospheric data, and the **Navigation Agent** provides real directions and traffic from Google Maps. All agents run concurrently on Google ADK + Vertex AI (Gemini 2.5 Flash), with results streaming back to the frontend progressively as each agent finishes — not after all of them do. The architecture mirrors what a real Android Automotive OS implementation would look like, with the FastAPI backend mapping 1:1 to AAOS hardware APIs and the Next.js frontend serving as a production-quality infotainment HMI.

---

## How It Works

Every voice command goes through a two-stage pipeline:

**Stage 1 — Intent Routing (Supervisor Agent)**  
The Supervisor Agent receives the full user request along with the current vehicle state, driver memory profile, and the last 3 conversation exchanges for session context. It returns a JSON map — a routing table — that decomposes the request into isolated sub-prompts, one per specialist domain. Each agent only receives the portion of the request relevant to it, preventing domain bleed. If the request is a simple state query (e.g., "Is the car locked?"), the Supervisor answers directly without invoking any downstream agents.

**Stage 2 — Parallel Specialist Execution**  
The backend launches all mapped agents simultaneously using `asyncio.as_completed`. Each agent has its own isolated `Runner` and `InMemorySessionService` instance — there is no shared session state across agents or across calls. As each agent completes it immediately appends its result to a job store. The frontend polls `/voice/status/{job_id}` every second and displays each agent's real result the moment it appears — nothing is shown until it actually happened.

```
                    ┌─────────────────────────────────┐
                    │         Voice Input              │
                    │  "I'm leaving, cool the car,     │
                    │   put on focus music, ping team" │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │       Supervisor Agent           │
                    │   (Gemini 2.5 Flash via ADK)     │
                    │   Decomposes intent → JSON map   │
                    │   Injects last 3 exchanges for   │
                    │   session memory context         │
                    └──┬──────┬──────┬──────┬─────────┘
                       │      │      │      │
              ┌────────▼─┐ ┌──▼───┐ ┌▼─────▼──┐ ┌────────────┐
              │  Car     │ │Music │ │ Office  │ │  Weather   │
              │  Agent   │ │Agent │ │ Agent   │ │  Agent     │
              │          │ │      │ │         │ │            │
              │ climate  │ │mood  │ │ slack   │ │ OpenWeather│
              │ locks    │ │track │ │ calendar│ │ AQI        │
              │ suspend. │ │search│ │         │ │ auto-adjust│
              │ seats    │ │      │ │         │ │            │
              └──────────┘ └──────┘ └─────────┘ └────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │   Job-Based Polling Store        │
                    │  Results appended as each agent  │
                    │  completes — streamed to UI      │
                    └─────────────────────────────────┘
```

All specialist agents run **concurrently** — total latency is bounded by the slowest single agent, not the sum of all agents. A 5-agent command typically completes in 6–8 seconds.

---

## Features

### 🚗 Vehicle Control
| Command | What Happens |
|---|---|
| `"Turn on climate at 22 degrees"` | Car Agent calls `set_climate(on=True, temp=22.0)` |
| `"Lock the car"` | Car Agent calls `lock_vehicle(locked=True)` |
| `"Set camp mode"` | Sets mode + auto-levels suspension to low |
| `"Open the frunk"` | Car Agent calls `control_frunk(open=True)` |
| `"Set suspension to high"` | Car Agent calls `set_suspension(level="high")` |
| `"Prepare the car for my trip"` | Macro: precondition battery + set climate + unlock |
| `"I'm leaving in 20 minutes"` | Precondition + climate + scheduled departure time |
| `"Warm up my seat"` | Seat heating levels 0–3 for driver and passenger |
| `"Turn on seat ventilation"` | Seat ventilation levels 0–3 for driver and passenger |
| `"The air smells weird"` | Air purification + recirculation mode toggled |

### 🎵 Music
| Command | What Happens |
|---|---|
| `"Play something energetic"` | Music Agent resolves mood → Spotify playlist URI |
| `"Play 20 Minutes by Lil Uzi Vert"` | Searches Spotify by track+artist, plays exact track |
| `"I'm exhausted"` | Music Agent queues calm playlist; Car Agent may set camp mode in parallel |
| Supported moods | `exhausted`, `tired`, `stressed`, `happy`, `energetic`, `focused`, `sad`, `calm`, `neutral` |

Music plays through the **Spotify Web Playback SDK** embedded directly in the browser — the browser itself becomes the registered Spotify audio device, eliminating any requirement for a native audio daemon or an external Spotify client to be open.

### 💼 Office Integration
| Command | What Happens |
|---|---|
| `"Notify the team I'm arriving"` | Posts to configured Slack channel via `slack_sdk` — real message, not mocked |
| `"Block my calendar for focus time"` | Creates a real Google Calendar event via Service Account credentials |
| `"I'm heading to the office"` | Car Agent prepares vehicle; Office Agent pings Slack simultaneously |

### 🌤️ Weather Intelligence
The Weather Agent doesn't just report — it **acts**. When invoked, it fetches live conditions from OpenWeatherMap, fetches AQI from the Air Pollution API, then autonomously adjusts the vehicle:

| Condition | Automatic Adjustment |
|---|---|
| Rain or snow detected | Raise suspension to `high` for wet roads |
| Temp > 26°C | Pre-cool cabin to 20°C |
| Temp < 10°C | Set cabin to 22°C + start battery preconditioning |
| Temp > 30°C | Enable seat ventilation (driver: 2, passenger: 1) |
| Temp < 15°C | Enable seat heating (driver: 2, passenger: 1) |
| AQI ≥ 3 (Moderate+) | Enable air purification + switch to recirculation |
| Humidity > 80% | Disable recirculation to prevent cabin fogging |

### 🗺️ Navigation
| Command | What Happens |
|---|---|
| `"How long to KLCC from Rawang"` | Real Google Maps directions with road names and ETA |
| `"Find the nearest charging station"` | Google Places API returns real nearby EV chargers |
| `"How is the traffic to the city centre"` | Google Distance Matrix with live traffic conditions |

### 🔊 Voice Synthesis
Agent responses are spoken back through the browser using Google Cloud Text-to-Speech (Neural2-D voice). The full voice loop: speak → act → speak back — exactly how real AAOS works.

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Python 3.10** | Runtime |
| **FastAPI** | REST API framework, async request handling |
| **Google ADK (`google-adk`)** | Multi-agent orchestration framework |
| **Vertex AI (Gemini 2.5 Flash)** | LLM backbone for all 5 active agents |
| **Pydantic** | Vehicle state modeling, request/response validation |
| **Uvicorn** | ASGI server |
| **asyncio** | Concurrent agent execution via `as_completed` |
| **httpx** | Async HTTP for Spotify Web API calls |
| **spotipy** | Spotify SDK (used with pre-cached token — never OAuth redirect) |
| **slack-sdk** | Slack Web API integration |
| **google-api-python-client** | Google Calendar API via Service Account |
| **google-cloud-texttospeech** | Neural TTS — en-US-Neural2-D voice |
| **requests** | Sync HTTP for OpenWeatherMap weather and AQI |
| **googlemaps** | Google Maps Directions, Places, Distance Matrix |

### Frontend
| Technology | Purpose |
|---|---|
| **Next.js 16 + React 19** | App Router, TypeScript, SSR |
| **Tailwind CSS v4** | Utility-first styling |
| **Spotify Web Playback SDK** | Browser-as-audio-device for music playback |
| **Web Speech API** | Push-to-talk voice capture with continuous recognition |

### APIs & Integrations
| Service | Usage |
|---|---|
| **Spotify Web API** | Search tracks, start playback, player controls |
| **Spotify Web Playback SDK** | Browser becomes a registered Spotify Connect device |
| **OpenWeatherMap** | Live weather conditions (temperature, humidity, condition ID) |
| **OpenWeatherMap Air Pollution API** | AQI index (1–5 scale) for cabin air quality decisions |
| **Slack Web API** | Team notifications via `chat_postMessage` |
| **Google Calendar API** | Real event creation via Service Account credentials |
| **Google Maps Directions API** | Real-time directions and estimated arrival |
| **Google Maps Places API** | Nearby EV charging stations and points of interest |
| **Google Maps Distance Matrix API** | Live traffic conditions between locations |
| **Google Cloud Text-to-Speech** | Neural voice synthesis for agent responses |

### Infrastructure
| Component | Detail |
|---|---|
| **Backend hosting** | Google Cloud Run (containerized, `python:3.10-slim`) |
| **Frontend hosting** | Vercel |
| **CI/CD** | GitHub Actions — ESLint + Ruff lint gates + gitleaks secret scanning on PRs, automated deploy on merge to `main` |
| **Deploy command** | `gcloud run deploy aaos-backend --source ./backend --region us-central1` |
| **GCP Project** | `aaos-vehicle-system`, region `us-central1` |
| **Container** | Dockerfile: `uvicorn main:app --host 0.0.0.0 --port $PORT` |

---

## Key Technical Achievements

### ⚡ True Parallel Agent Execution
Specialist agents run concurrently using `asyncio.as_completed`, not sequentially. Each agent has a fully isolated `Runner` and `InMemorySessionService` — no shared mutable session state across concurrent requests. A 5-agent command (car + music + office + weather + navigation) completes in ~the time of the single slowest agent. Results stream progressively to the frontend via job-based polling as each agent finishes.

```python
# Each agent gets its own isolated Runner — no shared session state
car_runner     = Runner(agent=car_agent,     app_name="vehicle_copilot", session_service=car_session_service)
office_runner  = Runner(agent=office_agent,  app_name="vehicle_copilot", session_service=office_session_service)
music_runner   = Runner(agent=music_agent,   app_name="vehicle_copilot", session_service=music_session_service)
weather_runner = Runner(agent=weather_agent, app_name="vehicle_copilot", session_service=weather_session_service)
nav_runner     = Runner(agent=nav_agent,     app_name="vehicle_copilot", session_service=nav_session_service)

# Parallel execution — results stream back as each agent finishes
for coro in asyncio.as_completed(coros):
    agent_name, result = await coro
    jobs[job_id]["results"].append(result)  # Frontend polls and displays immediately
```

### 📬 Job-Based Real-Time Polling
Voice commands return a `job_id` in under 100ms. The backend executes all agents in the background and appends results to an in-memory job store as each agent completes. The frontend polls `/voice/status/{job_id}` every second using a `deliveredCount` index — each agent's real result appears in the UI the moment it finishes, with nothing shown until it actually happened. No optimistic UI, no fake placeholders.

### 🔒 SpotifyOAuth Deadlock Fix
`SpotifyOAuth` internally calls `input()` to prompt for authorization on cache misses. On Cloud Run — which has no TTY, no stdin, and no persistent filesystem for token caching — this blocked a thread pool thread **permanently**, starving the FastAPI event loop and causing every subsequent request to 504 after the pool was exhausted.

**Fix**: All Spotify authentication was extracted into `spotify_state.py` — a thin shared module that implements the OAuth2 refresh-token flow directly via `requests`, with an in-memory cache keyed by token expiry. No `SpotifyOAuth` is used anywhere in agent tool code.

```python
# spotify_state.py — no SpotifyOAuth, no input(), no filesystem cache
def get_access_token() -> str | None:
    if _token_cache["token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["token"]  # Fast path: return cached token
    # Slow path: POST to Spotify token endpoint with refresh_token grant
    response = requests.post("https://accounts.spotify.com/api/token", ...)
    _token_cache["token"] = data["access_token"]
    return data["access_token"]
```

### 🌐 Browser as Spotify Device
Rather than requiring a native audio daemon inside Cloud Run (impossible in a serverless container), the Spotify Web Playback SDK is loaded directly in the Next.js frontend. The browser registers itself as a Spotify Connect device and POSTs its `device_id` to the backend at `/spotify/device`. All subsequent `start_playback` calls from agent tool functions target that stored device ID — actual audio streams peer-to-peer between Spotify's CDN and the browser, bypassing the backend entirely.

```
Browser (Web Playback SDK)  →  POST /spotify/device  →  Backend stores device_id
                                                              ↓
Agent: sp.start_playback(device_id=stored_id, ...)  →  Spotify API
                                                              ↓
                                        Audio streams directly to browser ✓
```

### 🧠 Session Memory Without a Database
Each voice command injects the last 3 conversation exchanges into the context string passed to every agent — giving the system short-term session memory without any database. The frontend passes conversation history in every request payload; the backend prepends it to the agent context alongside current vehicle state and driver preferences.

### 🌡️ Weather-Triggered Vehicle Intelligence
The Weather Agent implements a multi-signal decision tree that cross-references temperature, humidity, precipitation type (by OpenWeatherMap condition ID ranges), and AQI to make independent, stacked vehicle adjustments — without requiring the user to enumerate each one. A single command like *"Check the weather and set up the car"* can trigger up to 6 simultaneous vehicle state changes including seat heating, seat ventilation, suspension, climate, air purification, and recirculation.

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Google Cloud project with Vertex AI and Text-to-Speech APIs enabled
- Spotify Developer App with Premium account (required for Web Playback SDK)
- OpenWeatherMap API key (free tier)
- Google Maps Platform API key with Directions, Places, and Distance Matrix APIs enabled
- Slack Bot Token with `chat:write` scope (optional)
- Google Service Account with Calendar API enabled (optional)

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Authenticate with GCP (required for Vertex AI and Text-to-Speech)
gcloud auth application-default login
```

**`backend/.env`**
```env
# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=1

# Spotify (refresh-token flow — NO OAuth redirect needed at runtime)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REFRESH_TOKEN=your_spotify_refresh_token

# Weather
OPENWEATHERMAP_API_KEY=your_openweathermap_api_key

# Google Maps
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Slack (optional)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0XXXXXXXXX   # Channel ID — not the channel name

# Google Calendar (optional — paste full service account JSON as single line)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":...}
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
```

> **Getting a Spotify refresh token**: Run the OAuth flow once locally with scopes `streaming user-modify-playback-state user-read-playback-state user-read-currently-playing`, capture the refresh token, and store it. The backend never needs to run the OAuth flow again.

> **Slack Channel ID**: In the Slack web app, navigate to your channel — the ID is the last segment of the URL (starts with `C`). Do not use the channel name.

```bash
# Run the backend
uvicorn main:app --reload --port 8080
```

Backend available at `http://localhost:8080`. Visit `/docs` for the OpenAPI UI.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

# Run the development server
npm run dev
```

Frontend available at `http://localhost:3000`.

### Deploy to Production

```bash
# Deploy backend to Cloud Run
gcloud run deploy aaos-backend \
  --source ./backend \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 120 \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=1,GOOGLE_CLOUD_PROJECT=your-project-id,..."
```

Set env vars in Cloud Run via the GCP Console or `--set-env-vars`. For the frontend, connect your GitHub repo to Vercel and set `NEXT_PUBLIC_API_URL` to your Cloud Run service URL.

---

## Demo — Best Voice Commands to Try

```
# Multi-agent parallel execution (car + music + office simultaneously)
"I'm heading to the office — prepare the car, put on focus music, and let the team know"

# Full 5-agent command
"Check the weather, get directions to KLCC, play something energetic,
 send the team a Slack message, and set the car to dog mode"

# Weather intelligence (fetches live data → autonomous multi-action adjustment)
"Check the weather in Kuala Lumpur and adjust the car accordingly"

# Mood inference (supervisor decomposes emotional state across agents)
"I'm exhausted — set camp mode, cool it down, and play something calming"

# Specific track playback
"Play Blinding Lights by The Weeknd"

# Trip preparation macro (single command → 3+ vehicle actions)
"I'm leaving in 20 minutes"

# Navigation
"How long to KLCC from Petaling Jaya right now"
"Find the nearest electric vehicle charging station"

# Office integration
"Send a Slack message saying I'll be arriving in 10 minutes"
"Block my calendar for 2 hours of focus time"

# State queries (answered directly by supervisor — no sub-agents fired)
"What's my battery at?"
"Is the car locked?"
"What mode am I in?"

# Micro-climate
"Warm up my seat, it's cold in here"
"Turn on seat ventilation, I'm sweating"
"The air quality is bad, purify the cabin"
```

---

## Architecture — Why This Transfers to Real AAOS

The backend is intentionally structured to mirror the Android Automotive OS (AAOS) CarService API surface:

| Backend Tool | AAOS Equivalent |
|---|---|
| `set_climate(on, temp)` | `CarHvacManager.setProperty(HVAC_AC_ON, ...)` |
| `lock_vehicle(locked)` | `CarPropertyManager.setProperty(PERF_VEHICLE_SPEED_DISPLAY, ...)` |
| `set_suspension(level)` | OEM VHAL property extension |
| `set_vehicle_mode(mode)` | `CarPropertyManager` VHAL custom property |
| `control_frunk(open)` | OEM VHAL trunk/frunk latch property |
| `precondition_battery(enabled)` | `CarPropertyManager` preconditioning property |
| `set_seat_heating(driver, passenger)` | `CarHvacManager.HVAC_SEAT_TEMPERATURE` |
| `set_seat_ventilation(driver, passenger)` | `CarHvacManager.HVAC_SEAT_VENTILATION` |
| `set_air_purification(enabled)` | OEM VHAL air purification property |
| `set_recirculation(enabled)` | `CarHvacManager.HVAC_AIR_RECIRCULATION_ON` |

In a production AAOS deployment:
- This FastAPI backend **becomes a system service** — an Android Service running in the OEM's privileged partition
- The ADK agents run in-process and tool calls invoke `CarPropertyManager` directly instead of updating a Python dict
- The Next.js frontend is replaced by a native **Android Automotive app** targeting the `androidx.car.app` library
- The Spotify Web Playback SDK is replaced by native Spotify integration via `MediaSessionCompat` and the AAOS Media template
- The AAOS `SpeechRecognizer` replaces the browser's Web Speech API for voice capture
- Google Maps navigation integrates natively via the AAOS navigation template

The agent logic, tool structure, supervisor routing rules, parallel execution pattern, and all external API integrations are **fully portable** — they don't care whether the underlying transport is HTTP or IPC.

---

## CI/CD Pipeline

This project uses a GitHub Actions monorepo pipeline with path-based filtering — only the sub-project that changed is built and deployed.

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | Push to any branch + PRs to `main` | ESLint (frontend), Ruff lint + format (backend), gitleaks secret scan |
| `deploy.yml` | Merge to `main` | Deploy frontend → Vercel, deploy backend → Cloud Run (parallel) |

Both workflows skip irrelevant jobs — a frontend-only change never triggers a Cloud Build.

---

## Project Structure

```
AAOS_Copilot/
├── .github/
│   └── workflows/
│       ├── ci.yml               # Quality gates — lint + secret scan
│       └── deploy.yml           # Production deploy — Vercel + Cloud Run
├── backend/
│   ├── main.py                  # FastAPI app, all endpoints, agent runners, job store
│   ├── executor.py              # Vehicle action execution engine
│   ├── models.py                # VehicleState, Action, ActionResult (Pydantic)
│   ├── state.py                 # Vehicle state singleton
│   ├── spotify_state.py         # Shared Spotify token cache (no SpotifyOAuth)
│   ├── pyproject.toml           # Ruff linter configuration
│   ├── requirements.txt
│   ├── Dockerfile
│   └── agents/
│       ├── shared_tools.py      # All tool functions used by specialist agents
│       ├── supervisor_agent/    # Routes intent → JSON dispatch map
│       ├── car_agent/           # Climate, locks, suspension, modes, seats, air
│       ├── music_agent/         # Spotify mood playlists + specific track search
│       ├── office_agent/        # Slack + Google Calendar
│       ├── weather_agent/       # OpenWeatherMap + AQI + proactive adjustment
│       └── navigation_agent/    # Google Maps directions, places, traffic
└── frontend/
    ├── app/
    │   ├── page.tsx             # Main infotainment HMI
    │   └── layout.tsx           # Root layout (loads Spotify SDK script)
    ├── components/
    │   ├── SpotifyPlayer.tsx    # Web Playback SDK init, device registration
    │   ├── NowPlaying.tsx       # Track display, seek bar, playback controls
    │   └── AgentTree.tsx        # Live agent hierarchy with activity indicators
    └── lib/
        └── api.ts               # All backend API calls, job polling logic
```

---

## Planned Agents

| Agent | Domain | Planned Tools |
|---|---|---|
| **Rental Agent** | Fleet check-in/out, damage reports, customer handoff | `check_in_vehicle`, `generate_damage_report`, `handoff_to_customer` |
| **Truck Agent** | HOS compliance, route optimization, cargo management | `check_hos_status`, `optimize_route`, `log_cargo_weight` |
| **Fleet Manager** | OEM-level telemetry, predictive maintenance, recall management | `get_fleet_health`, `schedule_maintenance`, `issue_recall` |

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
Built with Google ADK · Vertex AI · Gemini 2.5 Flash
</div>