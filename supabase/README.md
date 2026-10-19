# Database work

PataTena Slice 1 uses three ordered migrations:

1. `migrations/20261015090000_reporting_foundation.sql` creates the report tables and narrow browser access.
2. `migrations/20261019100000_text_reporting.sql` seeds the specification's general categories and adds trusted functions to create, edit, publish, and archive text reports.
3. `migrations/20261019110000_item_image_storage.sql` creates a private, size- and MIME-limited `item-images` bucket and a download-only policy for linked images. Restrictive policies keep browser writes and object listing closed even if another feature later adds a broad Storage policy.

Apply all three to a **fresh** Supabase project through the Supabase CLI migration workflow after the project is configured. Do not paste only part of a migration into the SQL editor.

The migration creates the report tables, a sanitized `public_items` view,
email and campus eligibility checks, draft-only client writes, and an
append-only item audit trail. Browser roles cannot select
`items.private_identifiers`, change item status, promote a profile, or read
the audit table. The second migration adds `create_item_draft`,
`update_item_draft`, `publish_item`, and `archive_item`. Each checks the verified campus member;
publication also checks an active category and location, date, ownership,
status, and common contact-detail patterns. The existing audit trigger records
creation, edits, publication, and archival without logging private report text.
The reporting date boundary is `Africa/Nairobi` in both the browser and database.

Images cannot be uploaded or published in this slice. The Storage migration
prepares a private bucket with a 5 MiB per-object limit and allows only JPEG,
PNG, and WebP. It deliberately gives browser roles no image upload, update,
delete, or `item_images` insertion path. A later trusted image pipeline must
verify file bytes, dimensions, size, ownership, and the five-image limit, strip
embedded metadata where practical, and link the processed object to its item.
The contact-detail check is a first privacy gate, not a complete moderation
system. Claims, matching,
messaging, moderation, and notifications remain later work.

Before connected testing:

1. Create a development Supabase project and enable email confirmation.
2. Add the real campus, its approved email domains, and active locations
   through a trusted migration or administrative operation. No campus is
   seeded in the release migrations because the approved institution and
   domains have not been supplied. Example data exists only in the local tests.
3. Apply the migrations and test anonymous, verified member, unverified member,
   and outside-domain access against the actual Supabase Auth and PostgREST
   environment. Test Storage uploads, listing, and downloads with the real
   Storage API. Disposable PostgreSQL 17 tests verify the SQL and core RLS
   behavior, but do not exercise the Storage API or file-byte validation.

On Windows with PostgreSQL 17 installed, run the repeatable **disposable**
database test from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase\tests\run-local-postgres.ps1
```

The script creates a temporary loopback-only PostgreSQL instance, applies all
three migrations, runs three smoke tests, stops the instance, and deletes its temporary
cluster. To use another PostgreSQL installation, pass `-PgBin` with its `bin`
directory. The equivalent manual command against a **fresh, disposable**
database is:

```sh
psql -X -v ON_ERROR_STOP=1 -d patatena_test -f supabase/tests/standalone_postgres_stub.sql -f supabase/migrations/20261015090000_reporting_foundation.sql -f supabase/migrations/20261019100000_text_reporting.sql -f supabase/migrations/20261019110000_item_image_storage.sql -f supabase/tests/reporting_foundation_smoke.sql -f supabase/tests/text_reporting_smoke.sql -f supabase/tests/item_image_storage_smoke.sql
```

The scripts create test auth roles and users. Never run them against a Supabase
project or an existing application database.

Do not enable image uploads until server-side image validation, trusted linking,
and the Storage policies are tested against a real Supabase project.
