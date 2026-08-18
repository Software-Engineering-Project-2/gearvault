# GearVault — Equipment Rental Management (Increment 1)

This repository contains the GearVault project. Increment 1 delivers a Vite + React frontend with Supabase authentication and the database schema + Row-Level Security (RLS) configured in Supabase.

Useful links
- Frontend quickstart and run: [frontend/README.md](frontend/README.md)
- Supabase schema, RLS and setup notes: [docs/supabase-setup.md](docs/supabase-setup.md)

What is included now
- Frontend scaffold (Vite + React) with pages: `Login`, `Signup`, `Dashboard` and a `NavBar`.
- Supabase SQL schema and RLS policies in `frontend/sql/supabase_schema_with_rls.sql`.
- Documentation in `docs/supabase-setup.md` with commands and examples for seeding and linking users.

Important notes and current limitations
- The frontend uses `VITE_SUPABASE_ANON_KEY` (client anon key). Do NOT store the `service_role` key in frontend code or in the repository.
- Signup creates an auth user but does not automatically create a `profiles` row assigning a role — this must be created via the admin UI or by a backend endpoint using the service role key. See `docs/supabase-setup.md` for guidance.
- UI improvements: a Reddit-like theme and improved `Signup`/`Login`/`Dashboard` are included, but the frontend is minimal and intended as a starting point. Further UX work is planned.

Next recommended tasks
1. Add a small backend (or Supabase Edge Function) to securely create users and `profiles` rows using the `service_role` key.
2. Implement catalog pages and booking flows (frontend + server-side availability checks).
3. Add tests and CI.

If you want, I can: add a secure `tools/create-users.js` script (requires `SUPABASE_SERVICE_ROLE_KEY`), push these changes to your GitHub, or continue improving the UI/UX.
