from models import Action
from executor import execute_action
from state import get_state
import os
import spotipy
import spotify_state  # shared device ID + access token cache

def set_vehicle_mode(mode: str) -> str:
    """Sets the vehicle hardware mode (e.g. camp, dog, normal)."""
    result = execute_action(Action(tool="setVehicleMode", parameters={"mode": mode}), get_state())
    return result.message

def lock_vehicle(locked: bool) -> str:
    """Locks or unlocks the vehicle."""
    result = execute_action(Action(tool="lockVehicle", parameters={"locked": locked}), get_state())
    return result.message

def set_climate(on: bool, temp: float = 20.0) -> str:
    """Turns the climate control on or off, and sets the temperature."""
    result = execute_action(Action(tool="setClimate", parameters={"on": on, "temp": temp}), get_state())
    return result.message

def control_frunk(open: bool) -> str:
    """Opens or closes the frunk (front trunk)."""
    result = execute_action(Action(tool="controlEnclosures", parameters={"frunk": open}), get_state())
    return result.message

def set_suspension(level: str) -> str:
    """Sets the suspension level (entry, low, standard, high)."""
    result = execute_action(Action(tool="setSuspension", parameters={"level": level}), get_state())
    return result.message

def precondition_battery(enabled: bool) -> str:
    """Starts or stops battery preconditioning to warm/cool the battery pack for optimal range and charging speed."""
    result = execute_action(Action(tool="preconditionBattery", parameters={"enabled": enabled}), get_state())
    return result.message

def schedule_departure(time: str) -> str:
    """Schedules a departure time so the vehicle is ready to go at that time (e.g. '8:30am', '9:00 PM')."""
    result = execute_action(Action(tool="scheduleDeparture", parameters={"time": time}), get_state())
    return result.message

def prepare_for_trip(destination: str, departure_time: str = None) -> str:
    """Prepares the vehicle for a trip: preconditions battery, sets climate to 22°C, and unlocks the vehicle.
    Optionally schedules a departure time. Call this when the user says they are heading somewhere,
    leaving, or about to depart — even if they don't list each action individually."""
    precondition_battery(True)
    set_climate(on=True, temp=22.0)
    lock_vehicle(False)

    summary_parts = ["battery preconditioning started", "climate set to 22°C", "vehicle unlocked"]

    if departure_time:
        schedule_departure(departure_time)
        summary_parts.append(f"departure scheduled for {departure_time}")

    destination_str = f" to {destination}" if destination else ""
    return f"Trip{destination_str} prepared: {', '.join(summary_parts)}"

def send_slack_message(message: str) -> str:
    """Sends a Slack message to the team channel. Include context such as who is arriving and when."""
    try:
        from slack_sdk import WebClient
        from slack_sdk.errors import SlackApiError
    except ImportError:
        return "Slack is not configured (slack-sdk package missing)"

    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        return "Slack is not configured"

    channel = os.getenv("SLACK_CHANNEL_ID", "#general")
    channel_name = channel.lstrip("#")

    print(f"📨 [SLACK] Sending to {channel}: {message}")
    try:
        client = WebClient(token=token)
        client.chat_postMessage(channel=channel, text=message)
        return f"Slack message sent to #{channel_name}: {message}"
    except SlackApiError as e:
        return f"Slack error: {e.response['error']}"
    except Exception as e:
        return f"Slack error: {str(e)}"


