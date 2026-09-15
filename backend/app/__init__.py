import os
import threading

from dotenv import load_dotenv
from flask import Flask, jsonify

from app.extensions import bcrypt, cors, db, jwt, migrate
from app.routes.auth import auth_bp
from app.routes.catalog import catalog_bp

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__)

    # Default configuration
    use_external = (
        os.getenv("USE_EXTERNAL_DATABASE", "false").strip().lower()
        in ("true", "1", "yes")
    )
    database_url = (
        (
            os.getenv("DATABASE_POOLER_URL", "").strip()
            or os.getenv("DATABASE_URL", "").strip()
        )
        if use_external
        else ""
    )
    # Prefer PostgreSQL from env if external DB enabled; keep SQLite for seamless local development.
    if database_url:
        normalized_db_url = database_url.replace("postgres://", "postgresql://", 1)
        if (
            normalized_db_url.startswith("postgresql://")
            and "sslmode=" not in normalized_db_url
        ):
            separator = "&" if "?" in normalized_db_url else "?"
            normalized_db_url = f"{normalized_db_url}{separator}sslmode=require"
        app.config["SQLALCHEMY_DATABASE_URI"] = normalized_db_url
    else:
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///gearvault.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = os.getenv(
        "JWT_SECRET_KEY", "gearvault-default-jwt-secret-key"
    )

    if test_config:
        app.config.update(test_config)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(catalog_bp)

    with app.app_context():
        try:
            db.create_all()
            from app.models import DamageType

            if DamageType.query.count() == 0:
                defaults = [
                    DamageType(
                        name="Cosmetic",
                        weight=0.05,
                        description="Surface scratches, scuffs, minor cosmetic wear not affecting functionality.",
                    ),
                    DamageType(
                        name="Functional",
                        weight=0.20,
                        description="Partial impairment, broken switch/mount, requires servicing.",
                    ),
                    DamageType(
                        name="Major/Total Loss",
                        weight=1.00,
                        description="Complete device failure, shattered sensor/glass, water submersion, or total destruction.",
                    ),
                ]
                db.session.add_all(defaults)
                db.session.commit()
        except Exception as e:
            app.logger.warning(f"db.create_all() notice: {e}")


    # Expire holds even when no customer is currently browsing the catalog.
    # Database checks in the booking endpoints remain the final race-safe guard.
    if not app.config.get("TESTING"):
        from app.routes.catalog import expire_holds

        def hold_expiry_worker():
            while True:
                with app.app_context():
                    expire_holds()
                threading.Event().wait(60)

        threading.Thread(
            target=hold_expiry_worker, name="hold-expiry", daemon=True
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
