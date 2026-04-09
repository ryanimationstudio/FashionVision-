"""
FashionVision - Flask Application Entry Point (PRODUCTION HARDENED + UI FIXED)
"""
import logging
import os
from flask import Flask, send_from_directory, render_template, jsonify, session, redirect, url_for, request
from functools import wraps
from flask_cors import CORS

from api.config import config
from api.auth_routes import auth_bp, limiter as auth_limiter
from api.upload_routes import upload_bp, limiter as upload_limiter
from api.schedule_routes import schedule_bp, limiter as schedule_limiter
from api.history_routes import history_bp
from api.palette_routes import palette_bp
from api.stats_routes import stats_bp
from api.chat_routes import chat_bp, limiter as chat_limiter
from api.export_routes import export_bp

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    os.environ.setdefault("HF_HOME", "/tmp/huggingface")
    os.environ.setdefault("TRANSFORMERS_CACHE", "/tmp/huggingface")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

    # Use HF token from either HF_TOKEN or HUGGINGFACE_TOKEN when provided.
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if hf_token:
        os.environ.setdefault("HF_TOKEN", hf_token)

    # ─── PATH RESOLUTION (STABLE) ───
    # We resolve from the root of the project to ensure templates/static are found.
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    app = Flask(
        __name__,
        root_path=base_dir, # This ensures Flask finds /templates and /static automatically
        static_url_path="/static"
    )

    # ---------------- CONFIG ----------------
    if not config.SECRET_KEY:
        raise RuntimeError("SECRET_KEY missing")

    app.secret_key = config.SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH
    app.url_map.strict_slashes = False
    app.config["RATELIMIT_STORAGE_URI"] = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

    IS_PRODUCTION = os.environ.get("FLASK_ENV", "development").lower() == "production"

    app.config.update(
        SESSION_COOKIE_SECURE=IS_PRODUCTION,  # True in prod (HTTPS only), False in dev
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        PERMANENT_SESSION_LIFETIME=900, # 15 Minutes (Tighter security)
    )

    # ---------------- CORS ----------------
    # Allow all subdomains and localhost for better developer experience
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # ---------------- RATE LIMIT ----------------
    auth_limiter.init_app(app)
    upload_limiter.init_app(app)
    schedule_limiter.init_app(app)
    chat_limiter.init_app(app)

    # ---------------- UI HELPERS ----------------
    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not session.get("user_id"):
                # SIGNAL: Session is dead. Add param so frontend clears its token.
                return redirect(url_for("login_page", session_expired=1))
            return f(*args, **kwargs)
        return decorated_function

    @app.after_request
    def add_security_headers(response):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    # ---------------- BLUEPRINTS ----------------
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(upload_bp, url_prefix="/api/upload")
    app.register_blueprint(schedule_bp, url_prefix="/api/schedule")
    app.register_blueprint(history_bp, url_prefix="/api/history")
    app.register_blueprint(palette_bp, url_prefix="/api/palette")
    app.register_blueprint(stats_bp, url_prefix="/api/stats")
    app.register_blueprint(chat_bp, url_prefix="/api/chat")
    app.register_blueprint(export_bp, url_prefix="/api/export")

    # ---------------- UI ROUTES (FIXED) ----------------
    
    @app.route("/")
    def home():
        # THE CINEMATIC LANDING
        return render_template("home.html")

    @app.route("/dashboard")
    @app.route("/app")
    @login_required
    def dashboard():
        # THE ETHEREAL PHYSICS WORKSPACE
        return render_template("dashboard.html")

    @app.route("/analyze")
    def analyze_legacy():
        # REDIRECT TO SIGNUP (NEW WORKFLOW)
        from flask import redirect
        return redirect("/signup")

    @app.route("/login")
    def login_page():
        if session.get("user_id"):
            return redirect(url_for("dashboard"))
        return render_template("login.html")

    @app.route("/signup")
    def signup_page():
        if session.get("user_id"):
            return redirect(url_for("dashboard"))
        return render_template("signup.html")

    @app.route("/history")
    @login_required
    def history_page():
        return render_template("history.html")

    @app.route("/analytics")
    @login_required
    def analytics_page():
        return render_template("analytics.html")

    # ---------------- SPECIAL ASSETS ----------------
    
    @app.route("/uploads/<path:filename>")
    def serve_uploads(filename):
        return send_from_directory("/tmp", filename)

    @app.route('/favicon.ico')
    def favicon():
        try:
            return send_from_directory(app.static_folder, 'favicon.ico')
        except Exception:
            return '', 204  # No content — suppress 404 noise

    # ---------------- HEALTH ----------------
    @app.route("/api/health")
    def health():
        missing = config.validate()
        return jsonify({
            "status": "ok" if not missing else "degraded",
            "missing_env": missing
        })

    @app.route("/api/weather")
    def get_weather():
        """Live weather integration via OpenWeather API."""
        api_key = os.environ.get("OPENWEATHER_API_KEY", "").strip()
        if not api_key:
            return jsonify({"temp": 24, "condition": "Mocked", "style_advice": "Ideal for linen blazers."})

        import urllib.request
        import json
        
        # Fixed city for stable cinematic context, or can be dynamic
        city = request.args.get("city", "Delhi")
        url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}&units=metric"
        
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json.loads(resp.read())
                temp = round(data["main"]["temp"])
                condition = data["weather"][0]["main"]
                
                # Dynamic Logic
                if temp < 15:
                    advice = "Structure with Heavy Wool or Leather."
                elif temp < 25:
                    advice = "Composition: Light Layers & Knits."
                else:
                    advice = "Breathe with Natural Silk or Linen."
                
                return jsonify({
                    "temp": temp,
                    "condition": condition,
                    "style_advice": advice,
                    "city": city
                })
        except Exception as e:
            logger.error(f"Weather Engine Fault: {e}")
            # HARD FALLBACK (Emergency Protocol)
            return jsonify({
                "temp": 24, 
                "condition": "Stable", 
                "style_advice": "Ideal for linen blazers or light palettes.",
                "city": "Unknown"
            })

    # ---------------- ERROR HANDLING ----------------
    @app.errorhandler(404)
    def handle_404(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(413)
    def handle_413(e):
        return jsonify({"error": "Payload exceeds maximum allowed size."}), 413

    @app.errorhandler(429)
    def handle_429(e):
        return jsonify({"error": "Too many requests."}), 429

    @app.errorhandler(Exception)
    def handle_exception(e):
        logger.exception("Unhandled exception: %s", e)
        # SECURITY: Never expose str(e) to clients — may leak internal details
        return jsonify({"error": "An internal server error occurred."}), 500

    return app


app = create_app()

if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, host="0.0.0.0", port=5000)