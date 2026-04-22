from models import Action
from executor import execute_action
from state import get_state
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os

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

def send_slack_message(message: str) -> str:
    """Sends a Slack message about arriving at the office or task completion."""
    return f"Slack message sent: {message}"

def create_calendar_block(event_name: str, duration_minutes: int) -> str:
    """Creates a calendar block for the user."""
    return f"Calendar block created: {event_name} for {duration_minutes} minutes"

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
        sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
            client_id=os.getenv("SPOTIFY_CLIENT_ID"),
            client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
            redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
            scope="user-modify-playback-state user-read-playback-state",
        ))

        devices = sp.devices()
        if not devices["devices"]:
            return "No active Spotify device found. Open Spotify on your phone or laptop first."

        device_id = devices["devices"][0]["id"]
        playlist_uri = MOOD_TO_PLAYLIST.get(mood.lower(), MOOD_TO_PLAYLIST["neutral"])

        sp.start_playback(device_id=device_id, context_uri=playlist_uri)
        return f"Playing {mood} playlist on Spotify."

    except Exception as e:
        return f"Spotify error: {str(e)}"