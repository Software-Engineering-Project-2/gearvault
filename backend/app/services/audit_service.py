"""
GearVault — Financial Audit Log Service
Implements SRS Section 5.3, 5.4, and 6.1.
"""

from decimal import Decimal
from typing import Optional, Dict, Any
from app.extensions import db
from app.models import FinancialAuditLog


def log_financial_action(
    action: str,
    amount: Optional[float] = None,
    user_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[FinancialAuditLog]:
    """Creates an audit log entry within the current database transaction."""
    try:
        amt = Decimal(str(amount)) if amount is not None else None
        entry = FinancialAuditLog(
            action=action,
            amount=amt,
            user_id=str(user_id) if user_id else None,
            metadata_json=metadata or {},
        )
        db.session.add(entry)
        return entry
    except Exception:
        return None
