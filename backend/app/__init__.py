import os
import threading
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify

from app.extensions import bcrypt, cors, db, jwt, migrate
from app.routes.auth import auth_bp
from app.routes.catalog import catalog_bp

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__)

    if test_config:
        app.config.update(test_config)

    is_testing = app.config.get("TESTING") or os.getenv("TESTING", "").lower() in ("true", "1", "yes")
    if is_testing:
        app.config["TESTING"] = True
        app.config.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")
    else:
        database_url = (
            os.getenv("DATABASE_URL", "").strip()
            or os.getenv("DATABASE_POOLER_URL", "").strip()
        )
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL or DATABASE_POOLER_URL environment variable is required."
            )
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

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.getenv(
        "JWT_SECRET_KEY", "gearvault-default-jwt-secret-key"
    )
    jwt_expiry_minutes = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "60"))
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=jwt_expiry_minutes)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # Register CLI commands
    from app.cli import seed_command, seed_canonical_data
    app.cli.add_command(seed_command)

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(catalog_bp)

    # In testing mode only, automatically set up in-memory tables and canonical roles
    if app.config.get("TESTING"):
        with app.app_context():
            try:
                db.create_all()
                seed_canonical_data()
            except Exception as e:
                app.logger.warning(f"Test database setup notice: {e}")


    # Expire holds even when no customer is currently browsing the catalog.
    # Database checks in the booking endpoints remain the final race-safe guard.
    if not app.config.get("TESTING"):
        from app.routes.catalog import expire_holds, escalate_overdue_rentals

        def hold_expiry_worker():
            while True:
                try:
                    with app.app_context():
                        expire_holds()
                        escalate_overdue_rentals()
                except Exception:
                    pass
                threading.Event().wait(60)

        threading.Thread(
            target=hold_expiry_worker, name="hold-expiry-and-escalation", daemon=True
        ).start()

    @app.route("/")
    def index():
        return jsonify(
            {
                "service": "GearVault API",
                "version": "1.0.0",
                "endpoints": {
                    "auth_health": "/api/auth/health",
                    "register": "/api/auth/register",
                    "login": "/api/auth/login",
                    "me": "/api/auth/me",
                },
            }
        )

    return app
