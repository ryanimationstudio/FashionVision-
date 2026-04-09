"""
FashionVision - Correction Engine
"""

def refine_color(color: str, clothing_type: str) -> str:
    c = (color or "Unknown").lower()
    t = (clothing_type or "").lower()
    
    if c in ["off-white", "off white", "cream"]:
        return "Beige"
    if c in ["light blue", "sky blue", "cyan"]:
        return "Blue"

    warm_context_items = ["blazer", "jacket", "coat", "boots", "vest", "sweater"]
    if any(item in t for item in warm_context_items):
        if c == "red" or c == "orange":
            return "Brown"
        
    return c.title()


def refine_type(clothing_type: str) -> str:
    t = (clothing_type or "Outfit").lower()
    if t == "clothing":
        return "Outfit"
    if t == "jacket":
        return "Blazer"
    return t.title()


def refine_style(style: str, clothing_type: str) -> str:
    s = (style or "Casual").lower()
    t = (clothing_type or "").lower()
    
    if "blazer" in t or "suit" in t:
        return "Business Casual"
    if "vest" in t:
        return "Smart Casual"
    if "hoodie" in t:
        return "Streetwear"
    
    return s.title()


def infer_season(clothing_type: str, color: str) -> str:
    t = clothing_type.lower()
    if any(w in t for w in ["blazer", "vest", "cardigan"]):
        return "Autumn"
    if any(w in t for w in ["hoodie", "coat", "sweater", "boots"]):
        return "Winter"
    if any(w in t for w in ["t-shirt", "t shirt", "shorts", "swimsuit", "co-ord"]):
        return "Summer"
    
    return "All Season"


def infer_occasion(style: str, clothing_type: str) -> str:
    s = style.lower()
    t = clothing_type.lower()
    
    if "blazer" in t:
        return "Office"
    if "business" in s or "formal" in s:
        return "Formal"
    if "swimsuit" in t:
        return "Beach"
    if "sporty" in s:
        return "Activewear"
    
    return "Casual"


def infer_gender(clothing_type: str) -> str:
    t = clothing_type.lower()
    female_pieces = ["dress", "skirt", "blouse", "gown", "handbag", "leggings"]
    if any(p in t for p in female_pieces):
        return "Female"
    return "Unisex"


def infer_fit(clothing_type: str) -> str:  # ✅ No space in name
    t = clothing_type.lower()
    loose = ["hoodie", "sweater", "coat", "gown", "cardigan"]
    tight = ["leggings", "swimsuit", "athletic"]
    
    if any(p in t for p in loose):
        return "Loose"
    if any(p in t for p in tight):
        return "Tight"
    
    return "Regular"


def infer_trend(style: str, pattern: str) -> str:
    s = style.lower()
    if any(w in s for w in ["business", "minimalist", "classic", "formal"]):
        return "Classic"
    if any(w in s for w in ["streetwear", "vintage", "luxury"]):
        return "High"
    
    return "Standard"


def run_correction(raw_attrs: dict) -> dict:
    if not raw_attrs:
        raw_attrs = {}

    r_type    = raw_attrs.get("clothing_type", "Clothing")
    r_color   = raw_attrs.get("color", "Unknown")
    r_style   = raw_attrs.get("style", "Casual")
    r_pattern = raw_attrs.get("pattern", "Solid")

    # ── Detect if Gemini already produced clean, trusted attributes ──────────
    # When Gemini was used, its clothing_type / style are already accurate.
    # We must NOT override them with blunt rule-based logic (e.g. "suit" → Business Casual).
    # We only run full correction on raw BLIP output (which is noisy 1-word answers).
    gemini_was_used = bool(raw_attrs.get("generated_title", "").strip())

    if gemini_was_used:
        # Gemini path: trust its values, only normalise capitalisation
        refined_type  = r_type.strip().title() if r_type else "Outfit"
        refined_color = r_color.strip().title() if r_color else "Neutral"
        refined_style = r_style.strip().title() if r_style else "Casual"
    else:
        # BLIP fallback path: full rule-based correction
        refined_type  = refine_type(r_type)
        refined_color = refine_color(r_color, refined_type)
        refined_style = refine_style(r_style, refined_type)

    # Season: use Gemini's value if present, otherwise infer
    season = raw_attrs.get("season", "").strip()
    if not season or season.lower() in ("unknown", ""):
        season = infer_season(refined_type, refined_color)

    # Occasion / gender / fit / trend: always infer (safe secondary metadata)
    occasion = infer_occasion(refined_style, refined_type)
    gender   = infer_gender(refined_type)
    fit      = infer_fit(refined_type)
    trend    = infer_trend(refined_style, r_pattern)

    return {
        "clothing_type": refined_type,
        "color":         refined_color,
        "pattern":       r_pattern.title() if r_pattern else "Solid",
        "style":         refined_style,
        "season":        season,
        "occasion":      occasion,
        "gender":        gender,
        "fit":           fit,
        "trend":         trend,
        # Always pass through AI-generated content — never discard
        "generated_title": raw_attrs.get("generated_title", ""),
        "generated_desc":  raw_attrs.get("generated_desc", ""),
    }