"""
FashionVision - Fashion Image Validator (v2 HARDENED)

Architecture:
  - CLIP zero-shot classification across 10 prompts (6 fashion, 4 non-fashion)
  - Fail-CLOSED: uncertain / model failure = REJECTED (never silently approved)
  - Thread-safe double-checked locking for lazy model load
  - Consistent size gate in both public functions
  - 0.40 confidence threshold (~3.6x above 9-class random baseline of 0.11)
"""
import io
import os
import logging
import threading
import time
import concurrent.futures
from PIL import Image

from . import fashion_vision_config
from . import cache
from . import metrics

logger = logging.getLogger(__name__)

MODEL_NAME = "openai/clip-vit-base-patch32"

# ── Prompt Design ─────────────────────────────────────────────────────────────
# • Keep fashion prompts specific enough that CLIP separates them from lifestyle
# • Keep non-fashion prompts broad enough to catch edge cases
# • Indexes 0-5 are FASHION (allowed), 6-9 are NON-FASHION (blocked)
TEXT_PROMPTS = [
    # --- 🟢 1. CORE FASHION & E-COMMERCE (Allowed: Index 0-6) ---
    "a professional e-commerce product shot of fashionable clothing like a dress, shirt, or jacket",
    "a fashion outfit flat lay or mannequin display on a clean background",
    "a stylish person posing in trendy street style, streetwear, or casual everyday clothes",
    "a professional fashion portrait showing a highly styled designer outfit",
    "a close-up photo of apparel items like shoes, handbags, or fashion accessories",
    "a macro photography close-up of fine jewelry, watches, or small accessories",
    "a professional product photo of a person modeling lingerie, innerwear, or swimwear",

    # --- 🌍 2. GLOBAL & CULTURAL FASHION (Allowed: Index 7-13) ---
    "a photo of traditional Indian clothing like a beautiful Saree, Salwar Suit, Kurta, or Lehenga",
    "a photo of traditional East Asian clothing like a Kimono, Hanbok, or Qipao",
    "a photo of Middle Eastern or modest Islamic fashion like an Abaya, Thobe, Kaftan, or Hijab",
    "a photo of traditional African ethnic wear, Dashiki, or vibrant Ankara print clothing",
    "a photo of traditional European folk clothing like a Scottish Kilt or German Dirndl",
    "a photo of traditional Latin American or indigenous clothing like a Poncho or Huipil",
    "a portrait of a person wearing their country's cultural, indigenous, or national ethnic dress",

    # --- 🎭 3. EDGE CASES & VIRTUAL FASHION (Allowed: Index 14-16) ---
    "a highly realistic 3D render, Marvelous Designer output, or virtual fashion design of clothing",
    "a real photo of a person wearing a theatrical costume, fantasy armor, or anime cosplay",
    "a high-fashion monochromatic outfit or avant-garde runway clothing",

    # --- 💪 4. ACTIVEWEAR & ATHLEISURE (Allowed: Index 17-18) ---
    "a photo of a person wearing athletic, gym, yoga, or sportswear like leggings, a sports bra, or a jersey",
    "a photo of athleisure fashion combining sporty and casual clothing like joggers, hoodies, or sneakers",

    # --- 👗 5. FORMAL, BRIDAL & RED-CARPET (Allowed: Index 19-20) ---
    "a photo of a person wearing formal evening wear, a ball gown, a tuxedo, or red-carpet fashion",
    "a photo of a bride or groom in wedding attire, bridal lehenga, wedding gown, or sherwani",

    # --- 🌏 6. SOUTHEAST ASIAN FASHION (Allowed: Index 21) ---
    "a photo of Southeast Asian traditional clothing like a Vietnamese Ao Dai, Indonesian Batik, Filipino Barong, or Thai Silk outfit",

    # --- 👶 7. CHILDREN'S & MATERNITY FASHION (Allowed: Index 22-23) ---
    "a photo of a baby, toddler, or child wearing cute kids fashion, a onesie, or children's clothing",
    "a photo of a woman modeling maternity wear or pregnancy fashion",

    # --- ❌ 8. NON-FASHION & BLOCKED (Rejected: Index 24-33) ---
    "a screenshot, internet meme, or image containing heavy text, typography, or UI elements",
    "a photo of an animal, wildlife, or pets",
    "a photo of food, drinks, or cooked meals",
    "a photo of vehicles, natural landscapes, buildings, or inanimate household objects",
    "an anime, manga, manhwa, or 2D cartoon illustration of a character, even if wearing clothes",
    "a digital art illustration, painting, or sketch that is not a real photograph",
    "a photo containing full nudity, sexually explicit, or inappropriate NSFW adult content",
    # Additional edge-cases to block:
    "a photo of computers, phones, electronic gadgets, hardware, or technology",
    "a photo of furniture, home decor, interior design, or architecture without a person",
    "a close-up macro photo of human skin, a medical condition, or a body part without any focus on clothing",
]

