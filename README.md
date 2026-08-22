# GearVault

GearVault is an equipment rental management app for browsing inventory, checking availability across a time window, and placing temporary booking holds before payment confirmation.

## Current project scope

The repository now includes both the backend service and the React frontend for the rental workflow:

- Catalog browsing with category filters and keyword search
- Availability checking for a selected date/time range
- Booking holds with automatic expiry after 15 minutes
- Booking confirmation after payment
- Cancellation of active holds before checkout
- Customer-specific booking history
- Flask API with SQLite default database and optional external database support
- Frontend pages for login, signup, catalog dashboard, bookings, checkout, and staff operations

## Project structure

- [backend](backend) — Flask API and core rental logic
- [frontend](frontend) — Vite + React app
- [docs/session-log-increment-3.md](docs/session-log-increment-3.md) — Increment 3 checkout, staff, & theming documentation
- [docs/supabase-setup.md](docs/supabase-setup.md) — Supabase auth and database setup notes
- [frontend/sql/supabase_schema_with_rls.sql](frontend/sql/supabase_schema_with_rls.sql) — Supabase schema and RLS definitions

## Backend features

The Flask backend exposes catalog, booking, and staff endpoints under `/api`:

- `GET /api/categories` — returns all active item categories
- `GET /api/items` — lists catalog items, supports `search`, `category_id`, `start_ts`, and `end_ts`
- `POST /api/bookings/hold` — creates a time-bound hold for an item, with overlap checks and expiry handling
- `GET /api/bookings/<id>` — retrieves individual booking details
- `POST /api/bookings/<id>/confirm-payment` — confirms a held booking and records payment transaction
- `DELETE /api/bookings/<id>` — cancels a held booking
- `GET /api/bookings/mine` — returns bookings for the logged-in customer
- `GET /api/staff/bookings/confirmed` — returns confirmed bookings ready for equipment pickup
- `GET /api/staff/rentals/active` — returns all equipment currently out on rental
- `POST /api/staff/bookings/<id>/handover` — processes checkout handover and activates rental (with optional condition logging)


The backend also enforces booking rules:

- overlapping bookings are blocked
- active rental periods are treated as unavailable
- holds expire automatically after 15 minutes if not confirmed
- start/end windows must be valid and future-dated

## Frontend features

The React app includes:

- `Login` and `Signup` pages
- `Dashboard` page for catalog browsing and item availability by date range
- `Bookings` page to view user bookings and confirm or cancel holds
- client-side validation before creating a booking hold
- booking status messaging and hold expiry details

## Local setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # Windows (PowerShell): Copy-Item .env.example .env
# update .env with your real PostgreSQL connection URL(s)
python run.py
```

The backend .env.example already includes PostgreSQL placeholders:

- DATABASE_POOLER_URL=postgresql://... (recommended)
- DATABASE_URL=postgresql://... (direct DB fallback)

The app uses PostgreSQL when DATABASE_POOLER_URL (recommended) or DATABASE_URL is set. If neither is set, it falls back to local SQLite (sqlite:///gearvault.db).

Optional environment variables:

```bash
export DATABASE_URL="postgresql://..."
export DATABASE_POOLER_URL="postgresql://..."
export JWT_SECRET_KEY="your-secret-key"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

### 2. Frontend

```bash
cd frontend
npm install
cp env.example .env
# update .env with your Supabase values
npm run dev
```

## Security notes

- Do not commit `.env` files or keys
- Use the Supabase anonymous key only in the frontend
- Keep the service role key and any admin secrets on the server side only

## Useful references

- [frontend/README.md](frontend/README.md)
- [docs/supabase-setup.md](docs/supabase-setup.md)
