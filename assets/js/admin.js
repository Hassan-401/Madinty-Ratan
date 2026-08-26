/* ============================================================
   Madinty Ratan — لوحة التحكم
   ------------------------------------------------------------
   بتشتغل كلها في المتصفح (من غير سيرفر):
   • المنتجات والأقسام  -> localStorage تحت المفتاح mr_db_v1
   • الطلبات            -> localStorage تحت المفتاح mr_orders_v1
   عشان تعديلات الكتالوج تظهر لكل الزوّار لازم تنزّل data.js
   من تبويب الإعدادات وترفعه على GitHub.
   ============================================================ */

/* ============================================================
   1) الدخول
   ------------------------------------------------------------
   ⚠️ ده قفل شكلي على مستوى المتصفح، مش أمان حقيقي — أي حد يقدر
   يقرا ملفات الموقع. متحطش هنا بيانات حساسة.
   ============================================================ */
const AUTH_KEY = "mr_admin_v1";
const DEFAULT_PASS = "madinty2025";

/** djb2 — مجرد تشفير بسيط عشان الباسورد ما تتخزنش نص صريح */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const storedPass = () => localStorage.getItem(AUTH_KEY) || hash(DEFAULT_PASS);
const isDefaultPass = () => !localStorage.getItem(AUTH_KEY);

function openApp() {
  sessionStorage.setItem("mr_admin_ok", "1");
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  renderAll();
}

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (hash($("#pass").value) === storedPass()) openApp();
  else {
    toast("كلمة السر غلط");
    $("#pass").value = "";
    $("#pass").focus();
  }
});

$("#logout").addEventListener("click", () => {
  sessionStorage.removeItem("mr_admin_ok");
  location.reload();
});

if (!isDefaultPass()) $("#passHint").classList.add("hidden");

/* ============================================================
   2) التنقّل
   ============================================================ */
function showTab(name) {
  $$(".side .nav[data-tab]").forEach((b) =>
    b.classList.toggle("on", b.dataset.tab === name),
  );
  $$("section[data-panel]").forEach((s) =>
    s.classList.toggle("hidden", s.dataset.panel !== name),
  );
  document.body.classList.remove("menu");
  window.scrollTo({ top: 0 });
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest(".side .nav[data-tab]");
  if (nav) return showTab(nav.dataset.tab);

  const go = e.target.closest("[data-goto]");
  if (go) return showTab(go.dataset.goto);

  if (e.target.closest("[data-menu]")) document.body.classList.toggle("menu");
  if (e.target.id === "backdrop") document.body.classList.remove("menu");
});

/* ============================================================
   3) أدوات مشتركة
   ============================================================ */
const saveCatalog = () => writeDB({ categories: CATEGORIES, products: PRODUCTS });

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const lines = (t) =>
  String(t || "").split("\n").map((s) => s.trim()).filter(Boolean);

const commas = (t) =>
  String(t || "").split(/[،,]/).map((s) => s.trim()).filter(Boolean);

/** الحد اللي تحته يعتبر المخزون منخفض */
const LOW_STOCK = 5;

function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function modal(title, html, wide = false) {
  $("#modalHost").innerHTML = `
    <div class="modal">
      <div class="box"${wide ? "" : ' style="max-width:640px"'}>
        <header><h3>${title}</h3><button class="x" data-close type="button">&times;</button></header>
        <div class="content">${html}</div>
      </div>
    </div>`;
}
const closeModal = () => ($("#modalHost").innerHTML = "");

$("#modalHost").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]") || e.target.classList.contains("modal"))
    closeModal();
});

/* كل مسارات الصور المعروفة — تظهر كاقتراحات في خانات الصور */
function refreshImgList() {
  const paths = [
    ...new Set([...PRODUCTS.map((p) => p.img), ...CATEGORIES.map((c) => c.img)]),
  ].filter(Boolean);
  $("#imgList").innerHTML = paths.map((p) => `<option value="${esc(p)}">`).join("");
}

/** شارة المخزون — المخزون اختياري، لو مش متحدد بتظهر شرطة */
function stockPill(p) {
  if (p.stock == null || p.stock === "") return `<span class="pill none">—</span>`;
  const n = Number(p.stock);
  const k = n === 0 ? "low" : n <= LOW_STOCK ? "mid" : "";
  return `<span class="pill ${k}">${n}</span>`;
}

/** عدد القطع المباعة لكل منتج (بالاسم — الطلبات الملصوقة مالهاش كود) */
function soldMap() {
  const m = new Map();
  for (const o of getOrders()) {
    if (o.status === "ملغي") continue;
    for (const it of o.items) {
      const key = it.id || it.name;
      m.set(key, (m.get(key) || 0) + it.qty);
    }
  }
  return m;
}
const soldOf = (p, m) => (m.get(p.id) || 0) + (m.get(p.name) || 0);

/* ============================================================
   4) نظرة عامة
   ============================================================ */
