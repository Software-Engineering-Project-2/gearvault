import os
import unittest
from decimal import Decimal
from unittest.mock import patch
from app import create_app
from app.models import Item


class TestMediaUrlResolution(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})

    def test_media_url_formatting_with_media_base_url(self):
        """Item.to_dict() builds image_url as MEDIA_BASE_URL.rstrip('/') + '/' + key.lstrip('/')"""
        with self.app.app_context():
            item = Item(
                name="Cinema Camera",
                purchase_price=Decimal("150000.00"),
                replacement_price=Decimal("180000.00"),
                image_path="items/550e8400-e29b-41d4-a716-446655440000.jpg",
            )
            with patch.dict(os.environ, {"MEDIA_BASE_URL": "https://cdn.gearvault.com/media"}):
                d = item.to_dict()
                self.assertEqual(
                    d["image_url"],
                    "https://cdn.gearvault.com/media/items/550e8400-e29b-41d4-a716-446655440000.jpg",
                )

    def test_media_url_handles_trailing_and_leading_slashes(self):
        """Ensures no double slashes when MEDIA_BASE_URL has trailing slash and key has leading slash."""
        with self.app.app_context():
            item = Item(
                name="Cinema Lens",
                purchase_price=Decimal("50000.00"),
                replacement_price=Decimal("60000.00"),
                image_path="/items/a1b2c3d4-e5f6-7890.png",
            )
            with patch.dict(os.environ, {"MEDIA_BASE_URL": "https://gearvault.com/media/"}):
                d = item.to_dict()
                self.assertEqual(
                    d["image_url"],
                    "https://gearvault.com/media/items/a1b2c3d4-e5f6-7890.png",
                )

    def test_media_url_preserves_absolute_http_urls(self):
        """External absolute URLs are preserved as is."""
        with self.app.app_context():
            item = Item(
                name="Audio Recorder",
                purchase_price=Decimal("25000.00"),
                replacement_price=Decimal("30000.00"),
                image_path="https://external-storage.com/audio.jpg",
            )
            with patch.dict(os.environ, {"MEDIA_BASE_URL": "https://gearvault.com/media"}):
                d = item.to_dict()
                self.assertEqual(d["image_url"], "https://external-storage.com/audio.jpg")


if __name__ == "__main__":
    unittest.main()
