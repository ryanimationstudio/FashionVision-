"""
FashionVision - Upload Routes (AI OPTIMIZED + USAGE TRACKING)
Orchestrates parallel storage, AI analysis, and usage limits.
"""
import io
import uuid
import time
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from flask import Blueprint, request, jsonify
from api.rate_limit_compat import Limiter, get_remote_address
from PIL import Image
from datetime import datetime, timezone

from api.config import config
from api.supabase_client import get_supabase
from api.auth_routes import _extract_token, _get_user_from_token
from api.ai.analyzer import analyze
from api.ai.fashion_validator import validate_fashion_image

upload_bp = Blueprint("upload", __name__)
logger = logging.getLogger(__name__)

# Extensions & Limits
limiter = Limiter(key_func=get_remote_address)
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_IMAGE_BYTES = 16 * 1024 * 1024
DAILY_UPLOAD_LIMIT = 10

def _allowed_file(filename: str) -> bool:
    if not filename:
        return False
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def _process_image(image_bytes: bytes) -> tuple[bytes, bytes]:
    """Dual-Path Image Processing for Storage and AI Models"""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            if img.mode != "RGB":
                img = img.convert("RGB")
            
            # --- Path 1: High-Res Storage ---
            hi_res_img = img.copy()
            hi_res_img.thumbnail((1500, 1500), Image.Resampling.LANCZOS)
            hi_res_io = io.BytesIO()
            hi_res_img.save(hi_res_io, format="JPEG", quality=85, optimize=True)
            hi_res_data = hi_res_io.getvalue()

            # --- Path 2: AI Model Input ---
            model_img = img.resize((224, 224), Image.Resampling.LANCZOS)
            model_io = io.BytesIO()
            model_img.save(model_io, format="JPEG", quality=75)
            model_data = model_io.getvalue()

            return hi_res_data, model_data
    except Exception as e:
        logger.error(f"Image processing failure: {e}")
        return image_bytes, image_bytes  # Fallback to raw

def _reliable_storage_upload(supabase, image_bytes, ext, mime_type, user_id):
    """Parallelized storage upload routine."""
    for attempt in range(2):
        start_time = time.time()
        try:
            filename = f"{user_id}/{uuid.uuid4()}.{ext}"
            bucket = config.STORAGE_BUCKET
            
            supabase.storage.from_(bucket).upload(
                path=filename,
                file=image_bytes,
                file_options={"content-type": mime_type, "upsert": "false"},
            )
            url = supabase.storage.from_(bucket).get_public_url(filename)
            duration = time.time() - start_time
            logger.info(f"Storage Upload success [Attempt {attempt+1}] - {duration:.2f}s")
            return filename, url
        except Exception as e:
            if attempt == 0:
                logger.warning(f"Storage retry triggered for user {user_id}")
                continue
            raise e

def _reliable_ai_analyze(image_bytes):
    """Parallelized AI analysis involving BLIP-VQA and HEURISTICS."""
    for attempt in range(2):
        start_time = time.time()
        try:
            result = analyze(image_bytes)
            duration = time.time() - start_time
            logger.info(f"AI Pipeline success [Attempt {attempt+1}] - {duration:.2f}s")
            return result
        except Exception as e:
            if attempt == 0:
                logger.warning("AI retry triggered due to platform exception")
                continue
            raise e

# ==========================================
# 🟢 1. USAGE TRACKING API (For Frontend HUD)
# ==========================================
@upload_bp.route("/usage", methods=["GET"])
def get_usage_stats():
    """Returns the current day's upload count for the user."""
    try:
        token = _extract_token(request)
        user = _get_user_from_token(token) if token else None
        if not user:
            return jsonify({"error": "Unauthorized."}), 401

        supabase = get_supabase()
        today_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00+00:00")
        
        count_res = (
            supabase.table(config.UPLOADS_TABLE)
            .select("id", count="exact")
            .eq("user_id", user.id)
            .gte("created_at", today_start)
            .execute()
        )
        
        daily_count = count_res.count if count_res.count is not None else len(count_res.data or [])

        return jsonify({
            "uploads_today": daily_count,
            "daily_limit": DAILY_UPLOAD_LIMIT
        }), 200

    except Exception as e:
        logger.error(f"Usage API Error: {e}")
        return jsonify({"error": "Failed to fetch usage stats"}), 500


