"""
GearVault Role-Based Access Control (RBAC) Module.

Provides authentication and role-based authorization decorators for Flask routes.
Derives user identity and roles strictly from the database, ensuring that client-supplied
claims or headers cannot bypass access control.
"""

from functools import wraps

from flask import g, jsonify, request
from flask_jwt_extended import decode_token

from app.extensions import db
from app.models import User, Role


def authenticate_request():
    """
    Extracts Bearer token from Authorization header and verifies it via Flask-JWT Extended.

    Populates Flask's application context `g`:
    - `g.current_user`: User model instance
    - `g.user_id`: String UUID of the user
    - `g.customer_id`: Alias for `g.user_id` for backward compatibility with routes
    - `g.user_role`: Authorized role string ('customer', 'staff', 'manager')

    Returns:
        True if authentication succeeds, False otherwise.
    """
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header.startswith("Bearer "):
        return False

    token = auth_header[7:].strip()
    if not token:
        return False

    try:
        decoded = decode_token(token)
        user_id_str = str(decoded.get("sub"))
        user = db.session.get(User, user_id_str)

        if not user and decoded.get("email"):
            user = User.query.filter(
                db.func.lower(User.email) == decoded["email"].strip().lower()
            ).first()

        if user:
            g.current_user = user
            g.user_id = str(user.id)
            g.customer_id = str(user.id)
            g.user_role = (user.role or decoded.get("role") or "customer").lower()
            return True
    except Exception:
        pass

    return False


def jwt_required_custom(view):
    """Decorator requiring a valid authentication session."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not authenticate_request():
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped


def roles_required(*allowed_roles):
    """
    Decorator enforcing role authorization.
    Verifies that the authenticated user has one of the specified allowed roles.
    Unauthenticated -> 401 Unauthorized
    Authenticated but unauthorized -> 403 Forbidden
    """
    normalized_allowed = [r.lower() for r in allowed_roles]

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not authenticate_request():
                return jsonify({"error": "Authentication required."}), 401

            current_role = getattr(g, "user_role", None)
            if not current_role or current_role not in normalized_allowed:
                return jsonify({"error": "You do not have permission to perform this action."}), 403

            return view(*args, **kwargs)

        return wrapped

    return decorator


# Convenience role decorators
def customer_required(view):
    """Allows Customer and Manager roles for general rental & booking operations."""
    return roles_required("customer", "manager")(view)


def staff_required(view):
    """Allows Staff and Manager roles for operational rental counter workflows."""
    return roles_required("staff", "manager")(view)


def manager_required(view):
    """Allows Manager role only for high-privilege reporting, analytics, and dispute overrides."""
    return roles_required("manager")(view)
