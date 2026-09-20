/* ============================================================
   Madinty Ratan — الـWorker
   ------------------------------------------------------------
   الـWorker ده بيعمل تلات حاجات كانت على Supabase:
     • /api/*    بدل PostgREST و GoTrue  → بيقرا ويكتب في D1
     • /media/*  بدل Supabase Storage    → بيقرا من R2
     • أي حاجة تانية → صفحات الموقع الثابتة (أو صفحة 404)

   فرق مهم عن Supabase: المتصفح مش شايف قاعدة البيانات خالص —
   مفيش مفتاح عام ولا RLS. كل صلاحية بتتفحص هنا في الملف ده.
   ============================================================ */

import { hashSecret, verifySecret, signToken, readToken } from "./auth.js";

const ACCESS_TTL = 60 * 60 * 2; /* ساعتين */
const REFRESH_TTL = 60 * 60 * 24 * 30; /* شهر */
const MAX_JSON = 64 * 1024;
const MAX_UPLOAD = 10 * 1024 * 1024;
const ORDER_LIMIT = 500;

const STATUSES = new Set([
  "جديد",
  "تم التأكيد",
  "قيد التجهيز",
  "تم الشحن",
  "تم التسليم",
  "ملغي",
]);

/* ============================================================
   أدوات صغيرة
   ============================================================ */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (status, message) => {
  throw new HttpError(status, message);
};

const nowISO = () => new Date().toISOString();

const SAFE = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: SAFE });
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

async function readJSON(request, max = MAX_JSON) {
  const txt = await request.text();
  if (txt.length > max) bad(413, "البيانات كبيرة أوي");
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    bad(400, "البيانات مش JSON صحيح");
  }
}

const clientIP = (request) => request.headers.get("CF-Connecting-IP") || "anon";

/** حد أقصى للمحاولات — بيتخطّى بهدوء لو الربط مش متظبط */
async function limit(binding, request, message) {
  if (!binding || typeof binding.limit !== "function") return;
  try {
    const { success } = await binding.limit({ key: clientIP(request) });
    if (!success) bad(429, message);
  } catch (e) {
    if (e instanceof HttpError) throw e; /* الرفض الحقيقي يعدّي */
  }
}

/* ---------- تحقّق من القيم ---------- */
function text(v, max, name, required = true) {
  const s = v == null ? "" : String(v).trim();
  if (!s) {
    if (required) bad(400, name + " مطلوب");
    return null;
  }
  if (s.length > max) bad(400, name + " طويل أوي");
  return s;
}
function money(v, name, required = true) {
  if (v == null || v === "") {
    if (required) bad(400, name + " مطلوب");
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 10000000) bad(400, name + " مش رقم صحيح");
  return n;
}
function int(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/* ============================================================
   نقطة الدخول
   ============================================================ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api" || path.startsWith("/api/")) return await api(request, env, url);
      if (path.startsWith("/media/")) return await media(request, env, path.slice("/media/".length));
      return await notFound(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error("worker:", err && err.stack ? err.stack : err);
      return json({ error: "حصل خطأ في السيرفر — جرّب تاني" }, 500);
    }
  },
};

/** أي مسار مش موجود بيرجّع صفحة 404 بتاعة الموقع */
async function notFound(request, env) {
  if (!env.ASSETS) return new Response("Not found", { status: 404 });
  const res = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
  return new Response(res.body, { status: 404, headers: new Headers(res.headers) });
}

/* ============================================================
   الصور المرفوعة — R2
   ============================================================ */
async function media(request, env, rawKey) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return json({ error: "الطريقة دي مش مسموحة" }, 405);
  if (!env.MEDIA) return new Response("R2 مش مربوط", { status: 500 });

  let key;
  try {
    key = decodeURIComponent(rawKey);
  } catch (e) {
    key = rawKey;
  }
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const obj = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  /* اسم الملف فيه وقت ورقم عشوائي وعمره ما بيتكرر، فالتخزين الدائم آمن */
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

  /* لو المتصفح عنده النسخة دي بالفعل، R2 بترجّع الكائن من غير محتوى */
  if (!("body" in obj) || obj.body === null) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : obj.body, { status: 200, headers });
}

