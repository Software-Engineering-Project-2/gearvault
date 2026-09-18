from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import create_access_token
from app.extensions import db
from app.models import User, Role
from app.rbac import jwt_required_custom, manager_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "message": "Auth service is running"}), 200

import json
import os
from urllib.request import Request, urlopen
from sqlalchemy import text

def sync_user_to_supabase(email, password, full_name=None, role_id=1):
    """
    Ensures user exists in Supabase auth.users and profiles tables so foreign keys
    on bookings, rentals, payments, and notifications work without UUID syntax errors.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_KEY")
    if not supabase_url or not service_key:
        return None

    user_uuid = None
    try:
        # Check if already in auth.users
        row = db.session.execute(
            text("SELECT id FROM auth.users WHERE lower(email) = lower(:email) LIMIT 1"),
            {"email": email},
        ).fetchone()
        if row and row[0]:
            user_uuid = str(row[0])
        else:
            # Create in Supabase via Admin API
            req = Request(
                f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
                data=json.dumps({
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": full_name or ""},
                }).encode("utf-8"),
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                user_uuid = data.get("id")

        if user_uuid:
            prof = db.session.execute(
                text("SELECT id FROM profiles WHERE id = :uid"),
                {"uid": user_uuid},
            ).fetchone()
            if not prof:
                db.session.execute(
                    text("INSERT INTO profiles (id, role_id, full_name, created_at) VALUES (:uid, :role_id, :full_name, now())"),
                    {"uid": user_uuid, "role_id": role_id, "full_name": full_name or email.split("@")[0]},
                )
            else:
                db.session.execute(
                    text("UPDATE profiles SET role_id = :role_id, full_name = COALESCE(:full_name, full_name) WHERE id = :uid"),
                    {"uid": user_uuid, "role_id": role_id, "full_name": full_name},
                )
            db.session.commit()
    except Exception:
        pass

    return user_uuid


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    full_name = data.get("full_name", "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    if User.query.filter(db.func.lower(User.email) == email).first():
        return jsonify({"error": "A user with this email already exists"}), 409

    # Strict RBAC: All self-registrations MUST default to role_id=1 ('customer')
    user = User(email=email, full_name=full_name or None, role_id=1)
    user.set_password(password)

    user_uuid = sync_user_to_supabase(email, password, full_name, role_id=1)

    try:
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to register user: {str(e)}"}), 500

    identity_id = user_uuid if user_uuid else str(user.id)
    access_token = create_access_token(
        identity=identity_id,
        additional_claims={"role": user.role, "role_id": user.role_id, "email": user.email},
    )
    user_dict = user.to_dict()
    if user_uuid:
        user_dict["id"] = user_uuid
        user_dict["uuid"] = user_uuid

    return jsonify({
        "message": "User registered successfully",
        "user": user_dict,
        "access_token": access_token,
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter(db.func.lower(User.email) == email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    user_uuid = sync_user_to_supabase(email, password, user.full_name, user.role_id)
    identity_id = user_uuid if user_uuid else str(user.id)

    access_token = create_access_token(
        identity=identity_id,
        additional_claims={"role": user.role, "role_id": user.role_id, "email": user.email},
    )
    user_dict = user.to_dict()
    if user_uuid:
        user_dict["id"] = user_uuid
        user_dict["uuid"] = user_uuid

    return jsonify({
        "message": "Login successful",
        "user": user_dict,
        "access_token": access_token,
    }), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required_custom
def get_current_user():
    if getattr(g, "current_user", None):
        user_dict = g.current_user.to_dict()
        if getattr(g, "user_id", None):
            user_dict["id"] = g.user_id
            user_dict["uuid"] = g.user_id
        return jsonify({"user": user_dict}), 200

    # Supabase user fallback
    return jsonify({
        "user": {
            "id": g.user_id,
            "role": g.user_role,
        }
    }), 200

# ==========================================
# MANAGER-ONLY USER MANAGEMENT ENDPOINTS
# ==========================================

@auth_bp.route("/users", methods=["GET"])
@manager_required
def list_users():
    """Manager-only: View all registered users and their assigned roles."""
    users = User.query.order_by(User.id).all()
    return jsonify({"users": [u.to_dict() for u in users]}), 200

@auth_bp.route("/users/<int:user_id>/role", methods=["PUT"])
@manager_required
def update_user_role(user_id):
    """Manager-only: Administratively update a user's role."""
    data = request.get_json() or {}
    target_role = data.get("role", "").strip().lower()
    role_id = data.get("role_id")

    role_obj = None
    if role_id:
        role_obj = db.session.get(Role, role_id)
    elif target_role:
        role_obj = Role.query.filter(db.func.lower(Role.name) == target_role).first()

    if not role_obj:
        return jsonify({"error": "Invalid role specified. Valid roles are: customer, staff, manager"}), 400

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.role_id = role_obj.id
    db.session.commit()

    # Also sync role to profiles table in Supabase
    try:
        auth_row = db.session.execute(
            text("SELECT id FROM auth.users WHERE lower(email) = lower(:email) LIMIT 1"),
            {"email": user.email},
        ).fetchone()
        if auth_row and auth_row[0]:
            db.session.execute(
                text("UPDATE profiles SET role_id = :role_id WHERE id = :uid"),
                {"role_id": role_obj.id, "uid": auth_row[0]},
            )
            db.session.commit()
    except Exception:
        pass

    return jsonify({
        "message": f"User {user.email} role updated to {role_obj.name}",
        "user": user.to_dict()
    }), 200

