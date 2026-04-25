# AAOS AI Copilot — Claude Code Guide

## Project Structure
This is a monorepo with two separate apps:
- `backend/` — Python FastAPI backend deployed on Google Cloud Run
- `frontend/` — Next.js TypeScript frontend deployed on Vercel

Never mix backend and frontend dependencies. Never run frontend commands from backend directory or vice versa.

## Backend
- **Runtime**: Python 3.10, FastAPI, uvicorn
- **AI**: Google ADK (google-adk), Vertex AI, gemini-2.5-flash
- **Key files**:
  - `main.py` — FastAPI app, all endpoints, Vertex AI init
  - `executor.py` — tool execution logic
  - `models.py` — Pydantic models (VehicleState, Action, ActionResult, Location)
  - `state.py` — shared vehicle state singleton
  - `spotify_state.py` — Spotify device ID and token cache, shared module to avoid circular imports
  - `agents/shared_tools.py` — all tool functions used by agents
  - `agents/supervisor_agent/agent.py` — root agent, routes to sub-agents
  - `agents/car_agent/agent.py` — controls vehicle hardware
  - `agents/office_agent/agent.py` — Slack and calendar
  - `agents/music_agent/agent.py` — Spotify mood and specific track playback

## Backend rules
- Always use `ActionResult` not `ExecutionResult` — that class does not exist
- `spotify_state.py` owns all Spotify token logic — never import main.py from shared_tools (circular import)
- All Spotify endpoints in main.py must be async using httpx — never use requests library for Spotify calls
- Never use `SpotifyOAuth` in tool functions — always use `spotipy.Spotify(auth=spotify_state.get_access_token())`
- Load env vars with `load_dotenv()` before any ADK imports — ADK reads env at import time
- To run locally: `source venv/bin/activate` then `uvicorn main:app --reload --port 8080`
- To deploy: from repo root run `gcloud run deploy aaos-backend --source ./backend --region us-central1 --allow-unauthenticated --memory 1Gi --timeout 120`

## Frontend
- **Runtime**: Next.js 14, TypeScript, Tailwind CSS, App Router
- **Key files**:
  - `app/page.tsx` — main UI, renders all components
  - `app/layout.tsx` — root layout, loads Spotify SDK script
  - `lib/api.ts` — all backend API calls, single source of truth for endpoints
  - `components/SpotifyPlayer.tsx` — initializes Web Playback SDK, registers device ID
  - `components/NowPlaying.tsx` — polls now-playing, shows track controls and seek bar

## Frontend rules
- Never use HTML `<form>` tags — use onClick handlers instead
- All backend calls go through `lib/api.ts` — never call fetch directly in components
- Backend URL comes from `NEXT_PUBLIC_API_URL` env var
- To run locally: `cd frontend && npm run dev` (runs on port 3000)
- Backend must be running on port 8080 for local dev

## Environment variables
### Backend (.env in backend/)
- `GOOGLE_CLOUD_PROJECT` — GCP project ID
- `GOOGLE_CLOUD_LOCATION` — GCP region
- `GOOGLE_GENAI_USE_VERTEXAI` — must be "1"
- `SPOTIFY_CLIENT_ID` — Spotify app client ID
- `SPOTIFY_CLIENT_SECRET` — Spotify app client secret
- `SPOTIFY_REFRESH_TOKEN` — obtained via OAuth with scopes: streaming, user-modify-playback-state, user-read-playback-state, user-read-currently-playing
- `SPOTIFY_REDIRECT_URI` — http://127.0.0.1:8888/callback

### Frontend (.env.local in frontend/)
- `NEXT_PUBLIC_API_URL` — backend URL (local: http://localhost:8080, prod: Cloud Run URL)

## Critical gotchas
- Never use `SpotifyOAuth` in agent tool functions — it calls input() and deadlocks Cloud Run forever
- Never add sync blocking calls inside async FastAPI endpoints — use httpx not requests
- Never commit .env or .cache files — both are in .gitignore
- spotify_state.py must remain a thin shared module with no imports from main.py or agents/