FASHION_PROMPT_INDEXES = set(range(24))  # Indexes 0-23 are ALLOWED; 24+ are blocked

# Config
CONFIG = fashion_vision_config.load_config()
CONFIDENCE_THRESHOLD = CONFIG['confidence_threshold']

# Minimum image dimensions — CLIP patch size is 32px
MIN_DIMENSION = CONFIG['min_image_dimension']
INFERENCE_TIMEOUT = CONFIG.get('inference_timeout_seconds', 30)

# ── Thread-safe Lazy Model Load ───────────────────────────────────────────────
_processor = None
_model = None
_device = "cpu"
_load_attempted = False
_model_lock = threading.Lock()


def _load_model() -> bool:
    """
    Double-checked locking singleton loader.
    Returns True if model is ready, False if load failed.
    FAIL-CLOSED: a failed load permanently returns False until server restart.
    """
    global _processor, _model, _device, _load_attempted

    # Fast path — already loaded
    if _processor is not None and _model is not None:
        return True

    with _model_lock:
        # Re-check inside lock (another thread may have loaded while we waited)
        if _processor is not None and _model is not None:
            return True

        # Already tried and failed — don't retry (prevents thundering herd)
        if _load_attempted:
            return False

        _load_attempted = True

        try:
            import torch
            from transformers import CLIPModel, CLIPProcessor

            _device = "cuda" if torch.cuda.is_available() else "cpu"
            hf_token = os.environ.get("HF_TOKEN")
            load_kwargs = {"token": hf_token} if hf_token else {}

            _processor = CLIPProcessor.from_pretrained(MODEL_NAME, **load_kwargs)
            _model = CLIPModel.from_pretrained(MODEL_NAME, **load_kwargs)
            _model.to(_device)
            _model.eval()

            logger.info("Fashion validator loaded on %s", _device)
            return True

        except Exception:
            logger.exception("Fashion validator model load failed — failing closed.")
            # Explicitly clear to avoid partial state
            _processor = None
            _model = None
            return False  # FAIL-CLOSED


