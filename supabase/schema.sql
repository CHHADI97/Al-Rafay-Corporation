-- ============================================================================
--  Al Rafay Corporation & Traders — Supabase schema
--  Run this once in the Supabase dashboard → SQL Editor → New query → Run.
--  Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Site settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  id                  integer primary key default 1 check (id = 1),
  business_name_en    text not null default 'Al Rafay Corporation & Traders',
  business_name_ur    text not null default 'الرافع کارپوریشن اینڈ ٹریڈرز',
  short_name          text not null default 'Al Rafay',
  logo_url            text not null default '',
  logo_alt_url        text not null default '',
  tagline_en          text not null default '',
  tagline_ur          text not null default '',
  hero_title_en       text not null default '',
  hero_title_ur       text not null default '',
  hero_subtitle_en    text not null default '',
  hero_subtitle_ur    text not null default '',
  about_en            text not null default '',
  about_ur            text not null default '',
  address_en          text not null default '',
  address_ur          text not null default '',
  city_en             text not null default 'Islamabad',
  city_ur             text not null default 'اسلام آباد',
  address_short_en    text not null default '',
  address_short_ur    text not null default '',
  map_embed_url       text not null default '',
  map_link            text not null default '',
  map_embed_type      text not null default 'src',
  whatsapp_number     text not null default '',
  email               text not null default '',
  hours_en            text not null default '',
  hours_ur            text not null default '',
  facebook_url        text not null default '',
  instagram_url       text not null default '',
  youtube_url         text not null default '',
  footer_note_en      text not null default '',
  footer_note_ur      text not null default '',
  credits_en          text not null default 'Website designed by Abdul Hadi',
  credits_ur          text not null default 'ویب سائٹ ڈیزائن: عبدالہادی',
  admin_email         text not null default 'abdulhadicreates@gmail.com',
  updated_at          timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Brand & model catalogue (powers the "browse by company" and filters)
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  name_ur     text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.car_models (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references public.brands (id) on delete cascade,
  name        text not null,
  name_ur     text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (brand_id, name)
);

