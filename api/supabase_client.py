"""
FashionVision - Supabase Client Infrastructure (THREAD-SAFE ISOLATION)
"""
import logging
import threading
from functools import wraps
from supabase import create_client, Client, ClientOptions
from api.config import config

logger = logging.getLogger(__name__)

# ✅ RESILIENCE: Thread-local storage to prevent cross-thread connection corruption (HTTP/2 Protocol Errors)
_thread_local = threading.local()

def retry_on_failure(retries=3):
    """
    Decorator to retry Supabase operations on transient connection errors.
    Specifically handles 'ConnectionTerminated' errors by resetting the thread-local instance.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_err = None
            for attempt in range(retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_err = e
                    err_msg = str(e)
                    # Handle protocol/connection termination specifically
                    if "ConnectionTerminated" in err_msg or "RemoteProtocolError" in err_msg or "h2" in err_msg.lower():
                        logger.warning(f"Protocol error detected. Resetting client and retrying (Attempt {attempt+1}/{retries}). Error: {err_msg}")
                        # Force instance reset for this thread so next call gets a fresh connection
                        if hasattr(_thread_local, 'instance'):
                            _thread_local.instance = None
                        continue
                    # For other errors, log and raise immediately
                    logger.error(f"Supabase operation failed: {err_msg}")
                    raise e
            logger.error(f"Supabase operation exhausted all retries. Final error: {last_err}")
            raise last_err
        return wrapper
    return decorator

def _initialize_handle() -> Client:
    """Internal factory for thread-isolated hardened client instantiation."""
    url = getattr(config, "SUPABASE_URL", None)
    key = getattr(config, "SUPABASE_SERVICE_ROLE_KEY", None)

    if not url or not key:
        raise RuntimeError("Supabase credentials missing (URL/SERVICE_ROLE_KEY).")

    # Timeouts optimized for backend parallel orchestration
    options = ClientOptions(
        postgrest_client_timeout=30,
        storage_client_timeout=30
    )
    
    return create_client(url, key, options=options)

def get_supabase() -> Client:
    """
    Returns a thread-safe, isolated Supabase client instance.
    Utilizes threading.local() to resolve 'ConnectionTerminated' issues during parallel execution.
    """
    if not hasattr(_thread_local, 'instance') or _thread_local.instance is None:
        try:
            _thread_local.instance = _initialize_handle()
        except Exception as e:
            logger.error(f"Critical: Thread-local Supabase init failed: {e}")
            _thread_local.instance = None
            raise
            
    return _thread_local.instance

def get_supabase_admin() -> Client:
    """Alias for administrative operations using the thread-isolated client."""
    return get_supabase()
