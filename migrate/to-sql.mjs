/* ============================================================
   Madinty Ratan — تحويل نسخة احتياطية لـ SQL تتنفّذ على D1
   ------------------------------------------------------------
   بيقرا ملف JSON فيه { categories, products, orders } — سواء
   النسخة اللي بتنزل من زرار «💾 النسخة الاحتياطية» في اللوحة،
   أو تصدير مباشر من قاعدة قديمة — وبيطلّع ملف SQL جاهز.

   الاستخدام:
     node migrate/to-sql.mjs backup.json > migrate/import.sql
     npx wrangler d1 execute madinty-ratan --remote --file=migrate/import.sql

   اختياري: لو الصور كانت مرفوعة على تخزين خارجي وعايز الروابط
   تتحوّل لـ /media/... ، مرّر البادئة القديمة:
     node migrate/to-sql.mjs backup.json https://xxx.supabase.co/storage/v1/object/public/media/

   الملف اللي بيطلع آمن لو اتشغّل أكتر من مرة (insert or replace).
   ============================================================ */

import fs from "node:fs";
import crypto from "node:crypto";

const [file, oldPrefix] = process.argv.slice(2);
if (!file) {
  console.error("الاستخدام: node migrate/to-sql.mjs <backup.json> [بادئة الصور القديمة]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const cats = data.categories || [];
const prods = data.products || [];
const orders = data.orders || [];

/* ---------- أدوات ---------- */
const q = (v) => (v == null || v === "" ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "null" : Number(v));
const nowISO = new Date().toISOString();

/** الصور اللي كانت على تخزين خارجي بتتحوّل لمسار /media المحلي */
function img(v) {
  const s = String(v || "");
  if (!s) return null;
  if (oldPrefix && s.startsWith(oldPrefix)) return "/media/" + s.slice(oldPrefix.length);
  return s;
}

/* الحقول اللي بتتخزن جوه details — نفس اللي في assets/js/sb.js */
const EXTRA = [
  "components",
  "variants",
  "specs",
  "dims",
  "frameColors",
  "weaveColors",
  "colorsNote",
  "cushions",
  "warranty",
  "loadCapacity",
];

/** بيقبل الشكلين: صف قاعدة بيانات (old_price/descr/details) أو كائن الموقع (oldPrice/desc) */
function normProduct(p) {
  let details = p.details;
  if (!details || typeof details !== "object") {
    details = {};
    for (const k of EXTRA) if (p[k] != null) details[k] = p[k];
  }
  return {
    id: p.id,
    cat: p.cat,
    name: p.name,
    short: p.short,
    img: img(p.img),
    price: p.price,
    old_price: p.old_price ?? p.oldPrice,
    featured: p.featured ? 1 : 0,
    stock: p.stock,
    sort: p.sort,
    details: JSON.stringify(details),
    created_at: p.created_at || nowISO,
  };
}

const normCat = (c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  img: img(c.img),
  descr: c.descr ?? c.desc,
  sort: c.sort,
  created_at: c.created_at || nowISO,
});

const out = [];
out.push("-- اتولّد من " + file + " في " + nowISO);
out.push("-- " + cats.length + " قسم · " + prods.length + " منتج · " + orders.length + " طلب");
out.push("");

/* ---------- الأقسام (الأول — المنتجات بتشير ليها) ---------- */
cats.forEach((raw, i) => {
  const c = normCat(raw);
  out.push(
    "insert or replace into categories (id, name, icon, img, descr, sort, created_at, updated_at) values (" +
      [q(c.id), q(c.name), q(c.icon), q(c.img), q(c.descr), c.sort ?? i, q(c.created_at), q(nowISO)].join(", ") +
      ");",
  );
});
out.push("");

/* ---------- المنتجات ---------- */
prods.forEach((raw, i) => {
  const p = normProduct(raw);
  out.push(
    "insert or replace into products (id, cat, name, short, img, price, old_price, featured, stock, sort, details, created_at, updated_at) values (" +
      [
        q(p.id),
        q(p.cat),
        q(p.name),
        q(p.short),
        q(p.img),
        n(p.price),
        n(p.old_price),
        p.featured,
        n(p.stock),
        p.sort ?? i,
        q(p.details),
        q(p.created_at),
        q(nowISO),
      ].join(", ") +
      ");",
  );
});
out.push("");

/* ---------- الطلبات ---------- */
orders.forEach((o) => {
  const at = o.created_at || o.at || nowISO;
  out.push(
    "insert or replace into orders (id, no, status, customer, items, subtotal, shipping, total, source, created_at, updated_at) values (" +
      [
        q(o.id || crypto.randomUUID()),
        q(o.no),
        q(o.status || "جديد"),
        q(JSON.stringify(o.customer || {})),
        q(JSON.stringify(o.items || [])),
        n(o.subtotal) || 0,
        n(o.shipping),
        n(o.total) || 0,
        q(o.source || "import"),
        q(at),
        q(at),
      ].join(", ") +
      ");",
  );
});

process.stdout.write(out.join("\n") + "\n");
console.error(
  "تم: " + cats.length + " قسم · " + prods.length + " منتج · " + orders.length + " طلب",
);