-- ---------------------------------------------------------------------------
-- 3. Inventory
-- ---------------------------------------------------------------------------
create table if not exists public.cars (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title_en            text not null default '',
  title_ur            text not null default '',
  brand               text not null default '',
  model               text not null default '',
  variant             text not null default '',
  year                integer not null default extract(year from now())::int,
  price               bigint not null default 0,
  mileage_km          integer not null default 0,
  fuel                text not null default 'petrol',
  transmission        text not null default 'manual',
  engine_cc           integer not null default 0,
  color_en            text not null default '',
  color_ur            text not null default '',
  body_type           text not null default 'sedan',
  registered_city_en  text not null default '',
  registered_city_ur  text not null default '',
  condition_en        text not null default '',
  condition_ur        text not null default '',
  description_en      text not null default '',
  description_ur      text not null default '',
  status              text not null default 'available' check (status in ('available', 'sold')),
  featured            boolean not null default false,
  published           boolean not null default true,
  sort_order          integer not null default 0,
  views               bigint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists cars_brand_idx      on public.cars (brand);
create index if not exists cars_status_idx     on public.cars (status);
create index if not exists cars_featured_idx   on public.cars (featured);
create index if not exists cars_created_at_idx on public.cars (created_at desc);

create table if not exists public.car_images (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid not null references public.cars (id) on delete cascade,
  url           text not null,
  storage_path  text,
  alt           text not null default '',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists car_images_car_idx on public.car_images (car_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Editable page lists (owners, counters, "why us", FAQ)
-- ---------------------------------------------------------------------------
create table if not exists public.owners (
  id            uuid primary key default gen_random_uuid(),
  name_en       text not null default '',
  name_ur       text not null default '',
  role_en       text not null default '',
  role_ur       text not null default '',
  phone         text not null default '',
  whatsapp      text not null default '',
  show_on_site  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.site_stats (
  id          uuid primary key default gen_random_uuid(),
  value       integer not null default 0,
  suffix      text not null default '',
  label_en    text not null default '',
  label_ur    text not null default '',
  sort_order  integer not null default 0
);

create table if not exists public.why_us (
  id          uuid primary key default gen_random_uuid(),
  icon        text not null default 'shield',
  title_en    text not null default '',
  title_ur    text not null default '',
  body_en     text not null default '',
  body_ur     text not null default '',
  sort_order  integer not null default 0
);

create table if not exists public.faqs (
  id            uuid primary key default gen_random_uuid(),
  question_en   text not null default '',
  question_ur   text not null default '',
  answer_en     text not null default '',
  answer_ur     text not null default '',
  sort_order    integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 5. Enquiries from the website contact form
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  car_slug    text,
  subject     text not null default '',
  body        text not null default '',
  status      text not null default 'new' check (status in ('new', 'read', 'done', 'spam')),
  created_at  timestamptz not null default now()
);

create index if not exists messages_created_idx on public.messages (created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Admin allow-list. Only these Google accounts may sign in.
--    The address below is the dealership owner; add or change it here or from
--    the dashboard (Settings → Access) — the dashboard keeps this table and
--    the value it stores in its own settings in sync.
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  email       text primary key,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

insert into public.admins (email, name)
values ('abdulhadicreates@gmail.com', 'Site owner')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Row level security
--    • anyone may READ published cars, settings and the public lists
--    • only a signed-in allow-listed Google account may write
-- ---------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.brands        enable row level security;
alter table public.car_models    enable row level security;
alter table public.cars          enable row level security;
alter table public.car_images    enable row level security;
alter table public.owners        enable row level security;
alter table public.site_stats    enable row level security;
alter table public.why_us        enable row level security;
alter table public.faqs          enable row level security;
alter table public.messages      enable row level security;
alter table public.admins        enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

do $$
declare
  t text;
  readable text[] := array['site_settings','brands','car_models','cars','car_images','owners','site_stats','why_us','faqs'];
begin
  foreach t in array readable loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    if t = 'cars' then
      execute format('create policy %I on public.%I for select using (published = true or public.is_admin())', t || '_public_read', t);
    else
      execute format('create policy %I on public.%I for select using (true)', t || '_public_read', t);
    end if;
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
  end loop;
end $$;

-- The enquiries inbox is private: only an admin can read it, and the public
-- form may only INSERT a new enquiry.
drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all on public.messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists messages_public_insert on public.messages;
create policy messages_public_insert on public.messages
  for insert to anon, authenticated with check (true);

-- Only the service-role key (never the browser) may manage the admin list.
drop policy if exists admins_admin_all on public.admins;
create policy admins_admin_all on public.admins
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Storage bucket for car photos and the logo
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'car-images', 'car-images', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']
)
on conflict (id) do update set public = true;

drop policy if exists car_images_public_read on storage.objects;
create policy car_images_public_read on storage.objects
  for select using (bucket_id = 'car-images');

drop policy if exists car_images_admin_insert on storage.objects;
create policy car_images_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'car-images' and public.is_admin());

drop policy if exists car_images_admin_update on storage.objects;
create policy car_images_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'car-images' and public.is_admin());

drop policy if exists car_images_admin_delete on storage.objects;
create policy car_images_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'car-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. Google sign-in helper: the very first Google account to sign in becomes
--    an admin automatically, so a brand-new project is never locked out.
--    Remove this trigger if you prefer to manage the allow-list by hand.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.admins) then
    insert into public.admins (email, name)
    values (new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
    on conflict (email) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_bootstrap_admin on auth.users;
create trigger on_auth_user_created_bootstrap_admin
  after insert on auth.users
  for each row execute function public.bootstrap_first_admin();

-- ---------------------------------------------------------------------------
-- 10. Keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cars_touch_updated_at on public.cars;
create trigger cars_touch_updated_at
  before update on public.cars
  for each row execute function public.touch_updated_at();

drop trigger if exists site_settings_touch_updated_at on public.site_settings;
create trigger site_settings_touch_updated_at
  before update on public.site_settings
  for each row execute function public.touch_updated_at();
