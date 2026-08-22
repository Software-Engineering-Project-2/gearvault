# GearVault — Increment 3 Progress & Session Documentation

This document records all architectural updates, new features, database models, API endpoints, and design system enhancements implemented during this development session.

---

## 📌 Summary of Work Completed

### 1. Dedicated Checkout & Simulated Payment Flow
- **New Page**: [`frontend/src/pages/Checkout.jsx`](../frontend/src/pages/Checkout.jsx) (`/checkout/:bookingId`).
- **Features**:
  - Displays full equipment reservation summary (item details, SKU, category, rental window, hold expiry countdown).
  - 20% security deposit calculation and transparent pricing breakdown.
  - Multi-tab simulated payment form (Credit/Debit Card & UPI/QR) with pre-filled mock credentials.
  - Interactive payment-processing spinner animation (`@keyframes spin`).
  - Animated green success checkmark (`@keyframes scaleIn`, `@keyframes strokeDraw`).
  - Automated client-side redirect back to `/bookings` upon payment confirmation (1.8s delay).
- **Bookings Integration**: Updated [`frontend/src/pages/Bookings.jsx`](../frontend/src/pages/Bookings.jsx) so clicking "Pay ₹..." on any held booking seamlessly opens the dedicated Checkout page.

---

### 2. Database Models & Payment Persistence
- **Added Models** in [`backend/app/models.py`](../backend/app/models.py):
  - **`Payment`**: Persists financial transactions (`user_id`, `rental_id`, `amount`, `payment_type`, `provider`, `created_at`).
  - **`ItemConditionLog`**: Stores pre/post-rental condition inspection logs, notes, and photo references (`item_id`, `rental_id`, `captured_by`, `photo_url`, `notes`, `captured_at`).
- **Automatic Table Sync**: Enabled `db.create_all()` in [`backend/app/__init__.py`](../backend/app/__init__.py) ensuring new tables are synchronized with SQLite / Supabase PostgreSQL upon server startup.
- **API Endpoint Update**: Modified `POST /api/bookings/<id>/confirm-payment` in [`backend/app/routes/catalog.py`](../backend/app/routes/catalog.py) to automatically record a `Payment` row in the database on deposit confirmation.

---

### 3. Staff Operations Counter View
- **New Page**: [`frontend/src/pages/StaffQueue.jsx`](../frontend/src/pages/StaffQueue.jsx) (`/staff`).
- **Top Navigation**: Added **"Staff Operations"** link to [`frontend/src/components/NavBar.jsx`](../frontend/src/components/NavBar.jsx).
- **Core Tabs**:
  1. **📦 Ready for Pickup (Confirmed Bookings Queue)**:
     - Real-time search and filter across all bookings with paid deposits awaiting equipment pickup.
     - Handover modal allowing staff to confirm equipment release.
     - **Optional Pre-Rental Inspection**: Checkbox toggle enabling staff to optionally record condition notes and photo URLs to `ItemConditionLog`.
     - Clicking "Complete Handover" creates an active `Rental` record and marks the booking as `Checked Out`.
  2. **🚚 Active Rentals Monitoring**:
     - Lists all equipment currently in the possession of customers.
     - Tracks checkout timestamp, due date, deposit held, and dynamic **"⚠️ Overdue"** flags when past due.
- **Backend Endpoints Added**:
  - `GET /api/staff/bookings/confirmed` — Returns all confirmed pickup reservations.
  - `GET /api/staff/rentals/active` — Returns all currently active rentals.
  - `POST /api/staff/bookings/<id>/handover` — Creates `Rental` record, writes optional `ItemConditionLog`, and transitions booking status.

---

### 4. Arc-Inspired Theme & Visual System
- **File**: [`frontend/src/styles.css`](../frontend/src/styles.css)
- **Design Enhancements** (Preserving current page layout):
  - **Atmospheric Mesh Canvas**: Multi-stop radiant radial gradient background.
  - **Frosted Acrylic Navbar**: Sticky glassmorphic bar (`backdrop-filter: blur(20px)`), glowing brand squircle dot, and translucent hover pills.
  - **Soft Squircle Surfaces**: `border-radius: 18px` with layered ambient elevation shadows (`box-shadow: 0 10px 30px -4px rgba(0, 0, 0, 0.05)`).
  - **Spring Physics**: Smooth `cubic-bezier(0.16, 1, 0.3, 1)` transitions for card hover lifts and button press scaling.
  - **Arc Sunset Primary Buttons**: Vibrant coral gradient (`#ff5722` → `#ff7043`) with glowing drop shadow.
  - **Pill Badges**: Pastel status chips (Emerald for Available/Paid, Amber for Held/Deposit, Crimson for Overdue).
  - **Form Controls**: Rounded `10px` inputs with coral glow focus rings.

---

### 5. Dynamic Depreciation-Based Pricing Engine (FR011, FR012)
- **Module**: [`backend/app/services/pricing_engine.py`](../backend/app/services/pricing_engine.py).
- **Features**:
  - Algorithmic straight-line depreciation calculated from purchase price and asset age down to a 20% salvage floor ratio.
  - Duration-tier pricing multipliers: Daily (2.5%/day), Weekly (10%/week, 43% discount), and Monthly (30%/month, 60% discount).
  - Dynamic refundable security deposit (20% of current depreciated value, min ₹500).
  - Standalone unit test suite [`backend/tests/test_pricing.py`](../backend/tests/test_pricing.py) with 9 passing tests.
  - Public estimate endpoint `POST /api/pricing/estimate`.

---

### 6. Digital Rental Agreement & Checklist (FR014)
- **Component**: [`frontend/src/components/RentalAgreementModal.jsx`](../frontend/src/components/RentalAgreementModal.jsx).
- **Features**:
  - Generated at customer checkout review with mandatory consent agreement checkbox.
  - Generated and previewed at staff equipment handover with pre-rental inspection notes & photo reference URLs.
  - Accessible on demand by customers under `/bookings` and staff under `/staff`.
  - Formal 5-section legal contract format including Parties, Condition Checklist, Timeline, Financial Breakdown, Binding SRS Business Rules (BR3, BR4, FR018, FR022, FR023), and Digital Signature stamps.
  - Clean `@media print` layout enabling 1-click browser PDF export and paper printing.

---

### 7. SRS Compliance Audit (Progress Map)

| Requirement Area | Status | Notes |
| :--- | :---: | :--- |
| **Increment 1: Auth & RBAC** | ✅ 100% | User registration, bcrypt hashing, JWT auth, role control. |
| **Increment 2: Catalog & Booking** | ✅ 100% | Search, categories, availability window, 15-min soft holds, hold expiry worker. |
| **Increment 3: Checkout & Pricing** | ✅ 100% | Checkout payment flow, dynamic pricing engine (FR011/FR012), staff handover, and digital rental agreement (FR014). |
| **Increment 4: Returns & Damage** | ⏹️ 0% | Return check-in, photo comparison, and damage formulas up next. |
| **Increment 5: Reports & Notifications** | ⏹️ 0% | In-app notification delivery and analytics dashboard. |

