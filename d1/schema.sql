-- ============================================================
-- Madinty Ratan — قاعدة بيانات Cloudflare D1
-- ------------------------------------------------------------
-- بتتشغّل مرة واحدة:
--   npx wrangler d1 execute madinty-ratan --remote --file=d1/schema.sql
-- الملف ده آمن لو اتشغّل أكتر من مرة.
--
-- فرق مهم عن Supabase: مفيش RLS هنا. الصلاحيات كلها في كود الـ
-- Worker (worker/index.js) — والمتصفح مالوش أي وصول مباشر للقاعدة
-- خااالص، فمفيش مفتاح مكشوف من الأساس.
-- ============================================================

-- ============================================================
-- 1) الأدمن — مين له حق الكتابة
-- ------------------------------------------------------------
-- pass_hash فاضي = الحساب لسه ما اتفعّلش. أول مرة تفتح /admin
-- هتحط كلمة السر بنفسك من الصفحة، وهي بتتخزن مشفّرة.
-- عشان تصفّر كلمة سر حساب:  update admins set pass_hash=null, pass_salt=null where email='...';
-- ============================================================
create table if not exists admins (
  email      text primary key,
  pass_hash  text,
  pass_salt  text,
  token_ver  integer not null default 1,   -- بيزيد مع كل تغيير كلمة سر فتبطل التوكنات القديمة
  added_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

insert or ignore into admins (email) values ('hm2022004@gmail.com');

-- ============================================================
-- 2) الجداول
-- ============================================================

create table if not exists categories (
  id         text primary key,
  name       text not null,
  icon       text,
  img        text,
  descr      text,
  sort       integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists products (
  id         text primary key,
  cat        text not null references categories(id) on update cascade,
  name       text not null,
  short      text,
  img        text,
  price      real,
  old_price  real,
  featured   integer not null default 0,
  stock      integer,
  sort       integer not null default 0,
  -- باقي التفاصيل كـJSON: المكونات، الأنواع، المواصفات، المقاسات، الألوان، الضمان...
  details    text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists products_cat_idx  on products (cat);
create index if not exists products_sort_idx on products (sort, name);

create table if not exists orders (
  id         text primary key,
  no         text not null unique,
  status     text not null default 'جديد',
  customer   text not null,               -- JSON
  items      text not null,               -- JSON
  subtotal   real not null,
  shipping   real,                        -- null = يُحدد عند التأكيد
  total      real not null,
  source     text not null default 'web',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (total >= 0 and total < 10000000),
  check (status in ('جديد','تم التأكيد','قيد التجهيز','تم الشحن','تم التسليم','ملغي'))
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_status_idx  on orders (status);

-- ملاحظة: updated_at بيتحدّث من كود الـWorker مع كل كتابة (مفيش triggers
-- عشان نفضل بعيد عن سلوك SQLite في الـtriggers اللي بتعدّل نفس الجدول).
