-- PataTena Slice 1: report data and a deliberately narrow browser API.
-- Apply to a fresh Supabase project before building the report UI.

create type public.app_role as enum ('member', 'moderator', 'admin');
create type public.account_status as enum ('active', 'suspended', 'deactivated');
create type public.item_kind as enum ('lost', 'found');
create type public.item_status as enum ('draft', 'published', 'reserved', 'resolved', 'hidden', 'archived');

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  email_domains text[] not null check (cardinality(email_domains) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  name text not null check (length(btrim(name)) between 2 and 100),
  zone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus_id, name),
  unique (id, campus_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  display_name text not null check (length(btrim(display_name)) between 2 and 100),
  role public.app_role not null default 'member',
  status public.account_status not null default 'active',
  avatar_path text,
  notification_preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(notification_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  campus_id uuid not null references public.campuses(id),
  category_id uuid not null references public.categories(id),
  location_id uuid,
  kind public.item_kind not null,
  status public.item_status not null default 'draft',
  title text not null check (length(btrim(title)) between 5 and 120),
  description text not null check (length(btrim(description)) between 20 and 2000),
  private_identifiers text,
  colour text,
  brand text,
  event_date date not null,
  location_details text check (location_details is null or length(location_details) <= 300),
  published_at timestamptz,
  reserved_at timestamptz,
  resolved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, campus_id) references public.locations(id, campus_id)
);

create index items_public_feed_idx on public.items (status, kind, published_at desc);
create index items_filter_idx on public.items (campus_id, category_id, event_date desc);
create index items_owner_idx on public.items (owner_id);

create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null check (length(btrim(alt_text)) between 2 and 300),
  sort_order smallint not null check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique (item_id, sort_order),
  check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
);

create table public.verification_questions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  question text not null check (length(btrim(question)) between 10 and 300),
  sort_order smallint not null check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique (item_id, sort_order)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);

-- The helper reads auth.users with the migration owner's rights. It never returns
-- email addresses or authentication records to browser roles.
create function public.email_approved_for_campus(p_campus_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.campuses c on c.id = p_campus_id
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and c.is_active
      and exists (
        select 1 from unnest(c.email_domains) as approved_domain(domain_name)
        where lower(approved_domain.domain_name) = lower(split_part(u.email, '@', 2))
      )
  );
$$;

create function public.is_verified_member(p_campus_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.email_approved_for_campus(p_campus_id)
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.campus_id = p_campus_id
        and p.status = 'active'
    );
$$;

create function public.can_read_item_image(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.items i where i.id = p_item_id
      and (i.status = 'published' or (i.owner_id = (select auth.uid())
        and public.is_verified_member(i.campus_id)))
  );
$$;

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- Only approved, non-sensitive fields are copied into the append-only log.
create function public.audit_item_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'item.created' else 'item.updated' end,
    'item', new.id,
    case when tg_op = 'UPDATE' then
      jsonb_build_object('status', old.status, 'category_id', old.category_id,
        'location_id', old.location_id)
    end,
    jsonb_build_object('status', new.status, 'category_id', new.category_id,
      'location_id', new.location_id)
  );
  return new;
end;
$$;
create trigger audit_item_insert after insert on public.items
  for each row execute function public.audit_item_change();
create trigger audit_item_update after update on public.items
  for each row execute function public.audit_item_change();

alter table public.campuses enable row level security;
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.item_images enable row level security;
alter table public.verification_questions enable row level security;
alter table public.audit_events enable row level security;

create policy campuses_read_active on public.campuses for select to anon, authenticated
  using (is_active);
create policy locations_read_active on public.locations for select to anon, authenticated
  using (is_active and exists (
    select 1 from public.campuses c where c.id = campus_id and c.is_active
  ));
create policy categories_read_active on public.categories for select to anon, authenticated
  using (is_active);

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid())
    and role = 'member' and status = 'active'
    and public.email_approved_for_campus(campus_id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and status = 'active')
  with check (id = (select auth.uid()) and status = 'active'
    and public.email_approved_for_campus(campus_id));

