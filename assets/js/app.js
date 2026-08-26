/* ============================================================
   Madinty Ratan — منطق المتجر المشترك
   ============================================================ */

/* ---------- أدوات عامة ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => Number(n).toLocaleString("en-US") + " ج.م";
/** ترميز مسار الصورة (الأسماء عربية وفيها مسافات) — يشتغل مع المسار الخام أو المرمّز */
function imgURL(s) {
  try {
    return encodeURI(decodeURI(String(s || "")));
  } catch (e) {
    return encodeURI(String(s || ""));
  }
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/* ============================================================
   الكتالوج
   ------------------------------------------------------------
   المصدر الأساسي = جداول Supabase (لو config.js متظبط)، فأي تعديل
   من لوحة التحكم بيظهر لكل الزوّار على طول.

   لو الاتصال فشل بنرجع لآخر نسخة متخزنة في المتصفح، وبعدين لنسخة
   data.js المرفوعة مع الموقع — عشان الصفحة ما تفضلش فاضية أبدًا.
   ============================================================ */
const CATALOG_CACHE = "mr_catalog_v1";

let CATEGORIES = DEFAULT_CATEGORIES;
let PRODUCTS = DEFAULT_PRODUCTS;
/** من فين اتحمّل الكتالوج: supabase | cache | data.js */
let CATALOG_SOURCE = "data.js";

function readCatalogCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CATALOG_CACHE));
    if (!c || !Array.isArray(c.categories) || !Array.isArray(c.products))
      return null;
    if (!c.categories.length || !c.products.length) return null;
    return c;
  } catch (e) {
    return null;
  }
}

/** أقصى انتظار للكتالوج قبل ما نعرض النسخة المتخزنة (بالملي ثانية) */
const CATALOG_TIMEOUT = 6000;

async function loadCatalog() {
  if (!SB.configured) return;
  try {
    const [cats, prods] = await Promise.all([
      SB.categories(CATALOG_TIMEOUT),
      SB.products(CATALOG_TIMEOUT),
    ]);
    /* قاعدة فاضية (لسه ما اتعملش استيراد) — نسيب data.js شغّالة */
    if (cats.length) CATEGORIES = cats;
    if (prods.length) PRODUCTS = prods;
    if (cats.length && prods.length) {
      CATALOG_SOURCE = "supabase";
      localStorage.setItem(
        CATALOG_CACHE,
        JSON.stringify({ categories: CATEGORIES, products: PRODUCTS }),
      );
    }
  } catch (err) {
    const c = readCatalogCache();
    if (c) {
      CATEGORIES = c.categories;
      PRODUCTS = c.products;
      CATALOG_SOURCE = "cache";
    }
    console.warn("[Madinty Ratan] تعذّر تحميل الكتالوج من Supabase:", err.message);
  }
  updateCartCount();
}

const catalogReady = loadCatalog();

/** شغّل الكود بعد ما الكتالوج يجهز — كل صفحة بتعرض منتجات بتستخدمها */
const storeReady = (fn) =>
  catalogReady.then(fn).catch((e) => console.error(e));

const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || "";
const getProduct = (id) => PRODUCTS.find((p) => p.id === id);
const colorById = (id) => CUSHION_COLORS.find((c) => c.id === Number(id));

/* ============================================================
   العربة (localStorage)
   ------------------------------------------------------------
   السطر = { id, qty, v: رقم نوع الطقم أو null, c: رقم لون الشلت أو null }
   نفس المنتج بنوع أو لون مختلف = سطر مستقل.
   ============================================================ */
const CART_KEY = "mr_cart_v1";

const lineKey = (l) => `${l.id}|${l.v ?? ""}|${l.c ?? ""}`;

