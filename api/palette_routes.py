"""
FashionVision — Palette Genius
Extracts top 5 dominant colours from any image URL.
Pure stdlib + Pillow — no external 'colorthief' needed.
"""
import io
import logging
import urllib.request
from collections import Counter
from flask import Blueprint, request, jsonify

from api.auth_routes import _extract_token, _get_user_from_token

palette_bp = Blueprint("palette", __name__)
logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _fetch_image_bytes(url: str) -> bytes:
    """Download image bytes from a URL (Supabase public URL)."""
    req = urllib.request.Request(url, headers={"User-Agent": "FashionVision/1.0"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        return resp.read()

def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"

def _extract_palette(image_bytes: bytes, n_colors: int = 5) -> list[dict]:
    """
    Extract the top N dominant colours using PIL quantization.
    Returns list of { hex, rgb, name } dicts sorted by dominance.
    """
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # Resize for speed — we only need statistical colour properties
    img = img.resize((150, 150))

    # PIL quantize gives us a palette-mapped image
    quantized = img.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    palette_data = quantized.getpalette()           # flat [R,G,B, R,G,B, ...]

    # Count pixel frequency per palette index
    pixel_counts = Counter(quantized.getdata())

    results = []
    for idx, count in pixel_counts.most_common(n_colors):
        r = palette_data[idx * 3]
        g = palette_data[idx * 3 + 1]
        b = palette_data[idx * 3 + 2]
        # Skip near-white and near-black (background artefacts)
        if r > 240 and g > 240 and b > 240:
            continue
        if r < 15 and g < 15 and b < 15:
            continue
        results.append({
            "hex": _rgb_to_hex(r, g, b),
            "rgb": [r, g, b],
            "weight": round(count / (150 * 150), 3)
        })

    return results[:n_colors]


# ── Route ─────────────────────────────────────────────────────────────────────

@palette_bp.route("/extract", methods=["POST"])
def extract_palette():
    """
    POST /api/palette/extract
    Body: { "image_url": "https://..." }
    Returns: { "palette": [{ "hex": "#C0392B", "rgb": [192,57,43], "weight": 0.12 }, ...] }
    """
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized."}), 401

    body = request.get_json(silent=True) or {}
    image_url = body.get("image_url", "").strip()
    if not image_url:
        return jsonify({"error": "image_url is required."}), 400

    try:
        image_bytes = _fetch_image_bytes(image_url)
    except Exception as e:
        logger.warning("Palette: could not fetch image: %s", e)
        return jsonify({"error": "Could not fetch image."}), 422

    try:
        palette = _extract_palette(image_bytes)
    except Exception as e:
        logger.exception("Palette extraction failed: %s", e)
        return jsonify({"error": "Palette extraction failed."}), 500

    return jsonify({"palette": palette}), 200
