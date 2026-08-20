x# GearVault Frontend

This frontend provides the customer-facing experience for catalog browsing, booking holds, and booking management.

## Included features

- Login and signup flow
- Catalog dashboard with searchable equipment listings
- Category filtering and availability filtering by date/time window
- "Place 15-min hold" action for available items
- Booking page showing all active and historical bookings for the logged-in user
- Payment confirmation and cancellation actions for active holds

## Main pages

- `Login` — authentication for existing customers
- `Signup` — create a new account
- `Dashboard` — browse inventory and check availability for a rental window
- `Bookings` — view a user's booking list and manage holds

## Environment setup

Create a `.env` file from the sample configuration:

```bash
cp env.example .env
```

Then add your Supabase values in `.env`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Run locally

```bash
cd frontend
npm install
npm run dev
```

The app will run in the Vite development server and communicate with the Flask backend through the configured API base URL in the frontend client.

## Notes about booking flow

The dashboard sends the selected start and end timestamps to the backend. The backend checks:

- if the item exists and is active
- if the time window overlaps with another held booking or active rental
- whether the selected slot is valid and in the future

If available, the user can create a temporary hold. On the Bookings page, the user can confirm payment or cancel the hold before expiry.

## Security notes

- Never commit your `.env` file
- Keep service-role secrets only on the backend/server side
- Use the anonymous key strictly for browser client access
