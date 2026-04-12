# AAOS AI Copilot

Multi-agent vehicle hardware orchestrator built for the GDG Gemini CLI Hackathon.

---

## Prerequisites

Make sure you have these installed before starting:

- Node.js v18+ — https://nodejs.org
- Python 3.10+ — https://www.python.org
- Git — https://git-scm.com

To check your versions:

```bash
node -v
python3 --version
git --version
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/Divi19/AAOS.git
cd AAOS
```

### 2. Set up the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create your environment file:

```bash
cp .env.example .env
```

Then open `.env` and fill in your values (see Environment Variables section below).

### 3. Set up the frontend

Open a new terminal tab, then:

```bash
cd frontend
npm install
```

Create your frontend environment file:

```bash
cp .env.local.example .env.local
```

---

## Running the App

You need two terminal tabs running simultaneously.

**Tab 1 — Backend:**

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Tab 2 — Frontend:**

```bash
cd frontend
npm run dev
```

Then open your browser:

- Frontend → http://localhost:3000
- Backend API → http://localhost:8000
- API docs → http://localhost:8000/docs

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Your GCP project ID | `my-project-123` |
| `GOOGLE_CLOUD_REGION` | Vertex AI region | `us-central1` |
| `VERTEX_MODEL` | Gemini model to use | `gemini-2.5-flash` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL | `http://localhost:8000` |

---

## Project Structure
## Project Structure

```text
AAOS/
├── backend/
│   ├── main.py          # FastAPI router, endpoints
│   ├── state.py         # Global vehicle state dictionary
│   ├── executor.py      # Hardware macro runner
│   ├── .env             # Your local env vars (not committed)
│   ├── .env.example     # Env template (committed)
│   └── requirements.txt # Python dependencies
│
├── frontend/
│   ├── app/             # Next.js app router pages
│   ├── lib/
│   │   └── api.ts       # API utility functions
│   ├── .env.local        # Your local env vars (not committed)
│   └── .env.local.example # Env template (committed)
│
└── README.md
---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/vehicle/state` | Returns current vehicle state |
| `POST` | `/vehicle/voice` | Sends a voice transcript for processing |

---

## Troubleshooting

**`venv` not activating on macOS:**
```bash
source venv/bin/activate
```
If that fails, try `python3 -m venv venv` again from inside the `backend/` folder.

**CORS error in browser:**
Make sure the backend is running on port 8000 and your `NEXT_PUBLIC_API_URL` in `.env.local` matches exactly.

**`pip install` fails:**
Make sure your venv is activated — you should see `(venv)` at the start of your terminal prompt before running pip commands.

**Port already in use:**
```bash
# Kill whatever is on port 8000
lsof -ti:8000 | xargs kill
# Kill whatever is on port 3000
lsof -ti:3000 | xargs kill
```