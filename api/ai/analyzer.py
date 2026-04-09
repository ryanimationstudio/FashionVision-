"""
FashionVision - AI Analysis Orchestration (OPTIMIZED)
Loads models at startup and leverages pre-processed images for speed.
"""
import logging
from api.ai import fashion_detector, content_generator, correction_engine

logger = logging.getLogger(__name__)

# ✅ CRITICAL: Force-load AI models at startup to prevent request-time blocking
# इससे मॉडल बार-बार लोड नहीं होगा और सर्वर क्रैश होने से बचेगा।
try:
    from api.ai.fashion_validator import _load_model as load_validator
    from api.ai.fashion_detector import _load_model as load_detector
    
    logger.info("Initializing AI models for global reuse...")
    load_validator()
    load_detector()
    logger.info("AI models initialized and ready.")
except Exception as e:
    logger.error(f"Early model initialization failed: {e}")

# डिफ़ॉल्ट एट्रिब्यूट्स (अगर AI कुछ डिटेक्ट करने में फेल हो जाए)
DEFAULT_ATTRIBUTES = {
    "clothing_type": "Outfit",
    "color": "Neutral",
    "pattern": "Solid",
    "style": "Casual",
    "season": "All Season",
    "occasion": "Casual",
    "fit": "Regular",
    "trend": "Standard"
}

def validate_attributes(attrs: dict) -> dict:
    """Ensure all required attributes exist, patch missing ones with defaults."""
    if not isinstance(attrs, dict):
        return dict(DEFAULT_ATTRIBUTES)
    
    return {
        "clothing_type": attrs.get("clothing_type") or DEFAULT_ATTRIBUTES["clothing_type"],
        "color": attrs.get("color") or DEFAULT_ATTRIBUTES["color"],
        "pattern": attrs.get("pattern") or DEFAULT_ATTRIBUTES["pattern"],
        "style": attrs.get("style") or DEFAULT_ATTRIBUTES["style"],
        "season": attrs.get("season") or DEFAULT_ATTRIBUTES["season"],
        "occasion": attrs.get("occasion") or DEFAULT_ATTRIBUTES["occasion"],
        "fit": attrs.get("fit") or DEFAULT_ATTRIBUTES["fit"],
        "trend": attrs.get("trend") or DEFAULT_ATTRIBUTES["trend"]
    }

def analyze(image_bytes: bytes) -> dict:
    """
    Core AI Analysis Pipeline.
    Validation is skipped here as it is pre-run at the route level to optimize performance.
    """
    logger.info("Starting fashion analysis pipeline execution")

    # STEP 1: DETECTION + CORRECTION (Uses globally loaded detector)
    try:
        raw_data = fashion_detector.detect(image_bytes)
        raw_attrs = raw_data.get("attributes", {})
        corrected_attrs = correction_engine.run_correction(raw_attrs)
        raw_data["attributes"] = corrected_attrs
    except Exception as e:
        logger.error(f"Detector or correction failed: {e}")
        raw_data = {
            "attributes": dict(DEFAULT_ATTRIBUTES),
            "detected_items": [],
            "confidence": "fallback",
            "explanation": "Detection failure occurred."
        }

    # STEP 2: ATTRIBUTE VALIDATION (Patch any missing fields)
    clean_attrs = validate_attributes(raw_data.get("attributes", {}))

    # STEP 3: CONTEXTUAL CONTENT GENERATION (Call Gemini via content_generator)
    try:
        content = content_generator.generate(clean_attrs, raw_data)
    except Exception as e:
        logger.error(f"Content generation failed: {e}")
        content = {
            "title": f"A {clean_attrs.get('style', 'Stylish')} {clean_attrs.get('clothing_type', 'Outfit')}",
            "description": "Fashion insight generated from visual analysis.",
            "hashtags": ["#fashion", "#style"]
        }

    # STEP 4: FINAL PAYLOAD
    return {
        "attributes": clean_attrs,
        "content": content,
        "detected_items": raw_data.get("detected_items", []),
        "explanation": raw_data.get("explanation", ""),
        "confidence": raw_data.get("confidence", "heuristic")
    }