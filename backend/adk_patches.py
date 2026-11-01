"""Runtime fixes for google-adk 0.1.0 — import once, before any agent runs.

google-adk 0.1.0 predates Gemini 3. Its tracing helper dumps every LLM request
to JSON with model_dump() in python mode, which leaves Gemini 3's binary
`thought_signature` on function-call parts as raw bytes. json.dumps() then
raises "Object of type bytes is not JSON serializable" on the model call that
follows any tool call — the tool runs, but the agent errors before replying.
"""

from typing import Any

from google.adk import telemetry
from google.genai import types


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
