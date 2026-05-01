from models import Action
from executor import execute_action
from state import get_state
import os
import requests
import spotipy
import spotify_state  # shared device ID + access token cache
from typing import Optional

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

def prepare_for_trip(destination: Optional[str] = None, departure_time: Optional[str] = None) -> str:
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

def set_seat_heating(driver: int = 0, passenger: int = 0) -> str:
    """Sets seat heating level for driver and passenger. Level 0=off, 1=low, 2=medium, 3=high."""
    result = execute_action(Action(tool="setSeatHeating", parameters={"driver": driver, "passenger": passenger}), get_state())
    return result.message

def set_seat_ventilation(driver: int = 0, passenger: int = 0) -> str:
    """Sets seat ventilation level for driver and passenger. Level 0=off, 1=low, 2=medium, 3=high."""
    result = execute_action(Action(tool="setSeatVentilation", parameters={"driver": driver, "passenger": passenger}), get_state())
    return result.message

def set_air_purification(enabled: bool) -> str:
    """Enables or disables the cabin air purification and ionization system."""
    result = execute_action(Action(tool="setAirPurification", parameters={"enabled": enabled}), get_state())
    return result.message

def set_recirculation(enabled: bool) -> str:
    """Toggles air recirculation — True uses cabin air, False pulls in outside air."""
    result = execute_action(Action(tool="setRecirculation", parameters={"enabled": enabled}), get_state())
    return result.message

def get_weather_and_adjust(city: Optional[str] = None, lat: Optional[float] = None, lon: Optional[float] = None) -> str:
    """Fetches current weather and proactively adjusts vehicle settings for comfort and safety.
    Accepts either a city name or lat/lon coordinates. If only a city name is provided, it will be geocoded automatically."""
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key:
        return "Weather service unavailable — OPENWEATHERMAP_API_KEY not configured"

    if (lat is None or lon is None) and city:
        print(f"🌤️ [WEATHER] Geocoding city: {city}")
        try:
            geo_resp = requests.get(
                "https://api.openweathermap.org/geo/1.0/direct",
                params={"q": city, "limit": 1, "appid": api_key},
                timeout=5,
            )
            geo_resp.raise_for_status()
            coords = geo_resp.json()
            if not coords:
                return f"Could not find coordinates for '{city}'"
            lat, lon = coords[0]["lat"], coords[0]["lon"]
        except Exception:
            return "Weather service unavailable"

    if lat is None or lon is None:
        return "Location not specified — please provide a city name or coordinates"

    print(f"🌤️ [WEATHER] Fetching conditions for {lat},{lon}")
    try:
        resp = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return "Weather service unavailable"

    temp: float = data.get("main", {}).get("temp", 20.0)
    humidity: int = data.get("main", {}).get("humidity", 50)
    condition_id: int = data.get("weather", [{}])[0].get("id", 800)
    condition_desc: str = data.get("weather", [{}])[0].get("description", "clear sky")
    city_name: str = data.get("name", "your location")

    # Fetch AQI from Air Pollution API
    aqi_index = None
    try:
        aqi_resp = requests.get(
            "https://api.openweathermap.org/data/2.5/air_pollution",
            params={"lat": lat, "lon": lon, "appid": api_key},
            timeout=5,
        )
        aqi_resp.raise_for_status()
        aqi_data = aqi_resp.json()
        aqi_index = aqi_data.get("list", [{}])[0].get("main", {}).get("aqi", None)
        # AQI: 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=Very Poor
        if aqi_index:
            execute_action(Action(tool="setAQI", parameters={"aqi": aqi_index}), get_state())
    except Exception:
        pass

    # OpenWeatherMap condition IDs: 2xx=thunderstorm, 3xx=drizzle, 5xx=rain, 6xx=snow
    is_rain = 200 <= condition_id < 600
    is_snow = 600 <= condition_id < 700

    adjustments: list[str] = []

    # Rain or snow → raise suspension for safety
    if is_rain or is_snow:
        set_suspension("high")
        adjustments.append("raised suspension to high for wet roads")

    # Temperature above 26°C → pre-cool cabin (covers KL climate)
    if temp > 26:
        set_climate(on=True, temp=20.0)
        adjustments.append("pre-cooled the cabin to 20°C")
    elif temp < 10:
        set_climate(on=True, temp=22.0)
        precondition_battery(True)
        adjustments.append("set climate to 22°C and started battery preconditioning")

    # Temperature above 30°C → seat ventilation for comfort
    if temp > 30:
        set_seat_ventilation(driver=2, passenger=1)
        adjustments.append("enabled seat ventilation")

    # Temperature below 15°C → seat heating for comfort
    if temp < 15:
        set_seat_heating(driver=2, passenger=1)
        adjustments.append("enabled seat heating")

    # Poor air quality (AQI ≥ 3: Moderate or worse) → purify and recirculate
    if aqi_index and aqi_index >= 3:
        set_air_purification(True)
        set_recirculation(True)
        adjustments.append("enabled air purification and recirculation due to poor air quality")

    # Humidity above 80% → disable recirculation to pull in outside air and prevent fogging
    if humidity > 80:
        set_recirculation(False)
        if temp <= 26:
            set_climate(on=True, temp=22.0)
            adjustments.append("turned on climate and disabled recirculation to reduce cabin humidity and prevent window fogging")
        else:
            adjustments.append("disabled recirculation to reduce cabin humidity and prevent window fogging")

    if not adjustments:
        return (
            f"It's {round(temp)}°C and {condition_desc} in {city_name} with {humidity}% humidity. "
            f"Conditions are comfortable — no vehicle adjustments needed."
        )

    if is_rain:
        weather_part = f"Rain detected ({condition_desc})"
    elif is_snow:
        weather_part = f"Snow detected ({condition_desc})"
    else:
        weather_part = f"It's {round(temp)}°C and {condition_desc}"

    actions = " and ".join(adjustments) if len(adjustments) <= 2 else ", ".join(adjustments[:-1]) + ", and " + adjustments[-1]
    return f"{weather_part} in {city_name} with {humidity}% humidity. I've {actions} to keep you comfortable and safe."


def get_weather_info(city: str) -> str:
    """Returns a conversational weather summary for the given city without adjusting any vehicle settings."""
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key:
        return "Weather service unavailable — OPENWEATHERMAP_API_KEY not configured"

    print(f"🌤️ [WEATHER] Fetching info for city: {city}")

    try:
        resp = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": city, "appid": api_key, "units": "metric"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return "Weather service unavailable"

    temp: float = data.get("main", {}).get("temp", 20.0)
    feels_like: float = data.get("main", {}).get("feels_like", temp)
    humidity: int = data.get("main", {}).get("humidity", 50)
    condition_desc: str = data.get("weather", [{}])[0].get("description", "clear sky")
    city_name: str = data.get("name", city)

    return (
        f"It's currently {round(temp)}°C in {city_name} with {condition_desc}. "
        f"Feels like {round(feels_like)}°C and humidity is {humidity}%."
    )


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
        print(f"📅 [CALENDAR ERROR]: {str(e)}")
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