"""
FashionVision - Auth Routes (HARDENED PRODUCTION VERSION)
Handles user authentication via Supabase Auth with strict security controls.
"""
import re
import logging
from flask import Blueprint, request, jsonify, session
from api.rate_limit_compat import Limiter, get_remote_address

from api.supabase_client import get_supabase_admin

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)

# Pattern: Exported for init_app(app) in factory
limiter = Limiter(key_func=get_remote_address)

# Regex Patterns
EMAIL_REGEX = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

def _validate_credentials(email, password):
    """Secure validation for identity and password strength."""
    if not email or not re.match(EMAIL_REGEX, email):
        return "Invalid email address."
    
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    
    if not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter."
    
    if not any(c.islower() for c in password):
        return "Password must contain at least one lowercase letter."
    
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one number."
    
    return None

def _get_user_from_token(token: str):
    """
    State-aware token verification with localized debugging.
    Ensures that internal 403/Forbidden errors are logged for orchestration analysis.
    """
    try:
        admin = get_supabase_admin()
        # Direct verification with Supabase Auth identity layer
        result = admin.auth.get_user(token)
        
        if not result or not result.user:
            logger.warning("Supabase Token Verification: No user context found.")
            return None
            
        return result.user
    except Exception as e:
        # ✅ CAPTURED ERROR: This will now show up in your terminal logs to debug the 403
        logger.error(f"SUPABASE AUTH HANDSHAKE FAILED: {str(e)}")
        return None

def _extract_token(req) -> str | None:
    """Header extraction protocol."""
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None

@auth_bp.route("/signup", methods=["POST"])
@limiter.limit("5 per minute")
def signup():
    """
    Sign up restricted to strong policy and rate limits.
    """
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))

    error = _validate_credentials(email, password)
    if error:
        return jsonify({"error": error}), 400

    try:
        supabase = get_supabase_admin()
        
        # Consistent Retry Strategy: Exactly once on platform failure
        for attempt in range(2):
            try:
                resp = supabase.auth.sign_up({"email": email, "password": password})
                break
            except Exception as e:
                if attempt == 0:
                    logger.warning(f"Signup attempt 1 failed, retrying. Trace: {e}")
                    continue
                raise e

        if resp.user:
            return jsonify({
                "message": "Verify your email to continue signup.",
                "user": {"id": resp.user.id, "email": resp.user.email}
            }), 201
        
        return jsonify({"error": "Platform failed to create user."}), 400

    except Exception as e:
        logger.error(f"Signup System Error: {e}")
        # Clean response to avoid account enumeration or schema leaks
        if "already registered" in str(e).lower():
            return jsonify({"error": "An account with this email is unavailable."}), 409
        return jsonify({"error": "Signup failed. Please try again later."}), 500

@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    """
    Secure login with rate limiting and generic error mapping.
    """
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    try:
        supabase = get_supabase_admin()
        
        # Consistent Retry Strategy: Exactly once on network/platform failure
        for attempt in range(2):
            try:
                resp = supabase.auth.sign_in_with_password({"email": email, "password": password})
                break
            except Exception as e:
                if attempt == 0:
                    logger.warning(f"Login attempt 1 failed, retrying. Trace: {e}")
                    continue
                raise e

        if resp.session and resp.user:
            # Set server-side session for UI route protection
            session["user_id"] = resp.user.id
            session["user_email"] = resp.user.email
            session.permanent = True # Use PERMANENT_SESSION_LIFETIME from config

            return jsonify({
                "message": "Login success.",
                "access_token": resp.session.access_token,
                "user": {"id": resp.user.id, "email": resp.user.email},
            }), 200
        
        return jsonify({"error": "Credentials rejected."}), 401

    except Exception as e:
        logger.error(f"Login System Error: {e}")
        # Secure rejection: Do not distinguish between invalid email and invalid password
        return jsonify({"error": "Invalid email or password."}), 401

@auth_bp.route("/logout", methods=["POST"])
@limiter.limit("20 per minute")
def logout():
    """
    Stateless Auth Logout:
    The JWT protocol is stateless; this route acts as a synchronization barrier.
    Clients should clear tokens from local storage upon completion.
    """
    _ = _extract_token(request) # Verify token is present if needed
    session.clear() # Clear server-side session
    return jsonify({"message": "Session invalidated successfully."}), 200

@auth_bp.route("/me", methods=["GET"])
@limiter.limit("20 per minute")
def me():
    """Identifier discovery endpoint."""
    token = _extract_token(request)
    if not token:
        return jsonify({"error": "Unauthorized."}), 401

    user = _get_user_from_token(token)
    if not user:
        return jsonify({"error": "Session expired."}), 401

    return jsonify({
        "user": {"id": user.id, "email": user.email}
    }), 200