function renderHome() {
  const orders = getOrders();
  const live = orders.filter((o) => o.status !== "ملغي");
  const pending = orders.filter((o) => o.status === "جديد").length;
  const revenue = live.reduce((s, o) => s + o.total, 0);
  const pieces = live.reduce((s, o) => s + o.items.reduce((x, i) => x + i.qty, 0), 0);

  $("#homeStats").innerHTML = [
    ["gold", "💰", money(revenue), "إجمالي المبيعات"],
    ["blue", "🧾", orders.length, `عدد الطلبات${pending ? ` (${pending} قيد المراجعة)` : ""}`],
    ["forest", "📦", PRODUCTS.length, "عدد المنتجات"],
    ["terra", "🛍️", pieces, "قطعة مباعة"],
  ]
    .map(
      ([k, ic, v, t]) => `
      <div class="stat ${k}">
        <div class="txt"><b>${v}</b><span>${t}</span></div>
        <div class="ic">${ic}</div>
      </div>`,
    )
    .join("");

  $("#navOrders").textContent = pending;
  $("#navOrders").classList.toggle("hidden", !pending);
  $("#navProducts").textContent = PRODUCTS.length;
  $("#navCats").textContent = CATEGORIES.length;

  $("#homeOrders").innerHTML = orders.length
    ? ordersTableHTML(orders.slice(0, 5))
    : `<p class="empty-row">مفيش طلبات لسه.</p>`;

  /* --- الأكثر مبيعًا --- */
  const m = soldMap();
  const top = PRODUCTS.map((p) => ({ p, n: soldOf(p, m) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);

  $("#topSellers").innerHTML = top.length
    ? top
        .map(
          ({ p, n }) => `
      <div class="rank">
        <img src="${imgURL(p.img)}" alt="" loading="lazy">
        <b>${esc(p.name)}</b>
        <span>${n} قطعة</span>
      </div>`,
        )
        .join("")
    : `<div class="empty-state"><div class="ic">📊</div>لسه مفيش مبيعات مسجّلة.</div>`;

  /* --- مخزون منخفض --- */
  const tracked = PRODUCTS.filter((p) => p.stock != null && p.stock !== "");
  const low = tracked
    .filter((p) => Number(p.stock) <= LOW_STOCK)
    .sort((a, b) => a.stock - b.stock);

  $("#lowStock").innerHTML = !tracked.length
    ? `<div class="empty-state"><div class="ic">🗃️</div>
         حدّد المخزون للمنتجات من صفحة المنتجات عشان تتابعه من هنا.</div>`
    : low.length
      ? low
          .map(
            (p) => `
        <div class="rank">
          <img src="${imgURL(p.img)}" alt="" loading="lazy">
          <b>${esc(p.name)}</b>
          ${stockPill(p)}
        </div>`,
          )
          .join("")
      : `<div class="empty-state"><div class="ic">✅</div>كل المنتجات بمخزون كويس.</div>`;
}

/* ============================================================
   5) الطلبات
   ============================================================ */
$("#oStatus").innerHTML += ORDER_STATUSES.map(
  (s) => `<option value="${s}">${s}</option>`,
).join("");

function filteredOrders() {
  const q = $("#oSearch").value.trim().toLowerCase();
  const st = $("#oStatus").value;
  return getOrders().filter((o) => {
    if (st && o.status !== st) return false;
    if (!q) return true;
    return [o.no, o.customer.name, o.customer.phone, o.customer.phone2, o.customer.gov]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
}

const waLink = (phone) =>
  "https://wa.me/2" + String(phone || "").replace(/\D/g, "").replace(/^0/, "");

function ordersTableHTML(list) {
  return `
  <table>
    <thead>
      <tr>
        <th>رقم الطلب</th><th>العميل</th><th>التاريخ</th>
        <th>الإجمالي</th><th>الحالة</th><th></th>
      </tr>
    </thead>
    <tbody>
      ${list
        .map(
          (o) => `
      <tr>
        <td class="mono ono">${esc(o.no)}</td>
        <td>
          <b>${esc(o.customer.name)}</b>
          <div class="muted mono" dir="ltr" style="text-align:start">${esc(o.customer.phone)}</div>
        </td>
        <td class="muted">${fmtDate(o.at)}</td>
        <td><b>${money(o.total)}</b>${o.shipping === null ? '<div class="muted">+ الشحن</div>' : ""}</td>
        <td>
          <select class="status" data-s="${esc(o.status)}" data-no="${esc(o.no)}">
            ${ORDER_STATUSES.map(
              (s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`,
            ).join("")}
          </select>
        </td>
        <td class="actions">
          <button class="ibtn" data-detail="${esc(o.no)}" title="تفاصيل">👁</button>
          <a class="ibtn" href="${waLink(o.customer.phone)}" target="_blank" rel="noopener" title="واتساب">💬</a>
          <button class="ibtn del" data-del-order="${esc(o.no)}" title="حذف">🗑</button>
        </td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderOrders() {
  const all = getOrders();
  const n = (s) => all.filter((o) => o.status === s).length;

  $("#orderStats").innerHTML = [
    ["blue", "🧾", all.length, "كل الطلبات"],
    ["terra", "🆕", n("جديد"), "جديد"],
    ["gold", "🛠️", n("قيد التجهيز") + n("تم التأكيد"), "قيد التجهيز"],
    ["forest", "✅", n("تم التسليم"), "تم التسليم"],
  ]
    .map(
      ([k, ic, v, t]) => `
      <div class="stat ${k}">
        <div class="txt"><b>${v}</b><span>${t}</span></div>
        <div class="ic">${ic}</div>
      </div>`,
    )
    .join("");

  const list = filteredOrders();
  $("#ordersTable").innerHTML = list.length
    ? ordersTableHTML(list)
    : `<p class="empty-row">${
        all.length
          ? "مفيش طلبات مطابقة للبحث."
          : "مفيش طلبات لسه — استخدم «لصق رسالة واتساب» عشان تضيف طلب."
      }</p>`;
}

$("#oSearch").addEventListener("input", renderOrders);
$("#oStatus").addEventListener("change", renderOrders);

/* تغيير الحالة */
document.addEventListener("change", (e) => {
  const sel = e.target.closest("select.status");
  if (!sel) return;
  const list = getOrders();
  const o = list.find((x) => x.no === sel.dataset.no);
  if (!o) return;
  o.status = sel.value;
  saveOrders(list);
  toast("تم تحديث حالة الطلب " + o.no);
  renderOrders();
  renderHome();
});

/* تفاصيل / حذف */
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-detail]");
  if (d) return showOrder(d.dataset.detail);

  const x = e.target.closest("[data-del-order]");
  if (x) {
    if (!confirm("تأكيد حذف الطلب " + x.dataset.delOrder + "؟")) return;
    saveOrders(getOrders().filter((o) => o.no !== x.dataset.delOrder));
    toast("تم حذف الطلب");
    renderOrders();
    renderHome();
  }
});

function showOrder(no) {
  const o = getOrders().find((x) => x.no === no);
  if (!o) return;
  const c = o.customer;
  modal(
    "الطلب " + esc(o.no),
    `
    <dl class="kv">
      <dt>التاريخ</dt><dd>${fmtDate(o.at)}</dd>
      <dt>الحالة</dt><dd>${esc(o.status)}</dd>
      <dt>الاسم</dt><dd>${esc(c.name)}</dd>
      <dt>الموبايل</dt><dd class="mono" dir="ltr" style="text-align:start">${esc(c.phone)}${c.phone2 ? " / " + esc(c.phone2) : ""}</dd>
      <dt>المحافظة</dt><dd>${esc(c.gov)}</dd>
      <dt>العنوان</dt><dd>${esc(c.address)}</dd>
      ${c.notes ? `<dt>ملاحظات</dt><dd>${esc(c.notes)}</dd>` : ""}
    </dl>
    <div class="tablebox">
      <table>
        <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${o.items
            .map(
              (i) => `<tr>
            <td><b>${esc(i.name)}</b>
              ${i.variant ? `<div class="muted">النوع: ${esc(i.variant)}</div>` : ""}
              ${i.color ? `<div class="muted">لون الشلت: ${esc(i.color)}</div>` : ""}
            </td>
            <td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.price * i.qty)}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="3">الإجمالي الفرعي</td><td>${money(o.subtotal)}</td></tr>
          <tr><td colspan="3">الشحن</td><td>${
            o.shipping === null
              ? "يُحدد عند التأكيد"
              : o.shipping === 0
                ? "مجانًا"
                : money(o.shipping)
          }</td></tr>
          <tr><td colspan="3"><b>الإجمالي</b></td><td><b>${money(o.total)}</b></td></tr>
        </tfoot>
      </table>
    </div>
    <div class="form-actions">
      <a class="btn" href="${waLink(c.phone)}" target="_blank" rel="noopener">💬 كلّم العميل</a>
      <button class="btn line" data-close type="button">إغلاق</button>
    </div>`,
  );
}

/* ---------- تصدير CSV ---------- */
$("#exportCsv").addEventListener("click", () => {
  const rows = [
    ["رقم الطلب", "التاريخ", "الاسم", "الموبايل", "موبايل احتياطي", "المحافظة",
      "العنوان", "المنتجات", "الإجمالي الفرعي", "الشحن", "الإجمالي", "الحالة", "ملاحظات"],
    ...filteredOrders().map((o) => [
      o.no,
      fmtDate(o.at),
      o.customer.name,
      o.customer.phone,
      o.customer.phone2 || "",
      o.customer.gov,
      o.customer.address,
      o.items
        .map(
          (i) =>
            `${i.name}${i.variant ? ` (${i.variant})` : ""}${i.color ? ` [${i.color}]` : ""} ×${i.qty}`,
        )
        .join(" / "),
      o.subtotal,
      o.shipping === null ? "يُحدد لاحقًا" : o.shipping,
      o.total,
      o.status,
      o.customer.notes || "",
    ]),
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  /* BOM عشان إكسل يقرا العربي صح */
  download("orders-" + new Date().toISOString().slice(0, 10) + ".csv", "﻿" + csv, "text/csv");
});

/* ---------- إضافة طلب من رسالة واتساب ---------- */
$("#pasteOrder").addEventListener("click", () => {
  modal(
    "إضافة طلب من رسالة واتساب",
    `<p class="muted" style="margin-top:0">الصق رسالة الطلب اللي وصلتك على الواتساب زي ما هي، واللوحة هتقراها وتضيف الطلب.</p>
     <div class="f"><textarea id="waText" style="min-height:230px" class="mono"></textarea></div>
     <div class="form-actions">
       <button class="btn gold" id="waParse" type="button">تحليل وإضافة</button>
       <button class="btn line" data-close type="button">إلغاء</button>
     </div>`,
  );
  $("#waParse").addEventListener("click", () => {
    const o = parseWhatsAppOrder($("#waText").value);
    if (!o) return toast("مش قادر أقرا الرسالة — اتأكد إنها رسالة طلب من الموقع");
    if (getOrders().some((x) => x.no === o.no)) return toast("الطلب " + o.no + " مضاف قبل كده");
    addOrder(o);
    closeModal();
    toast("تمت إضافة الطلب " + o.no);
    renderOrders();
    renderHome();
  });
});

/** يحوّل رسالة الواتساب اللي الموقع بيبعتها لكائن طلب */
function parseWhatsAppOrder(text) {
  if (!text || !text.trim()) return null;
  const t = text.replace(/\r/g, "");
  const grab = (re) => (t.match(re) || [])[1]?.trim() || "";
  const num = (s) => Number(String(s).replace(/[^\d.]/g, "")) || 0;

  const name = grab(/^الاسم:\s*(.+)$/m);
  const phone = grab(/^الموبايل:\s*(.+)$/m);
  if (!name || !phone) return null;

  /* المنتجات: "1) الاسم" + سطر اختياري للنوع/اللون + سطر الكمية */
  const items = [];
  for (const b of t.split(/\n(?=\d+\)\s)/)) {
    const m = b.match(/^(\d+)\)\s*(.+)/);
    if (!m) continue;
    const qm = b.match(/الكمية:\s*(\d+)\s*[×x]\s*([\d.,]+)/);
    if (!qm) continue;
    const pick = (re) => (b.match(re) || [])[1]?.trim() || "";
    items.push({
      id: "",
      name: m[2].trim(),
      qty: Number(qm[1]),
      price: num(qm[2]),
      variant: pick(/النوع:\s*([^\n—]+)/),
      color: pick(/لون الشلت:\s*([^\n]+)/),
    });
  }
  if (!items.length) return null;

  const subtotal =
    num(grab(/الإجمالي الفرعي:\s*(.+)/)) ||
    items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipRaw = grab(/^الشحن\s*\(?[^)]*\)?:\s*(.+)$/m);
  const shipping = /يُحدد|يحدد/.test(shipRaw) ? null : /مجان/.test(shipRaw) ? 0 : num(shipRaw);

  return {
    no: grab(/رقم الطلب:\s*(\S+)/) || "MR-" + Date.now().toString().slice(-6),
    at: new Date().toISOString(),
    status: ORDER_STATUSES[0],
    customer: {
      name,
      phone,
      phone2: grab(/^موبايل احتياطي:\s*(.+)$/m),
      gov: grab(/^المحافظة:\s*(.+)$/m),
      address: grab(/^العنوان:\s*(.+)$/m),
      notes: grab(/^ملاحظات:\s*(.+)$/m),
    },
    items,
    subtotal,
    shipping,
    total: subtotal + (shipping || 0),
  };
}

/* ============================================================
   6) المنتجات
   ============================================================ */
function fillCatSelects() {
  $("#pFilterCat").innerHTML =
    `<option value="">كل الأقسام</option>` +
    CATEGORIES.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
}

function renderProducts() {
  const q = $("#pSearch").value.trim().toLowerCase();
  const cat = $("#pFilterCat").value;
  const list = PRODUCTS.filter(
    (p) =>
      (!cat || p.cat === cat) &&
      (!q || p.name.toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q)),
  );

  $("#productsTable").innerHTML = list.length
    ? `<table>
        <thead><tr>
          <th>المنتج</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>رواج</th><th>إجراءات</th>
        </tr></thead>
        <tbody>
          ${list
            .map((p) => {
              const cat = CATEGORIES.find((c) => c.id === p.cat);
              const off = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
              return `<tr>
            <td>
              <div class="cell-prod">
                <img src="${imgURL(p.img)}" alt="" loading="lazy">
                <div>
                  <b>${esc(p.name)}</b>
                  <span>${esc(p.short || "")}</span>
                </div>
              </div>
            </td>
            <td><span class="chip">${esc(cat?.icon || "")} ${esc(catName(p.cat) || "—")}</span></td>
            <td>
              <div class="price-now">${p.price != null ? money(p.price) : "—"}</div>
              ${p.oldPrice ? `<div class="price-old"><s>${money(p.oldPrice)}</s>${off ? ` −${off}%` : ""}</div>` : ""}
            </td>
            <td>${stockPill(p)}</td>
            <td>${p.featured ? "⭐" : "–"}</td>
            <td class="actions">
              <a class="ibtn" href="product.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="عرض">👁</a>
              <button class="ibtn" data-edit-p="${esc(p.id)}" title="تعديل">✏️</button>
              <button class="ibtn del" data-del-p="${esc(p.id)}" title="حذف">🗑</button>
            </td>
          </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
    : `<p class="empty-row">مفيش منتجات مطابقة.</p>`;
}

$("#pSearch").addEventListener("input", renderProducts);
$("#pFilterCat").addEventListener("change", renderProducts);
$("#addProduct").addEventListener("click", () => productModal(null));

document.addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit-p]");
  if (ed) return productModal(PRODUCTS.find((x) => x.id === ed.dataset.editP) || null);

  const del = e.target.closest("[data-del-p]");
  if (del) {
    const p = PRODUCTS.find((x) => x.id === del.dataset.delP);
    if (!p || !confirm(`تأكيد حذف «${p.name}»؟`)) return;
    PRODUCTS.splice(PRODUCTS.indexOf(p), 1);
    saveCatalog();
    toast("تم حذف المنتج");
    renderAll();
  }
});

/** نافذة إضافة/تعديل منتج */
function productModal(p) {
  const editingId = p?.id || null;
  modal(
    p ? "✏️ تعديل: " + esc(p.name) : "＋ إضافة منتج جديد",
    `
    <form id="pForm">
      <div class="form-grid">
        <div class="f">
          <label for="pId">كود المنتج (SKU) <small>لا يتكرر</small></label>
          <input id="pId" class="mono" placeholder="MR-IRON-09" value="${esc(p?.id || "")}">
        </div>
        <div class="f">
          <label for="pCat">القسم</label>
          <select id="pCat">
            ${CATEGORIES.map(
              (c) =>
                `<option value="${esc(c.id)}" ${c.id === p?.cat ? "selected" : ""}>${esc(c.name)}</option>`,
            ).join("")}
          </select>
        </div>
        <div class="f">
          <label for="pName">اسم المنتج</label>
          <input id="pName" placeholder="طقم حديد علب 4 × 8" value="${esc(p?.name || "")}">
        </div>
        <div class="f">
          <label for="pShort">وصف مختصر</label>
          <input id="pShort" placeholder="كنبة 3 مقعد + 2 كرسي + ترابيزة" value="${esc(p?.short || "")}">
        </div>
        <div class="f">
          <label for="pPrice">السعر (ج.م)</label>
          <input id="pPrice" type="number" min="0" step="50" value="${p?.price ?? ""}">
        </div>
        <div class="f">
          <label for="pOld">السعر قبل الخصم <small>اختياري</small></label>
          <input id="pOld" type="number" min="0" step="50" value="${p?.oldPrice ?? ""}">
        </div>
        <div class="f">
          <label for="pStock">المخزون <small>سِبها فاضية لو مش بتتابعه</small></label>
          <input id="pStock" type="number" min="0" step="1" value="${p?.stock ?? ""}">
        </div>
        <div class="f">
          <label>خيارات</label>
          <label class="check"><input type="checkbox" id="pFeatured" ${p?.featured ? "checked" : ""}>
            رواج (يظهر في «الأكثر طلبًا»)</label>
          <label class="check"><input type="checkbox" id="pCushions" ${p?.cushions ? "checked" : ""}>
            اختيار لون الشلت <b class="mono">إجباري</b> للعميل</label>
        </div>
        <div class="f wide">
          <label for="pImg">مسار الصورة</label>
          <input id="pImg" class="mono" list="imgList" value="${esc(p?.img || "")}"
            placeholder="assets/img/products/رتان/رتان 1.webp">
        </div>
        <div class="f wide">
          <label>معاينة الصورة</label>
          <div class="preview" id="pPreview"></div>
        </div>
        <div class="f wide">
          <label for="pComponents">مكونات الطقم <small>مكوّن في كل سطر</small></label>
          <textarea id="pComponents" placeholder="كنبة 3 مقعد&#10;2 كرسي&#10;ترابيزة">${esc((p?.components || []).join("\n"))}</textarea>
        </div>
        <div class="f wide">
          <label for="pSpecs">المواصفات <small>مواصفة في كل سطر</small></label>
          <textarea id="pSpecs" placeholder="حديد علب معالج&#10;دهان فرن إلكتروستاتك">${esc((p?.specs || []).join("\n"))}</textarea>
        </div>
        <div class="f wide">
          <label for="pVariants">أنواع الطقم
            <small>سطر لكل نوع: الاسم | السعر | السعر القديم | مكون + مكون</small></label>
          <textarea id="pVariants" class="mono" placeholder="طقم 4 كراسي + ترابيزة | 5500 |  | 4 كراسي + ترابيزة">${esc(
            (p?.variants || [])
              .map((v) =>
                [v.name, v.price ?? "", v.oldPrice ?? "", (v.components || []).join(" + ")].join(" | "),
              )
              .join("\n"),
          )}</textarea>
        </div>
        <div class="f wide">
          <label for="pDims">المقاسات <small>سطر لكل مقاس: التسمية: القيمة</small></label>
          <textarea id="pDims" placeholder="الترابيزة: 2 متر × 70 سم">${esc((p?.dims || []).map((d) => `${d.label}: ${d.value}`).join("\n"))}</textarea>
        </div>
        <div class="f">
          <label for="pFrame">ألوان الحديد <small>مفصولة بفاصلة</small></label>
          <input id="pFrame" placeholder="أبيض، أسود، جولد" value="${esc((p?.frameColors || []).join("، "))}">
        </div>
        <div class="f">
          <label for="pWeave">ألوان الجدل <small>مفصولة بفاصلة</small></label>
          <input id="pWeave" placeholder="بيچ فاتح، بني غامق" value="${esc((p?.weaveColors || []).join("، "))}">
        </div>
        <div class="f">
          <label for="pWarranty">الضمان</label>
          <input id="pWarranty" placeholder="ضمان جودة 100%" value="${esc(p?.warranty || "")}">
        </div>
        <div class="f">
          <label for="pLoad">الحمولة</label>
          <input id="pLoad" placeholder="تتحمل حتى 500 كيلو" value="${esc(p?.loadCapacity || "")}">
        </div>
        <div class="f wide">
          <label for="pNote">ملاحظة على الألوان</label>
          <input id="pNote" placeholder="متاح تغيير أي لون" value="${esc(p?.colorsNote || "")}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn gold" type="submit">${p ? "حفظ التعديلات" : "حفظ المنتج"}</button>
        <button class="btn line" data-close type="button">إلغاء</button>
      </div>
    </form>`,
    true,
  );

  const paint = () => {
    const v = $("#pImg").value.trim();
    $("#pPreview").innerHTML = v
      ? `<img src="${imgURL(v)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'none',textContent:'الصورة مش موجودة على المسار ده'}))">`
      : `<span class="none">لا توجد صورة</span>`;
  };
  paint();
  $("#pImg").addEventListener("input", paint);

  $("#pForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const np = formToProduct();

    const bad = (sel, cond) => {
      $(sel).closest(".f").classList.toggle("bad", !cond);
      return cond;
    };
    let ok = true;
    ok = bad("#pId", !!np.id) && ok;
    ok = bad("#pName", !!np.name) && ok;
    ok = bad("#pImg", !!np.img) && ok;
    /* السعر ممكن يبقى فاضي لو المنتج ليه أنواع بأسعار */
    ok = bad("#pPrice", np.price != null || (np.variants || []).some((v) => v.price != null)) && ok;
    if (!ok) return toast("راجع الخانات المطلوبة");

    if (np.price == null)
      np.price = Math.min(...np.variants.filter((v) => v.price != null).map((v) => v.price));
    if (!np.short) np.short = (np.components || []).join(" + ") || np.name;

    if (editingId) {
      if (np.id !== editingId && PRODUCTS.some((x) => x.id === np.id))
        return toast("الكود ده مستخدم في منتج تاني");
      PRODUCTS[PRODUCTS.findIndex((x) => x.id === editingId)] = np;
    } else {
      if (PRODUCTS.some((x) => x.id === np.id)) return toast("الكود ده مستخدم قبل كده");
      PRODUCTS.push(np);
    }

    saveCatalog();
    closeModal();
    toast(editingId ? "تم حفظ التعديلات" : "تمت إضافة المنتج");
    renderAll();
  });
}

function formToProduct() {
  const p = {
    id: $("#pId").value.trim(),
    cat: $("#pCat").value,
    name: $("#pName").value.trim(),
    short: $("#pShort").value.trim(),
    img: $("#pImg").value.trim(),
    price: $("#pPrice").value === "" ? null : Number($("#pPrice").value),
    oldPrice: $("#pOld").value === "" ? null : Number($("#pOld").value),
    specs: lines($("#pSpecs").value),
  };
  if ($("#pStock").value !== "") p.stock = Number($("#pStock").value);
  if ($("#pFeatured").checked) p.featured = true;
  if ($("#pCushions").checked) p.cushions = true;

  const comps = lines($("#pComponents").value);
  if (comps.length) p.components = comps;

  const vs = lines($("#pVariants").value).map((row) => {
    const [name, price, oldPrice, comps] = row.split("|").map((s) => (s || "").trim());
    const v = { name };
    if (price) v.price = Number(price);
    if (oldPrice) v.oldPrice = Number(oldPrice);
    if (comps) v.components = comps.split("+").map((s) => s.trim()).filter(Boolean);
    return v;
  });
  if (vs.length) p.variants = vs;

  const dims = lines($("#pDims").value)
    .map((row) => {
      const i = row.indexOf(":");
      return i < 0 ? null : { label: row.slice(0, i).trim(), value: row.slice(i + 1).trim() };
    })
    .filter(Boolean);
  if (dims.length) p.dims = dims;

  const fc = commas($("#pFrame").value);
  if (fc.length) p.frameColors = fc;
  const wc = commas($("#pWeave").value);
  if (wc.length) p.weaveColors = wc;
  if ($("#pNote").value.trim()) p.colorsNote = $("#pNote").value.trim();
  if ($("#pWarranty").value.trim()) p.warranty = $("#pWarranty").value.trim();
  if ($("#pLoad").value.trim()) p.loadCapacity = $("#pLoad").value.trim();
  return p;
}

/* ============================================================
   7) الأقسام
   ============================================================ */
function renderCats() {
  $("#catsTable").innerHTML = CATEGORIES.length
    ? `<table>
        <thead><tr><th>القسم</th><th>الكود</th><th>الوصف</th><th>المنتجات</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${CATEGORIES.map(
            (c) => `<tr>
            <td>
              <div class="cell-prod">
                <img src="${imgURL(c.img)}" alt="" loading="lazy" style="height:40px">
                <div><b>${esc(c.icon || "")} ${esc(c.name)}</b></div>
              </div>
            </td>
            <td class="mono muted">${esc(c.id)}</td>
            <td class="muted">${esc(c.desc || "")}</td>
            <td><span class="pill">${PRODUCTS.filter((p) => p.cat === c.id).length}</span></td>
            <td class="actions">
              <a class="ibtn" href="products.html?cat=${encodeURIComponent(c.id)}" target="_blank" rel="noopener" title="عرض">👁</a>
              <button class="ibtn" data-edit-c="${esc(c.id)}" title="تعديل">✏️</button>
              <button class="ibtn del" data-del-c="${esc(c.id)}" title="حذف">🗑</button>
            </td>
          </tr>`,
          ).join("")}
        </tbody>
      </table>`
    : `<p class="empty-row">مفيش أقسام.</p>`;
}

$("#addCat").addEventListener("click", () => catModal(null));

document.addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit-c]");
  if (ed) return catModal(CATEGORIES.find((x) => x.id === ed.dataset.editC) || null);

  const del = e.target.closest("[data-del-c]");
  if (del) {
    const c = CATEGORIES.find((x) => x.id === del.dataset.delC);
    if (!c) return;
    const n = PRODUCTS.filter((p) => p.cat === c.id).length;
    if (n)
      return alert(
        `مينفعش تحذف «${c.name}» وفيه ${n} منتج.\nانقل المنتجات دي لقسم تاني أو احذفها الأول.`,
      );
    if (!confirm(`تأكيد حذف قسم «${c.name}»؟`)) return;
    CATEGORIES.splice(CATEGORIES.indexOf(c), 1);
    saveCatalog();
    toast("تم حذف القسم");
    renderAll();
  }
});

