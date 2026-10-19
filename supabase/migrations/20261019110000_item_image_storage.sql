-- Private Storage boundary for future item images. Image uploads stay closed:
-- no INSERT, UPDATE, or DELETE policy is granted to browser roles, and no
-- browser role may add a public.item_images row. A trusted image-processing
-- path must validate bytes, strip metadata, and link at most five images before
-- the report UI or publication flow can accept images.

insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  ('item-images', 'item-images', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']);

-- Keep the object folder tied to the report even for future trusted writers.
alter table public.item_images add constraint item_images_path_matches_item
  check (split_part(storage_path, '/', 1) = item_id::text);

-- Only Storage API download operations can read a linked image. A
-- private draft is visible to its verified owner; a published image is readable
-- by anyone with its path. Object listing and unlinked objects stay hidden.
create policy item_images_download_linked on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'item-images'
    and storage.allow_any_operation(
      array['object.get_authenticated_info', 'object.get_authenticated'])
    and exists (
      select 1 from public.item_images image
      where image.storage_path = name
        and public.can_read_item_image(image.item_id)
    )
  );

-- Restrictive policies keep this bucket closed even if a future migration
-- adds a broad permissive policy for another bucket.
create policy item_images_read_boundary on storage.objects
  as restrictive for select to anon, authenticated
  using (
    bucket_id <> 'item-images'
    or (
      storage.allow_any_operation(
        array['object.get_authenticated_info', 'object.get_authenticated'])
      and exists (
        select 1 from public.item_images image
        where image.storage_path = name
          and public.can_read_item_image(image.item_id)
      )
    )
  );

create policy item_images_no_browser_insert on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'item-images');
create policy item_images_no_browser_update on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'item-images')
  with check (bucket_id <> 'item-images');
create policy item_images_no_browser_delete on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'item-images');
