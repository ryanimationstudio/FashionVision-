import hashlib
import logging
import threading
from cachetools import TTLCache

logger = logging.getLogger(__name__)

# To hold the cache object once initialized from config
_cache = None
_cache_lock = threading.Lock()
_CACHE_ENABLED = True

def _get_cache():
    """Lazy initialization of the cache to pick up config lazily"""
    global _cache, _CACHE_ENABLED
    if _cache is not None:
        return _cache
        
    with _cache_lock:
        if _cache is not None:
            return _cache
            
        from .fashion_vision_config import CONFIG
        
        _CACHE_ENABLED = CONFIG.get('cache_enabled', True)
        
        if not _CACHE_ENABLED:
            logger.info("Validation cache is disabled in config.")
            return None
            
        # cache_max_size_mb is roughly memory, we'll map that to items
        # Let's say 1 element in dict is 200 bytes.
        max_items = 100000 
        if "cache_max_size_mb" in CONFIG:
            # roughly scale max items by MB requested
            max_items = int(CONFIG["cache_max_size_mb"] * 5000)
            
        ttl = CONFIG.get('cache_ttl_minutes', 60) * 60
        
        _cache = TTLCache(maxsize=max_items, ttl=ttl)
        logger.info(f"Initialized validation cache with max_items={max_items}, ttl={ttl}s")
        return _cache

def _md5_hash(image_bytes: bytes) -> str:
    """Generate MD5 hash of image bytes for cache key."""
    return hashlib.md5(image_bytes).hexdigest()

def check_cache(image_bytes: bytes):
    """Check if result for this image is already in cache."""
    cache_store = _get_cache()
    if not _CACHE_ENABLED or cache_store is None:
        return None
        
    key = _md5_hash(image_bytes)
    
    if key in cache_store:
        from .metrics import record_cache_hit
        record_cache_hit()
        logger.debug("Cache hit for image hash %s...", key[:8])
        return cache_store[key]
        
    logger.debug("Cache miss for image hash %s...", key[:8])
    return None

def store_in_cache(image_bytes: bytes, result):
    """Store result in cache."""
    cache_store = _get_cache()
    if not _CACHE_ENABLED or cache_store is None:
        return
        
    key = _md5_hash(image_bytes)
    cache_store[key] = result
    logger.debug("Stored result in cache for hash %s...", key[:8])
    
def clear_cache():
    """Clear the entire cache manually."""
    with _cache_lock:
        if _cache is not None:
            _cache.clear()
            logger.info("Validation cache cleared manually.")
