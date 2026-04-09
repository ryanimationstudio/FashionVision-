"""
FashionVision — Trend Analytics Routes
Aggregates upload metadata to reveal style trends & distributions.
Pure Supabase queries — no extra libraries needed.
"""
import logging
from collections import Counter
from flask import Blueprint, request, jsonify

from api.config import config
from api.supabase_client import get_supabase
from api.auth_routes import _extract_token, _get_user_from_token

stats_bp = Blueprint("stats", __name__)
logger = logging.getLogger(__name__)


def _require_user(req):
    token = _extract_token(req)
    return _get_user_from_token(token) if token else None


@stats_bp.route("/summary", methods=["GET"])
def get_summary():
    """
    GET /api/stats/summary
    Returns aggregated style, color, clothing_type counts for the authenticated user.
    Used by the Trend Analytics dashboard.
    """
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized."}), 401

    supabase = get_supabase()
    try:
        res = (
            supabase.table(config.UPLOADS_TABLE)
            .select("style, color, clothing_type, created_at")
            .eq("user_id", str(user.id))
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
    except Exception as e:
        logger.exception("Stats query failed: %s", e)
        return jsonify({"error": "Could not fetch stats."}), 500

    rows = res.data or []
    total = len(rows)

    if total == 0:
        return jsonify({
            "total": 0, "styles": [], "colors": [], "clothing_types": [], "monthly": []
        }), 200

    # ── Aggregations ──────────────────────────────────────────────────────────
    styles = Counter(r["style"] for r in rows if r.get("style"))
    colors = Counter(r["color"] for r in rows if r.get("color"))
    types  = Counter(r["clothing_type"] for r in rows if r.get("clothing_type"))

    # Monthly upload frequency (last 6 months)
    from collections import defaultdict
    monthly: dict[str, int] = defaultdict(int)
    for r in rows:
        ts = (r.get("created_at") or "")[:7]  # "YYYY-MM"
        if ts:
            monthly[ts] += 1

    def _to_list(counter: Counter, top: int = 8):
        return [
            {"label": k, "count": v, "pct": round(v / total * 100, 1)}
            for k, v in counter.most_common(top)
        ]

    return jsonify({
        "total": total,
        "styles":         _to_list(styles),
        "colors":         _to_list(colors),
        "clothing_types": _to_list(types),
        "monthly": [
            {"month": m, "count": c}
            for m, c in sorted(monthly.items())[-6:]
        ],
    }), 200


@stats_bp.route("/timeline", methods=["GET"])
def get_timeline():
    """
    GET /api/stats/timeline
    Returns month-by-month dominant style — the "Style Evolution" view.
    """
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized."}), 401

    supabase = get_supabase()
    try:
        res = (
            supabase.table(config.UPLOADS_TABLE)
            .select("style, created_at")
            .eq("user_id", str(user.id))
            .order("created_at")
            .limit(300)
            .execute()
        )
    except Exception as e:
        logger.exception("Timeline query failed: %s", e)
        return jsonify({"error": "Could not fetch timeline."}), 500

    rows = res.data or []

    from collections import defaultdict
    monthly: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        month = (r.get("created_at") or "")[:7]
        style = r.get("style", "Unknown")
        if month and style:
            monthly[month][style] += 1

    timeline = []
    for month in sorted(monthly.keys()):
        dominant_style, count = monthly[month].most_common(1)[0]
        timeline.append({
            "month": month,
            "dominant_style": dominant_style,
            "count": count,
            "all_styles": dict(monthly[month])
        })

    return jsonify({"timeline": timeline[-12:]}), 200  # Last 12 months
