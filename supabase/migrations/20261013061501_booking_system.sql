-- Lion's Route Shuttles SA: booking, dispatch and tracking.
--
-- Roles: client (default for every signup), driver, admin.
-- Clients insert their own bookings (sanitised by a trigger). Every other
-- change goes through admin-only table policies or the RPCs at the bottom,
-- which validate the caller and the status transition.
-- SECURITY DEFINER code lives in the unexposed `private` schema; the public
-- RPCs are thin SECURITY INVOKER wrappers.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('client', 'driver', 'admin');
create type public.service_type as enum ('tourism', 'airport_transfer', 'long_distance', 'executive_event');
create type public.booking_status as enum (
  'pending', 'confirmed', 'driver_assigned', 'en_route_to_pickup',
  'arrived_at_pickup', 'in_progress', 'completed', 'cancelled'
);
create type public.payment_status as enum ('unpaid', 'paid');
create type public.payment_method as enum ('cash', 'eft', 'other');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 254),
  role public.user_role not null default 'client',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. role/active can only be changed by an admin.';
create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  vehicle_type text check (vehicle_type is null or char_length(vehicle_type) <= 60),
  registration text not null check (char_length(registration) between 2 and 20),
  seats smallint not null check (seats between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vehicles_registration_key on public.vehicles (upper(registration));

create sequence private.booking_order_seq as bigint start with 1;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  client_id uuid references public.profiles (id) on delete set null,
  client_name text not null check (char_length(client_name) between 2 and 120),
  client_phone text not null check (char_length(client_phone) between 6 and 30),
  client_email text check (client_email is null or char_length(client_email) <= 254),
  service_type public.service_type not null,
  pickup_location text not null check (char_length(pickup_location) between 3 and 300),
  dropoff_location text not null check (char_length(dropoff_location) between 3 and 300),
  pickup_at timestamptz not null,
  passengers smallint not null check (passengers between 1 and 60),
  luggage smallint not null default 0 check (luggage between 0 and 100),
  flight_number text check (flight_number is null or char_length(flight_number) <= 12),
  notes text check (notes is null or char_length(notes) <= 1000),
  status public.booking_status not null default 'pending',
  status_updated_at timestamptz not null default now(),
  driver_id uuid references public.profiles (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  quoted_price numeric(10, 2) check (quoted_price is null or quoted_price >= 0),
  payment_status public.payment_status not null default 'unpaid',
  payment_method public.payment_method,
  paid_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_driver_required check (
    status not in ('driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'in_progress')
    or driver_id is not null
  ),
  constraint bookings_paid_method_required check (payment_status = 'unpaid' or payment_method is not null)
);
comment on column public.bookings.client_id is 'Null for phone/WhatsApp bookings made by an admin for a client without an account.';
create index bookings_client_id_idx on public.bookings (client_id);
create index bookings_driver_id_idx on public.bookings (driver_id, pickup_at);
create index bookings_vehicle_id_idx on public.bookings (vehicle_id);
create index bookings_created_by_idx on public.bookings (created_by);
create index bookings_pickup_at_idx on public.bookings (pickup_at);
create index bookings_status_idx on public.bookings (status, pickup_at);

create table public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  status public.booking_status not null,
  note text check (note is null or char_length(note) <= 500),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_by_role public.user_role,
  created_at timestamptz not null default now()
);
create index booking_status_history_booking_idx on public.booking_status_history (booking_id, created_at);
create index booking_status_history_changed_by_idx on public.booking_status_history (changed_by);

create table public.booking_admin_notes (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 4000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
comment on table public.booking_admin_notes is 'Internal notes; visible to admins only.';
create index booking_admin_notes_updated_by_idx on public.booking_admin_notes (updated_by);

-- ---------------------------------------------------------------------------
-- Helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role()) = 'admin', false)
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Role is never taken from user metadata: every signup starts as a client.
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)), 120),
    left(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), 30),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function private.touch_updated_at();

create trigger booking_admin_notes_touch_updated_at
  before update on public.booking_admin_notes
  for each row execute function private.touch_updated_at();

create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  new.updated_at := now();
  -- No JWT subject means a trusted server-side context (SQL editor, service role, auth triggers).
  if v_uid is null then
    return new;
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email or new.created_at is distinct from old.created_at then
    raise exception 'This field cannot be changed.' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if not private.is_admin() then
      raise exception 'Only an administrator can change roles or account status.' using errcode = '42501';
    end if;
    if new.id = v_uid then
      raise exception 'Administrators cannot change their own role or deactivate their own account.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();