create policy items_read_public on public.items for select to anon, authenticated
  using (status = 'published');
create policy items_read_own on public.items for select to authenticated
  using (owner_id = (select auth.uid()) and public.is_verified_member(campus_id));
create policy items_insert_draft on public.items for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft'
    and public.is_verified_member(campus_id));
create policy items_update_own_draft on public.items for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft'
    and public.is_verified_member(campus_id))
  with check (owner_id = (select auth.uid()) and status = 'draft'
    and public.is_verified_member(campus_id));

create policy images_read_published_or_own on public.item_images for select
  to anon, authenticated using (public.can_read_item_image(item_id));
create policy questions_read_found_or_own on public.verification_questions for select
  to authenticated using (exists (
    select 1 from public.items i where i.id = item_id and i.kind = 'found'
      and ((i.owner_id = (select auth.uid()) and public.is_verified_member(i.campus_id))
        or (i.status = 'published' and public.is_verified_member(i.campus_id)))
  ));
create policy questions_insert_own_draft on public.verification_questions for insert
  to authenticated with check (exists (
    select 1 from public.items i where i.id = item_id and i.kind = 'found'
      and i.status = 'draft' and i.owner_id = (select auth.uid())
      and public.is_verified_member(i.campus_id)
  ));

-- Browser roles receive only the columns they need. In particular, the base
-- table's private_identifiers column is never selectable through PostgREST.
revoke all on public.campuses, public.locations, public.categories,
  public.profiles, public.items, public.item_images,
  public.verification_questions, public.audit_events from anon, authenticated;
grant select (id, name, slug, is_active) on public.campuses to anon, authenticated;
grant select (id, campus_id, name, zone, is_active) on public.locations to anon, authenticated;
grant select (id, name, slug, icon, is_active, sort_order) on public.categories to anon, authenticated;
grant select (id, campus_id, display_name, role, status, avatar_path,
  notification_preferences, created_at, updated_at) on public.profiles to authenticated;
grant insert (id, campus_id, display_name, avatar_path, notification_preferences)
  on public.profiles to authenticated;
grant update (display_name, avatar_path, notification_preferences)
  on public.profiles to authenticated;
grant select (id, campus_id, category_id, location_id, kind, status,
  title, description, colour, brand, event_date, location_details, published_at,
  reserved_at, resolved_at, archived_at, created_at, updated_at)
  on public.items to anon, authenticated;
grant select (owner_id) on public.items to authenticated;
grant insert (owner_id, campus_id, category_id, location_id, kind, title,
  description, private_identifiers, colour, brand, event_date, location_details)
  on public.items to authenticated;
grant update (category_id, location_id, title, description, private_identifiers,
  colour, brand, event_date, location_details) on public.items to authenticated;
grant select (id, item_id, storage_path, alt_text, sort_order, created_at)
  on public.item_images to anon, authenticated;
grant select (id, item_id, question, sort_order, created_at)
  on public.verification_questions to authenticated;
grant insert (item_id, question, sort_order) on public.verification_questions to authenticated;

create view public.public_items with (security_invoker = true) as
  select id, campus_id, category_id, location_id, kind, status, title,
    description, colour, brand, event_date, location_details, published_at
  from public.items where status = 'published';
revoke all on public.public_items from public, anon, authenticated;
grant select on public.public_items to anon, authenticated;

create function public.my_item_private_identifiers(p_item_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select i.private_identifiers from public.items i
  where i.id = p_item_id and i.owner_id = (select auth.uid())
    and public.is_verified_member(i.campus_id);
$$;
revoke all on function public.email_approved_for_campus(uuid),
  public.is_verified_member(uuid), public.can_read_item_image(uuid),
  public.my_item_private_identifiers(uuid)
  from public, anon, authenticated;
grant execute on function public.email_approved_for_campus(uuid),
  public.is_verified_member(uuid), public.my_item_private_identifiers(uuid)
  to authenticated;
grant execute on function public.can_read_item_image(uuid) to anon, authenticated;
revoke all on function public.set_updated_at(), public.audit_item_change()
  from public, anon, authenticated;
