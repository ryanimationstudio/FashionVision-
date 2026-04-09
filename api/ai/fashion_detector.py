import os
import io
import re
import json
import time
import logging
import threading
import concurrent.futures
from PIL import Image
from api.ai.gemini_client import generate_multimodal

logger = logging.getLogger(__name__)

# Standard Confidence Scores
CONFIDENCE_HIGH = 0.90
CONFIDENCE_MEDIUM = 0.65
CONFIDENCE_LOW = 0.35
CONFIDENCE_FALLBACK = 0.10

# ---------------- VOCAB (expanded) ----------------
CLOTHING_TYPES = [
    "blazer", "shirt", "t-shirt", "blouse", "dress", "skirt", "jeans", "pants",
    "trousers", "shorts", "jacket", "coat", "hoodie", "sweater", "suit",
    "gown", "swimsuit", "leggings", "vest", "cardigan", "top",
    "co-ord", "co-ord set", "handbag", "bag", "shoes", "sneakers", "boots",
    # Western / European
    "crop top", "jumpsuit", "romper", "overalls", "trench coat", "parka",
    "windbreaker", "raincoat", "waistcoat", "pullover", "sweatshirt", "track pants",
    "joggers", "cargo pants", "chinos", "khakis", "culottes", "palazzo pants",
    "maxi dress", "midi dress", "mini dress", "shirt dress", "wrap dress",
    "kimono", "shawl", "scarf", "belt", "hat", "cap", "beanie", "sunglasses",
    "watch", "bracelet", "necklace", "earrings", "heels", "flats", "sandals",
    "loafers", "oxfords", "ankle boots", "wedges",
    # Indian
    "saree", "sari", "lehenga", "kurta", "kurti", "salwar", "churidar",
    "dupatta", "sherwani", "dhoti", "lungi", "angrakha", "bandhgala",
    "jodhpuri", "patiala", "ghagra", "choli", "blouse piece",
    "kanjeevaram", "banarasi", "lehenga choli", "anarkali", "frock",
    "jhumka", "bindi", "bangles", "mojari", "juttis", "kolhapuri"
]

OUTERWEAR = {"blazer", "jacket", "coat", "cardigan", "hoodie", "sweater", "suit",
             "trench coat", "parka", "windbreaker", "raincoat", "waistcoat",
             "sherwani", "bandhgala", "angrakha"}

PATTERNS = [
    "solid", "striped", "checkered", "plaid", "floral", "polka dot",
    "paisley", "camouflage", "animal print", "geometric", "abstract", "tie-dye",
    # Western / European
    "houndstooth", "herringbone", "argyle", "chevron", "ikat", "damask",
    "toile", "ombre", "gradient", "color block", "patchwork", "tartan",
    "gingham", "windowpane", "jacquard", "brocade", "sequin",
    # Indian
    "block print", "bandhani", "bandhej", "zari", "zardozi", "mirror work",
    "chikankari", "phulkari", "kalamkari", "madhubani", "warli", "ajrakh",
    "bagh", "patola", "leheriya", "shibori"
]

STYLES = [
    "casual", "formal", "business casual", "smart casual", "sporty",
    "streetwear", "elegant", "vintage", "bohemian", "minimalist",
    # Western / European
    "grunge", "preppy", "athleisure", "edgy", "romantic", "glam",
    "punk", "gothic", "retro", "futuristic", "artistic", "western",
    "nautical", "ethnic", "couture", "avant-garde", "luxury",
    # Indian
    "indian traditional", "indo-western", "ethnic wear", "festive",
    "bridal", "royal", "south indian", "bengali", "punjabi", "rajasthani",
    "kerala saree", "modern indian", "designer"
]

COLOR_NAMES = [
    "red", "pink", "orange", "yellow", "green", "olive", "teal", "blue",
    "navy", "purple", "brown", "beige", "white", "gray", "black",
    "lavender", "mauve", "charcoal", "taupe", "burgundy", "maroon",
    "coral", "peach", "mustard", "emerald", "turquoise", "cyan",
    "indigo", "violet", "magenta", "fuchsia", "silver", "gold",
    "bronze", "copper", "cream", "ivory", "tan", "khaki", "camel",
    # Indian / cultural
    "saffron", "mango", "pista", "lime", "eggplant", "rust", "brick", "ochre"
]

