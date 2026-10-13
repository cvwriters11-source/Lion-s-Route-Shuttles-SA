# Online booking, dispatch & tracking

Lion's Route Shuttles SA online bookings run on [Supabase](https://supabase.com) (Postgres, Auth, Realtime). The React site talks to Supabase directly with the **publishable (anon) key only**; every rule is enforced in the database with Row Level Security (RLS) and database functions, so nothing in the browser can bypass it.

There is no online payment. The office sets a quoted price and marks bookings as paid (cash, EFT or other).

## Roles

| Role | Where | What they can do |
| --- | --- | --- |
| Client | `/book`, `/account`, `/account/bookings/:orderNumber` | Register, book trips, see only their own bookings, track status live, cancel while a booking is pending/confirmed and no driver is assigned. |
| Driver | `/driver` | See only jobs assigned to them, call/WhatsApp the client, move the trip forward one stage at a time (with an optional note). |
| Admin | `/admin/*` | Dashboard, search/filter bookings, create bookings for clients, confirm/edit/cancel, quote prices, mark payments, internal notes, dispatch drivers and vehicles, manage drivers, vehicles and clients, override status. |

## Status flow

`pending` (Submitted) → `confirmed` → `driver_assigned` → `en_route_to_pickup` → `arrived_at_pickup` → `in_progress` → `completed`, plus `cancelled`.

Every change is written to `booking_status_history` automatically (time, who, their role, optional note). Clients see the history as their tracking timeline.

## Database

Migration: `supabase/migrations/20261013061501_booking_system.sql`

- `profiles`: one per auth user (name, phone, email, role `client|driver|admin`, active). A trigger creates it on sign-up with role `client`. Users cannot change their own role or active flag, and roles are never read from sign-up metadata.
- `vehicles`: name, type, registration (unique), seats, active.
- `bookings`: order number `LRS-YYYY-NNNNN` from a Postgres sequence, client/contact details, trip details, status, driver, vehicle, quoted price (ZAR), payment status/method/date, cancellation reason.
- `booking_status_history`: the audit trail and timeline.
- `booking_admin_notes`: internal notes, visible to admins only.

Status changes only happen through these functions (all check the caller's role):

- `advance_booking_status(booking_id, next_status, note)`: the assigned driver (or an admin) moves to the next stage only.
- `cancel_booking(booking_id, reason)`
- `admin_set_booking_status(booking_id, status, note)`: admin override.
- `assign_driver(booking_id, driver_id, vehicle_id, note)`: dispatch, reassign or unassign.

Security-definer logic lives in a `private` schema that is not exposed through the API; `public` only has thin wrappers. Anonymous visitors have no access to any table or function.

## Setting up the Supabase project

1. **Create the project** (free plan) in the Supabase dashboard, e.g. named `lions-route-shuttles`, region close to South Africa (e.g. `eu-west` or `af-south` if offered).
2. **Apply the migration.** Pick one:
   - SQL editor: paste the contents of `supabase/migrations/20261013061501_booking_system.sql` and run it.
   - CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Check security (optional but recommended, before launch).** Run `supabase/tests/security_checks.sql` in the SQL editor. It runs inside a transaction that is rolled back and ends with `ALL SECURITY CHECKS PASSED`. It uses a few order numbers from the sequence (sequences are not rolled back). If no real bookings exist yet you can reset the counter afterwards:

   ```sql
   select setval('private.booking_order_seq', 1, false);
   ```

4. **Run the advisors** (Dashboard → Advisors → Security and Performance) and resolve anything they flag.
5. **Auth settings** (Dashboard → Authentication):
   - Keep **Confirm email** on. After confirming, customers sign in and their trip details are still filled in on that device.
   - **URL configuration**: set the Site URL to the live site (e.g. `https://lionsrouteshuttles.co.za`) and add redirect URLs for `https://<your-domain>/login` and `http://localhost:5173/login` for local development.
   - Consider a custom SMTP sender so confirmation emails come from your domain.
6. **Realtime**: the migration adds `bookings` and `booking_status_history` to the `supabase_realtime` publication. Realtime respects RLS, so people only receive changes to rows they are allowed to see.

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored) and fill in the values from Dashboard → Project Settings → API:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>
```

Never put the `service_role` / secret key in any `VITE_` variable or anywhere in the frontend. Set the same two variables in your hosting provider (e.g. Vercel → Project → Settings → Environment Variables) and redeploy.

Without these variables the site still works; the booking pages show a "coming soon" panel with WhatsApp and phone links.

## First admin (Mazenoch@gmail.com)

1. Register at `/register` with Mazenoch@gmail.com and confirm the email.
2. In the SQL editor run:

   ```sql
   update public.profiles
   set role = 'admin'
   where lower(email) = lower('Mazenoch@gmail.com');
   ```

3. Sign out and back in; the account menu now shows **Admin**.

Further admins can be promoted from **Admin → Clients → (person) → Role**.

## Adding drivers

Drivers create their own login so nobody else knows their password, and no secret key is needed:

1. The driver registers at `/register` with their own email and phone.
2. An admin opens **Admin → Drivers**, searches for them and clicks **Make driver**.
3. To stop a driver logging in to jobs, use **Deactivate** (keeps their history) or **Remove driver role**.

## Test accounts

Create test accounts only with clearly fake addresses such as `test-admin@example.com`, `test-driver@example.com` and `test-client@example.com`, and promote them with the SQL above (use `'driver'` for drivers).

To remove test data:

1. Delete test bookings first (they reference profiles):

   ```sql
   delete from public.bookings
   where client_email ilike 'test-%@example.com'
      or client_id in (select id from public.profiles where email ilike 'test-%@example.com')
      or driver_id in (select id from public.profiles where email ilike 'test-%@example.com');
   ```

2. Delete the users in Dashboard → Authentication → Users (search `example.com`). Their profiles are removed automatically.

## Local verification

The system was verified locally against the same migration on Postgres 17 with PostgREST and a Supabase-compatible auth/realtime stand-in:

- `security_checks.sql`: all checks pass (client isolation, driver isolation, no stage skipping, no self-promotion, anonymous access denied, forged inserts sanitised, cancellation rules).
- Browser end-to-end: client books and registers → admin confirms, prices, dispatches → driver advances every stage on a phone → client tracking updates live → admin marks paid.
- Screenshots: `docs/screenshots/`.

## Known limitations

- No email/SMS/WhatsApp notifications are sent automatically; clients see updates on their tracking page and the office can use the WhatsApp buttons.
- Admin lists show up to 200 bookings per filter; narrow by date or status for older records.
- Live tracking shows stage updates, not GPS location.
