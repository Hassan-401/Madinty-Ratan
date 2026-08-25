/* ============================================================
   Madinty Ratan — منطق المتجر المشترك
   ============================================================ */

/* ---------- أدوات عامة ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => Number(n).toLocaleString("en-US") + " ج.م";
const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || "";
const getProduct = (id) => PRODUCTS.find((p) => p.id === id);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/* ---------- العربة (localStorage) ---------- */
const CART_KEY = "mr_cart_v1";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}
function addToCart(id, qty = 1) {
  const cart = getCart();
  const line = cart.find((l) => l.id === id);
  if (line) line.qty += qty;
  else cart.push({ id, qty });
  saveCart(cart);
  toast("تمت الإضافة إلى العربة ✓");
}
function setQty(id, qty) {
  const cart = getCart();
  const line = cart.find((l) => l.id === id);
  if (!line) return;
  line.qty = Math.max(1, qty);
  saveCart(cart);
}
function removeFromCart(id) {
  saveCart(getCart().filter((l) => l.id !== id));
}
function clearCart() {
  saveCart([]);
}
function cartCount() {
  return getCart().reduce((s, l) => s + l.qty, 0);
}
function cartTotal() {
  return getCart().reduce((s, l) => {
    const p = getProduct(l.id);
    return p ? s + p.price * l.qty : s;
  }, 0);
}
function updateCartCount() {
  const n = cartCount();
  $$(".cart-btn .count").forEach((el) => {
    el.textContent = n;
    el.style.display = n ? "grid" : "none";
  });
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
          <li>📞 <a href="tel:${STORE.whatsappDisplay}" dir="ltr">${STORE.whatsappDisplay}</a></li>
          <li>💬 <a href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener">واتساب</a></li>
          <li>✉️ <a href="mailto:${STORE.email}" dir="ltr">${STORE.email}</a></li>
          <li>📍 المصنع: ${STORE.factory}</li>
        </ul>
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
  return `
  <article class="card">
    <a class="thumb" href="product.html?id=${p.id}">
      ${off ? `<span class="badge">خصم ${off}%</span>` : ""}
      <img src="${p.img}" alt="${esc(p.name)}" loading="lazy">
    </a>
    <div class="body">
      <span class="cat-tag">${catName(p.cat)}</span>
      <h3><a href="product.html?id=${p.id}">${esc(p.name)}</a></h3>
      <p class="short">${esc(p.short)}</p>
      <div class="price">${money(p.price)}${p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ""}</div>
      <div class="actions">
        <button class="btn btn-dark" onclick="addToCart('${p.id}')">أضف للعربة</button>
        <a class="btn btn-line" href="product.html?id=${p.id}">تفاصيل</a>
      </div>
    </div>
  </article>`;
}

/* ---------- رسالة الواتساب ---------- */
function buildOrderMessage(customer) {
  const cart = getCart();
  const orderNo = "MR-" + Date.now().toString().slice(-6);
  const lines = cart
    .map((l, i) => {
      const p = getProduct(l.id);
      return `${i + 1}) ${p.name}\n   الكمية: ${l.qty} × ${money(p.price)} = ${money(p.price * l.qty)}`;
    })
    .join("\n");

  const date = new Date().toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return [
    "🛒 *طلب جديد من موقع Madinty Ratan*",
    `رقم الطلب: ${orderNo}`,
    "",
    "*🧾 المنتجات:*",
    lines,
    "",
    `*💰 الإجمالي: ${money(cartTotal())}*`,
    "",
    "*👤 بيانات العميل:*",
    `الاسم: ${customer.name}`,
    `الموبايل: ${customer.phone}`,
    customer.phone2 ? `موبايل احتياطي: ${customer.phone2}` : null,
    `المحافظة: ${customer.gov}`,
    `العنوان: ${customer.address}`,
    customer.notes ? `ملاحظات: ${customer.notes}` : null,
    "",
    `📅 ${date}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function sendOrderToWhatsApp(customer) {
  const url = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(buildOrderMessage(customer))}`;
  window.open(url, "_blank");
}

/* ---------- المحافظات ---------- */
const GOVS = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "القليوبية",
  "المنوفية",
  "الشرقية",
  "الغربية",
  "الدقهلية",
  "البحيرة",
  "كفر الشيخ",
  "دمياط",
  "بورسعيد",
  "الإسماعيلية",
  "السويس",
  "شمال سيناء",
  "جنوب سيناء",
  "بني سويف",
  "الفيوم",
  "المنيا",
  "أسيوط",
  "سوهاج",
  "قنا",
  "الأقصر",
  "أسوان",
  "البحر الأحمر",
  "الوادي الجديد",
  "مطروح",
];