# ---------------- MODEL ----------------
_processor = None
_model = None
_load_attempted = False
_model_lock = threading.Lock()

def _load_model():
    """Thread-safe model loading with single-try enforcement."""
    global _processor, _model, _load_attempted
    
    if _processor is not None and _model is not None:
        return True
        
    with _model_lock:
        if _processor is not None and _model is not None:
            return True
            
        if _load_attempted:
            return False
            
        _load_attempted = True
        try:
            logger.info("Initializing BLIP VQA model (Salesforce/blip-vqa-base)...")
            from transformers import BlipProcessor, BlipForQuestionAnswering
            model_id = "Salesforce/blip-vqa-base"
            hf_token = os.environ.get("HF_TOKEN")
            load_kwargs = {"token": hf_token} if hf_token else {}
            
            # Use CPU by default for stability in shared environments
            _processor = BlipProcessor.from_pretrained(model_id, **load_kwargs)
            _model = BlipForQuestionAnswering.from_pretrained(model_id, **load_kwargs)
            _model.eval()
            
            logger.info("BLIP VQA model loaded successfully.")
            return True
        except Exception as e:
            logger.error(f"BLIP Model load failed: {e}")
            _processor = None
            _model = None
            return False

def _ask(img, q, max_tokens=30) -> str:
    """Ask BLIP model a question with error handling and model check."""
    if not _processor or not _model:
        logger.warning(f"BLIP model unavailable skipping question: {q}")
        return ""
        
    try:
        import torch
        inputs = _processor(img, q, return_tensors="pt")
        with torch.no_grad():
            out = _model.generate(**inputs, max_new_tokens=max_tokens)
        answer = _processor.decode(out[0], skip_special_tokens=True).lower().strip()
        return answer
    except Exception as e:
        logger.error(f"BLIP inference failed for question '{q}': {e}")
        return ""

# ---------------- HELPERS ----------------
def _normalize(text):
    return text.lower().replace("t shirt", "t-shirt").strip()

def _refine_color(color):
    c = _normalize(color)
    if not c or c == "unknown":
        return "Neutral"

    if c in ["green", "light green"]:
        return "Light Green"
    if c in ["white", "off white", "off-white"]:
        return "Off White"
    if c in ["light blue", "sky blue"]:
        return "Blue"

    return c.title()

def _match_type(answer):
    ans = _normalize(answer)
    matches = [t for t in CLOTHING_TYPES if t in ans]

    if not matches:
        if "dress" in ans or "gown" in ans:
            return "Dress"
        if "set" in ans:
            return "Co-ord Set"
        return "Outfit"

    for m in matches:
        if m in OUTERWEAR:
            return m.title()

    return max(matches, key=len).title()

def _match(answer, vocab, default):
    ans = _normalize(answer)
    for term in sorted(vocab, key=len, reverse=True):
        if term in ans:
            return term.title()
    return default

def _refine_style(style, ct):
    c = ct.lower()

    if "blazer" in c:
        return "Business Casual"
    if "vest" in c:
        return "Smart Casual"
    if "hoodie" in c:
        return "Streetwear"

    if not style or style.lower() == "casual":
        if "suit" in c:
            return "Business Casual"
        return "Casual"

    return style.title()

def _infer_season(ct, color):
    c = ct.lower()
    clr = color.lower()

    if any(w in c for w in ["dress", "gown", "t-shirt", "shorts", "top", "co-ord"]):
        return "Summer"
    if any(w in c for w in ["blazer", "vest", "cardigan"]):
        return "Autumn"
    if any(w in c for w in ["hoodie", "coat", "jacket", "sweater"]):
        return "Winter"

    if any(w in clr for w in ["white", "beige", "yellow"]):
        return "Summer"
    if any(w in clr for w in ["black", "navy"]):
        return "Winter"
    if any(w in clr for w in ["brown", "olive"]):
        return "Autumn"

    return "All Season"

def _infer_occasion(ct, style):
    c = ct.lower()
    if "blazer" in c:
        return "Office"
    if "dress" in c or "gown" in c or "suit" in c:
        return "Formal"
    if "swimsuit" in c:
        return "Beach"
    if "sporty" in style.lower():
        return "Activewear"
    return "Casual"

