# Supabase Setup & RLS Notes

This file documents the SQL, RLS policies, test data steps, and frontend env/run steps used for Increment 1 (auth + frontend). Add any future changes here so the team can follow the same steps.

Files referenced
- Schema & policies: [frontend/sql/supabase_schema_with_rls.sql](frontend/sql/supabase_schema_with_rls.sql#L1-L243)
- Frontend env example: [frontend/env.example](frontend/env.example)
- Frontend README/run steps: [frontend/README.md](frontend/README.md)

Quick summary
- Run `frontend/sql/supabase_schema_with_rls.sql` in the Supabase SQL editor to create tables and enable Row Level Security (RLS) with example policies.
- Create auth users in Supabase (Authentication → Users). For quick testing, check **Auto confirm user?** to avoid email confirmation.
- Link auth users to roles by inserting into `profiles` (see SQL snippets below).

Linking users to roles (replace emails or UUIDs)

By email (recommended for manual workflow):
```sql
-- link Harshit as customer
insert into profiles (id, role_id, full_name)
select u.id, r.id, 'Harshit'
from auth.users u join roles r on r.name = 'customer'
where u.email = 'harshit@example.com'
on conflict (id) do update set role_id = excluded.role_id, full_name = excluded.full_name;

-- link Sathya as staff
insert into profiles (id, role_id, full_name)
select u.id, r.id, 'Sathya'
from auth.users u join roles r on r.name = 'staff'
where u.email = 'sathya@example.com'
on conflict (id) do update set role_id = excluded.role_id, full_name = excluded.full_name;
```

By UUID (if you prefer copying the user IDs):
```sql
insert into profiles (id, role_id, full_name)
values (
  '<user-uuid-here>',
  (select id from roles where name = 'customer'),
  'Harshit'
)
on conflict (id) do update set role_id = excluded.role_id, full_name = excluded.full_name;
```

Seed a sample item and a held booking (optional)
```sql
insert into item_categories (name, description) values ('Camera','Photo equipment') on conflict do nothing;

insert into items (sku, name, description, purchase_price, purchase_date, replacement_price, category_id)
values ('CAM-001','Sony A7 IV','Full-frame mirrorless', 3000.00, '2022-06-01', 2500.00, (select id from item_categories where name='Camera'))
on conflict do nothing;

insert into bookings (customer_id, item_id, start_ts, end_ts, status, hold_expires_at, deposit_amount)
values (
  (select id from auth.users where email='harshit@example.com'),
  (select id from items where sku='CAM-001'),
  now() + interval '1 day',
  now() + interval '2 day',
  'held',
  now() + interval '15 minutes',
  100.00
);
```

RLS & security notes
- The RLS policies in the schema file restrict access by `auth.uid()` and the `profiles.role_id` values. Staff and Manager roles can read/modify records as defined in policies; customers can only access their own rows.
- Never store or expose the Supabase `service_role` key in the frontend. Use a backend (or Supabase Edge Function) with the service role key for privileged actions like writing to audit logs or performing admin actions.

How the frontend should create users/profiles in future
- Option A (recommended): Frontend calls your backend (authenticated) to create users via the Admin API or Supabase server SDK using `service_role` key; backend inserts a `profiles` row linking the new auth user.
- Option B: Use Supabase Functions (Edge Functions) that run server-side and hold the `service_role` key in environment variables.

Frontend env & run (local)
1. Copy `frontend/env.example` → `frontend/.env` and set:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...anon_key...
```

2. Start dev server:
```bash
cd frontend
npm install
npm run dev
```

Checklist for team review
- [ ] Confirm `frontend/sql/supabase_schema_with_rls.sql` was run in the project.
- [ ] Create test users in Supabase (Harshit, Sathya) and link via `profiles`.
- [ ] Seed a few items/bookings for demo.
- [ ] Implement a backend endpoint for creating users/profiles securely before enabling self-serve sign-up in production.

If you want, I can also add a small Node.js script that uses the Supabase Admin API to create users and insert `profiles` (this requires the `service_role` key and must be run in a secure environment). Ask and I will add it under `tools/`.
