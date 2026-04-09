"""
Gemini client compatibility layer.

Prefers the new `google.genai` package and falls back to
`google.generativeai` when needed.
"""

from __future__ import annotations

from typing import Any


def _import_backend():
    """Return (backend_name, module_or_object)."""
    try:
        from google import genai
        return "google.genai", genai
    except Exception:
        pass

    try:
        import google.generativeai as legacy_genai
        return "google.generativeai", legacy_genai
    except Exception:
        pass

    raise ImportError(
        "No Gemini SDK found. Install `google-genai` (preferred) or `google-generativeai`."
    )


def generate_text(*, api_key: str, model: str, prompt: str) -> str:
    """Generate text content from Gemini across SDK versions."""
    backend, sdk = _import_backend()

    if backend == "google.genai":
        client = sdk.Client(api_key=api_key)
        response = client.models.generate_content(model=model, contents=prompt)
        return getattr(response, "text", "") or ""

    # Legacy backend
    sdk.configure(api_key=api_key)
    m = sdk.GenerativeModel(model)
    response = m.generate_content(prompt)
    return getattr(response, "text", "") or ""


def generate_multimodal(*, api_key: str, model: str, prompt: str, image: Any) -> str:
    """Generate multimodal content (prompt + image) across SDK versions."""
    backend, sdk = _import_backend()

    if backend == "google.genai":
        client = sdk.Client(api_key=api_key)
        response = client.models.generate_content(model=model, contents=[prompt, image])
        return getattr(response, "text", "") or ""

    # Legacy backend
    sdk.configure(api_key=api_key)
    m = sdk.GenerativeModel(model)
    response = m.generate_content([prompt, image])
    return getattr(response, "text", "") or ""
