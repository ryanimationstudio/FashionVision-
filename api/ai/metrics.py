import json
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# State tracking for metrics
METRICS = {
    "total_validations": 0,
    "approved_count": 0,
    "rejected_count": 0,
    "cache_hits": 0,
    "total_inference_time_ms": 0.0,
    "clip_path_count": 0,
    "heuristic_path_count": 0,
    "model_load_time_ms": 0.0,
}

def record_metric(event_type: str, result: str, inference_time_ms: float = 0.0, 
                 path: str = "clip", confidence: float = None, 
                 detected_subject: str = None, image_hash: str = None):
    """
    Log a structured JSON metric for a validation event.
    """
    METRICS["total_validations"] += 1
    
    if path == "clip":
        METRICS["clip_path_count"] += 1
    elif path == "heuristic":
        METRICS["heuristic_path_count"] += 1
        
    if result == "approved":
        METRICS["approved_count"] += 1
    else:
        METRICS["rejected_count"] += 1
        
    METRICS["total_inference_time_ms"] += inference_time_ms
    
    # Calculate derived metrics
    approval_rate = (METRICS["approved_count"] / METRICS["total_validations"]) * 100 if METRICS["total_validations"] > 0 else 0.0
    cache_hit_rate = (METRICS["cache_hits"] / METRICS["total_validations"]) * 100 if METRICS["total_validations"] > 0 else 0.0
    
    log_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event_type,
        "result": result,
        "inference_time_ms": inference_time_ms,
        "path": path,
        "total_validations": METRICS["total_validations"],
        "approval_rate": approval_rate,
        "cache_hit_rate": cache_hit_rate
    }
    
    if image_hash:
        log_data["image_hash"] = image_hash
    if confidence is not None:
        log_data["confidence"] = confidence
    if detected_subject:
        log_data["detected_subject"] = detected_subject
        
    # Emit structured log
    logger.info(json.dumps(log_data))
    
def record_cache_hit():
    """Record a cache hit without recording a full validation event."""
    METRICS["cache_hits"] += 1

def record_model_load_time(time_ms: float):
    METRICS["model_load_time_ms"] = time_ms

def get_metrics() -> dict:
    """Return current metrics dictionary including derived values."""
    approval_rate = (METRICS["approved_count"] / METRICS["total_validations"]) * 100 if METRICS["total_validations"] > 0 else 0.0
    cache_hit_rate = (METRICS["cache_hits"] / METRICS["total_validations"]) * 100 if METRICS["total_validations"] > 0 else 0.0
    avg_inference_time = METRICS["total_inference_time_ms"] / METRICS["total_validations"] if METRICS["total_validations"] > 0 else 0.0
    
    return {
        **METRICS,
        "approval_rate": approval_rate,
        "cache_hit_rate": cache_hit_rate,
        "avg_inference_time_ms": avg_inference_time
    }

def reset_metrics():
    """Clear all counters."""
    global METRICS
    METRICS = {k: 0 if isinstance(v, (int, float)) else v for k, v in METRICS.items()}
    METRICS["total_inference_time_ms"] = 0.0
    METRICS["model_load_time_ms"] = 0.0

def export_metrics(format='prometheus') -> str:
    """Export metrics in requested format."""
    current = get_metrics()
    
    if format == 'prometheus':
        lines = [
            "# HELP fashionvision_total_validations Total number of images validated",
            "# TYPE fashionvision_total_validations counter",
            f"fashionvision_total_validations {current['total_validations']}",
            
            "# HELP fashionvision_approved_count Number of approved images",
            "# TYPE fashionvision_approved_count counter",
            f"fashionvision_approved_count {current['approved_count']}",
            
            "# HELP fashionvision_rejected_count Number of rejected images",
            "# TYPE fashionvision_rejected_count counter",
            f"fashionvision_rejected_count {current['rejected_count']}",
            
            "# HELP fashionvision_approval_rate Current approval rate percentage",
            "# TYPE fashionvision_approval_rate gauge",
            f"fashionvision_approval_rate {current['approval_rate']}",
            
            "# HELP fashionvision_cache_hit_rate Current cache hit rate percentage",
            "# TYPE fashionvision_cache_hit_rate gauge",
            f"fashionvision_cache_hit_rate {current['cache_hit_rate']}",
            
            "# HELP fashionvision_avg_inference_time_ms Average time spent inferencing in ms",
            "# TYPE fashionvision_avg_inference_time_ms gauge",
            f"fashionvision_avg_inference_time_ms {current['avg_inference_time_ms']}",
            
            "# HELP fashionvision_model_load_time_ms Time to load initial model in ms",
            "# TYPE fashionvision_model_load_time_ms gauge",
            f"fashionvision_model_load_time_ms {current['model_load_time_ms']}",
            
            "# HELP fashionvision_path_count Count of validations by path strategy",
            "# TYPE fashionvision_path_count counter",
            f"fashionvision_path_count{{path=\"clip\"}} {current['clip_path_count']}",
            f"fashionvision_path_count{{path=\"heuristic\"}} {current['heuristic_path_count']}"
        ]
        return "\n".join(lines)
    else:
        return json.dumps(current, indent=2)
