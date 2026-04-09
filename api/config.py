"""
FashionVision - Configuration Orchestrator (PRODUCTION HARDENED)
Responsible for loading and validating platform-wide environment configurations.
"""
import os
from dotenv import load_dotenv

# Initialize session environment
load_dotenv()

class Config:
    """Class-based configuration manager with strict security validation."""
    
    # ─── CORE INFRASTRUCTURE (STRICTLY REQUIRED) ───────────────────────────
    # No fallbacks allowed for security-sensitive or platform-critical settings.
    SECRET_KEY = os.environ.get("SECRET_KEY")
    JWT_SECRET = os.environ.get("JWT_SECRET")
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    CLIENT_URL = os.environ.get("CLIENT_URL")

    # ─── DATABASE SCHEMA (FLEXIBLE DEFAULTS) ────────────────────────────────
    UPLOADS_TABLE = os.environ.get("SUPABASE_UPLOADS_TABLE", "uploads")
    SCHEDULED_PINS_TABLE = os.environ.get("SUPABASE_SCHEDULED_PINS_TABLE", "scheduled_pins")
    FASHION_HISTORY_TABLE = os.environ.get("SUPABASE_FASHION_HISTORY_TABLE", "fashion_history")

    # ─── STORAGE STRATEGY (FLEXIBLE DEFAULTS) ───────────────────────────────
    STORAGE_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "fashion-images")

    # ─── SYSTEM CONSTRAINTS ───────────────────────────────────────────────
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", 16 * 1024 * 1024))
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

    @staticmethod
    def validate():
        """Aggregates all missing critical platform variables."""
        required_env_vars = [
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SECRET_KEY",
            "JWT_SECRET",
            "CLIENT_URL"
        ]
        return [var for var in required_env_vars if not os.environ.get(var)]

    @classmethod
    def ensure_integrity(cls):
        """Fail-fast gate: ensures platform won't run in an insecure/broken state."""
        missing = cls.validate()
        if missing:
            raise RuntimeError(
                f"FATAL: Application configuration integrity failed. "
                f"Missing required environment variables: {', '.join(missing)}. "
                f"Please verify your .env file or production secrets."
            )

# Instantiate global config
config = Config()

# Automation: Trigger fail-fast check on module import (application bootstrap)
# Only bypass for non-production environments if specifically configured.
if os.environ.get("SKIP_CONFIG_VALIDATION", "false").lower() != "true":
    config.ensure_integrity()
