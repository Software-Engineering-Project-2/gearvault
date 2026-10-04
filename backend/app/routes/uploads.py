import uuid
from flask import Blueprint, jsonify, request, g

from app.rbac import jwt_required_custom
from app.services.storage_service import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE_BYTES,
    generate_presigned_upload_url,
)

uploads_bp = Blueprint("uploads", __name__, url_prefix="/api/uploads")


@uploads_bp.post("/presign")
@jwt_required_custom
def get_presigned_upload_url():
    """
    POST /api/uploads/presign
    Generates a presigned S3/MinIO PUT URL for client-side direct upload.
    Role requirements:
    - type="item": manager role required. Key: items/<uuid>.<ext>
    - type="condition": staff or manager role required. Key: condition/<rental_id>/<uuid>.<ext>
    """
    data = request.get_json() or {}
    upload_type = (data.get("type") or "").strip().lower()
    content_type = (data.get("content_type") or "").strip().lower()
    file_size = data.get("file_size")
    rental_id = data.get("rental_id")

    # 1. Content-Type validation
    if content_type not in ALLOWED_CONTENT_TYPES:
        return jsonify({
            "error": "Invalid content_type. Allowed types: image/jpeg, image/png, image/webp"
        }), 400

    ext = ALLOWED_CONTENT_TYPES[content_type]

    # 2. File size validation (if provided)
    if file_size is not None:
        try:
            size_val = int(file_size)
            if size_val > MAX_FILE_SIZE_BYTES:
                return jsonify({"error": "File size exceeds the 5 MB maximum limit"}), 400
        except (ValueError, TypeError):
            pass

    user_role = (getattr(g, "user_role", None) or "customer").lower()

    # 3. Role authorization and key generation
    if upload_type == "item":
        if user_role != "manager":
            return jsonify({"error": "Manager role required to upload equipment item images"}), 403
        key = f"items/{uuid.uuid4()}.{ext}"

    elif upload_type == "condition":
        if user_role not in ("staff", "manager"):
            return jsonify({"error": "Staff or Manager role required to upload condition photos"}), 403
        if not rental_id:
            return jsonify({"error": "rental_id is required when uploading condition photos"}), 400
        key = f"condition/{rental_id}/{uuid.uuid4()}.{ext}"

    else:
        return jsonify({"error": "Invalid upload type. Must be 'item' or 'condition'"}), 400

    try:
        upload_url = generate_presigned_upload_url(key=key, content_type=content_type)
        return jsonify({
            "upload_url": upload_url,
            "key": key,
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to generate upload URL: {str(e)}"}), 500