/* ============================================================
   الـAPI
   ============================================================ */
async function api(request, env, url) {
  const seg = url.pathname.split("/").filter(Boolean).slice(1);
  const m = request.method;
  const id = (i) => {
    try {
      return decodeURIComponent(seg[i] || "");
    } catch (e) {
      return seg[i] || "";
    }
  };

  if (m === "OPTIONS") return done();

  /* ---------- عام: الكتالوج ---------- */
  if (m === "GET" && seg[0] === "categories" && seg.length === 1) {
    const { results } = await env.DB.prepare(
      "select id, name, icon, img, descr, sort from categories order by sort asc, name asc",
    ).all();
    return json(results || []);
  }
  if (m === "GET" && seg[0] === "products" && seg.length === 1) {
    const { results } = await env.DB.prepare(
      "select * from products order by sort asc, name asc",
    ).all();
    return json((results || []).map(outProduct));
  }

  /* ---------- عام: تسجيل طلب ---------- */
  if (m === "POST" && seg[0] === "orders" && seg.length === 1) {
    await limit(env.ORDER_LIMIT, request, "طلبات كتير في وقت قصير — استنّى شوية");
    return await createOrder(request, env);
  }

  /* ---------- الدخول ---------- */
  if (seg[0] === "auth") return await auth(request, env, seg.slice(1), m);

  /* ============================================================
     من هنا وتحت: الأدمن بس
     ============================================================ */
  const who = await currentAdmin(request, env);
  if (!who) bad(401, "الجلسة انتهت — اعمل تسجيل خروج ودخول تاني");

  /* ---------- الأقسام ---------- */
  if (seg[0] === "categories") {
    if (m === "PUT" && seg.length === 2) return await saveCat(request, env, null);
    if (m === "PATCH" && seg.length === 2) return await saveCat(request, env, id(1));
    if (m === "DELETE" && seg.length === 2) {
      await env.DB.prepare("delete from categories where id = ?").bind(id(1)).run();
      return done();
    }
  }

  /* ---------- المنتجات ---------- */
  if (seg[0] === "products") {
    if (m === "PUT" && seg.length === 2) return await saveProduct(request, env, null);
    if (m === "PATCH" && seg.length === 2) return await saveProduct(request, env, id(1));
    if (m === "DELETE" && seg.length === 2) {
      await env.DB.prepare("delete from products where id = ?").bind(id(1)).run();
      return done();
    }
  }

  /* ---------- استيراد الكتالوج دفعة واحدة ---------- */
  if (m === "POST" && seg[0] === "catalog" && seg[1] === "import" && seg.length === 2)
    return await importCatalog(request, env);

  /* ---------- الطلبات ---------- */
  if (seg[0] === "orders") {
    if (m === "GET" && seg.length === 1) {
      const { results } = await env.DB.prepare(
        "select * from orders order by created_at desc limit ?",
      )
        .bind(ORDER_LIMIT)
        .all();
      return json((results || []).map(outOrder));
    }
    if (m === "PATCH" && seg.length === 2) {
      const b = (await readJSON(request)) || {};
      if (!STATUSES.has(b.status)) bad(400, "حالة الطلب مش معروفة");
      await env.DB.prepare("update orders set status = ?, updated_at = ? where no = ?")
        .bind(b.status, nowISO(), id(1))
        .run();
      return done();
    }
    if (m === "DELETE" && seg.length === 2) {
      await env.DB.prepare("delete from orders where no = ?").bind(id(1)).run();
      return done();
    }
    if (m === "DELETE" && seg.length === 1) {
      await env.DB.prepare("delete from orders").run();
      return done();
    }
  }

  /* ---------- رفع صورة ---------- */
  if (m === "POST" && seg[0] === "upload" && seg.length === 1)
    return await upload(request, env, url);

  bad(404, "المسار ده مش موجود");
}

/* ============================================================
   تحويل صفوف D1 لنفس الشكل اللي الموقع متعوّد عليه
   ------------------------------------------------------------
   D1 بتخزّن JSON كنص و true/false كـ 0/1، والموقع بيتوقّع الشكل
   اللي كان جاي من Postgres — فالتحويل بيحصل هنا مرة واحدة.
   ============================================================ */