/** سعر الوحدة: سعر النوع المختار لو ليه سعر، وإلا سعر المنتج */
function linePrice(l) {
  const p = getProduct(l.id);
  if (!p) return 0;
  const v = l.v != null && p.variants ? p.variants[l.v] : null;
  return v && v.price != null ? v.price : p.price || 0;
}
function lineVariantName(l) {
  const p = getProduct(l.id);
  const v = p && l.v != null && p.variants ? p.variants[l.v] : null;
  return v ? v.name : "";
}
function lineColorName(l) {
  const c = l.c != null ? colorById(l.c) : null;
  return c ? c.name : "";
}

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    /* نتجاهل أي منتج اتشال من الكتالوج */
    return cart.filter((l) => getProduct(l.id));
  } catch (e) {
    return [];
  }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}
function addToCart(id, qty = 1, v = null, c = null) {
  const cart = getCart();
  const key = lineKey({ id, v, c });
  const line = cart.find((l) => lineKey(l) === key);
  if (line) line.qty += qty;
  else cart.push({ id, qty, v, c });
  saveCart(cart);
  toast("تمت الإضافة إلى العربة ✓");
}
function setQty(key, qty) {
  const cart = getCart();
  const line = cart.find((l) => lineKey(l) === key);
  if (!line) return;
  line.qty = Math.max(1, qty);
  saveCart(cart);
}
function removeFromCart(key) {
  saveCart(getCart().filter((l) => lineKey(l) !== key));
}
function clearCart() {
  saveCart([]);
}
function cartCount() {
  return getCart().reduce((s, l) => s + l.qty, 0);
}
function cartTotal() {
  return getCart().reduce((s, l) => s + linePrice(l) * l.qty, 0);
}
function updateCartCount() {
  const n = cartCount();
  $$(".cart-btn .count").forEach((el) => {
    el.textContent = n;
    el.style.display = n ? "grid" : "none";
  });
}

/* ---------- الشحن ---------- */
/** @returns {number|null} التكلفة، أو null لو المحافظة بتتحدد عند التأكيد */
function shippingCost(gov) {
  if (!gov || !(gov in SHIPPING)) return null;
  return SHIPPING[gov];
}
function shippingLabel(gov) {
  const c = shippingCost(gov);
  if (!gov) return "اختر المحافظة أولًا";
  if (c === null) return "تُحدد عند التأكيد";
  return c === 0 ? "مجانًا" : money(c);
}

/* ============================================================
   الطلبات
   ------------------------------------------------------------
   الطلب بيتبعت لـ Supabase عشان يظهر في لوحة التحكم، وبيتحفظ كمان
   نسخة محلية في متصفح العميل كنسخة احتياطية لو النت فصل.
   ============================================================ */
const ORDERS_KEY = "mr_orders_v1";
const ORDER_STATUSES = [
  "جديد",
  "تم التأكيد",
  "قيد التجهيز",
  "تم الشحن",
  "تم التسليم",
  "ملغي",
];

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveOrders(list) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
}
function addOrder(order) {
  const list = getOrders();
  list.unshift(order);
  saveOrders(list.slice(0, 50));
  return order;
}

/**
 * بيبعت الطلب لقاعدة البيانات عشان يوصل لوحة التحكم.
 * مش بنوقف العميل لو فشل — الرسالة بتوصل على الواتساب برضه،
 * وصاحب المتجر يقدر يضيفها من «لصق رسالة واتساب».
 * @returns {Promise<boolean>}
 */
async function sendOrder(order, source = "web") {
  if (!SB.configured) return false;
  try {
    await SB.addOrder(order, source);
    return true;
  } catch (err) {
    console.warn("[Madinty Ratan] الطلب ما اتسجّلش في القاعدة:", err.message);
    return false;
  }
}

/** رقم طلب لا يتكرر: 6 أرقام من الوقت + رقمين عشوائيين */
const newOrderNo = () =>
  "MR-" +
  Date.now().toString().slice(-6) +
  Math.floor(10 + Math.random() * 90);

/** يبني كائن الطلب من العربة + بيانات العميل */
function buildOrder(customer) {
  const cart = getCart();
  const items = cart.map((l) => {
    const p = getProduct(l.id);
    return {
      id: l.id,
      name: p.name,
      qty: l.qty,
      price: linePrice(l),
      variant: lineVariantName(l),
      color: lineColorName(l),
    };
  });
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = shippingCost(customer.gov);
  return {
    no: newOrderNo(),
    at: new Date().toISOString(),
    status: ORDER_STATUSES[0],
    customer,
    items,
    subtotal,
    shipping: ship,
    total: subtotal + (ship || 0),
  };
}