create or replace function private.bookings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
begin
  new.order_number := 'LRS-' || to_char(now() at time zone 'Africa/Johannesburg', 'YYYY') || '-'
    || lpad(nextval('private.booking_order_seq')::text, 5, '0');
  new.created_at := now();
  new.updated_at := now();
  new.status_updated_at := now();
  -- Dispatch always goes through assign_driver().
  new.driver_id := null;
  new.vehicle_id := null;
  new.cancellation_reason := null;
  new.flight_number := nullif(upper(trim(new.flight_number)), '');
  new.notes := nullif(trim(new.notes), '');

  if v_uid is not null and not private.is_admin() then
    select * into v_profile from public.profiles where id = v_uid;
    new.client_id := v_uid;
    new.created_by := v_uid;
    new.status := 'pending';
    new.quoted_price := null;
    new.payment_status := 'unpaid';
    new.payment_method := null;
    new.paid_at := null;
    new.client_name := coalesce(nullif(trim(new.client_name), ''), v_profile.full_name);
    new.client_phone := coalesce(nullif(trim(new.client_phone), ''), v_profile.phone);
    new.client_email := coalesce(v_profile.email, new.client_email);
    if new.pickup_at <= now() then
      raise exception 'Pickup date and time must be in the future.' using errcode = '22023';
    end if;
  else
    new.created_by := coalesce(v_uid, new.created_by);
    if new.status not in ('pending', 'confirmed') then
      raise exception 'New bookings start as pending or confirmed. Dispatch a driver after creating the booking.' using errcode = '22023';
    end if;
    if new.client_id is not null then
      select * into v_profile from public.profiles where id = new.client_id;
      if not found then
        raise exception 'Client account not found.' using errcode = '22023';
      end if;
      new.client_name := coalesce(nullif(trim(new.client_name), ''), v_profile.full_name);
      new.client_phone := coalesce(nullif(trim(new.client_phone), ''), v_profile.phone);
      new.client_email := coalesce(nullif(trim(new.client_email), ''), v_profile.email);
    end if;
    if new.payment_status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_before_insert
  before insert on public.bookings
  for each row execute function private.bookings_before_insert();

create or replace function private.bookings_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.order_number := old.order_number;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.flight_number := nullif(upper(trim(new.flight_number)), '');
  if new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.payment_status = 'unpaid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

create trigger bookings_before_update
  before update on public.bookings
  for each row execute function private.bookings_before_update();

create or replace function private.log_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role;
  v_note text := nullif(current_setting('app.status_note', true), '');
begin
  if v_uid is not null then
    select p.role into v_role from public.profiles p where p.id = v_uid;
  end if;
  if tg_op = 'INSERT' then
    insert into public.booking_status_history (booking_id, from_status, status, note, changed_by, changed_by_role)
    values (
      new.id, null, new.status,
      coalesce(v_note, case when v_role = 'admin' then 'Booking created by Lion''s Route' else 'Booking submitted' end),
      v_uid, v_role
    );
  elsif new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, status, note, changed_by, changed_by_role)
    values (new.id, old.status, new.status, v_note, v_uid, v_role);
  end if;
  return null;
end;
$$;

create trigger bookings_log_status
  after insert or update of status on public.bookings
  for each row execute function private.log_booking_status();

-- ---------------------------------------------------------------------------
-- Status / dispatch logic (SECURITY DEFINER, private)
-- ---------------------------------------------------------------------------
create or replace function private.next_trip_status(p_status public.booking_status)
returns public.booking_status
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'driver_assigned' then 'en_route_to_pickup'::public.booking_status
    when 'en_route_to_pickup' then 'arrived_at_pickup'::public.booking_status
    when 'arrived_at_pickup' then 'in_progress'::public.booking_status
    when 'in_progress' then 'completed'::public.booking_status
  end
$$;

