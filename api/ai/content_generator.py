import os
import re
import json
import random
import logging
import concurrent.futures
from api.ai.gemini_client import generate_text

logger = logging.getLogger(__name__)

# NOTE: API key is intentionally read lazily inside generate() to avoid
# module-load-time race conditions with dotenv initialization.

generation_config = {
    "temperature": 0.7,
    "top_p": 0.9,
    "max_output_tokens": 250,
}

# ==========================================
# 🧠 SMART HEURISTICS (THE BACKUP ENGINE)
# ==========================================
def clean_attrs(attrs: dict) -> dict:
    return {
        "clothing_type": str(attrs.get("clothing_type", "Outfit")).strip() or "Outfit",
        "color": str(attrs.get("color", "")).strip() or "Neutral",
        "pattern": str(attrs.get("pattern", "")).strip() or "Solid",
        "style": str(attrs.get("style", "")).strip() or "Casual",
        "season": str(attrs.get("season", "")).strip() or "All Season",
        "occasion": str(attrs.get("occasion", "")).strip() or "Casual",
    }

def generate_heuristic_title(attrs: dict, raw_data: dict) -> str:
    cl = clean_attrs(attrs)
    c_type = cl["clothing_type"]
    color = cl["color"]
    style = cl["style"]
    color_l = color.lower()
    type_l  = c_type.lower() if c_type.lower() not in ("outfit", "") else "look"
    season_l  = cl["season"].lower()
    occasion_l = cl["occasion"].lower()
    pattern_l  = cl["pattern"].lower()

    # Use a deterministic seed so the same item always maps to the same title
    # but DIFFERENT items (different colors/styles) land on different templates.
    _seed = hash(f"{color_l}{type_l}{style.lower()}{season_l}") % 18

    # 18 distinct templates — never all the same pattern
    TITLE_TEMPLATES = [
        f"The {color_l.title()} Statement — A {style} {type_l.title()} For Every Moment.",
        f"Effortless {style} Energy in This {color_l.title()} {type_l.title()}.",
        f"Power Dressing Redefined: {color_l.title()} {type_l.title()} Meets {style} Soul.",
        f"A {season_l.title()} Essential — The {color_l.title()} {type_l.title()} You Need.",
        f"Understated Luxury: {color_l.title()} {type_l.title()} with {pattern_l.title()} Precision.",
        f"Wear Your Narrative — {color_l.title()} {style} {type_l.title()} For the Bold.",
        f"The Art of Dressing Well: {color_l.title()} {type_l.title()} in {style} Form.",
        f"Curated for {occasion_l.title()} — A {color_l.title()} {type_l.title()} that Speaks.",
        f"Modern Silhouette Alert: {style} {color_l.title()} {type_l.title()}.",
        f"Palette of the Season — {color_l.title()} {type_l.title()} Refined.",
        f"Style Intelligence: {color_l.title()} {pattern_l.title()} {type_l.title()} for {season_l.title()}.",
        f"From Archive to Runway — {color_l.title()} {style} {type_l.title()}.",
        f"The {occasion_l.title()} Edit: {color_l.title()} {type_l.title()} Done Right.",
        f"Minimal Effort, Maximum Impact — {color_l.title()} {type_l.title()}.",
        f"A {color_l.title()} {type_l.title()} That Defines Your {style} Identity.",
        f"Seasonal Masterpiece: {style} {color_l.title()} {type_l.title()}.",
        f"The {color_l.title()} Edit — {pattern_l.title()} Finish meets {style} Spirit.",
        f"Wardrobe Intelligence Unlocked: {color_l.title()} {type_l.title()} for {occasion_l.title()}.",
    ]
    return TITLE_TEMPLATES[_seed]


def generate_heuristic_description(attrs: dict, raw_data: dict) -> str:
    cl = clean_attrs(attrs)
    items = raw_data.get("detected_items", []) if raw_data else []
    filtered_items = [i for i in items if i.lower() not in ["outfit", "clothing", "apparel", "look"]]

    color_l   = cl["color"].lower()
    type_l    = cl["clothing_type"].lower() if cl["clothing_type"].lower() not in ("outfit", "") else "look"
    style_l   = cl["style"].lower()
    season_l  = cl["season"].lower()
    pattern_l = cl["pattern"].lower()
    occasion_l = cl["occasion"].lower()

    # Seed for determinism
    _seed = hash(f"{color_l}{style_l}{pattern_l}") % 6

    if len(filtered_items) >= 2:
        pieces = ", ".join(filtered_items[:-1]) + " and " + filtered_items[-1]
        item_part = f"The ensemble layers {pieces.lower()} into one cohesive {season_l} look."
    elif len(filtered_items) == 1 and filtered_items[0].lower() != type_l:
        item_part = f"The addition of a {filtered_items[0].lower()} elevates this {occasion_l} outfit effortlessly."
    else:
        item_part = f"The {pattern_l} finish and thoughtful cut make this a wardrobe anchor for any {season_l} occasion."

    DESC_OPENERS = [
        f"A vision of {style_l} sophistication, this {color_l} {type_l} commands attention from the first glance.",
        f"Fashion-forward and intentional — this {color_l} {type_l} captures the essence of {style_l} dressing.",
        f"Rooted in {style_l} sensibility, this {color_l} {type_l} is a study in quiet confidence.",
        f"Precision-cut and color-accurate, this {color_l} {type_l} embodies modern {occasion_l} elegance.",
        f"A {season_l} standout, this {color_l} {type_l} blends wearability with an unmistakable {style_l} edge.",
        f"Dressed for impact — this {color_l} {type_l} is a deliberate {style_l} statement for the discerning eye.",
    ]

    opener = DESC_OPENERS[_seed]
    return f"{opener} {item_part}"

