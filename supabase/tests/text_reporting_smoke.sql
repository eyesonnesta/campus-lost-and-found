\set ON_ERROR_STOP on

insert into public.locations (id, campus_id, name)
values ('33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111', 'Library entrance');

do $$
begin
  if has_function_privilege('anon', 'public.create_item_draft(public.item_kind,uuid,uuid,text,text,date,text,text,text,text,text[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.publish_item(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.archive_item(uuid)', 'EXECUTE') then
    raise exception 'Anonymous browser role can call trusted report functions';
  end if;
  if not public.has_public_contact_details('Call 0712345678')
     or not public.has_public_contact_details('See https://example.com')
     or public.has_public_contact_details('Black wallet near library') then
    raise exception 'Public contact-detail scanner failed common cases';
  end if;
end;
$$;

set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.create_item_draft(
      'lost', '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      'Unverified draft', 'An unverified member cannot create a draft.', current_date);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Unverified account created a report'; end if;
end;
$$;
reset role;

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.create_item_draft(
      'lost', '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      'Future dated item', 'This report should not be saved with a future date.',
      current_date + 1);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Future-dated report was accepted'; end if;
end;
$$;
select public.create_item_draft(
  'found', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'Black wallet found', 'Found a black wallet beside the library entrance.',
  current_date, p_questions => array['What colour is the lining?']) as workflow_item_id \gset
set request.test.workflow_item_id = :'workflow_item_id';

do $$
begin
  if (select count(*) from public.items
      where id = current_setting('request.test.workflow_item_id')::uuid
        and status = 'draft' and kind = 'found') <> 1 then
    raise exception 'Draft was not created for its owner';
  end if;
  if (select count(*) from public.verification_questions
      where item_id = current_setting('request.test.workflow_item_id')::uuid) <> 1 then
    raise exception 'Found-item question was not saved atomically';
  end if;
  if (select count(*) from public.public_items
      where id = current_setting('request.test.workflow_item_id')::uuid) <> 0 then
    raise exception 'Draft leaked to the public view';
  end if;
end;
$$;

select public.update_item_draft(
  current_setting('request.test.workflow_item_id')::uuid,
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'Black wallet near library',
  'Found a black wallet near the library entrance.', current_date,
  p_questions => array['What is printed inside?']);
do $$
begin
  if (select title from public.items
      where id = current_setting('request.test.workflow_item_id')::uuid)
      <> 'Black wallet near library' then
    raise exception 'Owner edit did not update the draft';
  end if;
  if (select question from public.verification_questions
      where item_id = current_setting('request.test.workflow_item_id')::uuid)
      <> 'What is printed inside?' then
    raise exception 'Owner edit did not replace private questions';
  end if;
end;
$$;

select public.create_item_draft(
  'lost', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'Silver laptop lost', 'Please contact me at owner@example.edu about my laptop.',
  current_date) as contact_item_id \gset
set request.test.contact_item_id = :'contact_item_id';
do $$
declare rejected boolean := false;
begin
  begin
    perform public.publish_item(current_setting('request.test.contact_item_id')::uuid);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Contact details passed publication'; end if;
  if (select status from public.items
      where id = current_setting('request.test.contact_item_id')::uuid) <> 'draft' then
    raise exception 'Rejected report changed state';
  end if;
end;
$$;
reset role;

insert into auth.users (id, email, email_confirmed_at)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'other@example.edu', now());
set request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set role authenticated;
insert into public.profiles (id, campus_id, display_name)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '11111111-1111-4111-8111-111111111111', 'Other Member');
do $$
declare rejected boolean := false;
begin
  begin
    perform public.publish_item(current_setting('request.test.workflow_item_id')::uuid);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Another member published the draft'; end if;
  rejected := false;
  begin
    perform public.update_item_draft(
      current_setting('request.test.workflow_item_id')::uuid,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      'Stolen title', 'This is an unauthorized change to a report.', current_date);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Another member edited the draft'; end if;
end;
$$;
reset role;

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
select public.publish_item(current_setting('request.test.workflow_item_id')::uuid);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.publish_item(current_setting('request.test.workflow_item_id')::uuid);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Published item was published twice'; end if;
  rejected := false;
  begin
    perform public.update_item_draft(
      current_setting('request.test.workflow_item_id')::uuid,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      'Edited published report', 'This published report must not be editable.', current_date);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Published report was edited'; end if;
end;
$$;
reset role;

set request.jwt.claim.sub = '';
set role anon;
do $$
begin
  if (select count(*) from public.public_items
      where id = current_setting('request.test.workflow_item_id')::uuid) <> 1 then
    raise exception 'Published item is absent from public view';
  end if;
  if has_table_privilege('anon', 'public.verification_questions', 'SELECT') then
    raise exception 'Anonymous user can read private questions';
  end if;
end;
$$;
reset role;

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
select public.archive_item(current_setting('request.test.workflow_item_id')::uuid);
reset role;
set request.jwt.claim.sub = '';
set role anon;
do $$
begin
  if (select count(*) from public.public_items
      where id = current_setting('request.test.workflow_item_id')::uuid) <> 0 then
    raise exception 'Archived report remains public';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.audit_events
      where entity_id = current_setting('request.test.workflow_item_id')::uuid) <> 4 then
    raise exception 'Creation, edit, publication, and archive were not audited';
  end if;
end;
$$;
select 'Text reporting smoke test passed' as result;