function catModal(c) {
  const editingId = c?.id || null;
  modal(
    c ? "✏️ تعديل: " + esc(c.name) : "＋ إضافة قسم جديد",
    `
    <form id="cForm">
      <div class="form-grid">
        <div class="f">
          <label for="cId">كود القسم <small>إنجليزي بدون مسافات</small></label>
          <input id="cId" class="mono" placeholder="iron-sets" value="${esc(c?.id || "")}">
        </div>
        <div class="f">
          <label for="cName">اسم القسم</label>
          <input id="cName" placeholder="اطقم حديد علب" value="${esc(c?.name || "")}">
        </div>
        <div class="f">
          <label for="cIcon">الأيقونة <small>إيموجي</small></label>
          <input id="cIcon" placeholder="🛋️" value="${esc(c?.icon || "")}">
        </div>
        <div class="f">
          <label for="cImg">مسار الصورة</label>
          <input id="cImg" class="mono" list="imgList" placeholder="assets/img/categories/iron.webp" value="${esc(c?.img || "")}">
        </div>
        <div class="f wide">
          <label for="cDesc">وصف القسم</label>
          <input id="cDesc" placeholder="حديد علب معالج ودهان فرن إلكتروستاتك" value="${esc(c?.desc || "")}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn gold" type="submit">${c ? "حفظ التعديلات" : "حفظ القسم"}</button>
        <button class="btn line" data-close type="button">إلغاء</button>
      </div>
    </form>`,
  );

  $("#cForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const nc = {
      id: $("#cId").value.trim(),
      name: $("#cName").value.trim(),
      icon: $("#cIcon").value.trim(),
      img: $("#cImg").value.trim(),
      desc: $("#cDesc").value.trim(),
    };
    if (!nc.id || !nc.name) return toast("الكود والاسم مطلوبين");

    if (editingId) {
      if (nc.id !== editingId) {
        if (CATEGORIES.some((x) => x.id === nc.id)) return toast("الكود ده مستخدم");
        /* نقل منتجات القسم للكود الجديد */
        PRODUCTS.forEach((p) => {
          if (p.cat === editingId) p.cat = nc.id;
        });
      }
      CATEGORIES[CATEGORIES.findIndex((x) => x.id === editingId)] = nc;
    } else {
      if (CATEGORIES.some((x) => x.id === nc.id)) return toast("الكود ده مستخدم قبل كده");
      CATEGORIES.push(nc);
    }

    saveCatalog();
    closeModal();
    toast(editingId ? "تم حفظ القسم" : "تمت إضافة القسم");
    renderAll();
  });
}

