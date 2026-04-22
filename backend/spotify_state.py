"""Shared Spotify state — imported by both main.py and agents/shared_tools.py.

Keeping shared state here avoids circular imports (main → agents → shared_tools → main).
"""

import base64
import os
import time
import requests as _http_requests

# ── Device ID ──────────────────────────────────────────────────────────────────
# Set by POST /spotify/device when the browser Web Playback SDK player connects.
_spotify_device_id: str | None = None

# ── Access token cache ─────────────────────────────────────────────────────────
_token_cache: dict = {"token": None, "expires_at": 0.0}


def get_access_token() -> str | None:
    """Return a valid Spotify access token using the refresh-token flow, with caching.

    Returns None if credentials are not configured or if the refresh call fails.
    Callers that need to raise HTTP errors (e.g. FastAPI endpoints) should check
    the return value and raise themselves.
    """
    if _token_cache["token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    refresh_token = os.getenv("SPOTIFY_REFRESH_TOKEN")

    if not all([client_id, client_secret, refresh_token]):
        return None

    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        response = _http_requests.post(
            "https://accounts.spotify.com/api/token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            timeout=10,
        )
        if response.status_code == 200:
            data = response.json()
            _token_cache["token"] = data["access_token"]
            _token_cache["expires_at"] = time.time() + data.get("expires_in", 3600)
            return data["access_token"]
    except Exception:
        pass
    return None
