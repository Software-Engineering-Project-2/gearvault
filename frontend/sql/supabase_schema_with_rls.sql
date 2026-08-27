-- Supabase schema with RLS enabled and example policies
-- Run this in the Supabase SQL editor. This creates tables and adds RLS policies
-- that restrict access by auth.uid() and roles in the `profiles` table.

-- Create roles table
create table if not exists roles (
  id serial primary key,
  name text not null unique
);

-- Profiles (links to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role_id int not null references roles(id),
  full_name text,
  phone text,
  created_at timestamptz default now()
);

-- Categories and items
create table if not exists item_categories (
  id serial primary key,
  name text not null unique,
  description text
);

create table if not exists items (
  id serial primary key,
  sku text unique,
  name text not null,
  description text,
  -- Relative path in the Supabase Storage item-images bucket.
  image_path text,
  purchase_price numeric(12,2) not null,
  purchase_date date,
  replacement_price numeric(12,2) not null,
  category_id int references item_categories(id),
  active boolean default true,
  created_at timestamptz default now()
);

-- Supports databases created with an earlier version of this schema.
alter table items add column if not exists image_path text;

-- Bookings and rentals (created without public access)
create table if not exists bookings (
  id serial primary key,
  customer_id uuid references auth.users(id) on delete cascade,
  item_id int references items(id) on delete cascade,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  status text not null default 'requested',
  hold_expires_at timestamptz,
  deposit_amount numeric(12,2),
  created_at timestamptz default now()
);

create index if not exists bookings_item_period_idx on bookings (item_id, start_ts, end_ts);

create table if not exists rentals (
  id serial primary key,
  booking_id int references bookings(id) on delete set null,
  item_id int references items(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete cascade,
  checkout_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  status text not null default 'active',
  total_price numeric(12,2),
  deposit_held numeric(12,2),
  created_at timestamptz default now()
);

create index if not exists rentals_item_due_idx on rentals (item_id, due_at);

create table if not exists item_condition_log (
  id serial primary key,
  item_id int not null references items(id) on delete cascade,
  rental_id int references rentals(id),
  captured_by uuid references auth.users(id),
  photo_url text,
  notes text,
  captured_at timestamptz default now()
);

create table if not exists damage_types (
  id serial primary key,
  name text not null unique,
  weight numeric(4,2) not null default 1.0
);

create table if not exists damage_assessments (
  id serial primary key,
  rental_id int not null references rentals(id) on delete cascade,
  assessed_by uuid references auth.users(id),
  severity int check (severity >= 1 and severity <= 5),
  damage_type_id int references damage_types(id),
  notes text,
  deduction numeric(12,2),
  created_at timestamptz default now()
);

create table if not exists payments (
  id serial primary key,
  user_id uuid references auth.users(id),
  rental_id int references rentals(id),
  amount numeric(12,2) not null,
  payment_type text not null,
  provider text,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id serial primary key,
  user_id uuid references auth.users(id),
  type text,
  payload jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists financial_audit_log (
  id serial primary key,
  user_id uuid references auth.users(id),
  action text not null,
  amount numeric(12,2),
  metadata jsonb,
  created_at timestamptz default now()
);

-- Seed roles and damage types
insert into roles(name) values ('customer') on conflict do nothing;
insert into roles(name) values ('staff') on conflict do nothing;
insert into roles(name) values ('manager') on conflict do nothing;

insert into damage_types(name, weight) values ('Cosmetic', 0.05) on conflict do nothing;
insert into damage_types(name, weight) values ('Functional', 0.25) on conflict do nothing;
insert into damage_types(name, weight) values ('Major/Total Loss', 1.0) on conflict do nothing;

-- Enable RLS on sensitive tables and add policies
-- Profiles: only owner can read/update, staff/managers cannot modify profiles of others
alter table profiles enable row level security;

create policy profiles_is_owner on profiles
  for all
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- Bookings: customers may create/read their own bookings; staff/managers can read all
alter table bookings enable row level security;

create policy bookings_insert_owner on bookings
  for insert
  with check ( auth.uid() = customer_id );

create policy bookings_select_owner on bookings
  for select
  using ( auth.uid() = customer_id
          or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

create policy bookings_update_owner on bookings
  for update
  using ( auth.uid() = customer_id )
  with check ( auth.uid() = customer_id );

create policy bookings_delete_owner on bookings
  for delete
  using ( auth.uid() = customer_id );

-- Rentals: owners read their rentals; staff/managers can read/update statuses
alter table rentals enable row level security;

create policy rentals_select_owner on rentals
  for select
  using ( auth.uid() = customer_id
          or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

create policy rentals_update_staff on rentals
  for update
  using ( exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) )
  with check ( exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

create policy rentals_insert_owner on rentals
  for insert
  with check ( auth.uid() = customer_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

-- Item condition logs: staff may create logs; owner (customer) may view logs related to their rentals
alter table item_condition_log enable row level security;

create policy item_condition_insert_staff on item_condition_log
  for insert
  with check ( exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name = 'staff')) );

create policy item_condition_select on item_condition_log
  for select
  using ( exists (select 1 from rentals r where r.id = rental_id and r.customer_id = auth.uid())
          or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

-- Damage assessments: only staff/manager can create/read; customers can view their rental's assessment
alter table damage_assessments enable row level security;

create policy damage_assessments_insert_staff on damage_assessments
  for insert
  with check ( exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

create policy damage_assessments_select on damage_assessments
  for select
  using ( exists (select 1 from rentals r where r.id = rental_id and r.customer_id = auth.uid())
          or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

-- Payments: only owner and staff/manager
alter table payments enable row level security;

create policy payments_insert_owner on payments
  for insert
  with check ( auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

create policy payments_select on payments
  for select
  using ( auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role_id in (select id from roles where name in ('staff','manager'))) );

-- Notifications: owner-only
alter table notifications enable row level security;

create policy notifications_select_owner on notifications
  for select
  using ( auth.uid() = user_id );

create policy notifications_insert_server on notifications
  for insert
  with check ( true ); -- allow server to insert via service_role key

-- Financial audit log: readable by managers only
alter table financial_audit_log enable row level security;

create policy financial_audit_select_manager on financial_audit_log
  for select
  using ( exists (select 1 from profiles p where p.id = auth.uid() and p.role_id = (select id from roles where name = 'manager')) );

create policy financial_audit_insert_server on financial_audit_log
  for insert
  with check ( true ); -- allow server (service_role) to insert

-- Finally: ensure public role has no default access
revoke all on schema public from public;

-- End of script
