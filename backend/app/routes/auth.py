from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import create_access_token
from app.extensions import db
from app.models import User, Role
from app.rbac import jwt_required_custom, manager_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "message": "Auth service is running"}), 200


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    full_name = data.get("full_name", "").strip()
    phone = data.get("phone", "").strip() or None

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    if User.query.filter(db.func.lower(User.email) == email).first():
        return jsonify({"error": "A user with this email already exists"}), 409

    # Strict RBAC: All self-registrations MUST default to role_id=1 ('customer')
    user = User(email=email, full_name=full_name or None, phone=phone, role_id=1)
    user.set_password(password)

    try:
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to register user: {str(e)}"}), 500

    identity_id = str(user.id)
    access_token = create_access_token(
        identity=identity_id,
        additional_claims={"role": user.role, "role_id": user.role_id, "email": user.email},
    )

    return jsonify({
        "message": "User registered successfully",
        "user": user.to_dict(),
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

    identity_id = str(user.id)
    access_token = create_access_token(
        identity=identity_id,
        additional_claims={"role": user.role, "role_id": user.role_id, "email": user.email},
    )

    return jsonify({
        "message": "Login successful",
        "user": user.to_dict(),
        "access_token": access_token,
    }), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required_custom
def get_current_user():
    if getattr(g, "current_user", None):
        return jsonify({"user": g.current_user.to_dict()}), 200

    return jsonify({"error": "User not found"}), 404


# ==========================================
# MANAGER-ONLY USER MANAGEMENT ENDPOINTS
# ==========================================

@auth_bp.route("/users", methods=["GET"])
@manager_required
def list_users():
    """Manager-only: View all registered users and their assigned roles."""
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({"users": [u.to_dict() for u in users]}), 200


@auth_bp.route("/users/<string:user_id>/role", methods=["PUT"])
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

    return jsonify({
        "message": f"User {user.email} role updated to {role_obj.name}",
        "user": user.to_dict()
    }), 200
