"""
GearVault — Algorithmic Damage Assessment & Penalty Service Engine
Implements SRS FR017, FR018, FR021, FR022, FR023 and Business Rules BR3, BR4.

Rules:
1. FR018: Damage deduction = min(severity_score * damage_type_weight * item_depreciated_value, item_depreciated_value)
   where severity_score is 1-5 and damage_type_weight is:
   - Cosmetic: 0.05 (5% per severity level, max 25%)
   - Functional: 0.20 (20% per severity level, max 100%)
   - Major/Total Loss: 1.00 (100% full depreciated value)
2. FR021/FR022 (BR4): Overdue rentals accrue a flat daily penalty rate (default ₹500/day).
3. FR023: Rentals unreturned after threshold (7 days) escalate to 'Presumed Lost'
   and assess the item's full replacement price against the customer.
"""

from datetime import datetime, timezone
import math
from typing import Optional, Dict, Any

DEFAULT_DAILY_LATE_PENALTY = 500.0  # ₹500 flat per overdue day
PRESUMED_LOST_THRESHOLD_DAYS = 7     # Days past due to trigger presumed lost status

# Pre-defined damage weights corresponding to DamageType
DAMAGE_WEIGHTS = {
    "Cosmetic": 0.05,
    "Functional": 0.20,
    "Major/Total Loss": 1.00,
}


def calculate_damage_deduction(
    depreciated_value: float,
    severity: Optional[int],
    damage_type_weight: float = 0.0,
) -> float:
    """
    FR018: deduction = severity * damage_type_weight * depreciated_value,
    capped at the item's current depreciated value.
    """
    if not severity or severity <= 0 or damage_type_weight <= 0:
        return 0.0

    # Severity scale is 1 to 5
    clamped_severity = max(1, min(int(severity), 5))
    raw_deduction = clamped_severity * float(damage_type_weight) * float(depreciated_value)
    
    # Cap at depreciated value
    capped_deduction = min(raw_deduction, float(depreciated_value))
    return round(capped_deduction, 2)


def calculate_late_penalty(
    due_at: datetime,
    returned_at: Optional[datetime] = None,
    daily_penalty_rate: float = DEFAULT_DAILY_LATE_PENALTY,
) -> Dict[str, Any]:
    """
    FR021 & FR022: Flat daily penalty rate applied automatically once rental passes due_at.
    FR023: Escalates to Presumed Lost if overdue >= PRESUMED_LOST_THRESHOLD_DAYS.
    """
    if returned_at is None:
        returned_at = datetime.now(timezone.utc)

    # Ensure tz-aware
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    if returned_at.tzinfo is None:
        returned_at = returned_at.replace(tzinfo=timezone.utc)

    if returned_at <= due_at:
        return {
            "is_overdue": False,
            "overdue_days": 0,
            "late_penalty": 0.0,
            "is_presumed_lost": False,
        }

    overdue_seconds = (returned_at - due_at).total_seconds()
    # 60-second grace window to prevent sub-second execution clock drift bumping days
    if overdue_seconds <= 60:
        return {
            "is_overdue": False,
            "overdue_days": 0,
            "late_penalty": 0.0,
            "is_presumed_lost": False,
        }

    overdue_days = max(1, math.ceil((overdue_seconds - 60) / 86400.0))
    late_penalty = round(overdue_days * daily_penalty_rate, 2)
    is_presumed_lost = overdue_days >= PRESUMED_LOST_THRESHOLD_DAYS

    return {
        "is_overdue": True,
        "overdue_days": overdue_days,
        "late_penalty": late_penalty,
        "is_presumed_lost": is_presumed_lost,
    }


def evaluate_return_settlement(
    depreciated_value: float,
    replacement_price: float,
    deposit_held: float,
    due_at: datetime,
    returned_at: Optional[datetime] = None,
    severity: Optional[int] = None,
    damage_type_weight: float = 0.0,
    force_presumed_lost: bool = False,
    daily_penalty_rate: float = DEFAULT_DAILY_LATE_PENALTY,
) -> Dict[str, Any]:
    """
    Full financial reconciliation for equipment return.
    Combines damage assessment deduction, late-return penalty, and security deposit reconciliation.
    """
    late_info = calculate_late_penalty(due_at, returned_at, daily_penalty_rate)
    is_presumed_lost = force_presumed_lost or late_info["is_presumed_lost"]

    replacement_charge = 0.0
    damage_deduction = 0.0

    if is_presumed_lost:
        # FR023: Full replacement charge assessed
        replacement_charge = round(float(replacement_price), 2)
        total_deduction = replacement_charge + late_info["late_penalty"]
    else:
        damage_deduction = calculate_damage_deduction(
            depreciated_value=depreciated_value,
            severity=severity,
            damage_type_weight=damage_type_weight,
        )
        total_deduction = round(damage_deduction + late_info["late_penalty"], 2)

    deposit_held_float = round(float(deposit_held), 2)
    deposit_refunded = max(0.0, round(deposit_held_float - total_deduction, 2))
    balance_owed = max(0.0, round(total_deduction - deposit_held_float, 2))

    return {
        "depreciated_value": round(float(depreciated_value), 2),
        "replacement_price": round(float(replacement_price), 2),
        "deposit_held": deposit_held_float,
        "severity": severity,
        "damage_type_weight": damage_type_weight,
        "damage_deduction": damage_deduction,
        "is_overdue": late_info["is_overdue"],
        "overdue_days": late_info["overdue_days"],
        "late_penalty": late_info["late_penalty"],
        "is_presumed_lost": is_presumed_lost,
        "replacement_charge": replacement_charge,
        "total_deduction": total_deduction,
        "deposit_refunded": deposit_refunded,
        "balance_owed": balance_owed,
    }
