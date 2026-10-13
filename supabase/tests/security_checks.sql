-- Security & workflow checks for the booking system.
--
-- Safe to run in the Supabase SQL editor: everything happens inside one
-- transaction that is rolled back at the end, so no test data is kept.
-- Any failed check raises an exception that names the problem.
-- Expected final output: 'ALL SECURITY CHECKS PASSED'.

begin;

create schema lrs_test;
grant usage on schema lrs_test to anon, authenticated;

create table lrs_test.ids (key text primary key, id uuid not null);
grant select, insert on lrs_test.ids to authenticated;

create function lrs_test.id(p_key text) returns uuid language sql stable as $$
  select id from lrs_test.ids where key = p_key
$$;

-- Become a signed-in user (role authenticated + JWT claims) for the rest of the transaction.
create function lrs_test.act_as(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', lrs_test.id(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function lrs_test.fail(p_message text) returns void language plpgsql as $$
begin
  raise exception 'SECURITY CHECK FAILED: %', p_message;
end;
$$;
grant execute on all functions in schema lrs_test to anon, authenticated;

-- Test users -----------------------------------------------------------------
insert into lrs_test.ids values
  ('admin', gen_random_uuid()), ('driver1', gen_random_uuid()), ('driver2', gen_random_uuid()),
  ('client1', gen_random_uuid()), ('client2', gen_random_uuid());

insert into auth.users (id, email, raw_user_meta_data)
select id, key || '@lrs-test.example.com',
       jsonb_build_object('full_name', 'Test ' || key, 'phone', '0820000000', 'role', 'admin')
from lrs_test.ids;

do $$
begin
  if (select count(*) from public.profiles p join lrs_test.ids i on i.id = p.id where p.role = 'client') <> 5 then
    perform lrs_test.fail('signup trigger must create a client profile for every user, ignoring a role in metadata');
  end if;
end $$;

update public.profiles set role = 'admin' where id = lrs_test.id('admin');
update public.profiles set role = 'driver' where id in (lrs_test.id('driver1'), lrs_test.id('driver2'));

-- Vehicles: only admins can create ---------------------------------------------
select lrs_test.act_as('client1');
do $$
begin
  begin
    insert into public.vehicles (name, registration, seats) values ('Sneaky van', 'XX 00 XX GP', 8);
    perform lrs_test.fail('client inserted a vehicle');
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select lrs_test.act_as('admin');
with created as (
  insert into public.vehicles (name, vehicle_type, registration, seats)
  values ('Test Executive Sedan', 'Sedan', 'LRS 001 GP', 4) returning id
)
insert into lrs_test.ids select 'vehicle1', id from created;
reset role;
select set_config('request.jwt.claims', '', true);

-- Client creates a booking with forged privileged fields -------------------------
select lrs_test.act_as('client1');
with created as (
  insert into public.bookings (
    order_number, client_id, client_name, client_phone, service_type, pickup_location, dropoff_location,
    pickup_at, passengers, luggage, flight_number, status, driver_id, quoted_price, payment_status, payment_method
  ) values (
    'HACKED-1', lrs_test.id('client2'), 'Test Client One', '0821111111', 'airport_transfer',
    'O.R. Tambo International Airport', 'Sandton City Hotel', now() + interval '2 days', 2, 2, 'sa 123',
    'completed', lrs_test.id('driver1'), 1, 'paid', 'cash'
  ) returning id
)
insert into lrs_test.ids select 'booking1', id from created;

do $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = lrs_test.id('booking1');
  if b.id is null then perform lrs_test.fail('client cannot read the booking they created'); end if;
  if b.order_number !~ '^LRS-[0-9]{4}-[0-9]{5}$' then perform lrs_test.fail('order number not generated: ' || b.order_number); end if;
  if b.client_id <> lrs_test.id('client1') then perform lrs_test.fail('client booked on behalf of another user'); end if;
  if b.status <> 'pending' then perform lrs_test.fail('client set initial status'); end if;
  if b.driver_id is not null then perform lrs_test.fail('client assigned a driver'); end if;
  if b.quoted_price is not null or b.payment_status <> 'unpaid' then perform lrs_test.fail('client set price/payment'); end if;
  if b.flight_number <> 'SA 123' then perform lrs_test.fail('flight number not normalised'); end if;
  if (select count(*) from public.booking_status_history where booking_id = b.id and status = 'pending') <> 1 then
    perform lrs_test.fail('creation not recorded in status history');
  end if;
end $$;

do $$
begin
  begin
    insert into public.bookings (client_name, client_phone, service_type, pickup_location, dropoff_location, pickup_at, passengers)
    values ('Test Client One', '0821111111', 'tourism', 'Somewhere', 'Elsewhere', now() - interval '1 day', 1);
    perform lrs_test.fail('booking in the past accepted');
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Client cannot modify the booking directly, change role, or call admin RPCs ----
do $$
declare n int;
begin
  update public.bookings set status = 'completed', quoted_price = 0 where id = lrs_test.id('booking1');
  get diagnostics n = row_count;
  if n <> 0 then perform lrs_test.fail('client updated a booking directly'); end if;

  delete from public.bookings where id = lrs_test.id('booking1');
  get diagnostics n = row_count;
  if n <> 0 then perform lrs_test.fail('client deleted a booking'); end if;

  begin
    update public.profiles set role = 'admin' where id = lrs_test.id('client1');
    perform lrs_test.fail('client changed own role');
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set active = false where id = lrs_test.id('client1');
    perform lrs_test.fail('client changed own active flag');
  exception when insufficient_privilege then null;
  end;

  update public.profiles set full_name = 'Test Client One Renamed' where id = lrs_test.id('client1');
  get diagnostics n = row_count;
  if n <> 1 then perform lrs_test.fail('client cannot update own name'); end if;

  update public.profiles set full_name = 'Hacked' where id = lrs_test.id('client2');
  get diagnostics n = row_count;
  if n <> 0 then perform lrs_test.fail('client updated another profile'); end if;

  if (select count(*) from public.profiles) <> 1 then perform lrs_test.fail('client can list other profiles'); end if;

  begin
    perform public.admin_set_booking_status(lrs_test.id('booking1'), 'confirmed', null);
    perform lrs_test.fail('client used admin_set_booking_status');
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.assign_driver(lrs_test.id('booking1'), lrs_test.id('driver1'), null, null);
    perform lrs_test.fail('client used assign_driver');
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.advance_booking_status(lrs_test.id('booking1'), 'en_route_to_pickup', null);
    perform lrs_test.fail('client advanced a trip');
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.booking_admin_notes (booking_id, notes) values (lrs_test.id('booking1'), 'x');
    perform lrs_test.fail('client wrote admin notes');
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Another client cannot see or cancel it ----------------------------------------
select lrs_test.act_as('client2');
do $$
begin
  if exists (select 1 from public.bookings where id = lrs_test.id('booking1')) then
    perform lrs_test.fail('client2 can read client1 booking');
  end if;
  if exists (select 1 from public.booking_status_history where booking_id = lrs_test.id('booking1')) then
    perform lrs_test.fail('client2 can read client1 booking history');
  end if;
  begin
    perform public.cancel_booking(lrs_test.id('booking1'), 'not mine');
    perform lrs_test.fail('client2 cancelled client1 booking');
  exception when no_data_found then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Unassigned driver sees nothing ---------------------------------------------------
select lrs_test.act_as('driver1');
do $$
begin
  if exists (select 1 from public.bookings where id = lrs_test.id('booking1')) then
    perform lrs_test.fail('driver can read an unassigned booking');
  end if;
  begin
    perform public.advance_booking_status(lrs_test.id('booking1'), 'en_route_to_pickup', null);
    perform lrs_test.fail('driver advanced an unassigned booking');
  exception when no_data_found then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Admin confirms, prices and dispatches ---------------------------------------------
select lrs_test.act_as('admin');
do $$
declare b public.bookings;
begin
  if (select count(*) from public.profiles where id in (select id from lrs_test.ids)) <> 5 then
    perform lrs_test.fail('admin cannot list profiles');
  end if;
  begin
    update public.profiles set role = 'client' where id = lrs_test.id('admin');
    perform lrs_test.fail('admin changed own role');
  exception when insufficient_privilege then null;
  end;

  b := public.admin_set_booking_status(lrs_test.id('booking1'), 'confirmed', 'Confirmed by phone');
  if b.status <> 'confirmed' then perform lrs_test.fail('admin could not confirm'); end if;

  update public.bookings set quoted_price = 850 where id = lrs_test.id('booking1');
  insert into public.booking_admin_notes (booking_id, notes) values (lrs_test.id('booking1'), 'VIP client');

  begin
    perform public.assign_driver(lrs_test.id('booking1'), lrs_test.id('client2'), null, null);
    perform lrs_test.fail('a non-driver was dispatched');
  exception when invalid_parameter_value then null;
  end;

  b := public.assign_driver(lrs_test.id('booking1'), lrs_test.id('driver1'), lrs_test.id('vehicle1'), null);
  if b.status <> 'driver_assigned' or b.driver_id <> lrs_test.id('driver1') then
    perform lrs_test.fail('dispatch did not assign the driver');
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Other driver still sees nothing ---------------------------------------------------
select lrs_test.act_as('driver2');
do $$
begin
  if exists (select 1 from public.bookings where id = lrs_test.id('booking1')) then
    perform lrs_test.fail('driver2 can read driver1 job');
  end if;
  begin
    perform public.advance_booking_status(lrs_test.id('booking1'), 'en_route_to_pickup', null);
    perform lrs_test.fail('driver2 advanced driver1 job');
  exception when no_data_found then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Assigned driver works through the stages in order ----------------------------------
select lrs_test.act_as('driver1');
do $$
declare n int; b public.bookings;
begin
  if not exists (select 1 from public.bookings where id = lrs_test.id('booking1')) then
    perform lrs_test.fail('assigned driver cannot read job');
  end if;
  if exists (select 1 from public.booking_admin_notes) then
    perform lrs_test.fail('driver can read admin notes');
  end if;

  update public.bookings set status = 'completed' where id = lrs_test.id('booking1');
  get diagnostics n = row_count;
  if n <> 0 then perform lrs_test.fail('driver updated booking directly'); end if;

  begin
    perform public.advance_booking_status(lrs_test.id('booking1'), 'in_progress', null);
    perform lrs_test.fail('driver skipped a stage');
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.cancel_booking(lrs_test.id('booking1'), null);
    perform lrs_test.fail('driver cancelled a booking');
  exception when no_data_found then null;
  end;

  b := public.advance_booking_status(lrs_test.id('booking1'), 'en_route_to_pickup', 'Leaving the depot');
  b := public.advance_booking_status(lrs_test.id('booking1'), 'arrived_at_pickup', null);
  b := public.advance_booking_status(lrs_test.id('booking1'), 'in_progress', null);
  b := public.advance_booking_status(lrs_test.id('booking1'), 'completed', 'Dropped off safely');
  if b.status <> 'completed' then perform lrs_test.fail('driver could not complete the trip'); end if;

  begin
    perform public.advance_booking_status(lrs_test.id('booking1'), 'completed', null);
    perform lrs_test.fail('completed trip advanced again');
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Client sees the full timeline, the driver and vehicle --------------------------------
select lrs_test.act_as('client1');
do $$
begin
  if (select count(*) from public.booking_status_history where booking_id = lrs_test.id('booking1')) <> 7 then
    perform lrs_test.fail('timeline should have 7 entries');
  end if;
  if not exists (select 1 from public.booking_status_history
                 where booking_id = lrs_test.id('booking1') and status = 'en_route_to_pickup'
                   and note = 'Leaving the depot' and changed_by_role = 'driver') then
    perform lrs_test.fail('driver note / role not recorded');
  end if;
  if not exists (select 1 from public.profiles where id = lrs_test.id('driver1')) then
    perform lrs_test.fail('client cannot see assigned driver name');
  end if;
  if exists (select 1 from public.profiles where id = lrs_test.id('driver2')) then
    perform lrs_test.fail('client can see an unrelated driver');
  end if;
  if not exists (select 1 from public.vehicles where id = lrs_test.id('vehicle1')) then
    perform lrs_test.fail('client cannot see assigned vehicle');
  end if;
  if exists (select 1 from public.booking_admin_notes) then
    perform lrs_test.fail('client can read admin notes');
  end if;
  begin
    perform public.cancel_booking(lrs_test.id('booking1'), null);
    perform lrs_test.fail('client cancelled a completed booking');
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Client cancels a fresh booking, but not one already dispatched
with created as (
  insert into public.bookings (client_name, client_phone, service_type, pickup_location, dropoff_location, pickup_at, passengers)
  values ('Test Client One', '0821111111', 'tourism', 'Rosebank', 'Soweto', now() + interval '3 days', 3) returning id
)
insert into lrs_test.ids select 'booking2', id from created;
with created as (
  insert into public.bookings (client_name, client_phone, service_type, pickup_location, dropoff_location, pickup_at, passengers)
  values ('Test Client One', '0821111111', 'long_distance', 'Johannesburg', 'Durban', now() + interval '4 days', 2) returning id
)
insert into lrs_test.ids select 'booking3', id from created;
do $$
declare b public.bookings;
begin
  b := public.cancel_booking(lrs_test.id('booking2'), 'Plans changed');
  if b.status <> 'cancelled' then perform lrs_test.fail('client could not cancel pending booking'); end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select lrs_test.act_as('admin');
select public.assign_driver(lrs_test.id('booking3'), lrs_test.id('driver1'), null, null);
update public.bookings set payment_status = 'paid', payment_method = 'cash' where id = lrs_test.id('booking1');
do $$
begin
  if (select paid_at from public.bookings where id = lrs_test.id('booking1')) is null then
    perform lrs_test.fail('paid_at not stamped');
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select lrs_test.act_as('client1');
do $$
begin
  begin
    perform public.cancel_booking(lrs_test.id('booking3'), null);
    perform lrs_test.fail('client cancelled a dispatched booking');
  exception when invalid_parameter_value then null;
  end;
  if (select payment_status from public.bookings where id = lrs_test.id('booking1')) <> 'paid' then
    perform lrs_test.fail('client cannot see payment status');
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Deactivated driver loses access --------------------------------------------------
update public.profiles set active = false where id = lrs_test.id('driver1');
select lrs_test.act_as('driver1');
do $$
begin
  if exists (select 1 from public.bookings) then
    perform lrs_test.fail('deactivated driver can still read jobs');
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Anonymous users get nothing -------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform 1 from public.bookings limit 1;
    perform lrs_test.fail('anon can query bookings');
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.profiles limit 1;
    perform lrs_test.fail('anon can query profiles');
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.booking_status_history limit 1;
    perform lrs_test.fail('anon can query status history');
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cancel_booking(gen_random_uuid(), null);
    perform lrs_test.fail('anon can call RPCs');
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select 'ALL SECURITY CHECKS PASSED' as result;

rollback;