def generate_heuristic_hashtags(attrs: dict):
    cl = clean_attrs(attrs)
    tags = ["#fashion", "#style", "#ootd"]
    if cl["clothing_type"] and cl["clothing_type"] != "Outfit":
        tags.append(f"#{cl['clothing_type'].replace(' ', '').lower()}")
    if cl["color"] and cl["color"] != "Neutral":
        tags.append(f"#{cl['color'].replace(' ', '').lower()}")
    if cl["style"] and cl["style"] != "Casual":
        tags.append(f"#{cl['style'].replace(' ', '').lower()}style")
    if cl["season"] and cl["season"] != "All Season":
        tags.append(f"#{cl['season'].replace(' ', '').lower()}fashion")
    return list(dict.fromkeys(tags))[:10]

def suggest_boards(attrs: dict):
    cl = clean_attrs(attrs)
    boards = ["Outfit Ideas", "Wardrobe Essentials"]
    if cl["clothing_type"] and cl["clothing_type"] != "Outfit":
        boards.append(f"{cl['clothing_type']} Styles")
    if cl["style"] == "Business Casual":
        boards.append("Office Wear")
    elif cl["style"] == "Streetwear":
        boards.append("Street Style")
    elif cl["style"] == "Formal":
        boards.append("Formal Collection")
    return list(dict.fromkeys(boards))[:4]

def get_fallback_content(attrs: dict, raw_data: dict) -> dict:
    """Returns content fully generated by local heuristics or detector output."""
    # IF the detector already successfully got a Gemini-vision generated title, use it!
    # (Checking if it's not the default fallback title)
    detector_title = attrs.get("generated_title")
    detector_desc = attrs.get("generated_desc")
    
    # Simple check: if detector title exists and doesn't look like our hardcoded BLIP fallback
    if detector_title and detector_desc and "Outfit" not in detector_title and detector_title.strip() != "":
        title = detector_title
        description = detector_desc
    else:
        title = generate_heuristic_title(attrs, raw_data)
        description = generate_heuristic_description(attrs, raw_data)

    return {
        "title": title,
        "description": description,
        "hashtags": generate_heuristic_hashtags(attrs),
        "suggested_boards": suggest_boards(attrs),
    }

def _parse_gemini_json(text: str) -> dict:
    """Robustly parse JSON from Gemini's response using regex."""
    text = text.strip()
    # Remove markdown code blocks
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to extract the first { ... } block
        match = re.search(r'(\{.*\})', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        raise ValueError("Could not extract valid JSON from Gemini response")

# ==========================================
# 🤖 MAIN GENERATOR (GEMINI + FALLBACK)
# ==========================================
def generate(attrs: dict, raw_data: dict = None) -> dict:
    if raw_data is None:
        raw_data = {}

    boards = suggest_boards(attrs)

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
    has_key = len(GEMINI_API_KEY) > 20
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"

    if raw_data.get("confidence") == "high" and attrs.get("generated_title"):
        logger.info("ContentGenerator: Propagating rich Vision-generated title directly.")
        return get_fallback_content(attrs, raw_data)

    if not has_key:
        logger.info("Gemini Key unavailable or invalid. Using Heuristic Generator.")
        return get_fallback_content(attrs, raw_data)

    try:
        prompt = f"""
        You are an expert Fashion E-commerce Copywriter.
        Based on these clothing attributes:
        - Type: {attrs.get('clothing_type')}
        - Color: {attrs.get('color')}
        - Pattern: {attrs.get('pattern')}
        - Style: {attrs.get('style')}
        - Season: {attrs.get('season')}
        - Occasion: {attrs.get('occasion')}

        Write engaging product metadata.
        Output STRICTLY as a valid JSON object with these exact keys:
        "title": A catchy, SEO-friendly product title (max 60 chars).
        "description": A 2-sentence engaging product description.
        "hashtags": An array of 4-5 relevant Instagram hashtags.
        """

        logger.info("Calling Google Gemini API for content generation with model=%s...", GEMINI_MODEL)

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                generate_text,
                api_key=GEMINI_API_KEY,
                model=GEMINI_MODEL,
                prompt=prompt,
            )
            try:
                response_text = future.result(timeout=15)
                generated_content = _parse_gemini_json(response_text)
            except concurrent.futures.TimeoutError:
                logger.error("Gemini API timed out. Activating fallback.")
                return get_fallback_content(attrs, raw_data)

        return {
            "title": generated_content.get("title", generate_heuristic_title(attrs, raw_data)),
            "description": generated_content.get("description", generate_heuristic_description(attrs, raw_data)),
            "hashtags": generated_content.get("hashtags", generate_heuristic_hashtags(attrs)),
            "suggested_boards": boards,
        }

    except Exception as e:
        error_msg = str(e).lower()
        if any(w in error_msg for w in ["404", "429", "quota", "exhausted", "limit"]):
            logger.error("Gemini unavailable or quota exhausted. Activating fallback.")
        else:
            logger.error("Gemini generation failed: %s. Activating fallback.", e)

        return get_fallback_content(attrs, raw_data)