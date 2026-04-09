"""
FashionVision — AI Stylist Chatbot
Provides style consultations based on the user's archive data.
"""
import os
import logging
from flask import Blueprint, request, jsonify
from api.rate_limit_compat import Limiter, get_remote_address

from api.auth_routes import _extract_token, _get_user_from_token
from api.supabase_client import get_supabase_admin
from api.ai.gemini_client import generate_text

chat_bp = Blueprint("chat", __name__)
logger = logging.getLogger(__name__)

# ── RATE LIMITER (Cost Protection) ──
limiter = Limiter(key_func=get_remote_address)

def _get_user_archive(user_id: str):
    """Fetch user's recent fashion items metadata for context."""
    try:
        supabase = get_supabase_admin()
        res = supabase.table("uploads") \
            .select("analysis") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(15) \
            .execute()
        
        items = []
        for row in res.data:
            a = row.get("analysis")
            if not isinstance(a, dict):
                continue
            attrs = a.get("attributes", {})
            if not isinstance(attrs, dict):
                continue
            items.append(f"{attrs.get('color', 'Unknown')} {attrs.get('clothing_type', 'item')} ({attrs.get('style', 'casual')})")
        return items
    except Exception as e:
        logger.error(f"Chat: archive fetch failed: {e}")
        return []

@chat_bp.route("/consult", methods=["POST"])
@limiter.limit("3 per minute")
def consult():
    """
    POST /api/chat/consult
    Body: { "message": "What should I wear for a formal meeting?" }
    """
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized."}), 401

    data = request.get_json(silent=True) or {}
    user_msg = data.get("message", "").strip()
    if not user_msg:
        return jsonify({"error": "Message is required."}), 400

    # 1. Fetch Context (User's Style)
    archive = _get_user_archive(user.id)
    style_context = ", ".join(archive) if archive else "No items in archive yet."

    # 2. Call Gemini
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        return jsonify({"error": "AI service currently unavailable (API key missing)."}), 503

    try:
        system_prompt = f"""
        You are 'Ethereal Stylist', an elite AI fashion consultant for the FashionVision platform.
        You give sophisticated, cinematic, and practical style advice.
        
        The user's current closet archive contains: [{style_context}]
        
        User's question: "{user_msg}"
        
        Rules:
        1. If they ask for recommendations, try to use items from their closet archive first.
        2. If they don't have suitable items, suggest what they should add.
        3. Keep the tone premium, elegant, and concise.
        4. Use terms like 'Silhouette', 'Palette', 'Composition', and 'Identity'.
        5. Limit response to 3-4 sentences.
        """
        
        response_text = generate_text(
            api_key=gemini_key,
            model="gemini-1.5-flash",
            prompt=system_prompt,
        )
        return jsonify({"response": response_text}), 200

    except Exception as e:
        logger.error(f"Chat: Gemini error: {str(e)}")
        return jsonify({"error": "Consultation failed. The AI stylist is temporarily unavailable."}), 500
