import logging
import os
import sys
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import get_config
from app.extensions import bcrypt, cors, db, jwt, limiter, migrate
from app.routes.auth import auth_bp
from app.routes.catalog import catalog_bp
from app.routes.health import health_bp
from app.routes.uploads import uploads_bp

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__)

    # Apply configuration class
    config_cls = get_config()
    app.config.from_object(config_cls)

    if test_config:
        app.config.update(test_config)

    is_testing = (
        app.config.get("TESTING")
        or os.getenv("TESTING", "").lower() in ("true", "1", "yes")
    )

    # Configure structured logging to stdout
    log_level_name = app.config.get("LOG_LEVEL", os.getenv("LOG_LEVEL", "INFO")).upper()
    log_level = getattr(logging, log_level_name, logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )
    app.logger.setLevel(log_level)

    # Reverse proxy middleware for correct IP / scheme behind ALB / CloudFront (CloudFront + ALB = 2 hops)
    x_for = int(os.getenv("PROXY_FIX_FOR", "2"))
    x_proto = int(os.getenv("PROXY_FIX_PROTO", "1"))
    x_host = int(os.getenv("PROXY_FIX_HOST", "1"))
    x_port = int(os.getenv("PROXY_FIX_PORT", "1"))
    x_prefix = int(os.getenv("PROXY_FIX_PREFIX", "1"))
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=x_for,
        x_proto=x_proto,
        x_host=x_host,
        x_port=x_port,
        x_prefix=x_prefix,
    )

    if is_testing:
        app.config["TESTING"] = True
        app.config.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")
        app.config.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key")
        app.config["RATELIMIT_ENABLED"] = False
    else:
        # Strict validation: DATABASE_URL and JWT_SECRET_KEY are required in production/dev
        database_url = (
            os.getenv("DATABASE_URL", "").strip()
            or os.getenv("DATABASE_POOLER_URL", "").strip()
        )
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL or DATABASE_POOLER_URL environment variable is required."
            )

        jwt_secret_key = os.getenv("JWT_SECRET_KEY", "").strip()
        if not jwt_secret_key:
            raise RuntimeError("JWT_SECRET_KEY environment variable is required.")

        app.config["JWT_SECRET_KEY"] = jwt_secret_key

        normalized_db_url = database_url.replace("postgres://", "postgresql://", 1)
        if (
            normalized_db_url.startswith("postgresql://")
            and "sslmode=" not in normalized_db_url
            and "localhost" not in normalized_db_url
            and "127.0.0.1" not in normalized_db_url
            and "postgres" not in normalized_db_url
        ):
            separator = "&" if "?" in normalized_db_url else "?"
            normalized_db_url = f"{normalized_db_url}{separator}sslmode=require"
        app.config["SQLALCHEMY_DATABASE_URI"] = normalized_db_url

    # CORS configuration with explicit origins (rejecting wildcard "*")
    cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
    if cors_origins_env:
        origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
    elif is_testing:
        origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    else:
        origins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ]
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": origins}},
        supports_credentials=True,
    )

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)
    limiter.init_app(app)

    # Register CLI commands
    from app.cli import create_user_command, seed_canonical_data, seed_command
    from app.jobs import jobs_cli

    app.cli.add_command(seed_command)
    app.cli.add_command(create_user_command)
    app.cli.add_command(jobs_cli)

    # Register blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(catalog_bp)
    app.register_blueprint(uploads_bp)

    # Global JSON error handlers
    @app.errorhandler(404)
    def handle_not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(429)
    def handle_ratelimit(e):
        return (
            jsonify(
                {
                    "error": "Rate limit exceeded",
                    "message": getattr(e, "description", "Too many requests"),
                }
            ),
            429,
        )

    @app.errorhandler(500)
    def handle_internal_server_error(e):
        app.logger.error(f"Internal server error: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def handle_unexpected_exception(e):
        if isinstance(e, HTTPException):
            return jsonify({"error": e.description}), e.code
        app.logger.error(f"Unhandled exception: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred"}), 500

    # In testing mode only, automatically set up in-memory tables and canonical roles
    if app.config.get("TESTING"):
        with app.app_context():
            try:
                db.create_all()
                seed_canonical_data()
            except Exception as e:
                app.logger.warning(f"Test database setup notice: {e}")

    @app.route("/")
    def index():
        return jsonify(
            {
                "service": "GearVault API",
                "version": "1.0.0",
                "endpoints": {
                    "health": "/api/health",
                    "readiness": "/api/health/ready",
                    "auth_health": "/api/auth/health",
                    "register": "/api/auth/register",
                    "login": "/api/auth/login",
                    "me": "/api/auth/me",
                },
            }
        )

    return app
