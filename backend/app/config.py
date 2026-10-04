import os
from datetime import timedelta


class Config:
    TESTING = False
    DEBUG = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    RATELIMIT_ENABLED = True
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

    # JWT Config
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "60"))
    )

    # AWS S3 / MinIO
    S3_BUCKET = os.getenv("S3_BUCKET", "gearvault-media")
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    MEDIA_BASE_URL = os.getenv("MEDIA_BASE_URL")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_SECRET_KEY = "test-jwt-secret-key"
    RATELIMIT_ENABLED = False


def get_config(env_name=None):
    if env_name is None:
        if os.getenv("TESTING", "").lower() in ("true", "1", "yes"):
            env_name = "testing"
        elif os.getenv("FLASK_ENV") == "development":
            env_name = "development"
        else:
            env_name = "production"

    if env_name == "testing":
        return TestingConfig
    elif env_name == "development":
        return DevelopmentConfig
    return ProductionConfig
