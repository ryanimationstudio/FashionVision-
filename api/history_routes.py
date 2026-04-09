"""
FashionVision - History Routes (ORCHESTRATED PRODUCTION VERSION)
"""
import logging
import uuid
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from api.rate_limit_compat import Limiter, get_remote_address

from api.supabase_client import get_supabase
from api.config import config
from api.auth_routes import _extract_token, _get_user_from_token

history_bp = Blueprint("history", __name__)
logger = logging.getLogger(__name__)

# Pattern: Exported for init_app(app) in factory
limiter = Limiter(key_func=get_remote_address)



@history_bp.route("/", methods=["GET"])
@limiter.limit("20 per minute")
def get_history():
    """
    Retrieves user's upload history from the single source of truth (uploads table).
    - Rate Limited: 20/min
    - Secure user scoping
    - No cross-table merging (eliminates duplicates)
    """
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized access."}), 401

    # Parameter Normalization
    try:
        limit = min(max(int(request.args.get("limit", 50)), 1), 100)
        offset = max(int(request.args.get("offset", 0)), 0)
        sort_dir = request.args.get("sort", "desc").lower()
        ascending = (sort_dir == "asc")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid query parameters."}), 400

    try:
        supabase = get_supabase()
        resp = (
            supabase.table(config.UPLOADS_TABLE)
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=not ascending)
            .range(offset, offset + limit - 1)
            .execute()
        )
        uploads_list = resp.data or []

        # Count today's uploads for the frontend limit display
        today_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00+00:00")
        count_res = (
            supabase.table(config.UPLOADS_TABLE)
            .select("id", count="exact")
            .eq("user_id", user.id)
            .gte("created_at", today_start)
            .execute()
        )
        uploads_today = count_res.count if count_res.count is not None else len(count_res.data or [])

        return jsonify({
            "history": uploads_list,
            "uploads": uploads_list,
            "scheduled": [],
            "uploads_today": uploads_today,
            "daily_limit": 10,
            "params": {
                "limit": limit,
                "offset": offset,
                "sort": "asc" if ascending else "desc"
            }
        }), 200

    except Exception as e:
        logger.error(f"Critical History Retrieval Error: {e}")
        return jsonify({"error": "Platform error occurred during data synchronization."}), 500

@history_bp.route("/<item_id>", methods=["DELETE"])
@limiter.limit("10 per minute")
def delete_history_item(item_id):
    """
    Secure permanent resource removal with strict ID validation.
    - Rate Limited: 10/min
    - UUID Format Enforced
    - Scoped delete (User ID check)
    """
    # 1. Verification
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized access."}), 401

    # 2. Resource ID Validation
    try:
        uuid.UUID(str(item_id))
    except (ValueError, TypeError):
        return jsonify({"error": "Malformed resource identifier."}), 400

    supabase = get_supabase()
    
    try:
        logger.info(f"Deletion Protocol: User {user.id} requested removal of {item_id}")

        # Attempt Deletion: Primary History Table
        res = (
            supabase.table(config.FASHION_HISTORY_TABLE)
            .delete()
            .eq("id", item_id)
            .eq("user_id", user.id)
            .execute()
        )
        
        # Fallback Cleanup: Uploads Table
        if not res.data:
            res = (
                supabase.table(config.UPLOADS_TABLE)
                .delete()
                .eq("id", item_id)
                .eq("user_id", user.id)
                .execute()
            )

        if not res.data:
            return jsonify({"error": "Source not found or access restricted."}), 404
            
        return jsonify({"message": "Successfully synchronized resource deletion."}), 200

    except Exception as e:
        logger.error(f"Deletion Failure for item {item_id}: {e}")
        return jsonify({"error": "Platform error during secure synchronization."}), 500