"""
GearVault — S3-Compatible Storage Service (AWS S3 / MinIO)
Implements presigned URLs for secure upload and retrieval without vendor lock-in.
"""

import os
import boto3
from botocore.client import Config
from typing import Optional

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def get_s3_bucket_name() -> str:
    return os.getenv("S3_BUCKET", "gearvault-media")


def get_s3_client():
    """Initializes and returns a boto3 S3 client configured for AWS or local MinIO."""
    endpoint_url = os.getenv("S3_ENDPOINT_URL")
    region = os.getenv("AWS_REGION", "us-east-1")
    access_key = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")

    client_kwargs = {
        "service_name": "s3",
        "region_name": region,
        "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    }
    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url
        client_kwargs["aws_access_key_id"] = access_key
        client_kwargs["aws_secret_access_key"] = secret_key

    return boto3.client(**client_kwargs)


def generate_presigned_upload_url(key: str, content_type: str, expires_in: int = 3600) -> str:
    """Generates a presigned PUT URL for client-side direct upload."""
    s3 = get_s3_client()
    bucket = get_s3_bucket_name()
    return s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_in,
    )


def generate_presigned_download_url(key: str, expires_in: int = 3600) -> Optional[str]:
    """Generates a short-lived presigned GET URL for private condition photos."""
    if not key:
        return None
    # If already a full URL (legacy or external), return as is
    if key.startswith("http://") or key.startswith("https://"):
        return key

    try:
        s3 = get_s3_client()
        bucket = get_s3_bucket_name()
        return s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": bucket,
                "Key": key,
            },
            ExpiresIn=expires_in,
        )
    except Exception:
        # Fallback for offline/test environments
        media_base = os.getenv("MEDIA_BASE_URL", "").rstrip("/")
        if media_base:
            return f"{media_base}/{key.lstrip('/')}"
        endpoint = os.getenv("S3_ENDPOINT_URL", "").rstrip("/")
        bucket = get_s3_bucket_name()
        if endpoint:
            return f"{endpoint}/{bucket}/{key.lstrip('/')}"
        return f"https://{bucket}.s3.amazonaws.com/{key.lstrip('/')}"
