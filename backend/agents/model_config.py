import os

# Gemini model used by every agent. Override with the GEMINI_MODEL env var so a
# model retirement only needs a config change, not a code change and rebuild.
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