# ==========================================
# 🟢 2. MAIN UPLOAD & ANALYZE API
# ==========================================
@upload_bp.route("/analyze", methods=["POST"])
@upload_bp.route("/", methods=["POST"])
@limiter.limit("5 per minute")
def upload_image():
    """Optimized Upload & Analysis Flow with ThreadPool fixes."""
    image_path = None
    supabase = get_supabase()
    
    try:
        # 1. Identity Verification
        token = _extract_token(request)
        user = _get_user_from_token(token) if token else None
        if not user:
            return jsonify({"error": "Unauthorized."}), 401

        # 1b. Daily upload limit check
        try:
            today_start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00+00:00")
            count_res = (
                supabase.table(config.UPLOADS_TABLE)
                .select("id", count="exact")
                .eq("user_id", user.id)
                .gte("created_at", today_start)
                .execute()
            )
            daily_count = count_res.count if count_res.count is not None else len(count_res.data or [])
            if daily_count >= DAILY_UPLOAD_LIMIT:
                return jsonify({
                    "error": "Daily upload limit reached.",
                    "reason": f"You can upload a maximum of {DAILY_UPLOAD_LIMIT} images per day.",
                    "uploads_today": daily_count,
                    "limit": DAILY_UPLOAD_LIMIT
                }), 429
        except Exception as lim_err:
            logger.warning(f"Daily limit check failed (non-blocking): {lim_err}")

        # 2. Input Sanity
        if "file" not in request.files:
            return jsonify({"error": "No file provided."}), 400
        file = request.files["file"]
        if not _allowed_file(file.filename):
            return jsonify({"error": "Invalid file format. Allowed: png, jpg, jpeg, webp"}), 400

        # 3. Security Gate (Raw Bytes)
        raw_bytes = file.read()
        if len(raw_bytes) == 0:
            return jsonify({"error": "Empty file."}), 400
        if len(raw_bytes) > MAX_IMAGE_BYTES:
            return jsonify({"error": "Image too large."}), 413

        try:
            policy = validate_fashion_image(raw_bytes)
        except Exception as val_err:
            logger.exception("Validator raised an exception: %s", val_err)
            return jsonify({"error": "Content validation failed."}), 400

        if not policy.get("is_fashion", False):
            return jsonify({
                "error": "Non-fashion content rejected.",
                "detected_subject": policy.get("detected_subject", "unknown"),
                "reason": policy.get("reason", "Content does not meet standards."),
            }), 400

        # 4. Preprocessing
        try:
            hi_res_data, model_data = _process_image(raw_bytes)
        except Exception as e:
            logger.error(f"Processing crash: {e}")
            return jsonify({"error": "Failed to process image."}), 400

        image_ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else "jpg"
        mime_type = f"image/{image_ext}" if image_ext != "jpg" else "image/jpeg"

        # 5. Orchestration (ThreadPool Timeout Fix Applied)
        executor = ThreadPoolExecutor(max_workers=2)
        ai_task = executor.submit(_reliable_ai_analyze, model_data)
        storage_task = executor.submit(_reliable_storage_upload, supabase, hi_res_data, image_ext, mime_type, user.id)
        
        try:
            analysis = ai_task.result(timeout=120)
            image_path, image_url = storage_task.result(timeout=10)
        except TimeoutError:
            logger.error("Platform Timeout during AI Analysis/Storage")
            executor.shutdown(wait=False, cancel_futures=True) 
            return jsonify({"error": "Processing timed out (Internal AI overhead)."}), 504
        except Exception as e:
            logger.error(f"Internal Task Failure: {e}")
            executor.shutdown(wait=False, cancel_futures=True)
            return jsonify({"error": "Service failure."}), 502
            
        executor.shutdown(wait=False)

        # 6. DB Metadata Persistence
        try:
            attrs = analysis.get("attributes", {})
            content = analysis.get("content", {})
            
            record = {
                "user_id": user.id,
                "image_path": image_path,
                "image_url": image_url,
                "clothing_type": attrs.get("clothing_type", ""),
                "color": attrs.get("color", ""),
                "style": attrs.get("style", ""),
                "title": content.get("title", ""),
                "description": content.get("description", ""),
                "hashtags": content.get("hashtags", []),
            }

            db_res = supabase.table(config.UPLOADS_TABLE).insert(record).execute()
            saved_id = db_res.data[0]["id"] if db_res.data else None
            
            return jsonify({
                "message": "Analysis successful.",
                "id": saved_id,
                "image_url": image_url,
                "analysis": analysis
            }), 200

        except Exception as db_ex:
            logger.error(f"Sync error: Rollback {image_path}. {db_ex}")
            if image_path:
                try:
                    supabase.storage.from_(config.STORAGE_BUCKET).remove([image_path])
                except Exception: pass
            return jsonify({"error": "State synchronization failed."}), 500

    except Exception as e:
        logger.exception(f"Unhandled Orchestration Error: {e}")
        return jsonify({"error": "Platform error."}), 500


# ==========================================
# 🟢 3. LIGHTWEIGHT VALIDATION API
# ==========================================
@upload_bp.route("/validate-image", methods=["POST"])
@limiter.limit("20 per minute")
def validate_image_only():
    """Lightweight fashion validation endpoint — no storage, no DB write."""
    try:
        token = _extract_token(request)
        user = _get_user_from_token(token) if token else None
        if not user:
            return jsonify({"error": "Unauthorized."}), 401

        if "file" not in request.files:
            return jsonify({"error": "No file provided."}), 400

        file = request.files["file"]
        if not _allowed_file(file.filename):
            return jsonify({"error": "Invalid file format. Allowed: png, jpg, jpeg, webp"}), 400

        raw_bytes = file.read()
        if len(raw_bytes) == 0:
            return jsonify({"error": "Empty file."}), 400
        if len(raw_bytes) > MAX_IMAGE_BYTES:
            return jsonify({"error": "Image too large."}), 413

        try:
            result = validate_fashion_image(raw_bytes)
        except Exception as val_err:
            logger.exception("validate-image: validator error — %s", val_err)
            return jsonify({"is_fashion": False, "reason": "Validation error."}), 400

        return jsonify({
            "is_fashion": result.get("is_fashion", False),
            "reason": result.get("reason", ""),
            "detected_subject": result.get("detected_subject", ""),
        }), 200

    except Exception as e:
        logger.exception("validate-image: unhandled error — %s", e)
        return jsonify({"error": "Platform error."}), 500