create or replace function private.advance_booking_status(
  p_booking_id uuid,
  p_next_status public.booking_status,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role := private.current_user_role();
  v_booking public.bookings;
  v_expected public.booking_status;
begin
  if v_uid is null or v_role is null or v_role not in ('driver', 'admin') then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or (v_role = 'driver' and v_booking.driver_id is distinct from v_uid) then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  v_expected := private.next_trip_status(v_booking.status);
  if v_expected is null then
    raise exception 'This trip cannot be advanced while it is %.', replace(v_booking.status::text, '_', ' ') using errcode = '22023';
  end if;
  if p_next_status is distinct from v_expected then
    raise exception 'Invalid update: the next stage is %.', replace(v_expected::text, '_', ' ') using errcode = '22023';
  end if;
  perform set_config('app.status_note', coalesce(left(trim(p_note), 500), ''), true);
  update public.bookings set status = v_expected where id = p_booking_id returning * into v_booking;
  perform set_config('app.status_note', '', true);
  return v_booking;
end;
$$;

create or replace function private.cancel_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role := private.current_user_role();
  v_booking public.bookings;
  v_reason text := nullif(left(trim(p_reason), 500), '');
begin
  if v_uid is null or v_role is null then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or (v_role <> 'admin' and v_booking.client_id is distinct from v_uid) then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_role = 'admin' then
    if v_booking.status in ('completed', 'cancelled') then
      raise exception 'This booking is already %.', v_booking.status using errcode = '22023';
    end if;
  elsif v_booking.status not in ('pending', 'confirmed') or v_booking.driver_id is not null then
    raise exception 'This booking can no longer be cancelled online. Please call or WhatsApp us.' using errcode = '22023';
  end if;
  perform set_config('app.status_note', coalesce(v_reason, case when v_role = 'admin' then 'Cancelled by Lion''s Route' else 'Cancelled by client' end), true);
  update public.bookings
     set status = 'cancelled', cancellation_reason = v_reason
   where id = p_booking_id
  returning * into v_booking;
  perform set_config('app.status_note', '', true);
  return v_booking;
end;
$$;

create or replace function private.admin_set_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_note text := nullif(left(trim(p_note), 500), '');
begin
  if not private.is_admin() then
    raise exception 'Only an administrator can override a booking status.' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_booking.status = p_status then
    raise exception 'The booking is already %.', replace(p_status::text, '_', ' ') using errcode = '22023';
  end if;
  if p_status in ('driver_assigned', 'en_route_to_pickup', 'arrived_at_pickup', 'in_progress') and v_booking.driver_id is null then
    raise exception 'Assign a driver before moving the booking to this stage.' using errcode = '22023';
  end if;
  perform set_config('app.status_note', coalesce(v_note, 'Status updated by Lion''s Route'), true);
  update public.bookings
     set status = p_status,
         cancellation_reason = case when p_status = 'cancelled' then v_note else cancellation_reason end
   where id = p_booking_id
  returning * into v_booking;
  perform set_config('app.status_note', '', true);
  return v_booking;
end;
$$;

create or replace function private.assign_driver(
  p_booking_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings;
  v_driver public.profiles;
  v_vehicle public.vehicles;
  v_note text := nullif(left(trim(p_note), 500), '');
  v_message text;
begin
  if not private.is_admin() then
    raise exception 'Only an administrator can dispatch drivers.' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_booking.status in ('completed', 'cancelled') then
    raise exception 'A % booking cannot be dispatched.', v_booking.status using errcode = '22023';
  end if;

  if p_driver_id is null then
    if v_booking.status not in ('pending', 'confirmed', 'driver_assigned') then
      raise exception 'The trip is under way; reassign it to another driver instead of removing the driver.' using errcode = '22023';
    end if;
    perform set_config('app.status_note', coalesce(v_note, 'Driver unassigned'), true);
    update public.bookings
       set driver_id = null, vehicle_id = null,
           status = case when status = 'driver_assigned' then 'confirmed'::public.booking_status else status end
     where id = p_booking_id
    returning * into v_booking;
    perform set_config('app.status_note', '', true);
    return v_booking;
  end if;

  select * into v_driver from public.profiles where id = p_driver_id;
  if not found or v_driver.role <> 'driver' or not v_driver.active then
    raise exception 'Choose an active driver.' using errcode = '22023';
  end if;
  if p_vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = p_vehicle_id;
    if not found or not v_vehicle.active then
      raise exception 'Choose an active vehicle.' using errcode = '22023';
    end if;
  end if;

  v_message := coalesce(v_note,
    case when v_booking.driver_id is null then 'Driver assigned: ' else 'Driver reassigned: ' end
    || v_driver.full_name
    || coalesce(' (' || v_vehicle.name || ', ' || v_vehicle.registration || ')', ''));

  if v_booking.status in ('pending', 'confirmed') then
    perform set_config('app.status_note', left(v_message, 500), true);
    update public.bookings
       set driver_id = p_driver_id, vehicle_id = p_vehicle_id, status = 'driver_assigned'
     where id = p_booking_id
    returning * into v_booking;
    perform set_config('app.status_note', '', true);
  else
    update public.bookings
       set driver_id = p_driver_id, vehicle_id = p_vehicle_id
     where id = p_booking_id
    returning * into v_booking;
    insert into public.booking_status_history (booking_id, from_status, status, note, changed_by, changed_by_role)
    values (v_booking.id, v_booking.status, v_booking.status, left(v_message, 500), v_uid, 'admin');
  end if;
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPC wrappers (SECURITY INVOKER)
-- ---------------------------------------------------------------------------
create or replace function public.advance_booking_status(
  p_booking_id uuid,
  p_next_status public.booking_status,
  p_note text default null
)
returns public.bookings
language sql
security invoker
set search_path = ''
as $$
  select * from private.advance_booking_status(p_booking_id, p_next_status, p_note)
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings
language sql
security invoker
set search_path = ''
as $$
  select * from private.cancel_booking(p_booking_id, p_reason)
$$;

create or replace function public.admin_set_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_note text default null
)
returns public.bookings
language sql
security invoker
set search_path = ''
as $$
  select * from private.admin_set_booking_status(p_booking_id, p_status, p_note)
$$;

create or replace function public.assign_driver(
  p_booking_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null,
  p_note text default null
)
returns public.bookings
language sql
security invoker
set search_path = ''
as $$
  select * from private.assign_driver(p_booking_id, p_driver_id, p_vehicle_id, p_note)
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.current_user_role(),
  private.is_admin(),
  private.advance_booking_status(uuid, public.booking_status, text),
  private.cancel_booking(uuid, text),
  private.admin_set_booking_status(uuid, public.booking_status, text),
  private.assign_driver(uuid, uuid, uuid, text)
to authenticated, service_role;

revoke all on function
  public.advance_booking_status(uuid, public.booking_status, text),
  public.cancel_booking(uuid, text),
  public.admin_set_booking_status(uuid, public.booking_status, text),
  public.assign_driver(uuid, uuid, uuid, text)
from public, anon;
grant execute on function
  public.advance_booking_status(uuid, public.booking_status, text),
  public.cancel_booking(uuid, text),
  public.admin_set_booking_status(uuid, public.booking_status, text),
  public.assign_driver(uuid, uuid, uuid, text)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table privileges (explicit; anon gets nothing)
-- ---------------------------------------------------------------------------
revoke all on table
  public.profiles, public.vehicles, public.bookings,
  public.booking_status_history, public.booking_admin_notes
from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, phone, role, active) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update, delete on table public.bookings to authenticated;
grant select on table public.booking_status_history to authenticated;
grant select, insert, update, delete on table public.booking_admin_notes to authenticated;
grant all on table
  public.profiles, public.vehicles, public.bookings,
  public.booking_status_history, public.booking_admin_notes