/* ---------- إشعار سريع ---------- */
let toastTimer;
function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- الهيدر والفوتر ---------- */

const ICONS = {
  chair:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M4 11h16a1 1 0 0 1 1 1v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a1 1 0 0 1 1-1Z"/><path d="M6 17v3M18 17v3"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h9.1a1.6 1.6 0 0 0 1.6-1.3L21 7H5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.5s7-5.9 7-11.2A7 7 0 0 0 5 10.3c0 5.3 7 11.2 7 11.2Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3h3l1.5 4-2 1.4a12 12 0 0 0 5.6 5.6L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.3 2"/></svg>',
  whats:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1s-.7 1-.9 1.2c-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>',
  truck:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5h12v11H1z"/><path d="M13 8h4.5l3.5 3.5V16h-8"/><circle cx="6" cy="18.5" r="1.9"/><circle cx="17" cy="18.5" r="1.9"/></svg>',
  medal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9.5" r="6"/><path d="m9 8.8 2 2 4-4"/><path d="m8.5 15-1.7 6L12 18.6 17.2 21l-1.7-6"/></svg>',
  facebook:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.9h-2.33V22c4.78-.79 8.45-4.93 8.45-9.94z"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 4.5 5.6v6c0 4.6 3.1 8.5 7.5 9.9 4.4-1.4 7.5-5.3 7.5-9.9v-6L12 2.5Z"/><path d="m8.8 11.8 2.4 2.4 4-4.4"/></svg>',
};

const NAV_LINKS = [
  ["index.html", "الرئيسية", "home"],
  ["products.html", "جميع المنتجات", "products"],
  ["about.html", "من نحن", "about"],
  ["contact.html", "تواصل معنا", "contact"],
];

/**
 * @param {string} active  مفتاح الصفحة الحالية
 * @param {boolean} overlay  true = هيدر شفاف فوق صورة الهيرو (الصفحة الرئيسية)
 */
function renderHeader(active, overlay = false) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `
  <header class="site${overlay ? " overlay" : ""}">
    <div class="wrap nav">
      <a class="logo" href="index.html">
        <span class="txt">
          <b>مدينتي رتان</b>
          <em>MADINTY RATAN</em>
          <small>أثاث خارجي فاخر</small>
        </span>
        <span class="mark">${ICONS.chair}</span>
      </a>

      <nav class="links">
        ${NAV_LINKS.map(
          ([h, t, k]) =>
            `<a href="${h}" class="${k === active ? "active" : ""}">${t}</a>`,
        ).join("")}
      </nav>

      <div class="tools">
        <a class="icon-btn cart-btn" href="cart.html" aria-label="عربة التسوق">
          ${ICONS.cart}<span class="count">0</span>
        </a>
        <button class="burger" aria-label="القائمة"
          onclick="document.querySelector('.nav .links').classList.toggle('open')">☰</button>
      </div>
    </div>
  </header>`,
  );

  const header = $("header.site");
  if (overlay) {
    const onScroll = () =>
      header.classList.toggle("scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  updateCartCount();
}

function renderFooter() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `
  <footer class="site" id="contact">
    <div class="wrap cols">
      <div>
        <h4>Madinty Ratan</h4>
        <p>${STORE.tagline}<br>خامات قوية · تشطيب نضيف · ضمان فعلي.<br>${STORE.shippingNote}</p>
      </div>
      <div>
        <h4>روابط سريعة</h4>
        <ul>
          <li><a href="index.html">الرئيسية</a></li>
          <li><a href="products.html">جميع المنتجات</a></li>
          <li><a href="about.html">من نحن</a></li>
          <li><a href="contact.html">تواصل معنا</a></li>
          <li><a href="cart.html">عربة التسوق</a></li>
        </ul>
      </div>
      <div>
        <h4>تواصل معنا</h4>
        <ul>
          <li>📞 <a href="tel:${STORE.phone}" dir="ltr">${STORE.whatsappDisplay}</a></li>
          <li>💬 <a href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener">واتساب</a></li>
          <li>✉️ <a href="mailto:${STORE.email}" dir="ltr">${STORE.email}</a></li>
          <li>📍 المصنع: ${STORE.factory}</li>
        </ul>
        <div class="social">
          <a href="${STORE.facebook}" target="_blank" rel="noopener" aria-label="صفحتنا على فيسبوك" title="فيسبوك">${ICONS.facebook}</a>
          <a href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener" aria-label="واتساب" title="واتساب">${ICONS.whats}</a>
        </div>
      </div>
    </div>
    <div class="wrap copy">© ${new Date().getFullYear()} Madinty Ratan — جميع الحقوق محفوظة</div>
  </footer>
  <a class="wa-float" href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener" aria-label="واتساب">${ICONS.whats}</a>
  <div id="toast"></div>`,
  );
}