/* ============================================================
   8) الإعدادات
   ============================================================ */

/** يولّد ملف data.js كامل من الحالة الحالية — جاهز للرفع على GitHub */
function buildDataJs() {
  const j = (v) => JSON.stringify(v, null, 2);
  return `/* ============================================================
   Madinty Ratan — بيانات المتجر (المصدر الأساسي)
   ------------------------------------------------------------
   ⚙️ الملف ده اتولّد من لوحة التحكم بتاريخ ${new Date().toLocaleDateString("ar-EG-u-nu-latn")}
   ============================================================ */

const STORE = ${j(STORE)};

/* روابط الخريطة تتولّد أوتوماتيك من STORE.map */
const MAP_EMBED = \`https://www.google.com/maps?q=\${encodeURIComponent(STORE.map.query)}&z=\${STORE.map.zoom}&hl=ar&output=embed\`;
const MAP_LINK  = \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(STORE.map.query)}\`;

/* مصاريف الشحن بالجنيه — 0 = مجانًا، null = تُحدد عند التأكيد */
const SHIPPING = ${j(SHIPPING)};

/* قائمة المحافظات في نموذج الطلب */
const GOVS = Object.keys(SHIPPING);

/* ألوان الشلت المتاحة */
const CUSHION_COLORS = ${j(CUSHION_COLORS)};

/* الأقسام */
const DEFAULT_CATEGORIES = ${j(CATEGORIES)};

/* المنتجات (${PRODUCTS.length} منتج) */
const DEFAULT_PRODUCTS = ${j(PRODUCTS)};
`;
}

