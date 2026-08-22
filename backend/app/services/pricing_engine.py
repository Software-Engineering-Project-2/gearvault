"""
GearVault - Dynamic Depreciation-Based Pricing Engine
Implements FR011 (Straight-line depreciation pricing) and FR012 (Duration-tier multipliers).
Decoupled, isolated service module as required by SRS Section 5.4.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
import math
from typing import Any, Dict, Optional, Union


# ==========================================
# CONSTANTS & CONFIGURATION
# ==========================================

# Standard straight-line useful life in years (default: 5 years / 60 months)
DEFAULT_USEFUL_LIFE_YEARS = 5.0

# Residual salvage floor ratio (equipment value will never drop below 20% of purchase price)
SALVAGE_FLOOR_RATIO = 0.20

# Annual depreciation rate: (1.0 - SALVAGE_FLOOR_RATIO) / DEFAULT_USEFUL_LIFE_YEARS = 16% per year
ANNUAL_DEPRECIATION_RATE = (1.0 - SALVAGE_FLOOR_RATIO) / DEFAULT_USEFUL_LIFE_YEARS  # 0.16 (16%/year)

# Category-specific lifespans (in years)
CATEGORY_LIFESPANS = {
    "cameras": 3.0,          # Cameras & sensors: 3-year production lifecycle
    "computers": 3.0,        # Production laptops/desktops: 3-year cycle
    "audio": 5.0,            # Microphones, mixers: 5-year cycle
    "lighting": 5.0,         # Studio lights, softboxes: 5-year cycle
    "event gear": 6.0,       # PA speakers, projectors: 6-year cycle
}

# Duration-tier pricing multipliers (expressed as a fraction of current depreciated value)
# Daily Tier (< 7 days): 2.5% of depreciated value per day (40 days full ROI)
DAILY_TIER_MULTIPLIER = 0.025

# Weekly Tier (7 to 29 days): 10.0% of depreciated value per 7-day week (equivalent to ~1.43% / day -> 43% discount vs daily)
WEEKLY_TIER_MULTIPLIER = 0.100

# Monthly Tier (>= 30 days): 30.0% of depreciated value per 30-day month (equivalent to 1.0% / day -> 60% discount vs daily)
MONTHLY_TIER_MULTIPLIER = 0.300

# Security deposit percentage of current depreciated value (default: 20%)
DEFAULT_DEPOSIT_RATIO = 0.20

# Minimum security deposit floor (₹500)
MINIMUM_DEPOSIT_FLOOR = 500.0


# ==========================================
# CORE CALCULATION FUNCTIONS
# ==========================================

def calculate_depreciated_value(
    purchase_price: Union[float, Decimal, int],
    purchase_date: Optional[Union[date, datetime, str]] = None,
    as_of_date: Optional[Union[date, datetime]] = None,
    category_name: Optional[str] = None,
) -> float:
    """
    Calculates the straight-line depreciated value of an item based on its purchase price and age.
    
    Formula:
      Age (years) = (as_of_date - purchase_date) / 365.25
      Depreciation Fraction = min(1.0 - Salvage_Floor, Age * Annual_Rate)
      Depreciated Value = max(Purchase_Price * Salvage_Floor, Purchase_Price * (1.0 - Depreciation_Fraction))
    """
    price = float(purchase_price or 0.0)
    if price <= 0:
        return 0.0

    # Parse purchase date
    p_date = None
    if isinstance(purchase_date, str) and purchase_date.strip():
        try:
            p_date = date.fromisoformat(purchase_date[:10])
        except ValueError:
            p_date = None
    elif isinstance(purchase_date, datetime):
        p_date = purchase_date.date()
    elif isinstance(purchase_date, date):
        p_date = purchase_date

    # Default to current date if purchase_date is not set (i.e. brand new item)
    calc_date = as_of_date.date() if isinstance(as_of_date, datetime) else (as_of_date or date.today())
    if not p_date:
        p_date = calc_date

    # Calculate age in days / years
    age_days = max(0, (calc_date - p_date).days)
    age_years = age_days / 365.25

    # Determine useful life based on category
    useful_life = DEFAULT_USEFUL_LIFE_YEARS
    if category_name:
        cat_key = category_name.strip().lower()
        useful_life = CATEGORY_LIFESPANS.get(cat_key, DEFAULT_USEFUL_LIFE_YEARS)

    # Annual rate for this category
    annual_rate = (1.0 - SALVAGE_FLOOR_RATIO) / useful_life
    depreciation_fraction = min(1.0 - SALVAGE_FLOOR_RATIO, age_years * annual_rate)

    # Calculate depreciated value with salvage floor
    salvage_floor = price * SALVAGE_FLOOR_RATIO
    depreciated_value = max(salvage_floor, price * (1.0 - depreciation_fraction))

    return round(depreciated_value, 2)


def calculate_rental_pricing(
    purchase_price: Union[float, Decimal, int],
    purchase_date: Optional[Union[date, datetime, str]],
    start_ts: Union[datetime, str],
    end_ts: Union[datetime, str],
    category_name: Optional[str] = None,
    replacement_price: Optional[Union[float, Decimal, int]] = None,
) -> Dict[str, Any]:
    """
    Computes the complete pricing breakdown for a rental window.
    
    Returns a dictionary containing:
      - purchase_price: original cost
      - depreciated_value: current market worth
      - age_years: calculated asset age
      - duration_hours: rental window duration in hours
      - duration_days: billable rental days (ceil)
      - duration_tier: 'Daily' | 'Weekly' | 'Monthly'
      - daily_rate: single day rental charge
      - rental_price: total rental charge for the entire period
      - deposit_amount: refundable security deposit
      - total_initial_payable: deposit amount payable at checkout
    """
    # Parse timestamps
    def parse_dt(val):
        if isinstance(val, datetime):
            return val
        s = str(val).replace("Z", "+00:00")
        return datetime.fromisoformat(s)

    start_dt = parse_dt(start_ts)
    end_dt = parse_dt(end_ts)

    # Ensure start < end
    total_seconds = max(3600, (end_dt - start_dt).total_seconds())
    duration_hours = total_seconds / 3600.0
    duration_days = max(1, math.ceil(total_seconds / 86400.0))

    # Calculate current depreciated value as of rental start date
    depreciated_val = calculate_depreciated_value(
        purchase_price=purchase_price,
        purchase_date=purchase_date,
        as_of_date=start_dt.date() if hasattr(start_dt, "date") else None,
        category_name=category_name,
    )

    # Base single-day rate (2.5% of depreciated value)
    base_daily_rate = round(depreciated_val * DAILY_TIER_MULTIPLIER, 2)

    # Determine duration tier and rental price
    if duration_days < 7:
        duration_tier = "Daily"
        rental_price = round(duration_days * base_daily_rate, 2)
    elif duration_days < 30:
        duration_tier = "Weekly"
        # Weekly tier: (days / 7) * weekly multiplier
        rental_price = round((duration_days / 7.0) * (depreciated_val * WEEKLY_TIER_MULTIPLIER), 2)
    else:
        duration_tier = "Monthly"
        # Monthly tier: (days / 30) * monthly multiplier
        rental_price = round((duration_days / 30.0) * (depreciated_val * MONTHLY_TIER_MULTIPLIER), 2)

    # Calculate refundable security deposit (20% of depreciated value, with minimum floor)
    calculated_deposit = max(MINIMUM_DEPOSIT_FLOOR, round(depreciated_val * DEFAULT_DEPOSIT_RATIO, 2))
    
    # Calculate age for display
    p_date = None
    if isinstance(purchase_date, (date, datetime)):
        p_date = purchase_date.date() if isinstance(purchase_date, datetime) else purchase_date
    elif isinstance(purchase_date, str) and purchase_date.strip():
        try:
            p_date = date.fromisoformat(purchase_date[:10])
        except ValueError:
            p_date = None
    
    age_days = (start_dt.date() - p_date).days if p_date else 0
    age_years = round(max(0, age_days / 365.25), 1)

    return {
        "purchase_price": float(purchase_price or 0.0),
        "depreciated_value": depreciated_val,
        "age_years": age_years,
        "duration_hours": round(duration_hours, 1),
        "duration_days": duration_days,
        "duration_tier": duration_tier,
        "daily_rate": base_daily_rate,
        "rental_price": rental_price,
        "deposit_amount": calculated_deposit,
        "total_initial_payable": calculated_deposit,
    }


def get_item_daily_rate(
    purchase_price: Union[float, Decimal, int],
    purchase_date: Optional[Union[date, datetime, str]] = None,
    category_name: Optional[str] = None,
) -> float:
    """
    Convenience helper to get the baseline 1-day rental rate for an item.
    """
    depreciated_val = calculate_depreciated_value(
        purchase_price=purchase_price,
        purchase_date=purchase_date,
        as_of_date=date.today(),
        category_name=category_name,
    )
    return round(depreciated_val * DAILY_TIER_MULTIPLIER, 2)
