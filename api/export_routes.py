"""
FashionVision — Lookbook Export Engine
Generates a PDF summary of the user's fashion archive using ReportLab.
"""
import io
import logging
from flask import Blueprint, request, send_file, jsonify
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors

from api.auth_routes import _extract_token, _get_user_from_token
from api.supabase_client import get_supabase_admin

export_bp = Blueprint("export", __name__)
logger = logging.getLogger(__name__)

def _get_user_archive(user_id: str):
    """Fetch user's fashion items for the lookbook."""
    try:
        supabase = get_supabase_admin()
        res = supabase.table("uploads") \
            .select("image_url, analysis, created_at") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(30) \
            .execute()
        return res.data
    except Exception as e:
        logger.error(f"Export: archive fetch failed: {e}")
        return []

@export_bp.route("/lookbook", methods=["GET"])
def export_lookbook():
    """
    GET /api/export/lookbook
    Returns: PDF file stream
    """
    token = _extract_token(request)
    user = _get_user_from_token(token) if token else None
    if not user:
        return jsonify({"error": "Unauthorized."}), 401

    archive = _get_user_archive(user.id)
    if not archive:
        return jsonify({"error": "No items found to export."}), 404

    # ── PDF Generation ──────────────────────────────────────────────────────────
    try:
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        # 1. Header (Ethereal Title)
        c.setFont("Helvetica-Bold", 40)
        c.drawString(50, height - 100, "FASHIONVISION")
        
        c.setFont("Helvetica", 14)
        c.setStrokeColor(colors.black)
        c.line(50, height - 115, 200, height - 115)
        
        c.setFont("Helvetica-Oblique", 11)
        c.drawString(50, height - 135, f"Personal Style Archive Lookbook — {user.email}")
        
        y_cursor = height - 180
        item_spacing = 160
        
        # 2. Iterate Items
        for idx, row in enumerate(archive):
            if y_cursor < 150: # Trigger new page
                c.showPage()
                y_cursor = height - 80
            
            analysis = row.get("analysis") or {}
            attr = analysis.get("attributes", {}) if isinstance(analysis, dict) else {}
            content = analysis.get("content", {}) if isinstance(analysis, dict) else {}
            
            # Simple Text Info — Title from content block (where detector stores it)
            c.setFont("Helvetica-Bold", 12)
            item_title = content.get("title") or attr.get("clothing_type") or f"Item #{idx+1}"
            c.drawString(60, y_cursor, str(item_title)[:65])  # Truncate for safety
            
            c.setFont("Helvetica", 9)
            details = f"Type: {attr.get('clothing_type', 'N/A')} | Color: {attr.get('color', 'N/A')} | Style: {attr.get('style', 'N/A')}"
            c.drawString(60, y_cursor - 15, details)
            
            # Sustainability Badge
            sus = analysis.get("sustainability", {}) if isinstance(analysis, dict) else {}
            sus_score = sus.get("score") if isinstance(sus, dict) else None
            if sus_score is not None:
                c.setFont("Helvetica-BoldOblique", 8)
                c.setFillColor(colors.green if int(sus_score) > 60 else colors.grey)
                c.drawString(width - 150, y_cursor, f"ECO SCORE: {sus_score}/100")
                c.setFillColor(colors.black)

            c.line(60, y_cursor - 25, width - 60, y_cursor - 25)
            y_cursor -= 60  # Move down for next item

        c.save()
        buffer.seek(0)
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name="fashionvision_lookbook.pdf",
            mimetype="application/pdf"
        )

    except Exception as e:
        logger.exception(f"Export: PDF generation failed: {e}")
        return jsonify({"error": "PDF Lookbook generation failed internally."}), 500
