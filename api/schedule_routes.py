"""
FashionVision - Schedule Routes (ORCHESTRATED PRODUCTION VERSION)
"""
from datetime import datetime, timezone
import logging
from flask import Blueprint, request, jsonify
from api.rate_limit_compat import Limiter, get_remote_address

from api.supabase_client import get_supabase
from api.config import config
from api.auth_routes import _extract_token, _get_user_from_token

schedule_bp = Blueprint("schedule", __name__)
logger = logging.getLogger(__name__)

# Limiter Initialization (Pattern: exported for init_app(app) in factory)
limiter = Limiter(key_func=get_remote_address)

def _normalize_hashtags(hashtags) -> list:
    """Consolidates varying hashtag inputs into a clean list of strings."""
    if isinstance(hashtags, str):
        return [tag.strip() for tag in hashtags.split(",") if tag.strip()]
    if isinstance(hashtags, list):
        return [str(tag).strip() for tag in hashtags if str(tag).strip()]
    return []

@schedule_bp.route("/", methods=["POST"])
@limiter.limit("10 per minute")
def save_schedule():
    """
    Saves a scheduled record with strict validation and normalization.
    """
    # 1. Authentication
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized access."}), 401

    # 2. Extract and Sanitize Input
    data = request.get_json(silent=True) or {}
    
    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    raw_time = data.get("scheduled_time")

    # 3. Validation: Field Constraints
    if len(title) < 3 or len(title) > 200:
        return jsonify({"error": "Title must be between 3 and 200 characters."}), 400
    
    if not raw_time:
        return jsonify({"error": "Scheduled time is mandatory."}), 400

    # 4. Validation: Temporal Integrity (Future UTC)
    try:
        # Support ISO 8601 with Z suffix
        if isinstance(raw_time, str) and raw_time.endswith('Z'):
            raw_time = raw_time.replace('Z', '+00:00')
            
        dt = datetime.fromisoformat(raw_time)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
            
        if dt <= datetime.now(timezone.utc):
            return jsonify({"error": "Scheduled time must be in the future."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid time format. Use ISO 8601."}), 400

    # 5. Normalization
    hashtags = _normalize_hashtags(data.get("hashtags"))

    # 6. Persistence
    record = {
        "user_id": user.id,
        "image_path": data.get("image_path", ""),
        "image_url": data.get("image_url", ""),
        "title": title,
        "description": description,
        "hashtags": hashtags,
        "board_id": data.get("board_id", ""),
        "scheduled_time": dt.isoformat(),
        "status": "pending",
        "published_at": None,
    }

    try:
        supabase = get_supabase()
        result = supabase.table(config.SCHEDULED_PINS_TABLE).insert(record).execute()

        if not result.data:
            return jsonify({"error": "Persistence failure."}), 500

        return jsonify({
            "message": "Content successfully scheduled.",
            "record": result.data[0]
        }), 201

    except Exception as ex:
        logger.error(f"Persistence error for {user.id}: {ex}")
        return jsonify({"error": "Internal platform error while saving schedule."}), 500

@schedule_bp.route("/", methods=["GET"])
def get_scheduled():
    """
    Fetches user's scheduled records with:
    - Pagination (limit, offset)
    - Sorting (sort: asc/desc)
    - Filtering (status: pending/published/etc.)
    """
    # 1. Authentication
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized access."}), 401

    # 2. Query Parameters
    try:
        limit = min(int(request.args.get("limit", 10)), 100)
        offset = max(int(request.args.get("offset", 0)), 0)
        
        # Sort logic
        sort_dir = request.args.get("sort", "desc").lower()
        ascending = (sort_dir == "asc")
        
        # Filter logic
        status_filter = request.args.get("status")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid query parameters."}), 400

    # 3. Secure Retrieval
    try:
        supabase = get_supabase()
        query = (
            supabase.table(config.SCHEDULED_PINS_TABLE)
            .select("*")
            .eq("user_id", user.id)
        )
        
        # Optional Status Filtering
        if status_filter:
            query = query.eq("status", status_filter)
            
        # Refined Order & Execution
        result = (
            query
            .order("scheduled_time", desc=not ascending)
            .range(offset, offset + limit - 1)
            .execute()
        )
        
        return jsonify({
            "scheduled": result.data or [],
            "count": len(result.data) if result.data else 0,
            "params": {
                "limit": limit,
                "offset": offset,
                "sort": "asc" if ascending else "desc",
                "status": status_filter
            }
        }), 200

    except Exception as ex:
        logger.error(f"Retrieval error for user {user.id}: {ex}")
        return jsonify({"error": "Internal platform error while fetching data."}), 500
