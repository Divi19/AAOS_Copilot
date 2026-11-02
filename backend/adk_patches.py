"""Runtime fixes for google-adk 0.1.0 — import once, before any agent runs.

1. Tracing crash: google-adk 0.1.0 predates Gemini 3. Its tracing helper dumps
   every LLM request to JSON with model_dump() in python mode, which leaves
   Gemini 3's binary `thought_signature` on function-call parts as raw bytes.
   json.dumps() then raises "Object of type bytes is not JSON serializable" on
   the model call that follows any tool call — the tool runs, but the agent
   errors before replying.

2. No retries: google-genai only retries when given retry_options, and ADK
   0.1.0 never passes any, so a single transient 429 RESOURCE_EXHAUSTED (Gemini
   shared capacity briefly busy) failed the whole voice command.
"""

from functools import cached_property
from typing import Any

from google.adk import telemetry
from google.adk.models.google_llm import Gemini
from google.genai import Client, types


def _build_llm_request_for_trace(llm_request) -> dict[str, Any]:
    """Same as ADK's version, but dumps in JSON mode so bytes become base64."""
    result = {
        "model": llm_request.model,
        "config": llm_request.config.model_dump(
            mode="json", exclude_none=True, exclude="response_schema"
        ),
        "contents": [],
    }
    # Like ADK, skip inline media so large blobs don't end up in the trace
    for content in llm_request.contents:
        parts = [part for part in content.parts if not part.inline_data]
        result["contents"].append(
            types.Content(role=content.role, parts=parts).model_dump(
                mode="json", exclude_none=True
            )
        )
    return result


# trace_call_llm looks this up as a module global at call time, so replacing
# the module attribute is enough.
telemetry._build_llm_request_for_trace = _build_llm_request_for_trace


# Retry transient Gemini errors with exponential backoff: waits of ~1s, 2s, 4s
# (plus up to 0.5s jitter), so at most ~8s extra — well under AGENT_TIMEOUT_S.
_RETRY_OPTIONS = types.HttpRetryOptions(
    attempts=4,  # including the first call
    initial_delay=1.0,
    max_delay=4.0,
    jitter=0.5,
    http_status_codes=[429, 500, 502, 503, 504],
)


def _api_client_with_retries(self) -> Client:
    """Same as ADK's Gemini.api_client, plus retry_options."""
    return Client(
        http_options=types.HttpOptions(
            headers=self._tracking_headers, retry_options=_RETRY_OPTIONS
        )
    )


_api_client = cached_property(_api_client_with_retries)
_api_client.__set_name__(Gemini, "api_client")
Gemini.api_client = _api_client