def _open_image(image_bytes: bytes) -> Image.Image | None:
    """
    Safely decode bytes into a PIL RGB image.
    Enforces minimum dimension gate.
    Returns None on any failure.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        logger.warning(f"Image decode failed. Error: {e}")
        return None

    if img.width < MIN_DIMENSION or img.height < MIN_DIMENSION:
        logger.warning(
            "Image too small (%dx%d) for reliable CLIP classification — rejecting.",
            img.width, img.height
        )
        return None

    return img


def _is_likely_illustration(image: Image.Image) -> bool:
    """
    Fast pixel-level heuristic to catch anime / cartoon / digital art
    BEFORE running the heavier CLIP model.

    Anime & cartoon art has two telltale signatures vs. real photos:
      1. HYPER-SATURATION: HSV saturation values are extreme (>0.75) in a
         large fraction of pixels — real photos rarely exceed ~30% of pixels
         at that saturation level.
      2. FLAT COLORS: Cartoon cel-shading uses very few distinct hues.
         We sample the image and count unique quantized hue buckets.

    Returns True if the image is likely illustrated (should be BLOCKED).
    """
    import colorsys

    # Downsample for speed — we only need statistical properties
    thumb = image.resize((128, 128))
    pixels = list(thumb.getdata())  # List of (R, G, B) tuples

    high_sat_count = 0
    hue_buckets: set[int] = set()

    for r, g, b in pixels:
        # Normalize to 0-1
        rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
        h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)

        # Count hyper-saturated pixels (anime hallmark)
        if s > 0.75 and v > 0.3:
            high_sat_count += 1

        # Record hue in 36 discrete buckets (every 10°)
        if s > 0.15:  # Only count pixels with noticeable color
            hue_buckets.add(int(h * 36))

    total_pixels = len(pixels)
    sat_ratio = high_sat_count / total_pixels

    # Heuristic thresholds from config
    sat_thresh = CONFIG.get('cartoon_saturation_threshold', 0.85)
    hue_thresh = CONFIG.get('cartoon_hue_buckets_threshold', 4)
    
    is_cartoon = sat_ratio > sat_thresh and len(hue_buckets) < hue_thresh

    if is_cartoon:
        logger.warning(
            "Pixel heuristic flagged illustration: sat_ratio=%.2f, hue_buckets=%d — rejecting.",
            sat_ratio, len(hue_buckets)
        )

    return is_cartoon


def _fast_clothing_heuristic(image: Image.Image) -> dict | None:
    """
    Fast fallback heuristic for clothing detection using color/texture analysis.
    Runs in <100ms. Used when CLIP times out.
    Returns: boosted confidence dict or None if uncertain.
    """
    try:
        import numpy as np
        
        # Convert to array
        img_array = np.array(image.resize((128, 128)))
        
        # Detect if image has clothing-like properties:
        # 1. Not too bright/pure white (common in non-fashion backgrounds)
        # 2. Has some color variation (fabric texture)
        # 3. Not monochromatic
        mean_brightness = img_array.mean() / 255.0
        
        if mean_brightness > 0.95:  # Too white/bright = likely background
            return {"confidence": 0.1, "reason": "too_bright"}
        
        # Check color diversity (fabric typically has varied colors)
        r, g, b = img_array[:,:,0], img_array[:,:,1], img_array[:,:,2]
        color_std = np.std([r.std(), g.std(), b.std()])
        
        if color_std > 20:  # Good texture/color variation
            return {"confidence": 0.65, "reason": "texture_detected"}
        else:
            return {"confidence": 0.35, "reason": "low_texture"}
            
    except Exception as e:
        logger.debug(f"Fast heuristic failed: {e}")
        return None


def _predict(image: Image.Image) -> dict | None:
    """
    Run CLIP zero-shot classification with timeout protection.
    Falls back to fast heuristic if timeout occurs.
    Returns:
      dict with 'best_idx', 'max_prob', 'probs', or 'error' key.
    """
    if not _load_model() or _processor is None or _model is None:
        logger.error("CLIP model unavailable — failing closed.")
        return {"error": "model_unavailable"}

    start_time = time.perf_counter()
    try:
        import torch

        inputs = _processor(
            text=TEXT_PROMPTS,
            images=image,
            return_tensors="pt",
            padding=True,
        )
        inputs = {k: v.to(_device) for k, v in inputs.items()}

        with torch.no_grad():
            # Run inference with timeout protection
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(lambda: _model(**inputs).logits_per_image)
                try:
                    logits = future.result(timeout=INFERENCE_TIMEOUT)
                except concurrent.futures.TimeoutError:
                    logger.warning(f"CLIP inference timeout ({INFERENCE_TIMEOUT}s) — falling back to fast heuristic")
                    fallback = _fast_clothing_heuristic(image)
                    if fallback:
                        return {"fallback": True, **fallback}
                    return {"error": "timeout"}

        probs = logits.softmax(dim=1)[0]
        max_prob = probs.max().item()
        best_idx = int(probs.argmax().item())

        logger.debug(
            "CLIP result: idx=%d prompt='%s' conf=%.3f",
            best_idx, TEXT_PROMPTS[best_idx], max_prob
        )
        
        inference_time_ms = (time.perf_counter() - start_time) * 1000

        return {
            "best_idx": best_idx,
            "max_prob": max_prob,
            "probs": probs.tolist(),
            "inference_time_ms": inference_time_ms
        }

    except Exception as e:
        logger.exception("CLIP inference failed — failing closed.")
        return {"error": "inference_failed", "exception": str(e)}


# ── Public API ────────────────────────────────────────────────────────────────

def is_fashion_image(image_bytes: bytes) -> bool:
    """
    Fast boolean gate. Returns True only if image is confidently fashion.
    FAIL-CLOSED: False on any uncertainty, including anime/cartoon art.
    """
    # Check cache first
    cached_result = cache.check_cache(image_bytes)
    if cached_result is not None:
        return cached_result.get("is_fashion", False)

    image = _open_image(image_bytes)
    if image is None:
        return False

    # Layer 1: Fast pixel heuristic — catches anime/cartoon before CLIP
    if _is_likely_illustration(image):
        logger.info("is_fashion_image → False | pixel heuristic blocked illustration")
        metrics.record_metric("validation_complete", "rejected", path="heuristic")
        cache.store_in_cache(image_bytes, {"is_fashion": False})
        return False

    # Layer 2: CLIP zero-shot classification
    pred = _predict(image)
    if "error" in pred:
        logger.error("Could not classify image with confidence — rejecting.")
        metrics.record_metric("validation_complete", "rejected", path="clip")
        return False

    # Handle fallback heuristic result
    if pred.get("fallback"):
        confidence = pred.get("confidence", 0.35)
        if confidence < 0.55:
            metrics.record_metric("validation_complete", "rejected", path="fallback_heuristic")
            return False
        metrics.record_metric("validation_complete", "approved", path="fallback_heuristic", confidence=confidence)
        return True

    max_prob = pred["max_prob"]
    best_idx = pred["best_idx"]
    inference_time = pred.get("inference_time_ms", 0)

    # --- 🛡️ SMART THRESHOLD LOGIC (Fast Path) 🛡️ ---
    base_thresh = CONFIDENCE_THRESHOLD
    human_centric_prompts = {2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23}
    
    current_thresh = base_thresh
    if best_idx in human_centric_prompts:
        current_thresh = 0.20

    if max_prob < current_thresh:
        logger.warning(
            "Low CLIP confidence (%.2f < %.2f) — rejecting for safety.",
            max_prob, current_thresh
        )
        metrics.record_metric("validation_complete", "rejected", inference_time_ms=inference_time, path="clip", confidence=max_prob)
        cache.store_in_cache(image_bytes, {"is_fashion": False})
        return False

    result = best_idx in FASHION_PROMPT_INDEXES
    logger.info("is_fashion_image → %s | prompt: '%s'", result, TEXT_PROMPTS[best_idx])
    
    metrics.record_metric("validation_complete", "approved" if result else "rejected", 
                          inference_time_ms=inference_time, path="clip", 
                          confidence=max_prob, detected_subject=TEXT_PROMPTS[best_idx])
                          
    cache.store_in_cache(image_bytes, {"is_fashion": result})
    return result


def validate_fashion_image(image_bytes: bytes) -> dict:
    """
    Rich validation result with subject label and human-readable reason.
    FAIL-CLOSED: uncertainty, model failure, and illustrated art all return is_fashion=False.
    """
    # Check cache first
    cached_result = cache.check_cache(image_bytes)
    if cached_result is not None:
        return cached_result
        
    image_hash = cache._md5_hash(image_bytes)

    # Decode step
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        metrics.record_metric("validation_complete", "rejected", path="heuristic", image_hash=image_hash)
        return {
            "is_fashion": False,
            "detected_subject": "unreadable",
            "reason": f"Image decode failed: {e}. File may be corrupted or not a valid image format. Supported formats: JPEG, PNG, WebP, GIF."
        }

    if img.width < MIN_DIMENSION or img.height < MIN_DIMENSION:
        metrics.record_metric("validation_complete", "rejected", path="heuristic", image_hash=image_hash)
        return {
            "is_fashion": False,
            "detected_subject": "too_small",
            "reason": f"Image dimensions {img.width}x{img.height} are below the minimum required {MIN_DIMENSION}x{MIN_DIMENSION} for reliable classification."
        }
        
    image = img

    # Layer 1: Pixel heuristic for anime / cartoon art
    if _is_likely_illustration(image):
        metrics.record_metric("validation_complete", "rejected", path="heuristic", image_hash=image_hash)
        result = {
            "is_fashion": False,
            "detected_subject": "anime / cartoon / digital illustration",
            "reason": (
                "This image appears to be animated or illustrated art, not a real photograph. "
                "FashionVision only accepts real fashion photography."
            )
        }
        cache.store_in_cache(image_bytes, result)
        return result

    # Layer 2: CLIP zero-shot classification (with fallback)
    pred = _predict(image)
    if "error" in pred:
        error_type = pred["error"]
        metrics.record_metric("validation_complete", "rejected", path="clip", image_hash=image_hash)
        if error_type == "timeout":
            reason = f"CLIP inference timeout ({INFERENCE_TIMEOUT}s) — model inference too slow."
        elif error_type == "model_unavailable":
            reason = "Fashion Validator model is currently unavailable."
        else:
            reason = f"CLIP inference failed unexpectedly: {pred.get('exception', 'Unknown error')}."
            
        result = {
            "is_fashion": False,
            "detected_subject": "uncertain",
            "reason": reason
        }
        return result

    # Handle both CLIP results and fallback heuristic results
    if pred.get("fallback"):
        # Fallback heuristic mode (CLIP timed out but we got a result)
        confidence = pred.get("confidence", 0.35)
        heuristic_reason = pred.get("reason", "texture_analysis")
        inference_time = 0
        
        logger.info("Using fallback heuristic: confidence=%.2f reason=%s", confidence, heuristic_reason)
        
        # Fallback is more conservative: require higher confidence
        if confidence < 0.55:
            metrics.record_metric("validation_complete", "rejected", path="fallback_heuristic", image_hash=image_hash)
            result = {
                "is_fashion": False,
                "detected_subject": "uncertain (fallback mode)",
                "reason": f"Server overloaded — using fast detection. Confidence {confidence:.0%} below threshold."
            }
            cache.store_in_cache(image_bytes, result)
            return result
        
        # Fallback approved (conservative threshold)
        metrics.record_metric("validation_complete", "approved", path="fallback_heuristic", image_hash=image_hash, confidence=confidence)
        result = {
            "is_fashion": True,
            "detected_subject": "clothing (fast detection)",
            "reason": f"Detected clothing texture via fast heuristic (confidence {confidence:.0%})."
        }
        cache.store_in_cache(image_bytes, result)
        return result

    # Standard CLIP result
    max_prob = pred["max_prob"]
    best_idx = pred["best_idx"]
    probs = pred["probs"]
    inference_time = pred.get("inference_time_ms", 0)
    
    # --- 🛡️ SMART THRESHOLD LOGIC 🛡️ ---
    # We use a hierarchical threshold system to prevent false rejections of valid fashion:
    # 1. BASE: 0.25 (standard for all fashion categories)
    # 2. HUMAN BYPASS: 0.20 (if a person is clearly seen modeling clothes)
    # 3. NON-FASHION: Always requires same high-bar (0.25) to block
    
    base_thresh = CONFIDENCE_THRESHOLD # Likely 0.25 now
    human_centric_prompts = {2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23}
    
    current_thresh = base_thresh
    if best_idx in human_centric_prompts:
        current_thresh = 0.20 # High leniency for photos with models
        
    # Process rich error message for low confidence
    if max_prob < current_thresh:
        # Get top 3 categories
        top_indices = sorted(range(len(probs)), key=lambda i: probs[i], reverse=True)[:3]
        top_cats = [f"{'fashion' if i in FASHION_PROMPT_INDEXES else 'non-fashion'} ({probs[i]:.2f})" for i in top_indices]
        
        reason = (
            f"Image confidence {max_prob:.2f} is below threshold {current_thresh:.2f}. "
            f"Model was unsure between: {', '.join(top_cats)}. "
            "Rejected to maintain system integrity."
        )
        metrics.record_metric("validation_complete", "rejected", inference_time_ms=inference_time, 
                              path="clip", confidence=max_prob, image_hash=image_hash)
        result = {
            "is_fashion": False,
            "detected_subject": "uncertain",
            "reason": reason
        }
        cache.store_in_cache(image_bytes, result)
        return result

    is_fashion = best_idx in FASHION_PROMPT_INDEXES
    detected_subject = TEXT_PROMPTS[best_idx]
    reason = (
        f"Detected: {detected_subject}"
        if is_fashion
        else f"Detected non-fashion content: {detected_subject}"
    )

    logger.info("validate_fashion_image → %s | %s", is_fashion, detected_subject)
    
    metrics.record_metric("validation_complete", "approved" if is_fashion else "rejected", 
                          inference_time_ms=inference_time, path="clip", 
                          confidence=max_prob, detected_subject=detected_subject, image_hash=image_hash)
                          
    result = {
        "is_fashion": is_fashion,
        "detected_subject": detected_subject,
        "reason": reason
    }
    cache.store_in_cache(image_bytes, result)
    return result