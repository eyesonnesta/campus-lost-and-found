do $$ begin create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin;
exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (
  id uuid primary key,
  email text not null,
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;
