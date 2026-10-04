from flask import Blueprint, jsonify
from sqlalchemy import text
from app.extensions import db

health_bp = Blueprint("health", __name__, url_prefix="/api/health")


@health_bp.get("")
@health_bp.get("/")
def liveness():
    """Liveness probe: returns 200 without DB query."""
    return jsonify({"status": "ok", "service": "GearVault API"}), 200


@health_bp.get("/ready")
def readiness():
    """Readiness probe: verifies database connectivity."""
    try:
        db.session.execute(text("SELECT 1"))
        return jsonify({"status": "ready", "database": "connected"}), 200
    except Exception as e:
        return jsonify(
            {
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e),
            }
        ), 503
