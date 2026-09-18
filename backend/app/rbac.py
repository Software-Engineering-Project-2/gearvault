"""
GearVault Role-Based Access Control (RBAC) Module.

Provides authentication and role-based authorization decorators for Flask routes.
Derives user identity and roles strictly from the database, ensuring that client-supplied
claims or headers cannot bypass access control.
"""

import json
import os
from functools import wraps
from urllib.request import Request, urlopen

from flask import g, jsonify, request
from flask_jwt_extended import decode_token
from sqlalchemy import text

from app.extensions import db
from app.models import User, Role


def authenticate_request():
    """
    Extracts Bearer token from Authorization header and verifies it against:
    1. Local Flask-JWT Extended tokens
    2. Supabase Auth tokens (fallback for external sessions)

    Populates Flask's application context `g`:
    - `g.current_user`: User model instance (if local user) or None
    - `g.user_id`: String representation of user ID (integer ID or Supabase UUID)
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

    # 1. Try decoding as local Flask-JWT token
    try:
        decoded = decode_token(token)
        user_id_str = str(decoded.get("sub"))
        user = None

        # Try to resolve local User record
        try:
            user_id_int = int(user_id_str)
            user = db.session.get(User, user_id_int)
        except (ValueError, TypeError):
            user = None

        if not user and decoded.get("email"):
            user = User.query.filter(db.func.lower(User.email) == decoded["email"].strip().lower()).first()

        if user:
            g.current_user = user
            # Resolve authoritative Supabase auth.users UUID for database integrity
            auth_user_row = db.session.execute(
                text("SELECT id FROM auth.users WHERE lower(email) = lower(:email) LIMIT 1"),
                {"email": user.email},
            ).fetchone()
            if auth_user_row and auth_user_row[0]:
                uuid_str = str(auth_user_row[0])
                g.user_id = uuid_str
                g.customer_id = uuid_str
            else:
                g.user_id = str(user.id)
                g.customer_id = str(user.id)
            g.user_role = (user.role or "customer").lower()
            return True
        elif user_id_str:
            # Check if user_id_str is a Supabase auth.users UUID directly
            try:
                import uuid as uuid_mod
                uuid_mod.UUID(user_id_str)
                auth_user_row = db.session.execute(
                    text("SELECT id, email FROM auth.users WHERE id = :uid LIMIT 1"),
                    {"uid": user_id_str},
                ).fetchone()
                if auth_user_row and auth_user_row[0]:
                    g.current_user = None
                    g.user_id = str(auth_user_row[0])
                    g.customer_id = str(auth_user_row[0])
                    role_query = text(
                        "SELECT r.name FROM profiles p "
                        "JOIN roles r ON p.role_id = r.id "
                        "WHERE p.id = :uid LIMIT 1"
                    )
                    role_row = db.session.execute(role_query, {"uid": g.user_id}).fetchone()
                    if role_row and role_row[0]:
                        g.user_role = str(role_row[0]).lower()
                    else:
                        g.user_role = (decoded.get("role") or "customer").lower()
                    return True
            except (ValueError, TypeError):
                pass
    except Exception:
        pass

    # 2. Fall back to Supabase session verification
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    if supabase_url and supabase_key:
        try:
            auth_req = Request(
                f"{supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {token}",
                },
            )
            with urlopen(auth_req, timeout=5) as response:
                user_data = json.loads(response.read().decode("utf-8"))
                user_uuid = user_data.get("id")

            if user_uuid:
                g.current_user = None
                g.user_id = str(user_uuid)
                g.customer_id = str(user_uuid)

                # Look up authoritative role from profiles table linked to roles
                role_query = text(
                    "SELECT r.name FROM profiles p "
                    "JOIN roles r ON p.role_id = r.id "
                    "WHERE p.id = :uid LIMIT 1"
                )
                role_row = db.session.execute(role_query, {"uid": user_uuid}).fetchone()
                if role_row and role_row[0]:
                    g.user_role = str(role_row[0]).lower()
                else:
                    g.user_role = "customer"

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
