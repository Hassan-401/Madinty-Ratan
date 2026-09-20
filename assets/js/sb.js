/* ============================================================
   Madinty Ratan — عميل الـAPI
   ------------------------------------------------------------
   مكتوب بـ fetch عادي من غير أي مكتبة خارجية عشان الموقع يفضل
   ثابت من غير خطوة بناء. بيغطّي اللي المتجر محتاجه بس:
   • قراءة الأقسام والمنتجات   (للزوّار)
   • تسجيل الطلبات             (للزوّار)
   • تسجيل دخول الأدمن + CRUD  (للوحة التحكم)
   • رفع الصور                 (للوحة التحكم)

   الطلبات كلها رايحة لـ /api على نفس الدومين — الـWorker بتاع
   Cloudflare هو اللي بيكلّم قاعدة البيانات. يعني المتصفح مالوش
   أي وصول مباشر للقاعدة ولا فيه مفتاح مكشوف في الكود.

   شكل الصفوف في قاعدة البيانات مش نفس شكل الكائنات في الموقع،
   فالتحويل بينهم بيحصل هنا (rowToProduct / productToRow ...).
   ============================================================ */

const SB = (() => {
  const BASE =
    String(typeof API_BASE !== "undefined" ? API_BASE : "")
      .trim()
      .replace(/\/+$/, "") + "/api";

  const SESSION_KEY = "mr_sb_session";

  /* عدد دورات تشفير كلمة السر في المتصفح.
     ⚠️ لازم يساوي CLIENT_ITERATIONS في worker/auth.js */
  const KDF_ITERATIONS = 300000;

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

  /* ============================================================
     كلمة السر
     ------------------------------------------------------------
     كلمة السر نفسها عمرها ما بتخرج من الجهاز — اللي بيتبعت هو
     ناتج PBKDF2 عليها. السيرفر بيشفّر الناتج ده تاني قبل ما
     يخزّنه، فحتى لو حد وصل للقاعدة مش هيعرف كلمة السر.
     ============================================================ */
  async function deriveKey(email, password) {
    if (!(window.crypto && crypto.subtle))
      throw new Error("المتصفح ده مش مدعوم — افتح اللوحة من متصفح أحدث");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: enc.encode("mr:" + String(email).trim().toLowerCase()),
        iterations: KDF_ITERATIONS,
      },
      key,
      256,
    );
    let s = "";
    for (const b of new Uint8Array(bits)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /* ---------- طلبات الشبكة ---------- */
  async function readError(res) {
    let msg = "";
    let setup = false;
    try {
      const d = await res.json();
      msg = d.error || d.message || "";
      setup = !!d.setup;
    } catch (e) {
      /* رد مش JSON */
    }
    if (!msg) msg = "HTTP " + res.status;
    const err = new Error(msg);
    err.status = res.status;
    err.setup = setup;
    return err;
  }

  /** fetch بس بيحوّل أخطاء الشبكة لرسالة مفهومة بدل "Failed to fetch" */
  async function go(url, opts) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (e.name === "TimeoutError" || e.name === "AbortError")
        throw new Error("السيرفر أخد وقت طويل ومردّش");
      throw new Error("تعذّر الاتصال بالسيرفر — راجع النت وجرّب تاني");
    }
  }

  /** مهلة للطلب — لو السيرفر بطيء أو واقف ما نسيبش الزائر مستني */
  const timeoutSignal = (ms) => {
    try {
      return ms ? AbortSignal.timeout(ms) : undefined;
    } catch (e) {
      return undefined; /* متصفح قديم */
    }
  };

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
      const res = await go(BASE + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!res.ok) throw await readError(res);
      return saveSession(await res.json()).access_token;
    } catch (e) {
      clearSession();
      return null;
    }
  }

  /**
   * نداء على الـAPI.
   * @param {string} path مثال: "/products"
   */
  async function call(path, opts = {}) {
    const { method = "GET", body, raw, type, authed = false, keepalive, timeout } = opts;
    const headers = { Accept: "application/json" };

    if (authed) {
      const jwt = await token();
      /* لو كانت فيه جلسة وانتهت، منكملش من غير توكن — الرد هيبقى
         401 برسالة مش مفهومة، فالأوضح نقول إن الجلسة خلصت */
      if (!jwt) throw new Error("الجلسة انتهت — اعمل تسجيل خروج ودخول تاني");
      headers.Authorization = "Bearer " + jwt;
    }

    let payload;
    if (raw !== undefined) {
      payload = raw;
      if (type) headers["Content-Type"] = type;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const res = await go(BASE + path, {
      method,
      headers,
      body: payload,
      /* keepalive بيخلّي الطلب يكمّل حتى لو العميل قفل التبويب بعد ما فتح الواتساب */
      keepalive: !!keepalive,
      signal: timeoutSignal(timeout),
    });
    if (!res.ok) throw await readError(res);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const enc = encodeURIComponent;

  /* بعض الملفات (زي .jfif) المتصفح بيسيب نوعها فاضي */
  const TYPES = {
    jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", jpe: "image/jpeg",
    png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
    svg: "image/svg+xml", bmp: "image/bmp",
  };
  const guessType = (name) =>
    TYPES[String(name).split(".").pop().toLowerCase()] || "image/jpeg";

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
    at: o.at,
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
    /* الـAPI على نفس الدومين، فمفيش حاجة تتظبط — القيمة موجودة
       عشان الكود اللي بيسأل عنها في app.js و admin.js يفضل شغّال */
    configured: true,
    base: BASE,
    session,
    clearSession,
    email: () => session()?.email || "",

    /* ---------- الدخول ---------- */
    async signIn(email, password) {
      const d = await call("/auth/login", {
        method: "POST",
        body: { email: String(email).trim(), key: await deriveKey(email, password) },
      });
      saveSession(d);
      return d;
    },
    /** أول مرة بس: بتحط كلمة سر لحساب لسه ما اتفعّلش */
    async setupPassword(email, password) {
      const d = await call("/auth/setup", {
        method: "POST",
        body: { email: String(email).trim(), key: await deriveKey(email, password) },
      });
      saveSession(d);
      return d;
    },
    async signOut() {
      try {
        await call("/auth/logout", { method: "POST", authed: true });
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
      const email = session()?.email;
      if (!email) throw new Error("الجلسة انتهت — سجّل دخول تاني");
      const d = await call("/auth/password", {
        method: "POST",
        authed: true,
        body: { key: await deriveKey(email, password) },
      });
      /* كلمة السر الجديدة بتبطّل التوكنات القديمة، فبناخد توكن جديد */
      saveSession(d);
      return d;
    },
    /** الحساب ده مسموح له يعدّل؟ */
    async isAdmin() {
      const d = await call("/auth/me", { authed: true });
      return !!(d && d.email);
    },

    /* ---------- الكتالوج ---------- */
    async categories(timeout) {
      const rows = await call("/categories", { timeout });
      return rows.map(rowToCat);
    },
    async products(timeout) {
      const rows = await call("/products", { timeout });
      return rows.map(rowToProduct);
    },
    saveCat: (c, sort) =>
      call("/categories/" + enc(c.id), { method: "PUT", authed: true, body: catToRow(c, sort) }),
    renameCat: (oldId, c, sort) =>
      call("/categories/" + enc(oldId), { method: "PATCH", authed: true, body: catToRow(c, sort) }),
    delCat: (id) => call("/categories/" + enc(id), { method: "DELETE", authed: true }),

    saveProduct: (p, sort) =>
      call("/products/" + enc(p.id), { method: "PUT", authed: true, body: productToRow(p, sort) }),
    renameProduct: (oldId, p, sort) =>
      call("/products/" + enc(oldId), {
        method: "PATCH",
        authed: true,
        body: productToRow(p, sort),
      }),
    delProduct: (id) => call("/products/" + enc(id), { method: "DELETE", authed: true }),

    /** رفع دفعة واحدة — بيستخدمها زرار «استيراد الكتالوج الافتراضي» */
    async importCatalog(cats, prods) {
      await call("/catalog/import", {
        method: "POST",
        authed: true,
        body: {
          categories: cats.map((c, i) => catToRow(c, i)),
          products: prods.map((p, i) => productToRow(p, i)),
        },
      });
    },

    /* ---------- الطلبات ---------- */
    async orders() {
      const rows = await call("/orders", { authed: true });
      return rows.map(rowToOrder);
    },
    /* من غير توكن: الزائر مسموح له يضيف بس مش يقرا */
    addOrder: (o, source) =>
      call("/orders", { method: "POST", body: orderToRow(o, source), keepalive: true }),
    setOrderStatus: (no, status) =>
      call("/orders/" + enc(no), { method: "PATCH", authed: true, body: { status } }),
    delOrder: (no) => call("/orders/" + enc(no), { method: "DELETE", authed: true }),
    delAllOrders: () => call("/orders", { method: "DELETE", authed: true }),

    /* ---------- رفع صورة ---------- */
    /** @returns {Promise<string>} رابط الصورة */
    async upload(file, folder = "products") {
      const d = await call("/upload?folder=" + enc(folder) + "&name=" + enc(file.name || ""), {
        method: "POST",
        authed: true,
        raw: file,
        type: file.type || guessType(file.name),
      });
      return d.url;
    },
  };

  return api;
})();
