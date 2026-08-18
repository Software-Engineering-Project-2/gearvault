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
    # Local SQLite is the default development database. Set USE_EXTERNAL_DATABASE=true
    # only when a reachable PostgreSQL DATABASE_URL has been configured.
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        os.getenv("DATABASE_URL")
        if os.getenv("USE_EXTERNAL_DATABASE", "false").lower() == "true"
        else "sqlite:///gearvault.db"
    )
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
        db.create_all()
        # Local development catalog. These inserts are idempotent, so an existing
        # SQLite database receives any newly added categories/items at startup.
        from app.models import Category, Item
        category_data = {
            "Cameras": "Cameras and lenses", "Audio": "Recording equipment",
            "Lighting": "Studio and event lights", "Computers": "Production computers",
            "Event Gear": "Projectors and presentation gear",
        }
        for name, description in category_data.items():
            if not Category.query.filter_by(name=name).first():
                db.session.add(Category(name=name, description=description))
        db.session.flush()
        category_ids = {category.name: category.id for category in Category.query.all()}
        item_data = [
            ("CAM-R6", "Canon EOS R6", "Full-frame mirrorless camera body", 185000, 225000, "Cameras"),
            ("CAM-A7IV", "Sony A7 IV", "Full-frame hybrid camera body", 210000, 255000, "Cameras"),
            ("LEN-2470", "Sony 24-70mm f/2.8 Lens", "Professional standard zoom lens", 145000, 175000, "Cameras"),
            ("AUD-WL", "Wireless Microphone Kit", "Dual-channel lavalier microphone system", 18000, 25000, "Audio"),
            ("AUD-RODE", "Rode Shotgun Microphone", "Camera-mounted directional microphone", 22000, 30000, "Audio"),
            ("LGT-LED", "LED Panel Light", "Bi-colour LED light panel with stand", 8000, 12000, "Lighting"),
            ("LGT-SOFT", "Godox Softbox Kit", "Two-light softbox studio kit", 14000, 20000, "Lighting"),
            ("CMP-MBP", "MacBook Pro 14-inch", "Apple Silicon laptop for editing", 175000, 220000, "Computers"),
            ("CMP-MON", "Editing Monitor 27-inch", "4K colour-accurate production monitor", 32000, 45000, "Computers"),
            ("EVT-PROJ", "Epson Projector", "Full HD event projector", 55000, 75000, "Event Gear"),
            ("EVT-PA", "Portable PA Speaker", "Battery-powered PA speaker with microphone", 28000, 40000, "Event Gear"),
        ]
        for sku, name, description, purchase_price, replacement_price, category_name in item_data:
            if not Item.query.filter_by(sku=sku).first():
                db.session.add(Item(sku=sku, name=name, description=description, purchase_price=purchase_price,
                                    replacement_price=replacement_price, category_id=category_ids[category_name]))
        db.session.commit()

    # Expire holds even when no customer is currently browsing the catalog.
    # Database checks in the booking endpoints remain the final race-safe guard.
    if not app.config.get("TESTING"):
        from app.routes.catalog import expire_holds
        def hold_expiry_worker():
            while True:
                with app.app_context():
                    expire_holds()
                threading.Event().wait(60)
        threading.Thread(target=hold_expiry_worker, name="hold-expiry", daemon=True).start()

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
