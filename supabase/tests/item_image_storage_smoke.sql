\set ON_ERROR_STOP on
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'item-images' and not public
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  ) then
    raise exception 'Private item image bucket restrictions are missing';
  end if;
end;
$$;

-- Simulate a permissive policy added by another feature. The restrictive
-- bucket boundary must still prevent listing, upload, modification, and leaks.
create policy test_neighboring_storage_access on storage.objects
  for all to anon, authenticated using (true) with check (true);

insert into public.items
  (id, owner_id, campus_id, category_id, kind, title, description,
   event_date)
values
  ('44444444-4444-4444-8444-444444444444',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   'lost', 'Draft keys image', 'Private draft used for image policy testing.',
   current_date);
do $$
begin
  begin
    insert into public.item_images (item_id, storage_path, alt_text, sort_order)
    values ('44444444-4444-4444-8444-444444444444',
            '55555555-5555-4555-8555-555555555555/77777777-7777-4777-8777-777777777777.png',
            'Wrong report folder', 0);
    raise exception 'Image could be linked from a different report folder';
  exception when check_violation then null;
  end;
end;
$$;
insert into public.item_images (item_id, storage_path, alt_text, sort_order)
select id, id::text || '/66666666-6666-4666-8666-666666666666.jpg',
       'Blue keyring on a desk', 0
from public.items where title = 'Blue keyring';
insert into public.item_images (item_id, storage_path, alt_text, sort_order)
values ('44444444-4444-4444-8444-444444444444',
        '44444444-4444-4444-8444-444444444444/77777777-7777-4777-8777-777777777777.png',
        'Private draft keys', 0);
insert into storage.objects (bucket_id, name)
select 'item-images', storage_path from public.item_images;
insert into storage.objects (bucket_id, name) values
  ('item-images',
   '88888888-8888-4888-8888-888888888888/99999999-9999-4999-8999-999999999999.webp');

set storage.operation = 'object.get_authenticated';
set request.jwt.claim.sub = '';
set role anon;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'item-images') <> 1 then
    raise exception 'Anonymous download access is not limited to published linked images';
  end if;
  if has_table_privilege('anon', 'public.item_images', 'INSERT') then
    raise exception 'Anonymous user can link an image';
  end if;
  begin
    insert into storage.objects (bucket_id, name)
    values ('item-images', 'attacker.jpg');
    raise exception 'Anonymous upload unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'item-images') <> 2 then
    raise exception 'Verified owner cannot read their linked draft image';
  end if;
  if has_table_privilege('authenticated', 'public.item_images', 'INSERT') then
    raise exception 'Browser user can link an image';
  end if;
  begin
    insert into storage.objects (bucket_id, name)
    values ('item-images', '44444444-4444-4444-8444-444444444444/attacker.jpg');
    raise exception 'Browser upload unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from storage.objects where bucket_id = 'item-images';
    if found then raise exception 'Browser deleted an image'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    update storage.objects set name = 'renamed.jpg'
    where bucket_id = 'item-images';
    if found then raise exception 'Browser renamed an image'; end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set role authenticated;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'item-images') <> 1 then
    raise exception 'Other member can read a private draft image';
  end if;
end;
$$;
reset role;

set storage.operation = 'object.list';
set request.jwt.claim.sub = '';
set role anon;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'item-images') then
    raise exception 'Anonymous user can list item images';
  end if;
end;
$$;
reset role;

set storage.operation = 'object.get_authenticated';
update public.items set status = 'archived', archived_at = now()
where title = 'Blue keyring';
set role anon;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'item-images') then
    raise exception 'Archived item image remains publicly readable';
  end if;
end;
$$;
reset role;
select 'Item image Storage policy smoke test passed' as result;