function parseJSON(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
const outProduct = (r) => ({ ...r, featured: !!r.featured, details: parseJSON(r.details, {}) });
const outOrder = (r) => ({
  ...r,
  customer: parseJSON(r.customer, {}),
  items: parseJSON(r.items, []),
});

/* ============================================================
   الكتالوج — كتابة
   ============================================================ */
function catRow(b) {
  return {
    id: text(b.id, 60, "كود القسم"),
    name: text(b.name, 120, "اسم القسم"),
    icon: text(b.icon, 20, "الأيقونة", false),
    img: text(b.img, 500, "الصورة", false),
    descr: text(b.descr, 500, "الوصف", false),
    sort: int(b.sort) ?? 0,
  };
}

function productRow(b) {
  return {
    id: text(b.id, 60, "كود المنتج"),
    cat: text(b.cat, 60, "القسم"),
    name: text(b.name, 200, "اسم المنتج"),
    short: text(b.short, 300, "الوصف المختصر", false),
    img: text(b.img, 500, "الصورة", false),
    price: money(b.price, "السعر", false),
    old_price: money(b.old_price, "السعر قبل الخصم", false),
    featured: b.featured ? 1 : 0,
    stock: int(b.stock),
    sort: int(b.sort) ?? 0,
    details: JSON.stringify(b.details && typeof b.details === "object" ? b.details : {}),
  };
}

const CAT_UPSERT = `insert into categories (id, name, icon, img, descr, sort, updated_at)
  values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  on conflict(id) do update set
    name = ?2, icon = ?3, img = ?4, descr = ?5, sort = ?6, updated_at = ?7`;

const PRODUCT_UPSERT = `insert into products
    (id, cat, name, short, img, price, old_price, featured, stock, sort, details, updated_at)
  values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  on conflict(id) do update set
    cat = ?2, name = ?3, short = ?4, img = ?5, price = ?6, old_price = ?7,
    featured = ?8, stock = ?9, sort = ?10, details = ?11, updated_at = ?12`;

const catBind = (c, at) => [c.id, c.name, c.icon, c.img, c.descr, c.sort, at];
const productBind = (p, at) => [
  p.id,
  p.cat,
  p.name,
  p.short,
  p.img,
  p.price,
  p.old_price,
  p.featured,
  p.stock,
  p.sort,
  p.details,
  at,
];

/** oldId موجود = الصف بيتعدّل (وممكن كوده نفسه يتغيّر) */
async function saveCat(request, env, oldId) {
  const c = catRow((await readJSON(request)) || {});
  const at = nowISO();
  if (oldId && oldId !== c.id) {
    await env.DB.prepare(
      "update categories set id = ?, name = ?, icon = ?, img = ?, descr = ?, sort = ?, updated_at = ? where id = ?",
    )
      .bind(c.id, c.name, c.icon, c.img, c.descr, c.sort, at, oldId)
      .run();
    return done();
  }
  await env.DB.prepare(CAT_UPSERT)
    .bind(...catBind(c, at))
    .run();
  return done();
}

async function saveProduct(request, env, oldId) {
  const p = productRow((await readJSON(request)) || {});
  const at = nowISO();
  if (oldId && oldId !== p.id) {
    await env.DB.prepare(
      "update products set id = ?, cat = ?, name = ?, short = ?, img = ?, price = ?," +
        " old_price = ?, featured = ?, stock = ?, sort = ?, details = ?, updated_at = ? where id = ?",
    )
      .bind(...productBind(p, at), oldId)
      .run();
    return done();
  }
  await env.DB.prepare(PRODUCT_UPSERT)
    .bind(...productBind(p, at))
    .run();
  return done();
}

async function importCatalog(request, env) {
  const b = (await readJSON(request, 4 * 1024 * 1024)) || {};
  const cats = Array.isArray(b.categories) ? b.categories : [];
  const prods = Array.isArray(b.products) ? b.products : [];
  if (cats.length > 200 || prods.length > 2000) bad(413, "الاستيراد كبير أوي");
  const at = nowISO();
  const stmts = [];
  /* الأقسام الأول — المنتجات بتشير ليها */
  for (const c of cats) stmts.push(env.DB.prepare(CAT_UPSERT).bind(...catBind(catRow(c), at)));
  for (const p of prods)
    stmts.push(env.DB.prepare(PRODUCT_UPSERT).bind(...productBind(productRow(p), at)));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ categories: cats.length, products: prods.length });
}

