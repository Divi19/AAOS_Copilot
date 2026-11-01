import os
from typing import Optional

from google.adk.planners import BuiltInPlanner
from google.genai import types

# Gemini model used by every agent. Override with the GEMINI_MODEL env var so a
# model retirement only needs a config change, not a code change and rebuild.
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

# Gemini 3 thinks at a high level by default, which made simple commands slow
# and ambiguous ones exceed the agent timeout. One of: minimal, low, medium,
# high — or "default" to leave it to the model.
THINKING_LEVEL = os.getenv("GEMINI_THINKING_LEVEL", "low").strip().lower()


def thinking_planner() -> Optional[BuiltInPlanner]:
    """Planner that sets the thinking level (ADK 0.1.0 only accepts it via a planner)."""
    if THINKING_LEVEL in ("", "default"):
        return None
    return BuiltInPlanner(
        thinking_config=types.ThinkingConfig(thinking_level=THINKING_LEVEL.upper())
    )
