\set ON_ERROR_STOP on
insert into public.campuses (id, name, slug, email_domains)
values ('11111111-1111-4111-8111-111111111111', 'Example Campus', 'example-campus', array['example.edu']);
insert into public.categories (id, name, slug)
values ('22222222-2222-4222-8222-222222222222', 'Test keys', 'test-keys');
insert into auth.users (id, email, email_confirmed_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@example.edu', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'unverified@example.edu', null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'outsider@other.edu', now());

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
insert into public.profiles (id, campus_id, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111', 'Verified Owner');
insert into public.items
  (owner_id, campus_id, category_id, kind, title, description, event_date, private_identifiers)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   'lost', 'Blue keyring', 'Lost my blue keyring near the library.', current_date,
   'Engraved initials: secret');
do $$
begin
  if (select count(*) from public.items where status = 'draft') <> 1 then
    raise exception 'Owner cannot read their draft';
  end if;
  if public.my_item_private_identifiers((select id from public.items limit 1))
    <> 'Engraved initials: secret' then
    raise exception 'Owner cannot read private identifiers through the controlled function';
  end if;
  if has_column_privilege('authenticated', 'public.items', 'private_identifiers', 'SELECT') then
    raise exception 'Private identifiers leaked through table select';
  end if;
  if has_column_privilege('authenticated', 'public.items', 'status', 'UPDATE') then
    raise exception 'Client can change item status';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') then
    raise exception 'Client can change its role';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'campus_id', 'UPDATE') then
    raise exception 'Client can move itself between campuses';
  end if;
end;
$$;
reset role;
select id as item_id from public.items where title = 'Blue keyring' \gset
set request.test.item_id = :'item_id';
update public.profiles set status = 'suspended'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
do $$
begin
  if (select count(*) from public.items where status = 'draft') <> 0 then
    raise exception 'Suspended member can read a private draft';
  end if;
  if public.my_item_private_identifiers(current_setting('request.test.item_id')::uuid) is not null then
    raise exception 'Suspended member can read private identifiers';
  end if;
end;
$$;
reset role;
update public.profiles set status = 'active'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
do $$
begin
  if public.email_approved_for_campus('11111111-1111-4111-8111-111111111111') then
    raise exception 'Unverified email passed gate';
  end if;
  begin
    insert into public.profiles (id, campus_id, display_name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111', 'Unverified User');
    raise exception 'Unverified user created a profile';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.items) <> 0 then
    raise exception 'Other member can see a private draft';
  end if;
  if public.my_item_private_identifiers(current_setting('request.test.item_id')::uuid) is not null then
    raise exception 'Other member can read private identifiers';
  end if;
end;
$$;
reset role;

set request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
do $$
begin
  if public.email_approved_for_campus('11111111-1111-4111-8111-111111111111') then
    raise exception 'Outside domain passed gate';
  end if;
  begin
    insert into public.profiles (id, campus_id, display_name)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '11111111-1111-4111-8111-111111111111', 'Outside User');
    raise exception 'Outside-domain user created a profile';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set request.jwt.claim.sub = '';
update public.items set status = 'published', published_at = now()
where title = 'Blue keyring';
set role anon;
do $$
begin
  if (select count(*) from public.public_items) <> 1 then
    raise exception 'Anonymous user cannot read public listing';
  end if;
  if has_column_privilege('anon', 'public.items', 'owner_id', 'SELECT')
     or has_column_privilege('anon', 'public.items', 'private_identifiers', 'SELECT') then
    raise exception 'Anonymous user can read private item columns';
  end if;
  if has_table_privilege('anon', 'public.audit_events', 'SELECT') then
    raise exception 'Anonymous user can read audit events';
  end if;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.audit_events where entity_type = 'item') <> 2 then
    raise exception 'Item audit trigger did not append both events';
  end if;
end;
$$;
select 'RLS smoke test passed' as result;