def _infer_fit(ct):
    c = ct.lower()
    if any(w in c for w in ["hoodie", "sweater", "coat", "gown", "cardigan"]):
        return "Loose"
    if any(w in c for w in ["leggings", "swimsuit"]):
        return "Tight"
    return "Regular"

def _infer_trend(style):
    s = style.lower()
    if any(w in s for w in ["business", "minimalist", "classic", "formal"]):
        return "Classic"
    if any(w in s for w in ["streetwear", "vintage", "luxury"]):
        return "High"
    return "Standard"

def _generate_title(ct, color, style) -> str:
    """Generate a creative title when Gemini is unavailable."""
    return f"Elegant {color.title()} {ct.title()} in {style.title()} Style"

def _generate_description(ct, color, style, pattern) -> str:
    """Generate a editor-style description when Gemini is unavailable."""
    return (f"This {style.lower()} look features a {color.lower()} {ct.lower()} "
            f"with a {pattern.lower()} design. A perfect choice for those who value "
            f"both comfort and aesthetic appeal.")

def _generate_explanation(ct, color, style):
    return f"Detected a {color.lower()} {ct.lower()} with a {style.lower()} style using visual patterns and rule-based inference."

def _parse_gemini_json(text: str) -> dict:
    """Robustly parse JSON from Gemini's markdown-heavy response."""
    text = text.strip()
    # Remove markdown code blocks
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find anything between { and }
        match = re.search(r'(\{.*\})', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        raise ValueError("Invalid JSON format from Gemini API")

# ---------------- MAIN ----------------
def detect(image_bytes: bytes):
    # 1. Input Validation
    if not image_bytes or not isinstance(image_bytes, bytes):
        logger.error("Invalid input: image_bytes is missing or not a bytes object")
        return _fallback()
        
    if len(image_bytes) > 20 * 1024 * 1024: # 20MB limit
        logger.warning(f"Image too large ({len(image_bytes)} bytes), rejecting.")
        return _fallback()

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        if img.width < 128 or img.height < 128:
            logger.warning(f"Image dimensions too small ({img.width}x{img.height})")
            return _fallback()
    except Exception as e:
        logger.error(f"Image decode failed: {e}")
        return _fallback()

    # 2. Gemini Vision Access
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if len(gemini_key) > 20: # Basic key validation
        try:
            
            prompt = """
            Analyze the outfit in this image and return a raw JSON object. 
            The JSON must match this structure exactly:
            {
                "clothing_type": "Blazer/Dress/Outfit/etc",
                "color": "Main color name",
                "pattern": "Solid/Floral/etc",
                "style": "Casual/Formal/etc",
                "season": "Summer/Winter/etc",
                "occasion": "Work/Party/etc",
                "fit": "Regular/Loose/etc",
                "trend": "Classic/High/etc",
                "detected_items": ["item1", "item2"],
                "generated_title": "Creative 10-word title",
                "generated_desc": "3-sentence description",
                "explanation": "Short analytical reason",
                "sustainability_score": 0-100,
                "sustainability_impact": "Short 1-sentence impact summary"
            }
            """
            
            # Wrap Gemini in a simple timeout using ThreadPoolExecutor
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    generate_multimodal,
                    api_key=gemini_key,
                    model="gemini-1.5-flash",
                    prompt=prompt,
                    image=img,
                )
                response_text = future.result(timeout=25)
            
            data = _parse_gemini_json(response_text)
            
            return {
                "attributes": {
                    "clothing_type": data.get("clothing_type", "Outfit"),
                    "color": data.get("color", "Neutral"),
                    "pattern": data.get("pattern", "Solid"),
                    "style": data.get("style", "Casual"),
                    "season": data.get("season", "All Season"),
                    "occasion": data.get("occasion", "Casual"),
                    "fit": data.get("fit", "Regular"),
                    "trend": data.get("trend", "Standard"),
                    "generated_title": data.get("generated_title", ""),
                    "generated_desc": data.get("generated_desc", "")
                },
                "detected_items": data.get("detected_items", []),
                "sustainability": {
                    "score": data.get("sustainability_score", 50),
                    "impact": data.get("sustainability_impact", "Standard environmental footprint.")
                },
                "confidence": CONFIDENCE_HIGH,
                "explanation": data.get("explanation", "Analyzed via Gemini Vision.")
            }
        except Exception as e:
            logger.warning(f"Gemini path failed or timed out: {e}. Falling back to BLIP.")
    else:
        logger.debug("GEMINI_API_KEY missing or invalid format - using BLIP fallback.")

    if not (_load_model() and _model):
        return _fallback()

    items_ans   = _ask(img, "List all clothing items visible in this image (e.g., shirt, jacket, pants, shoes, dress).")
    color_ans   = _ask(img, "What color is the main clothing?")
    pattern_ans = _ask(img, "What pattern are the clothes?")
    style_ans   = _ask(img, "What fashion style is this outfit?")
    season_ans  = _ask(img, "Which season is this clothing best suited for? (summer, winter, autumn, spring)", max_tokens=10)

    ans_norm = " " + _normalize(items_ans) + " "
    detected_items = []

    for t in sorted(CLOTHING_TYPES, key=len, reverse=True):
        if t in ans_norm:
            detected_items.append(t)
            ans_norm = ans_norm.replace(t, " ")

    if not detected_items:
        fallback_item = _match_type(items_ans)
        if fallback_item.lower() not in ["outfit"]:
            detected_items.append(fallback_item.lower())

    if len(detected_items) > 1:
        clothing_type = "Layered Outfit"
    elif len(detected_items) == 1:
        clothing_type = detected_items[0].title()
    else:
        clothing_type = "Outfit"
        detected_items = []

    raw_color = _match(color_ans, COLOR_NAMES, "Unknown")
    pattern = _match(pattern_ans, PATTERNS, "Solid")
    raw_style = _match(style_ans, STYLES, "Casual")

    color = _refine_color(raw_color)
    style = _refine_style(raw_style, clothing_type)
    
    SEASONS = ["Summer", "Winter", "Autumn", "Spring", "All Season", "Fall", "Monsoon"]
    detected_season = _match(season_ans, SEASONS, "Unknown")
    if detected_season == "Fall":
        detected_season = "Autumn"
    
    if detected_season != "Unknown":
        season = detected_season
    else:
        season = _infer_season(clothing_type, color)
    occasion = _infer_occasion(clothing_type, style)
    fit = _infer_fit(clothing_type)
    trend = _infer_trend(style)

    if len(detected_items) > 1:
        confidence = CONFIDENCE_HIGH
    elif len(detected_items) == 1:
        confidence = CONFIDENCE_MEDIUM
    else:
        confidence = CONFIDENCE_LOW

    items_str = ", ".join(detected_items) if detected_items else "no specific recognizable items"
    if clothing_type == "Layered Outfit":
        explanation = f"Detected {items_str}, indicating a layered outfit commonly associated with {style.lower()} style and {color.lower()} colors."
    else:
        explanation = f"Detected {items_str}. Interpreted as a {color.lower()} {clothing_type.lower()} with a {style.lower()} style."

    # Simple rule-based sustainability fallback
    sus_score = 75 if any(x in clothing_type.lower() for x in ["linen", "cotton", "wool"]) else 45
    sus_impact = "Natural fiber base" if sus_score > 60 else "Synthetic blend detectable"

    return {
        "attributes": {
            "clothing_type": clothing_type,
            "color": color,
            "pattern": pattern,
            "style": style,
            "season": season,
            "occasion": occasion,
            "fit": fit,
            "trend": trend,
            "generated_title": _generate_title(clothing_type, color, style),
            "generated_desc": _generate_description(clothing_type, color, style, pattern)
        },
        "detected_items": detected_items,
        "sustainability": {
            "score": sus_score,
            "impact": sus_impact
        },
        "confidence": confidence,
        "explanation": explanation
    }

def _fallback():
    """Consistent fallback response when all models fail."""
    ct, color, style = "Outfit", "Neutral", "Casual"
    return {
        "attributes": {
            "clothing_type": ct,
            "color": color,
            "pattern": "Solid",
            "style": style,
            "season": "All Season",
            "occasion": "Casual",
            "fit": "Regular",
            "trend": "Standard",
            "generated_title": _generate_title(ct, color, style),
            "generated_desc": _generate_description(ct, color, style, "solid")
        },
        "detected_items": [],
        "sustainability": {
            "score": 50,
            "impact": "Standard environmental footprint."
        },
        "confidence": CONFIDENCE_FALLBACK,
        "explanation": "Standard defaults applied due to identification failure."
    }