import unittest
from datetime import datetime, timedelta, timezone

from app.services.damage_engine import (
    calculate_damage_deduction,
    calculate_late_penalty,
    evaluate_return_settlement,
    DAMAGE_WEIGHTS,
    DEFAULT_DAILY_LATE_PENALTY,
    PRESUMED_LOST_THRESHOLD_DAYS,
)


class TestDamageEngine(unittest.TestCase):
    def setUp(self):
        self.depreciated_value = 50000.0  # ₹50,000 baseline
        self.replacement_price = 80000.0  # ₹80,000 brand new replacement
        self.deposit_held = 10000.0       # ₹10,000 security deposit
        self.now = datetime.now(timezone.utc)

    # -------------------------------------------------------------
    # 1. Damage Deduction Formulas (FR018)
    # -------------------------------------------------------------
    def test_no_damage_zero_deduction(self):
        """When no damage is logged or severity is 0, deduction is 0.0."""
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, severity=None), 0.0)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, severity=0), 0.0)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, severity=3, damage_type_weight=0.0), 0.0)

    def test_cosmetic_damage_deduction(self):
        """Cosmetic damage weight = 0.05 (5% per severity level, max 25%)."""
        weight = DAMAGE_WEIGHTS["Cosmetic"]  # 0.05
        # Severity 1: 1 * 0.05 * 50000 = 2500.0 (5%)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 1, weight), 2500.0)
        # Severity 3: 3 * 0.05 * 50000 = 7500.0 (15%)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 3, weight), 7500.0)
        # Severity 5: 5 * 0.05 * 50000 = 12500.0 (25%)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 5, weight), 12500.0)

    def test_functional_damage_deduction(self):
        """Functional damage weight = 0.20 (20% per severity level, max 100%)."""
        weight = DAMAGE_WEIGHTS["Functional"]  # 0.20
        # Severity 1: 1 * 0.20 * 50000 = 10000.0 (20%)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 1, weight), 10000.0)
        # Severity 3: 3 * 0.20 * 50000 = 30000.0 (60%)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 3, weight), 30000.0)
        # Severity 5: 5 * 0.20 * 50000 = 50000.0 (100%)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 5, weight), 50000.0)

    def test_major_loss_and_deduction_capping(self):
        """Major loss weight = 1.00; deduction must be strictly capped at depreciated value."""
        weight = DAMAGE_WEIGHTS["Major/Total Loss"]  # 1.00
        # Severity 1: 1 * 1.0 * 50000 = 50000.0
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 1, weight), 50000.0)
        # Severity 5: 5 * 1.0 * 50000 = 250000 -> must cap at depreciated_value (50000.0)
        self.assertEqual(calculate_damage_deduction(self.depreciated_value, 5, weight), 50000.0)

    # -------------------------------------------------------------
    # 2. Overdue Penalties & Presumed Lost (FR021, FR022, FR023)
    # -------------------------------------------------------------
    def test_on_time_return_no_penalty(self):
        """On-time return produces zero late penalty."""
        due_at = self.now + timedelta(days=2)
        res = calculate_late_penalty(due_at=due_at, returned_at=self.now)
        self.assertFalse(res["is_overdue"])
        self.assertEqual(res["overdue_days"], 0)
        self.assertEqual(res["late_penalty"], 0.0)
        self.assertFalse(res["is_presumed_lost"])

    def test_overdue_daily_penalty(self):
        """Overdue return calculates flat daily rate (₹500/day)."""
        due_at = self.now - timedelta(days=3, hours=2)
        res = calculate_late_penalty(due_at=due_at, returned_at=self.now, daily_penalty_rate=500.0)
        self.assertTrue(res["is_overdue"])
        self.assertEqual(res["overdue_days"], 4)  # 3 days + 2 hours = 4 calendar days
        self.assertEqual(res["late_penalty"], 2000.0)
        self.assertFalse(res["is_presumed_lost"])

    def test_presumed_lost_threshold(self):
        """Rentals overdue by >= 7 days escalate to Presumed Lost."""
        due_at = self.now - timedelta(days=8)
        res = calculate_late_penalty(due_at=due_at, returned_at=self.now, daily_penalty_rate=500.0)
        self.assertTrue(res["is_overdue"])
        self.assertTrue(res["is_presumed_lost"])
        self.assertEqual(res["overdue_days"], 8)
        self.assertEqual(res["late_penalty"], 4000.0)

    # -------------------------------------------------------------
    # 3. Complete Financial Reconciliation
    # -------------------------------------------------------------
    def test_on_time_undamaged_full_refund(self):
        """On-time undamaged return receives 100% deposit refund."""
        due_at = self.now + timedelta(days=1)
        res = evaluate_return_settlement(
            depreciated_value=self.depreciated_value,
            replacement_price=self.replacement_price,
            deposit_held=self.deposit_held,
            due_at=due_at,
            returned_at=self.now,
        )
        self.assertEqual(res["damage_deduction"], 0.0)
        self.assertEqual(res["late_penalty"], 0.0)
        self.assertEqual(res["total_deduction"], 0.0)
        self.assertEqual(res["deposit_refunded"], 10000.0)
        self.assertEqual(res["balance_owed"], 0.0)

    def test_overdue_with_cosmetic_damage_partial_refund(self):
        """Deposit held = ₹10,000. Severity 2 cosmetic (₹5,000) + 2 days late (₹1,000) = ₹6,000 -> Refund ₹4,000."""
        due_at = self.now - timedelta(days=2)
        res = evaluate_return_settlement(
            depreciated_value=self.depreciated_value,
            replacement_price=self.replacement_price,
            deposit_held=self.deposit_held,
            due_at=due_at,
            returned_at=self.now,
            severity=2,
            damage_type_weight=0.05,
            daily_penalty_rate=500.0,
        )
        self.assertEqual(res["damage_deduction"], 5000.0)
        self.assertEqual(res["late_penalty"], 1000.0)
        self.assertEqual(res["total_deduction"], 6000.0)
        self.assertEqual(res["deposit_refunded"], 4000.0)
        self.assertEqual(res["balance_owed"], 0.0)

    def test_deductions_exceeding_deposit_creates_balance_owed(self):
        """If damage deduction exceeds deposit held, refund is 0 and balance owed is recorded."""
        due_at = self.now
        res = evaluate_return_settlement(
            depreciated_value=self.depreciated_value,
            replacement_price=self.replacement_price,
            deposit_held=self.deposit_held,  # 10,000
            due_at=due_at,
            returned_at=self.now,
            severity=3,
            damage_type_weight=0.20,  # 3 * 0.20 * 50000 = 30000
        )
        self.assertEqual(res["damage_deduction"], 30000.0)
        self.assertEqual(res["total_deduction"], 30000.0)
        self.assertEqual(res["deposit_refunded"], 0.0)
        self.assertEqual(res["balance_owed"], 20000.0)

    def test_presumed_lost_settlement(self):
        """Presumed lost charges full replacement price and late penalty."""
        due_at = self.now - timedelta(days=10)
        res = evaluate_return_settlement(
            depreciated_value=self.depreciated_value,
            replacement_price=self.replacement_price,  # 80000
            deposit_held=self.deposit_held,            # 10000
            due_at=due_at,
            returned_at=self.now,
            daily_penalty_rate=500.0,
        )
        self.assertTrue(res["is_presumed_lost"])
        self.assertEqual(res["replacement_charge"], 80000.0)
        self.assertEqual(res["late_penalty"], 5000.0)
        self.assertEqual(res["total_deduction"], 85000.0)
        self.assertEqual(res["deposit_refunded"], 0.0)
        self.assertEqual(res["balance_owed"], 75000.0)


if __name__ == "__main__":
    unittest.main()
