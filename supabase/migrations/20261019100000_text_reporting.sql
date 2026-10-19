-- Slice 1 text reports. Browser roles may create drafts; only these trusted
-- functions can publish them. Images remain disabled until upload validation
-- and storage policies are available.

insert into public.categories (name, slug, sort_order) values
  ('Electronics', 'electronics', 10),
  ('Identification documents', 'identification-documents', 20),
  ('Keys', 'keys', 30),
  ('Bags', 'bags', 40),
  ('Clothing', 'clothing', 50),
  ('Books', 'books', 60),
  ('Accessories', 'accessories', 70),
  ('Sports equipment', 'sports-equipment', 80),
  ('Other', 'other', 90)
on conflict (slug) do nothing;

alter table public.items
  add constraint items_colour_length check
    (colour is null or length(btrim(colour)) between 1 and 80),
  add constraint items_brand_length check
    (brand is null or length(btrim(brand)) between 1 and 100),
  add constraint items_location_details_nonblank check
    (location_details is null or length(btrim(location_details)) between 1 and 300);

create function public.has_public_contact_details(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_text, '') ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    or coalesce(p_text, '') ~* '(https?://|www\.)'
    or coalesce(p_text, '') ~ '(^|[^[:digit:]])\+?[[:digit:]][[:digit:] .()-]{7,}[[:digit:]]($|[^[:digit:]])';
$$;

create function public.reporting_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Nairobi')::date;
$$;

