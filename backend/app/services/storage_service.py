"""
GearVault — S3-Compatible Storage Service (AWS S3 / MinIO)
Implements presigned URLs for secure upload and retrieval without vendor lock-in.
"""

import os
from typing import Optional
import boto3
from botocore.client import Config

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_PRESIGNED_EXPIRY_SECONDS = 900  # 15 minutes max expiry


def get_s3_bucket_name() -> str:
    return os.getenv("S3_BUCKET", "gearvault-media")


def get_s3_client():
    """
    Initializes and returns a boto3 S3 client configured for AWS or local MinIO.
    Uses region_name=AWS_REGION and signature_version="s3v4".
    Relies on the default AWS credential chain (IAM roles, AWS CLI, env vars)
    unless AWS_ACCESS_KEY_ID is explicitly set (e.g. for MinIO / local dev).
    """
    endpoint_url = os.getenv("S3_ENDPOINT_URL")
    region = os.getenv("AWS_REGION", "us-east-1")
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

    config_kwargs = {"signature_version": "s3v4"}
    if endpoint_url:
        config_kwargs["s3"] = {"addressing_style": "path"}

    client_kwargs = {
        "service_name": "s3",
        "region_name": region,
        "config": Config(**config_kwargs),
    }

    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url

    # Only pass explicit credentials when AWS_ACCESS_KEY_ID is set (dev/MinIO).
    # In production AWS (ECS/EKS/EC2/Lambda), omit to use default credential chain.
    if access_key:
        client_kwargs["aws_access_key_id"] = access_key
        if secret_key:
            client_kwargs["aws_secret_access_key"] = secret_key

    return boto3.client(**client_kwargs)


def generate_presigned_upload_url(
    key: str, content_type: str, expires_in: int = MAX_PRESIGNED_EXPIRY_SECONDS
) -> str:
    """Generates a presigned PUT URL for client-side direct upload (max 900s expiry)."""
    s3 = get_s3_client()
    bucket = get_s3_bucket_name()
    effective_expiry = min(expires_in, MAX_PRESIGNED_EXPIRY_SECONDS)
    return s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=effective_expiry,
    )


def generate_presigned_download_url(
    key: str, expires_in: int = MAX_PRESIGNED_EXPIRY_SECONDS
) -> Optional[str]:
    """Generates a short-lived presigned GET URL for private condition photos (max 900s expiry)."""
    if not key:
        return None
    # If already a full URL (legacy or external), return as is
    if key.startswith("http://") or key.startswith("https://"):
        return key

    effective_expiry = min(expires_in, MAX_PRESIGNED_EXPIRY_SECONDS)
    try:
        s3 = get_s3_client()
        bucket = get_s3_bucket_name()
        return s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": bucket,
                "Key": key,
            },
            ExpiresIn=effective_expiry,
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