$("#dlData").addEventListener("click", () => {
  download("data.js", buildDataJs(), "text/javascript");
  toast("نزّل الملف وحطه مكان assets/js/data.js");
});

$("#dlBackup").addEventListener("click", () => {
  download(
    "madinty-backup-" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(
      { at: new Date().toISOString(), categories: CATEGORIES, products: PRODUCTS, orders: getOrders() },
      null,
      2,
    ),
  );
});

$("#upBackup").addEventListener("click", () => $("#backupFile").click());
$("#backupFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.categories) || !Array.isArray(d.products)) throw new Error("bad");
      if (!confirm("هيستبدل المنتجات والأقسام الحالية. تأكيد؟")) return;
      CATEGORIES = d.categories;
      PRODUCTS = d.products;
      saveCatalog();
      if (Array.isArray(d.orders) && confirm("تستورد الطلبات كمان؟")) saveOrders(d.orders);
      toast("تم استيراد النسخة");
      renderAll();
    } catch (err) {
      toast("الملف مش نسخة صحيحة");
    }
  };
  r.readAsText(file);
  e.target.value = "";
});

$("#passForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (hash($("#oldPass").value) !== storedPass()) return toast("كلمة السر الحالية غلط");
  const np = $("#newPass").value;
  if (np.length < 6) return toast("كلمة السر الجديدة لازم 6 حروف على الأقل");
  localStorage.setItem(AUTH_KEY, hash(np));
  $("#passForm").reset();
  $("#passHint").classList.add("hidden");
  toast("تم تغيير كلمة السر");
});

$("#resetCatalog").addEventListener("click", () => {
  if (!confirm("هيرجّع المنتجات والأقسام لآخر نسخة منشورة ويمسح تعديلات المتصفح. تأكيد؟")) return;
  resetDB();
  CATEGORIES = DEFAULT_CATEGORIES;
  PRODUCTS = DEFAULT_PRODUCTS;
  toast("تم الاسترجاع");
  renderAll();
});

$("#clearOrders").addEventListener("click", () => {
  if (!confirm("هيمسح كل الطلبات نهائيًا. تأكيد؟")) return;
  saveOrders([]);
  toast("تم مسح الطلبات");
  renderAll();
});

/* ============================================================
   9) تشغيل
   ============================================================ */
function renderAll() {
  fillCatSelects();
  refreshImgList();
  renderHome();
  renderOrders();
  renderProducts();
  renderCats();
}

/* لو الجلسة لسه مفتوحة ندخل على طول */
if (sessionStorage.getItem("mr_admin_ok") === "1") openApp();
else $("#pass").focus();
