# Shared Spotify device state — imported by both main.py and shared_tools.py
# Using a module avoids circular imports (main → agents → shared_tools → main).
_spotify_device_id: str | None = None