/* ---------- كارت المنتج ---------- */
function productCard(p) {
  const off = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const hasVariants = !!(p.variants && p.variants.length);
  /* لازم يفتح صفحة المنتج عشان يختار النوع أو لون الشلت */
  const pickLabel = hasVariants ? "اختر النوع" : p.cushions ? "اختر اللون" : "";
  return `
  <article class="card">
    <a class="thumb" href="product.html?id=${encodeURIComponent(p.id)}">
      ${off ? `<span class="badge">خصم ${off}%</span>` : ""}
      <img src="${imgURL(p.img)}" alt="${esc(p.name)}" loading="lazy">
    </a>
    <div class="body">
      <span class="cat-tag">${esc(catName(p.cat))}</span>
      <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
      <p class="short">${esc(p.short)}</p>
      <div class="price">${hasVariants ? "يبدأ من " : ""}${money(p.price)}${p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ""}</div>
      <div class="actions">
        ${
          pickLabel
            ? `<a class="btn btn-dark" href="product.html?id=${encodeURIComponent(p.id)}">${pickLabel}</a>`
            : `<button class="btn btn-dark" onclick="addToCart('${esc(p.id)}')">أضف للعربة</button>`
        }
        <a class="btn btn-line" href="product.html?id=${encodeURIComponent(p.id)}">تفاصيل</a>
      </div>
    </div>
  </article>`;
}

/* ---------- رسالة الواتساب ---------- */
function buildOrderMessage(order) {
  const lines = order.items
    .map((it, i) => {
      const extra = [
        it.variant ? `النوع: ${it.variant}` : null,
        it.color ? `لون الشلت: ${it.color}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      return (
        `${i + 1}) ${it.name}` +
        (extra ? `\n   ${extra}` : "") +
        `\n   الكمية: ${it.qty} × ${money(it.price)} = ${money(it.price * it.qty)}`
      );
    })
    .join("\n");

  const c = order.customer;
  const date = new Date(order.at).toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return [
    "🛒 *طلب جديد من موقع Madinty Ratan*",
    `رقم الطلب: ${order.no}`,
    "",
    "*🧾 المنتجات:*",
    lines,
    "",
    `الإجمالي الفرعي: ${money(order.subtotal)}`,
    `الشحن (${c.gov}): ${order.shipping === null ? "يُحدد عند التأكيد" : order.shipping === 0 ? "مجانًا" : money(order.shipping)}`,
    `*💰 الإجمالي: ${money(order.total)}*` +
      (order.shipping === null ? " + الشحن" : ""),
    "",
    "*👤 بيانات العميل:*",
    `الاسم: ${c.name}`,
    `الموبايل: ${c.phone}`,
    c.phone2 ? `موبايل احتياطي: ${c.phone2}` : null,
    `المحافظة: ${c.gov}`,
    `العنوان: ${c.address}`,
    c.notes ? `ملاحظات: ${c.notes}` : null,
    "",
    `📅 ${date}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function orderWhatsAppUrl(order) {
  return `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(buildOrderMessage(order))}`;
}
