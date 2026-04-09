import os
import yaml
import logging

logger = logging.getLogger(__name__)

# Default Configuration
DEFAULT_CONFIG = {
    # Confidence threshold (0.0 - 1.0)
    "confidence_threshold": 0.25,
    
    # Cartoon detection thresholds
    "cartoon_saturation_threshold": 0.85,
    "cartoon_saturation_threshold_2": 0.80,
    "cartoon_hue_buckets_threshold": 4,
    
    # Size constraints
    "min_image_dimension": 224,
    "max_image_dimension": 4096,
    
    # Inference timeout
    "inference_timeout_seconds": 30,
    
    # Cache settings
    "cache_enabled": True,
    "cache_max_size_mb": 100,
    "cache_ttl_minutes": 60,
    
    # Logging
    "log_level": "INFO",
    "log_format": "json",
    
    # Model settings
    "device_preference": "auto",
    "model_name": "openai/clip-vit-base-patch32",
    
    # Risk profiles
    "strict_mode": False,
    "lenient_mode": False
}

CONFIG = DEFAULT_CONFIG.copy()

def load_config(path: str = None) -> dict:
    """Load configuration from YAML and environment variables."""
    global CONFIG
    
    # 1. Start with defaults
    CONFIG = DEFAULT_CONFIG.copy()
    
    # 2. Try to load from YAML
    yaml_path = path or os.environ.get('FASHIONVISION_CONFIG')
    if not yaml_path:
        # Check standard locations
        locations = [
            'fashion_vision_config.yaml',
            '~/.fashionvision/config.yaml',
            '/etc/fashionvision/config.yaml'
        ]
        for loc in locations:
            expanded = os.path.expanduser(loc)
            if os.path.exists(expanded):
                yaml_path = expanded
                break
                
    if yaml_path and os.path.exists(yaml_path):
        try:
            with open(yaml_path, 'r') as f:
                user_config = yaml.safe_load(f)
                if user_config:
                    for k, v in user_config.items():
                        if k in CONFIG:
                            CONFIG[k] = v
            logger.info(f"Loaded configuration from {yaml_path}")
        except Exception as e:
            logger.error(f"Failed to load config from {yaml_path}: {e}")
            
    # 3. Override with environment variables
    for k in CONFIG.keys():
        env_key = f"FASHIONVISION_{k.upper()}"
        if env_key in os.environ:
            val = os.environ[env_key]
            # Convert types appropriately
            if isinstance(CONFIG[k], bool):
                CONFIG[k] = val.lower() in ('true', '1', 'yes')
            elif isinstance(CONFIG[k], int):
                CONFIG[k] = int(val)
            elif isinstance(CONFIG[k], float):
                CONFIG[k] = float(val)
            else:
                CONFIG[k] = val
                
    return CONFIG

# Initialize
load_config()
