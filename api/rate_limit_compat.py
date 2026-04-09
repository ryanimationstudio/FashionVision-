"""Compatibility layer for optional flask-limiter dependency.

If flask-limiter is unavailable in the active environment, this module
provides no-op fallbacks so the app can still start.
"""

from __future__ import annotations

try:
    from flask_limiter import Limiter  # type: ignore
    from flask_limiter.util import get_remote_address  # type: ignore
except ModuleNotFoundError:
    def get_remote_address() -> str:
        return "0.0.0.0"

    class Limiter:  # pragma: no cover - fallback path
        def __init__(self, *args, **kwargs):
            pass

        def init_app(self, app):
            return None

        def limit(self, *args, **kwargs):
            def decorator(fn):
                return fn

            return decorator