/* ============================================================
   الطلبات — الإضافة مفتوحة للزوّار، فالتحقّق هنا مشدّد
   ============================================================ */
async function createOrder(request, env) {
  const b = (await readJSON(request, 32 * 1024)) || {};
  const no = text(b.no, 40, "رقم الطلب");
  if (!b.customer || typeof b.customer !== "object" || Array.isArray(b.customer))
    bad(400, "بيانات العميل ناقصة");
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50)
    bad(400, "عدد الأصناف في الطلب مش صحيح");

  /* تاريخ الطلب بييجي من العميل (وبيتحفظ كما هو وقت استرجاع نسخة
     احتياطية)، فبنتأكد إنه تاريخ حقيقي ومش في المستقبل عشان محدش
     يثبّت طلب وهمي فوق القايمة */
  const sent = typeof b.at === "string" && b.at.length <= 40 ? Date.parse(b.at) : NaN;
  const at = Number.isFinite(sent) && sent <= Date.now() + 60000 ? new Date(sent).toISOString() : nowISO();
  try {
    await env.DB.prepare(
      "insert into orders (id, no, status, customer, items, subtotal, shipping, total, source, created_at, updated_at)" +
        " values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        no,
        STATUSES.has(b.status) ? b.status : "جديد",
        JSON.stringify(b.customer),
        JSON.stringify(b.items),
        money(b.subtotal, "الإجمالي الفرعي"),
        money(b.shipping, "الشحن", false),
        money(b.total, "الإجمالي"),
        text(b.source, 20, "المصدر", false) || "web",
        at,
        at,
      )
      .run();
  } catch (e) {
    /* نفس رقم الطلب موجود قبل كده — الزرار اتضغط مرتين غالبًا */
    if (/UNIQUE/i.test(String(e && e.message))) return done();
    throw e;
  }
  return done();
}

/* ============================================================
   رفع الصور
   ============================================================ */
async function upload(request, env, url) {
  if (!env.MEDIA) bad(500, "تخزين الصور (R2) مش مربوط");
  const folder = url.searchParams.get("folder") === "categories" ? "categories" : "products";

  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!type.startsWith("image/")) bad(415, "الملف ده مش صورة");

  if (Number(request.headers.get("content-length") || 0) > MAX_UPLOAD)
    bad(413, "الصورة أكبر من 10 ميجا");

  const name = url.searchParams.get("name") || "";
  const ext = (name.match(/\.[a-z0-9]{1,5}$/i) || [".jpg"])[0].toLowerCase();
  const key = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;

  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD) bad(413, "الصورة أكبر من 10 ميجا");
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type } });

  /* رابط نسبي — يشتغل على أي دومين من غير تعديل */
  return json({ url: "/media/" + key });
}

/* ============================================================
   الدخول والصلاحيات
   ============================================================ */
function secret(env) {
  const s = env.SESSION_SECRET;
  if (!s || String(s).length < 24) bad(500, "SESSION_SECRET مش متظبط — شوف SETUP.md");
  return String(s);
}

const normEmail = (v) => String(v || "").trim().toLowerCase();

async function issue(env, email, ver) {
  const s = secret(env);
  const t = Math.floor(Date.now() / 1000);
  return {
    access_token: await signToken({ e: email, v: ver, t: "a", exp: t + ACCESS_TTL }, s),
    refresh_token: await signToken({ e: email, v: ver, t: "r", exp: t + REFRESH_TTL }, s),
    expires_in: ACCESS_TTL,
    user: { email },
  };
}