to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.booking_admin_notes enable row level security;

-- profiles: yourself, admins, and (for clients) the driver assigned to one of your bookings.
create policy "profiles: read own, admin, or assigned driver"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.bookings b
      where b.driver_id = profiles.id and b.client_id = (select auth.uid())
    )
  );

create policy "profiles: update own or admin"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- vehicles: admins manage; others only see vehicles on bookings they can see.
create policy "vehicles: read admin or on visible booking"
  on public.vehicles for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.bookings b where b.vehicle_id = vehicles.id)
  );

create policy "vehicles: admin insert"
  on public.vehicles for insert to authenticated
  with check ((select private.is_admin()));

create policy "vehicles: admin update"
  on public.vehicles for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "vehicles: admin delete"
  on public.vehicles for delete to authenticated
  using ((select private.is_admin()));

-- bookings
create policy "bookings: read own, assigned, or admin"
  on public.bookings for select to authenticated
  using (
    client_id = (select auth.uid())
    or (driver_id = (select auth.uid()) and (select private.current_user_role()) = 'driver')
    or (select private.is_admin())
  );

create policy "bookings: clients create their own, admins create any"
  on public.bookings for insert to authenticated
  with check (
    (select private.is_admin())
    or (client_id = (select auth.uid()) and (select private.current_user_role()) = 'client')
  );

create policy "bookings: admin update"
  on public.bookings for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "bookings: admin delete"
  on public.bookings for delete to authenticated
  using ((select private.is_admin()));

-- status history: readable when the booking is readable; written only by triggers/RPCs.
create policy "booking_status_history: read with booking"
  on public.booking_status_history for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_status_history.booking_id));

-- admin notes
create policy "booking_admin_notes: admin read"
  on public.booking_admin_notes for select to authenticated
  using ((select private.is_admin()));

create policy "booking_admin_notes: admin insert"
  on public.booking_admin_notes for insert to authenticated
  with check ((select private.is_admin()));

create policy "booking_admin_notes: admin update"
  on public.booking_admin_notes for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "booking_admin_notes: admin delete"
  on public.booking_admin_notes for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes respects the SELECT policies above)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings, public.booking_status_history;
  end if;
end;
$$;
