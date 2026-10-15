# Database work

`migrations/20261015090000_reporting_foundation.sql` is the first bounded part of
PataTena Slice 1. Apply it to a **fresh** Supabase project through the Supabase
CLI migration workflow after the project is configured. Do not paste only part
of the file into the SQL editor.

The migration creates the report tables, a sanitized `public_items` view,
email and campus eligibility checks, draft-only client writes, and an
append-only item audit trail. Browser roles cannot select
`items.private_identifiers`, change item status, promote a profile, or read
the audit table. There are no publication, image-upload, claim, or moderation
endpoints in this piece. Draft reports cannot become public through the
browser API yet.

Before connected testing:

1. Create a development Supabase project and enable email confirmation.
2. Add the real campus and its approved email domains through a trusted
   migration or administrative operation. No campus is seeded here because
   the approved institution and domains have not been supplied.
3. Apply the migration and test anonymous, verified member, unverified member,
   and outside-domain access against the actual Supabase Auth and PostgREST
   environment. A disposable PostgreSQL 17 run has verified the SQL and core
   RLS behavior, but it does not substitute for this connected check.

The `tests/` scripts reproduce that PostgreSQL 17 smoke test in a **fresh,
disposable database**. From the repository root, create an empty test database
and run:

```sh
psql -X -v ON_ERROR_STOP=1 -d patatena_test -f supabase/tests/standalone_postgres_stub.sql -f supabase/migrations/20261015090000_reporting_foundation.sql -f supabase/tests/reporting_foundation_smoke.sql
```

The scripts create test auth roles and users. Never run them against a Supabase
project or an existing application database.

Do not connect the reporting form to public publication until image validation,
content checks, storage policies, and trusted state transitions are added.