def create_calendar_block(event_name: str, duration_minutes: int = 60) -> str:
    """Creates a Google Calendar event for the user. Default duration is 60 minutes if not specified."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        return "Google Calendar is not configured (google-api-python-client package missing)"

    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return "Google Calendar is not configured"

    calendar_id = os.getenv("GOOGLE_CALENDAR_ID", "primary")

    try:
        import json as _json
        from datetime import datetime, timezone, timedelta

        sa_info = _json.loads(sa_json)
        scopes = ["https://www.googleapis.com/auth/calendar"]
        credentials = service_account.Credentials.from_service_account_info(sa_info, scopes=scopes)

        service = build("calendar", "v3", credentials=credentials)

        now = datetime.now(timezone.utc)
        end_time = now + timedelta(minutes=duration_minutes)
        start_str = now.isoformat()
        end_str = end_time.isoformat()

        event = {
            "summary": event_name,
            "start": {"dateTime": start_str},
            "end": {"dateTime": end_str},
        }

        print(f"📅 [CALENDAR] Creating event: '{event_name}' for {duration_minutes} minutes starting at {start_str}")

        service.events().insert(calendarId=calendar_id, body=event).execute()
        return f"Calendar block created: {event_name} for {duration_minutes} minutes starting at {start_str}"
    except Exception as e:
        return f"Google Calendar error: {str(e)}"

MOOD_TO_PLAYLIST = {
    "exhausted": "spotify:playlist:37i9dQZF1DWZd79rJ6a7lp",
    "tired": "spotify:playlist:37i9dQZF1DWZd79rJ6a7lp",
    "stressed": "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO",
    "happy": "spotify:playlist:37i9dQZF1DXdPec7aLTmlC",
    "energetic": "spotify:playlist:37i9dQZF1DX76Wlfdnj7AP",
    "focused": "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO",
    "sad": "spotify:playlist:37i9dQZF1DX3rxVfibe1L0",
    "calm": "spotify:playlist:37i9dQZF1DWZd79rJ6a7lp",
    "neutral": "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
}

def play_music_for_mood(mood: str) -> str:
    """Plays a Spotify playlist matching the detected mood.
    Mood should be one of: exhausted, tired, stressed, happy, energetic, focused, sad, calm, neutral."""
    try:
        device_id = spotify_state._spotify_device_id
        if not device_id:
            return "No browser player connected yet. Open the app in a browser first so the audio player can initialize."

        # Use the pre-obtained access token from the shared cache.
        # SpotifyOAuth must NOT be used here — on Cloud Run (no cached token file,
        # no stdin) it blocks forever on input(), consuming a thread pool thread
        # permanently and causing every endpoint to 504 after the pool is exhausted.
        token = spotify_state.get_access_token()
        if not token:
            return "Spotify is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN."

        print(f"🎵 [SPOTIFY] Using device_id: {device_id}")

        sp = spotipy.Spotify(auth=token)
        playlist_uri = MOOD_TO_PLAYLIST.get(mood.lower(), MOOD_TO_PLAYLIST["neutral"])

        sp.start_playback(device_id=device_id, context_uri=playlist_uri)
        return f"Playing {mood} playlist on Spotify."

    except Exception as e:
        return f"Spotify error: {str(e)}"


def play_specific_track(track_name: str, artist: str) -> str:
    """Plays a specific song on Spotify by searching for it by name and artist.
    Use this when the user requests a particular song or artist, not a mood."""
    try:
        device_id = spotify_state._spotify_device_id
        if not device_id:
            return "No browser player connected yet. Open the app in a browser first so the audio player can initialize."

        token = spotify_state.get_access_token()
        if not token:
            return "Spotify is not configured. Cannot play specific tracks."

        print(f"🎵 [SPOTIFY] Searching for track: '{track_name}' by '{artist}'")

        # Use spotipy with the pre-obtained access token (no OAuth redirect flow needed)
        sp = spotipy.Spotify(auth=token)
        results = sp.search(q=f"track:{track_name} artist:{artist}", type="track", limit=1)
        tracks = results.get("tracks", {}).get("items", [])

        if not tracks:
            print(f"🎵 [SPOTIFY] No results found for '{track_name}' by '{artist}'")
            return "Could not find that track on Spotify"

        found = tracks[0]
        track_uri = found["uri"]
        found_name = found.get("name", track_name)
        found_artist = found["artists"][0]["name"] if found.get("artists") else artist

        print(f"🎵 [SPOTIFY] Found: '{found_name}' by '{found_artist}' — URI: {track_uri}, device: {device_id}")

        sp.start_playback(device_id=device_id, uris=[track_uri])
        return f"Playing {found_name} by {found_artist}"

    except Exception as e:
        return f"Spotify error: {str(e)}"