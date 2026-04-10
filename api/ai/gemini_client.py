import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


def _import_genai():
    try:
        import google.generativeai as genai
        return genai
    except ImportError as exc:
        raise RuntimeError("google-generativeai not installed") from exc


def _validate_api_key(api_key: str) -> None:
    if not api_key or len(api_key) < 20:
        raise ValueError("Invalid Gemini API Key")


def _candidate_models(model: str) -> list[str]:
    model = (model or "").strip()
    candidates = [model]

    aliases = {
        "gemini-1.5-flash": ["gemini-1.5-flash-latest", "gemini-2.0-flash"],
        "gemini-1.5-pro": ["gemini-1.5-pro-latest", "gemini-2.0-pro"],
    }
    candidates.extend(aliases.get(model, []))

    seen = set()
    out = []
    for m in candidates:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _is_model_not_found(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "404" in msg or "not found" in msg or "does not exist" in msg or "not available" in msg


def generate_text(*, api_key: str, model: str, prompt: str) -> str:
    genai = _import_genai()
    _validate_api_key(api_key)

    genai.configure(api_key=api_key)

    last_exc: Exception | None = None
    for candidate in _candidate_models(model):
        try:
            time.sleep(1.5)

            gemini_model = genai.GenerativeModel(candidate)
            response = gemini_model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_output_tokens": 250,
                },
            )

            if not response or not getattr(response, "text", None):
                raise ValueError("Empty response from Gemini")

            return response.text.strip()

        except Exception as e:
            last_exc = e
            if _is_model_not_found(e):
                continue
            raise

    raise RuntimeError(f"Gemini model not available. Tried: {_candidate_models(model)}") from last_exc


def generate_multimodal(*, api_key: str, model: str, prompt: str, image: Any) -> str:
    genai = _import_genai()
    _validate_api_key(api_key)

    genai.configure(api_key=api_key)

    last_exc: Exception | None = None
    for candidate in _candidate_models(model):
        try:
            time.sleep(1.5)

            gemini_model = genai.GenerativeModel(candidate)
            response = gemini_model.generate_content(
                [prompt, image],
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_output_tokens": 250,
                },
            )

            if not response or not getattr(response, "text", None):
                raise ValueError("Empty response from Gemini")

            return response.text.strip()

        except Exception as e:
            last_exc = e
            if _is_model_not_found(e):
                continue
            raise

    raise RuntimeError(f"Gemini model not available. Tried: {_candidate_models(model)}") from last_exc