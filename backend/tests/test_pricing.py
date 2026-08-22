import unittest
from datetime import date, datetime, timedelta, timezone

from app.services.pricing_engine import (
    calculate_depreciated_value,
    calculate_rental_pricing,
    get_item_daily_rate,
    DAILY_TIER_MULTIPLIER,
    WEEKLY_TIER_MULTIPLIER,
    MONTHLY_TIER_MULTIPLIER,
    SALVAGE_FLOOR_RATIO,
)


class TestPricingEngine(unittest.TestCase):
    def setUp(self):
        self.purchase_price = 100000.0  # ₹1,00,000 baseline
        self.today = date.today()

    def test_brand_new_item_no_depreciation(self):
        """Brand new item (age 0) retains 100% of purchase price."""
        dep_val = calculate_depreciated_value(
            purchase_price=self.purchase_price,
            purchase_date=self.today,
            as_of_date=self.today,
        )
        self.assertEqual(dep_val, 100000.0)

    def test_one_year_depreciation_standard_category(self):
        """Standard category (5 yr life, 16% per year) depreciates ~16% in 1 year."""
        one_year_ago = self.today - timedelta(days=365)
        dep_val = calculate_depreciated_value(
            purchase_price=self.purchase_price,
            purchase_date=one_year_ago,
            as_of_date=self.today,
            category_name="Audio",
        )
        # Expected: ~100000 * (1 - 0.16 * 1) = ~84000.0
        self.assertAlmostEqual(dep_val, 84000.0, delta=200.0)

    def test_camera_category_faster_depreciation(self):
        """Cameras have 3-year lifespan (26.67% per year)."""
        one_year_ago = self.today - timedelta(days=365)
        dep_val = calculate_depreciated_value(
            purchase_price=self.purchase_price,
            purchase_date=one_year_ago,
            as_of_date=self.today,
            category_name="Cameras",
        )
        # Expected: ~100000 * (1 - (0.80/3.0)*1) = ~73333.33
        self.assertAlmostEqual(dep_val, 73333.33, delta=300.0)

    def test_salvage_floor_preservation(self):
        """Very old gear (e.g. 10 years old) hits the 20% salvage floor and never drops lower."""
        ten_years_ago = self.today - timedelta(days=365 * 10)
        dep_val = calculate_depreciated_value(
            purchase_price=self.purchase_price,
            purchase_date=ten_years_ago,
            as_of_date=self.today,
        )
        expected_floor = self.purchase_price * SALVAGE_FLOOR_RATIO
        self.assertEqual(dep_val, expected_floor)

    def test_daily_tier_pricing(self):
        """1-day and 3-day rentals apply the Daily Tier rate (2.5% of dep value / day)."""
        start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        end = start + timedelta(days=3)
        pricing = calculate_rental_pricing(
            purchase_price=100000.0,
            purchase_date=start.date(),
            start_ts=start,
            end_ts=end,
        )
        self.assertEqual(pricing["duration_tier"], "Daily")
        self.assertEqual(pricing["duration_days"], 3)
        # 100,000 * 0.025 * 3 = 7,500
        self.assertEqual(pricing["daily_rate"], 2500.0)
        self.assertEqual(pricing["rental_price"], 7500.0)
        # Deposit: 20% of 100,000 = 20,000
        self.assertEqual(pricing["deposit_amount"], 20000.0)

    def test_weekly_tier_pricing_discount(self):
        """7-day rental applies the Weekly Tier multiplier (10% of dep value per week)."""
        start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        end = start + timedelta(days=7)
        pricing = calculate_rental_pricing(
            purchase_price=100000.0,
            purchase_date=start.date(),
            start_ts=start,
            end_ts=end,
        )
        self.assertEqual(pricing["duration_tier"], "Weekly")
        self.assertEqual(pricing["duration_days"], 7)
        # 100,000 * 0.10 = 10,000 (Notice: weekly discount saves 7 * 2500 - 10000 = 7500!)
        self.assertEqual(pricing["rental_price"], 10000.0)

    def test_monthly_tier_pricing_discount(self):
        """30-day rental applies the Monthly Tier multiplier (30% of dep value per month)."""
        start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        end = start + timedelta(days=30)
        pricing = calculate_rental_pricing(
            purchase_price=100000.0,
            purchase_date=start.date(),
            start_ts=start,
            end_ts=end,
        )
        self.assertEqual(pricing["duration_tier"], "Monthly")
        self.assertEqual(pricing["duration_days"], 30)
        # 100,000 * 0.30 = 30,000
        self.assertEqual(pricing["rental_price"], 30000.0)

    def test_fractional_days_round_up(self):
        """A 36-hour rental counts as 2 billable days."""
        start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        end = start + timedelta(hours=36)
        pricing = calculate_rental_pricing(
            purchase_price=100000.0,
            purchase_date=start.date(),
            start_ts=start,
            end_ts=end,
        )
        self.assertEqual(pricing["duration_days"], 2)
        self.assertEqual(pricing["rental_price"], 5000.0)


class TestPricingAPI(unittest.TestCase):
    def setUp(self):
        from app import create_app
        from app.extensions import db
        from app.models import Category, Item

        self.app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()
            cat = Category(name="Cameras", description="Cameras and lenses")
            db.session.add(cat)
            db.session.flush()

            # Item bought 1 year ago for 100,000
            item = Item(
                sku="CAM-TEST",
                name="Test Camera",
                description="Test camera body",
                purchase_price=100000.0,
                purchase_date=date.today() - timedelta(days=365),
                replacement_price=120000.0,
                category_id=cat.id,
                active=True,
            )
            db.session.add(item)
            db.session.commit()
            self.item_id = item.id

    def test_pricing_estimate_endpoint(self):
        """POST /api/pricing/estimate returns dynamic price calculations correctly."""
        base = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        start = base.isoformat()
        end = (base + timedelta(days=3)).isoformat()

        response = self.client.post(
            "/api/pricing/estimate",
            json={"item_id": self.item_id, "start_ts": start, "end_ts": end},
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("pricing", data)
        self.assertEqual(data["pricing"]["duration_days"], 3)
        self.assertEqual(data["pricing"]["duration_tier"], "Daily")
        self.assertGreater(data["pricing"]["rental_price"], 0)


if __name__ == "__main__":
    unittest.main()