create function public.create_item_draft(
  p_kind public.item_kind,
  p_category_id uuid,
  p_location_id uuid,
  p_title text,
  p_description text,
  p_event_date date,
  p_location_details text default null,
  p_colour text default null,
  p_brand text default null,
  p_private_identifiers text default null,
  p_questions text[] default '{}'::text[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_campus_id uuid;
  v_item_id uuid;
  v_questions text[] := coalesce(p_questions, '{}'::text[]);
begin
  select campus_id into v_campus_id from public.profiles
  where id = v_user_id and status = 'active';
  if v_user_id is null or v_campus_id is null
     or not public.is_verified_member(v_campus_id) then
    raise exception 'A verified campus profile is required' using errcode = '42501';
  end if;
  if p_kind is null or p_category_id is null or p_location_id is null
     or p_title is null or p_description is null or p_event_date is null
     or p_event_date > public.reporting_today() then
    raise exception 'Report fields are incomplete or invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categories
                 where id = p_category_id and is_active)
     or not exists (select 1 from public.locations
                    where id = p_location_id and campus_id = v_campus_id and is_active) then
    raise exception 'Category or location is unavailable' using errcode = '22023';
  end if;
  if cardinality(v_questions) > 5
     or (p_kind = 'lost' and cardinality(v_questions) > 0)
     or (p_kind = 'found' and p_private_identifiers is not null)
     or exists (select 1 from unnest(v_questions) as question
                where question is null or length(btrim(question)) not between 10 and 300) then
    raise exception 'Private report details are invalid' using errcode = '22023';
  end if;

  insert into public.items
    (owner_id, campus_id, category_id, location_id, kind, title, description,
     event_date, location_details, colour, brand, private_identifiers)
  values
    (v_user_id, v_campus_id, p_category_id, p_location_id, p_kind,
     btrim(p_title), btrim(p_description), p_event_date,
     nullif(btrim(p_location_details), ''), nullif(btrim(p_colour), ''),
     nullif(btrim(p_brand), ''), nullif(btrim(p_private_identifiers), ''))
  returning id into v_item_id;

  if cardinality(v_questions) > 0 then
    insert into public.verification_questions (item_id, question, sort_order)
    select v_item_id, btrim(question), (ordinality - 1)::smallint
    from unnest(v_questions) with ordinality as q(question, ordinality);
  end if;
  return v_item_id;
end;
$$;

create function public.update_item_draft(
  p_item_id uuid,
  p_category_id uuid,
  p_location_id uuid,
  p_title text,
  p_description text,
  p_event_date date,
  p_location_details text default null,
  p_colour text default null,
  p_brand text default null,
  p_private_identifiers text default null,
  p_questions text[] default '{}'::text[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.items%rowtype;
  v_questions text[] := coalesce(p_questions, '{}'::text[]);
begin
  select * into v_item from public.items where id = p_item_id for update;
  if not found or v_item.owner_id is distinct from (select auth.uid())
     or v_item.status <> 'draft'
     or not public.is_verified_member(v_item.campus_id) then
    raise exception 'Draft cannot be edited' using errcode = '42501';
  end if;
  if p_category_id is null or p_location_id is null or p_title is null
     or p_description is null or p_event_date is null
     or p_event_date > public.reporting_today()
     or not exists (select 1 from public.categories
                    where id = p_category_id and is_active)
     or not exists (select 1 from public.locations
                    where id = p_location_id and campus_id = v_item.campus_id
                      and is_active) then
    raise exception 'Draft fields are incomplete or invalid' using errcode = '22023';
  end if;
  if cardinality(v_questions) > 5
     or (v_item.kind = 'lost' and cardinality(v_questions) > 0)
     or (v_item.kind = 'found' and p_private_identifiers is not null)
     or exists (select 1 from unnest(v_questions) as q(question)
                where question is null or length(btrim(question)) not between 10 and 300) then
    raise exception 'Private report details are invalid' using errcode = '22023';
  end if;

  update public.items set
    category_id = p_category_id, location_id = p_location_id,
    title = btrim(p_title), description = btrim(p_description),
    event_date = p_event_date,
    location_details = nullif(btrim(p_location_details), ''),
    colour = nullif(btrim(p_colour), ''), brand = nullif(btrim(p_brand), ''),
    private_identifiers = nullif(btrim(p_private_identifiers), '')
  where id = p_item_id;
  delete from public.verification_questions where item_id = p_item_id;
  if cardinality(v_questions) > 0 then
    insert into public.verification_questions (item_id, question, sort_order)
    select p_item_id, btrim(question), (ordinality - 1)::smallint
    from unnest(v_questions) with ordinality as q(question, ordinality);
  end if;
  return p_item_id;
end;
$$;

create function public.publish_item(p_item_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.items%rowtype;
begin
  select * into v_item from public.items where id = p_item_id for update;
  if not found or v_item.owner_id is distinct from (select auth.uid())
     or v_item.status <> 'draft'
     or not public.is_verified_member(v_item.campus_id) then
    raise exception 'Report cannot be published' using errcode = '42501';
  end if;
  if v_item.event_date > public.reporting_today()
     or v_item.location_id is null
     or not exists (select 1 from public.categories
                    where id = v_item.category_id and is_active)
     or not exists (select 1 from public.locations
                    where id = v_item.location_id
                      and campus_id = v_item.campus_id and is_active) then
    raise exception 'Report category, date, or location is invalid'
      using errcode = '22023';
  end if;
  if public.has_public_contact_details(concat_ws(' ', v_item.title,
       v_item.description, v_item.location_details, v_item.colour, v_item.brand)) then
    raise exception 'Remove contact details and links from public report fields'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.item_images where item_id = p_item_id) then
    raise exception 'Image publication is not enabled yet' using errcode = '22023';
  end if;

  update public.items set status = 'published', published_at = now()
  where id = p_item_id;
  return p_item_id;
end;
$$;

create function public.archive_item(p_item_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.items%rowtype;
begin
  select * into v_item from public.items where id = p_item_id for update;
  if not found or v_item.owner_id is distinct from (select auth.uid())
     or v_item.status not in ('draft', 'published')
     or not public.is_verified_member(v_item.campus_id) then
    raise exception 'Report cannot be archived' using errcode = '42501';
  end if;
  -- When claims are introduced, this transition must also reject active claims.
  update public.items set status = 'archived', archived_at = now()
  where id = p_item_id;
  return p_item_id;
end;
$$;

revoke all on function public.has_public_contact_details(text),
  public.reporting_today(),
  public.create_item_draft(public.item_kind, uuid, uuid, text, text, date,
    text, text, text, text, text[]),
  public.update_item_draft(uuid, uuid, uuid, text, text, date,
    text, text, text, text, text[]), public.publish_item(uuid),
  public.archive_item(uuid)
  from public, anon, authenticated;
grant execute on function public.create_item_draft(public.item_kind, uuid, uuid,
  text, text, date, text, text, text, text, text[]),
  public.update_item_draft(uuid, uuid, uuid, text, text, date,
    text, text, text, text, text[]), public.publish_item(uuid),
  public.archive_item(uuid)
  to authenticated;
