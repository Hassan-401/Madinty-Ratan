/* ============================================================
   Madinty Ratan — عميل Supabase مبسّط
   ------------------------------------------------------------
   مكتوب بـ fetch عادي من غير أي مكتبة خارجية عشان الموقع يفضل
   ثابت من غير خطوة بناء. بيغطّي اللي المتجر محتاجه بس:
   • قراءة الأقسام والمنتجات   (للزوّار)
   • تسجيل الطلبات             (للزوّار)
   • تسجيل دخول الأدمن + CRUD  (للوحة التحكم)
   • رفع الصور على Storage     (للوحة التحكم)

   شكل الصفوف في قاعدة البيانات مش نفس شكل الكائنات في الموقع،
   فالتحويل بينهم بيحصل هنا (rowToProduct / productToRow ...).
   ============================================================ */

const SB = (() => {
  const URL_ = String(typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "")
    .trim()
    .replace(/\/+$/, "");
  const KEY = String(
    typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : "",
  ).trim();
  const configured = !!(URL_ && KEY);

  const SESSION_KEY = "mr_sb_session";

  /* ---------- الجلسة ---------- */
  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
    } catch (e) {
      return null;
    }
  }
  function saveSession(d) {
    if (!d || !d.access_token) return null;
    const s = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      /* بنطرح دقيقة عشان ما نستخدمش توكن على وشك الانتهاء */
      expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60000,
      email: d.user?.email || session()?.email || "",
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }
  const clearSession = () => localStorage.removeItem(SESSION_KEY);

  /* ---------- طلبات الشبكة ---------- */
  async function readError(res) {
    let msg = "";
    try {
      const d = await res.json();
      msg = d.message || d.error_description || d.msg || d.error || d.hint || "";
    } catch (e) {
      /* رد مش JSON */
    }
    if (!msg) msg = `HTTP ${res.status}`;
    return new Error(msg);
  }

  /** fetch بس بيحوّل أخطاء الشبكة لرسالة مفهومة بدل "Failed to fetch" */
  async function go(url, opts) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (e.name === "TimeoutError" || e.name === "AbortError")
        throw new Error("Supabase أخد وقت طويل ومردّش");
      throw new Error("تعذّر الاتصال بـ Supabase — راجع النت والقيم في config.js");
    }
  }

  async function auth(path, body, method = "POST") {
    const res = await go(`${URL_}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: KEY,
        "Content-Type": "application/json",
        ...(session() ? { Authorization: `Bearer ${session().access_token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await readError(res);
    return res.status === 204 ? null : res.json();
  }

  /** التوكن الحالي، وبيجدّده لوحده لو قرب ينتهي */
  async function token() {
    const s = session();
    if (!s) return null;
    if (Date.now() < s.expires_at) return s.access_token;
    if (!s.refresh_token) {
      clearSession();
      return null;
    }
    try {
      const d = await auth("token?grant_type=refresh_token", {
        refresh_token: s.refresh_token,
      });
      return saveSession(d).access_token;
    } catch (e) {
      clearSession();
      return null;
    }
  }

  /** مهلة للطلب — لو Supabase بطيء أو واقف ما نسيبش الزائر مستني */
  const timeoutSignal = (ms) => {
    try {
      return ms ? AbortSignal.timeout(ms) : undefined;
    } catch (e) {
      return undefined; /* متصفح قديم */
    }
  };

  /**
   * نداء على PostgREST.
   * @param {string} path مثال: "products?select=*&order=sort.asc"
   */
  async function rest(path, { method = "GET", body, prefer, keepalive, timeout } = {}) {
    if (!configured) throw new Error("Supabase مش متظبط في assets/js/config.js");
    /* لو كانت فيه جلسة وانتهت، منكملش بمفتاح الزائر — الكتابة هتترفض
       برسالة RLS مش مفهومة، فالأوضح نقول إن الجلسة خلصت */
    const hadSession = !!session();
    const jwt = (await token()) || KEY;
    if (hadSession && jwt === KEY)
      throw new Error("الجلسة انتهت — اعمل تسجيل خروج ودخول تاني");
    const res = await go(`${URL_}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      /* keepalive بيخلّي الطلب يكمّل حتى لو العميل قفل التبويب بعد ما فتح الواتساب */
      keepalive: !!keepalive,
      signal: timeoutSignal(timeout),
    });
    if (!res.ok) throw await readError(res);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ============================================================
     تحويل الصفوف <-> كائنات الموقع
     ============================================================ */

  /* الحقول اللي بتتخزن جوه details لأنها متغيّرة من منتج للتاني */
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

  const num = (v) => (v == null ? null : Number(v));

  function rowToCat(r) {
    const c = { id: r.id, name: r.name };
    if (r.icon) c.icon = r.icon;
    if (r.img) c.img = r.img;
    if (r.descr) c.desc = r.descr;
    return c;
  }
  const catToRow = (c, sort = 0) => ({
    id: c.id,
    name: c.name,
    icon: c.icon || null,
    img: c.img || null,
    descr: c.desc || null,
    sort,
  });

  function rowToProduct(r) {
    const p = {
      id: r.id,
      cat: r.cat,
      name: r.name,
      short: r.short || "",
      img: r.img || "",
      price: num(r.price),
    };
    if (r.old_price != null) p.oldPrice = num(r.old_price);
    if (r.featured) p.featured = true;
    if (r.stock != null) p.stock = Number(r.stock);
    /* details فيه باقي الحقول بنفس أسماء data.js بالظبط */
    Object.assign(p, r.details || {});
    return p;
  }
  function productToRow(p, sort = 0) {
    const details = {};
    for (const k of EXTRA) if (p[k] != null) details[k] = p[k];
    return {
      id: p.id,
      cat: p.cat,
      name: p.name,
      short: p.short || null,
      img: p.img || null,
      price: p.price ?? null,
      old_price: p.oldPrice ?? null,
      featured: !!p.featured,
      stock: p.stock ?? null,
      sort,
      details,
    };
  }

  const rowToOrder = (r) => ({
    no: r.no,
    at: r.created_at,
    status: r.status,
    customer: r.customer || {},
    items: r.items || [],
    subtotal: num(r.subtotal) || 0,
    shipping: num(r.shipping),
    total: num(r.total) || 0,
  });
  const orderToRow = (o, source = "web") => ({
    no: o.no,
    status: o.status,
    customer: o.customer,
    items: o.items,
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    source,
  });

  /* ============================================================
     العمليات
     ============================================================ */
  const api = {
    configured,
    url: URL_,
    session,
    clearSession,
    email: () => session()?.email || "",

    /* ---------- الدخول ---------- */
    async signIn(email, password) {
      const d = await auth("token?grant_type=password", { email, password });
      saveSession(d);
      return d;
    },
    async signOut() {
      try {
        await auth("logout", {});
      } catch (e) {
        /* التوكن ممكن يكون منتهي — مش مشكلة */
      }
      clearSession();
    },
    /** بيرجّع true لو فيه جلسة شغالة فعلًا */
    async signedIn() {
      return !!(await token());
    },
    async changePassword(password) {
      const jwt = await token();
      if (!jwt) throw new Error("الجلسة انتهت — سجّل دخول تاني");
      return auth("user", { password }, "PUT");
    },
    /** الإيميل ده مسموح له يعدّل؟ (بيسأل جدول admins نفسه) */
    async isAdmin() {
      const rows = await rest("admins?select=email&limit=1");
      return Array.isArray(rows) && rows.length > 0;
    },

    /* ---------- الكتالوج ---------- */
    async categories(timeout) {
      const rows = await rest("categories?select=*&order=sort.asc,name.asc", { timeout });
      return rows.map(rowToCat);
    },
    async products(timeout) {
      const rows = await rest("products?select=*&order=sort.asc,name.asc", { timeout });
      return rows.map(rowToProduct);
    },
    saveCat: (c, sort) =>
      rest("categories?on_conflict=id", {
        method: "POST",
        body: [catToRow(c, sort)],
        prefer: "resolution=merge-duplicates,return=minimal",
      }),
    renameCat: (oldId, c, sort) =>
      rest(`categories?id=eq.${encodeURIComponent(oldId)}`, {
        method: "PATCH",
        body: catToRow(c, sort),
        prefer: "return=minimal",
      }),
    delCat: (id) =>
      rest(`categories?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      }),

    saveProduct: (p, sort) =>
      rest("products?on_conflict=id", {
        method: "POST",
        body: [productToRow(p, sort)],
        prefer: "resolution=merge-duplicates,return=minimal",
      }),
    renameProduct: (oldId, p, sort) =>
      rest(`products?id=eq.${encodeURIComponent(oldId)}`, {
        method: "PATCH",
        body: productToRow(p, sort),
        prefer: "return=minimal",
      }),
    delProduct: (id) =>
      rest(`products?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      }),

    /** رفع دفعة واحدة — بيستخدمها زرار «استيراد الكتالوج الافتراضي» */
    async importCatalog(cats, prods) {
      await rest("categories?on_conflict=id", {
        method: "POST",
        body: cats.map((c, i) => catToRow(c, i)),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      await rest("products?on_conflict=id", {
        method: "POST",
        body: prods.map((p, i) => productToRow(p, i)),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    },

    /* ---------- الطلبات ---------- */
    async orders() {
      const rows = await rest("orders?select=*&order=created_at.desc&limit=500");
      return rows.map(rowToOrder);
    },
    /* return=minimal مهم: الزائر مسموح له يضيف بس مش يقرا */
    addOrder: (o, source) =>
      rest("orders", {
        method: "POST",
        body: [orderToRow(o, source)],
        prefer: "return=minimal",
        keepalive: true,
      }),
    setOrderStatus: (no, status) =>
      rest(`orders?no=eq.${encodeURIComponent(no)}`, {
        method: "PATCH",
        body: { status },
        prefer: "return=minimal",
      }),
    delOrder: (no) =>
      rest(`orders?no=eq.${encodeURIComponent(no)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      }),
    delAllOrders: () =>
      rest("orders?no=neq.__none__", { method: "DELETE", prefer: "return=minimal" }),

    /* ---------- رفع صورة ---------- */
    /** @returns {Promise<string>} الرابط العام للصورة */
    async upload(file, folder = "products") {
      const jwt = await token();
      if (!jwt) throw new Error("لازم تسجّل دخول الأول");
      const ext = (String(file.name).match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const res = await go(`${URL_}/storage/v1/object/media/${path}`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${jwt}`,
          "x-upsert": "true",
        },
        body: file,
      });
      if (!res.ok) throw await readError(res);
      return `${URL_}/storage/v1/object/public/media/${path}`;
    },
  };

  return api;
})();
