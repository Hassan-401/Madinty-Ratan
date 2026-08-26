-- ============================================================
-- Madinty Ratan — قاعدة بيانات Supabase
-- ------------------------------------------------------------
-- شغّل الملف ده مرة واحدة من: Supabase Dashboard ← SQL Editor
-- قبل ما تشغّله: غيّر الإيميل في سطر «إيميل صاحب المتجر» تحت.
-- الملف ده آمن لو اتشغّل أكتر من مرة.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) الأدمن — مين له حق الكتابة
-- ------------------------------------------------------------
-- الكتابة مش مربوطة بمجرد إنك مسجّل دخول — لازم إيميلك يكون في
-- الجدول ده. يعني حتى لو حد عمل حساب في المشروع، مش هيقدر يعدّل
-- أي حاجة.
-- ============================================================
create table if not exists public.admins (
  email    text primary key,
  added_at timestamptz not null default now()
);

-- 👇 غيّر الإيميل ده لإيميلك (نفس الإيميل اللي هتعمل بيه المستخدم في Authentication)
insert into public.admins (email) values ('owner@example.com')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$fn$;

-- ============================================================
-- 2) الجداول
-- ============================================================

create table if not exists public.categories (
  id         text primary key,
  name       text not null,
  icon       text,
  img        text,
  descr      text,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id         text primary key,
  cat        text not null references public.categories(id) on update cascade,
  name       text not null,
  short      text,
  img        text,
  price      numeric(12,2),
  old_price  numeric(12,2),
  featured   boolean not null default false,
  stock      int,
  sort       int not null default 0,
  -- باقي التفاصيل: المكونات، الأنواع، المواصفات، المقاسات، الألوان، الضمان...
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_cat_idx  on public.products (cat);
create index if not exists products_sort_idx on public.products (sort, name);

create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  no         text unique not null,
  status     text not null default 'جديد',
  customer   jsonb not null,
  items      jsonb not null,
  subtotal   numeric(12,2) not null,
  shipping   numeric(12,2),          -- null = يُحدد عند التأكيد
  total      numeric(12,2) not null,
  source     text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_items_ok  check (jsonb_array_length(items) between 1 and 50),
  constraint orders_total_ok  check (total >= 0 and total < 10000000),
  constraint orders_status_ok check (status in
    ('جديد','تم التأكيد','قيد التجهيز','تم الشحن','تم التسليم','ملغي'))
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);

-- تحديث updated_at أوتوماتيك
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists t_categories_touch on public.categories;
create trigger t_categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists t_products_touch on public.products;
create trigger t_products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists t_orders_touch on public.orders;
create trigger t_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 3) الصلاحيات (RLS)
-- ------------------------------------------------------------
-- المفتاح الموجود في config.js عام ومكشوف للكل — الحماية الحقيقية
-- هي القواعد دي، مش إخفاء المفتاح.
-- ============================================================
alter table public.admins     enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.orders     enable row level security;

grant select on public.categories, public.products to anon, authenticated;
grant insert on public.orders to anon, authenticated;
grant select, update, delete on public.orders to authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;
grant select on public.admins to authenticated;

-- الأدمن يشوف صفّه هو بس
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- الكتالوج: أي حد يقرا، الأدمن بس اللي يكتب
drop policy if exists "categories read" on public.categories;
create policy "categories read" on public.categories
  for select to anon, authenticated using (true);

drop policy if exists "categories write" on public.categories;
create policy "categories write" on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products read" on public.products;
create policy "products read" on public.products
  for select to anon, authenticated using (true);

drop policy if exists "products write" on public.products;
create policy "products write" on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- الطلبات: العميل يضيف بس (ومش بيقدر يقرا أي حاجة)، الأدمن بس اللي بيشوف
drop policy if exists "orders insert" on public.orders;
create policy "orders insert" on public.orders
  for insert to anon, authenticated with check (true);

drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read" on public.orders
  for select to authenticated using (public.is_admin());

drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders admin delete" on public.orders;
create policy "orders admin delete" on public.orders
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- 4) تخزين الصور — bucket اسمه media
-- ------------------------------------------------------------
-- لو السطور دي رمت خطأ صلاحيات، اعمل الـbucket يدوي من
-- Storage ← New bucket ← الاسم media ← Public ✅
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media read" on storage.objects;
create policy "media read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');

drop policy if exists "media insert" on storage.objects;
create policy "media insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media update" on storage.objects;
create policy "media update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media delete" on storage.objects;
create policy "media delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