/** @returns {Promise<{email:string}|null>} */
async function currentAdmin(request, env) {
  const head = request.headers.get("Authorization") || "";
  if (!head.startsWith("Bearer ")) return null;
  const p = await readToken(head.slice(7), secret(env));
  if (!p || p.t !== "a" || !p.e) return null;
  const row = await env.DB.prepare("select email, token_ver from admins where email = ?")
    .bind(p.e)
    .first();
  /* token_ver بيزيد مع كل تغيير كلمة سر — فالتوكنات القديمة بتبطل */
  if (!row || row.token_ver !== p.v) return null;
  return { email: row.email };
}

async function auth(request, env, seg, m) {
  const what = seg[0] || "";

  if (m === "POST" && what === "login") {
    await limit(env.LOGIN_LIMIT, request, "محاولات دخول كتير — استنّى دقيقة وجرّب تاني");
    const b = (await readJSON(request)) || {};
    const email = normEmail(b.email);
    const key = text(b.key, 200, "كلمة السر");
    const row = await env.DB.prepare(
      "select email, pass_hash, pass_salt, token_ver from admins where email = ?",
    )
      .bind(email)
      .first();

    if (!row) bad(401, "الإيميل أو كلمة السر غلط");
    if (!row.pass_hash)
      return json({ error: "الحساب ده لسه ما اتفعّلش — حط كلمة سر", setup: true }, 409);
    if (!(await verifySecret(key, row.pass_hash, row.pass_salt)))
      bad(401, "الإيميل أو كلمة السر غلط");

    return json(await issue(env, row.email, row.token_ver));
  }

  /* أول تفعيل: بيشتغل بس للحساب اللي لسه ماحطّش كلمة سر */
  if (m === "POST" && what === "setup") {
    await limit(env.LOGIN_LIMIT, request, "محاولات كتير — استنّى دقيقة وجرّب تاني");
    const b = (await readJSON(request)) || {};
    const email = normEmail(b.email);
    const key = text(b.key, 200, "كلمة السر");
    const row = await env.DB.prepare(
      "select email, pass_hash, token_ver from admins where email = ?",
    )
      .bind(email)
      .first();
    if (!row) bad(404, "الإيميل ده مش مسجّل كأدمن");
    if (row.pass_hash) bad(409, "الحساب ده متفعّل خلاص — سجّل دخول عادي");

    const { hash, salt } = await hashSecret(key);
    await env.DB.prepare("update admins set pass_hash = ?, pass_salt = ? where email = ?")
      .bind(hash, salt, row.email)
      .run();
    return json(await issue(env, row.email, row.token_ver));
  }

  if (m === "POST" && what === "refresh") {
    const b = (await readJSON(request)) || {};
    const p = await readToken(b.refresh_token, secret(env));
    if (!p || p.t !== "r" || !p.e) bad(401, "الجلسة انتهت — سجّل دخول تاني");
    const row = await env.DB.prepare("select email, token_ver from admins where email = ?")
      .bind(p.e)
      .first();
    if (!row || row.token_ver !== p.v) bad(401, "الجلسة انتهت — سجّل دخول تاني");
    return json(await issue(env, row.email, row.token_ver));
  }

  if (m === "POST" && what === "logout") return done();

  /* الباقي محتاج جلسة شغّالة */
  const who = await currentAdmin(request, env);
  if (!who) bad(401, "الجلسة انتهت — اعمل تسجيل خروج ودخول تاني");

  if (m === "GET" && what === "me") return json({ email: who.email });

  if (m === "POST" && what === "password") {
    const b = (await readJSON(request)) || {};
    const key = text(b.key, 200, "كلمة السر");
    const { hash, salt } = await hashSecret(key);
    /* token_ver بيزيد فكل الأجهزة التانية بتطلع برّه */
    await env.DB.prepare(
      "update admins set pass_hash = ?, pass_salt = ?, token_ver = token_ver + 1 where email = ?",
    )
      .bind(hash, salt, who.email)
      .run();
    const row = await env.DB.prepare("select token_ver from admins where email = ?")
      .bind(who.email)
      .first();
    return json(await issue(env, who.email, row.token_ver));
  }

  bad(404, "المسار ده مش موجود");
}
