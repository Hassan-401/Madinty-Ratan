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
function storedPass() {
  return localStorage.getItem(AUTH_KEY) || hash(DEFAULT_PASS);
}
function isDefaultPass() {
  return !localStorage.getItem(AUTH_KEY);
}

const loginScreen = $("#loginScreen");
const app = $("#app");

function openApp() {
  sessionStorage.setItem("mr_admin_ok", "1");
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  renderAll();
}

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#pass").value;
  if (hash(v) === storedPass()) openApp();
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
   2) التبويبات
   ============================================================ */
function showTab(name) {
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  $$("section[data-panel]").forEach((s) =>
    s.classList.toggle("hidden", s.dataset.panel !== name),
  );
  window.scrollTo({ top: 0 });
}
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) showTab(b.dataset.tab);
});
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) showTab(g.dataset.goto);
});

/* ============================================================
   3) أدوات مشتركة
   ============================================================ */
const saveCatalog = () => writeDB({ categories: CATEGORIES, products: PRODUCTS });

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
  });

const lines = (t) =>
  String(t || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const commas = (t) =>
  String(t || "")
    .split(/[،,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function modal(title, html) {
  $("#modalHost").innerHTML = `
    <div class="modal">
      <div class="box">
        <header><h3>${title}</h3><button class="x" data-close>&times;</button></header>
        <div class="content">${html}</div>
      </div>
    </div>`;
  return $("#modalHost");
}
$("#modalHost").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]") || e.target.classList.contains("modal"))
    closeModal();
});
const closeModal = () => ($("#modalHost").innerHTML = "");

/* كل مسارات الصور المعروفة — تظهر كاقتراحات في خانات الصور */
function refreshImgList() {
  const paths = [
    ...new Set([
      ...PRODUCTS.map((p) => p.img),
      ...CATEGORIES.map((c) => c.img),
    ]),
  ].filter(Boolean);
  $("#imgList").innerHTML = paths.map((p) => `<option value="${esc(p)}">`).join("");
}

/* ============================================================
   4) نظرة عامة
   ============================================================ */
function renderHome() {
  const orders = getOrders();
  const open = orders.filter((o) => !["تم التسليم", "ملغي"].includes(o.status));
  const done = orders.filter((o) => o.status === "تم التسليم");
  const revenue = done.reduce((s, o) => s + o.total, 0);

  $("#homeStats").innerHTML = [
    ["إجمالي الطلبات", orders.length, ""],
    ["طلبات مفتوحة", open.length, "terra"],
    ["تم تسليمها", done.length, "forest"],
    ["إيراد المُسلَّم", money(revenue), "gold"],
    ["عدد المنتجات", PRODUCTS.length, ""],
    ["عدد الأقسام", CATEGORIES.length, ""],
  ]
    .map(([t, v, k]) => `<div class="stat ${k}"><b>${v}</b><span>${t}</span></div>`)
    .join("");

  const n = orders.filter((o) => o.status === "جديد").length;
  $("#newPill").textContent = n;
  $("#newPill").classList.toggle("hidden", !n);

  $("#homeOrders").innerHTML = orders.length
    ? ordersTableHTML(orders.slice(0, 6), false)
    : `<p class="empty-row">مفيش طلبات لسه.</p>`;

  $("#homeCats").innerHTML = `
    <table>
      <thead><tr><th>القسم</th><th>عدد المنتجات</th><th>أقل سعر</th><th>أعلى سعر</th></tr></thead>
      <tbody>
        ${CATEGORIES.map((c) => {
          const list = PRODUCTS.filter((p) => p.cat === c.id);
          const prices = list.map((p) => p.price).filter((x) => x != null);
          return `<tr>
            <td>${esc(c.icon || "")} ${esc(c.name)}</td>
            <td>${list.length}</td>
            <td>${prices.length ? money(Math.min(...prices)) : "—"}</td>
            <td>${prices.length ? money(Math.max(...prices)) : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
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

function ordersTableHTML(list, withActions = true) {
  return `
  <table>
    <thead>
      <tr>
        <th>رقم الطلب</th><th>التاريخ</th><th>العميل</th><th>الموبايل</th>
        <th>المحافظة</th><th>الإجمالي</th><th>الحالة</th>${withActions ? "<th></th>" : ""}
      </tr>
    </thead>
    <tbody>
      ${list
        .map(
          (o) => `
      <tr>
        <td class="mono">${esc(o.no)}</td>
        <td>${fmtDate(o.at)}</td>
        <td>${esc(o.customer.name)}</td>
        <td class="mono" dir="ltr">${esc(o.customer.phone)}</td>
        <td>${esc(o.customer.gov)}</td>
        <td><b>${money(o.total)}</b>${o.shipping === null ? " +شحن" : ""}</td>
        <td>
          <select class="status" data-s="${esc(o.status)}" data-no="${esc(o.no)}">
            ${ORDER_STATUSES.map(
              (s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`,
            ).join("")}
          </select>
        </td>
        ${
          withActions
            ? `<td class="actions">
          <button class="btn line sm" data-detail="${esc(o.no)}">تفاصيل</button>
          <a class="btn line sm" href="https://wa.me/2${esc(String(o.customer.phone).replace(/^0/, ""))}"
             target="_blank" rel="noopener">واتساب</a>
          <button class="btn danger sm" data-del-order="${esc(o.no)}">حذف</button>
        </td>`
            : ""
        }
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderOrders() {
  const all = getOrders();
  const sum = (f) => all.filter(f).length;

  $("#orderStats").innerHTML = [
    ["كل الطلبات", all.length, ""],
    ["جديد", sum((o) => o.status === "جديد"), "terra"],
    ["قيد التجهيز", sum((o) => o.status === "قيد التجهيز"), ""],
    ["تم الشحن", sum((o) => o.status === "تم الشحن"), ""],
    ["تم التسليم", sum((o) => o.status === "تم التسليم"), "forest"],
    ["ملغي", sum((o) => o.status === "ملغي"), ""],
  ]
    .map(([t, v, k]) => `<div class="stat ${k}"><b>${v}</b><span>${t}</span></div>`)
    .join("");

  const list = filteredOrders();
  $("#ordersTable").innerHTML = list.length
    ? ordersTableHTML(list)
    : `<p class="empty-row">${all.length ? "مفيش طلبات مطابقة للبحث." : "مفيش طلبات لسه — استخدم «لصق رسالة واتساب» عشان تضيف طلب."}</p>`;
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
      <dt>الموبايل</dt><dd class="mono" dir="ltr">${esc(c.phone)}${c.phone2 ? " / " + esc(c.phone2) : ""}</dd>
      <dt>المحافظة</dt><dd>${esc(c.gov)}</dd>
      <dt>العنوان</dt><dd>${esc(c.address)}</dd>
      ${c.notes ? `<dt>ملاحظات</dt><dd>${esc(c.notes)}</dd>` : ""}
    </dl>
    <div class="tablebox">
      <table style="min-width:auto">
        <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${o.items
            .map(
              (i) => `<tr>
            <td>${esc(i.name)}
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
            o.shipping === null ? "يُحدد عند التأكيد" : o.shipping === 0 ? "مجانًا" : money(o.shipping)
          }</td></tr>
          <tr><td colspan="3"><b>الإجمالي</b></td><td><b>${money(o.total)}</b></td></tr>
        </tfoot>
      </table>
    </div>
    <div class="form-actions">
      <a class="btn" href="https://wa.me/2${esc(String(c.phone).replace(/^0/, ""))}"
         target="_blank" rel="noopener">💬 كلّم العميل</a>
      <button class="btn line" data-close>إغلاق</button>
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
      o.items.map((i) => `${i.name} ×${i.qty}`).join(" / "),
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
    `<p class="muted">الصق رسالة الطلب اللي وصلتك على الواتساب زي ما هي، واللوحة هتقراها وتضيف الطلب.</p>
     <div class="f"><textarea id="waText" style="min-height:220px" class="mono"></textarea></div>
     <div class="form-actions">
       <button class="btn gold" id="waParse">تحليل وإضافة</button>
       <button class="btn line" data-close>إلغاء</button>
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
  const blocks = t.split(/\n(?=\d+\)\s)/);
  for (const b of blocks) {
    const m = b.match(/^(\d+)\)\s*(.+)/);
    if (!m) continue;
    const qm = b.match(/الكمية:\s*(\d+)\s*[×x]\s*([\d.,]+)/);
    if (!qm) continue;
    items.push({
      id: "",
      name: m[2].trim(),
      qty: Number(qm[1]),
      price: num(qm[2]),
      variant: grab.call(null, /النوع:\s*([^\n—]+)/) && b.match(/النوع:\s*([^\n—]+)/)
        ? b.match(/النوع:\s*([^\n—]+)/)[1].trim()
        : "",
      color: b.match(/لون الشلت:\s*([^\n]+)/)
        ? b.match(/لون الشلت:\s*([^\n]+)/)[1].trim()
        : "",
    });
  }
  if (!items.length) return null;

  const gov = grab(/^المحافظة:\s*(.+)$/m);
  const subtotal =
    num(grab(/الإجمالي الفرعي:\s*(.+)/)) ||
    items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipRaw = grab(/^الشحن\s*\(?[^)]*\)?:\s*(.+)$/m);
  const shipping = /يُحدد|يحدد/.test(shipRaw)
    ? null
    : /مجان/.test(shipRaw)
      ? 0
      : num(shipRaw);

  return {
    no: grab(/رقم الطلب:\s*(\S+)/) || "MR-" + Date.now().toString().slice(-6),
    at: new Date().toISOString(),
    status: ORDER_STATUSES[0],
    customer: {
      name,
      phone,
      phone2: grab(/^موبايل احتياطي:\s*(.+)$/m),
      gov,
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
let editingProduct = null;

function fillCatSelects() {
  const opts = CATEGORIES.map(
    (c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`,
  ).join("");
  $("#pCat").innerHTML = opts;
  $("#pFilterCat").innerHTML =
    `<option value="">كل الأقسام</option>` + opts;
}

function renderProducts() {
  const q = $("#pSearch").value.trim().toLowerCase();
  const cat = $("#pFilterCat").value;
  const list = PRODUCTS.filter(
    (p) =>
      (!cat || p.cat === cat) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        String(p.id).toLowerCase().includes(q)),
  );

  $("#pCount").textContent = `${PRODUCTS.length} منتج`;
  $("#productsTable").innerHTML = list.length
    ? `<table>
        <thead><tr><th></th><th>الكود</th><th>الاسم</th><th>القسم</th><th>السعر</th><th>مميز</th><th></th></tr></thead>
        <tbody>
          ${list
            .map(
              (p) => `<tr>
            <td><img class="thumb-sm" src="${imgURL(p.img)}" alt="" loading="lazy"></td>
            <td class="mono">${esc(p.id)}</td>
            <td>${esc(p.name)}${p.variants?.length ? `<div class="muted">${p.variants.length} أنواع</div>` : ""}</td>
            <td>${esc(catName(p.cat))}</td>
            <td><b>${p.price != null ? money(p.price) : "—"}</b>${
              p.oldPrice ? `<div class="muted"><s>${money(p.oldPrice)}</s></div>` : ""
            }</td>
            <td>${p.featured ? "⭐" : ""}</td>
            <td class="actions">
              <button class="btn line sm" data-edit-p="${esc(p.id)}">تعديل</button>
              <button class="btn danger sm" data-del-p="${esc(p.id)}">حذف</button>
            </td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>`
    : `<p class="empty-row">مفيش منتجات مطابقة.</p>`;
}

$("#pSearch").addEventListener("input", renderProducts);
$("#pFilterCat").addEventListener("change", renderProducts);
$("#pImg").addEventListener("input", paintPreview);

function paintPreview() {
  const v = $("#pImg").value.trim();
  $("#pPreview").innerHTML = v
    ? `<img src="${imgURL(v)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'none',textContent:'الصورة مش موجودة على المسار ده'}))">`
    : `<span class="none">لا توجد صورة</span>`;
}

/* ---------- تحويل النموذج <-> المنتج ---------- */
function productToForm(p) {
  $("#pId").value = p?.id || "";
  $("#pCat").value = p?.cat || CATEGORIES[0]?.id || "";
  $("#pName").value = p?.name || "";
  $("#pShort").value = p?.short || "";
  $("#pPrice").value = p?.price ?? "";
  $("#pOld").value = p?.oldPrice ?? "";
  $("#pImg").value = p?.img || "";
  $("#pFeatured").checked = !!p?.featured;
  $("#pCushions").checked = !!p?.cushions;
  $("#pComponents").value = (p?.components || []).join("\n");
  $("#pSpecs").value = (p?.specs || []).join("\n");
  $("#pVariants").value = (p?.variants || [])
    .map((v) =>
      [v.name, v.price ?? "", v.oldPrice ?? "", (v.components || []).join(" + ")].join(" | "),
    )
    .join("\n");
  $("#pDims").value = (p?.dims || []).map((d) => `${d.label}: ${d.value}`).join("\n");
  $("#pFrame").value = (p?.frameColors || []).join("، ");
  $("#pWeave").value = (p?.weaveColors || []).join("، ");
  $("#pWarranty").value = p?.warranty || "";
  $("#pLoad").value = p?.loadCapacity || "";
  $("#pNote").value = p?.colorsNote || "";
  $("#pFormTitle").textContent = p ? "✏️ تعديل: " + p.name : "➕ إضافة منتج جديد";
  $("#pSave").textContent = p ? "حفظ التعديلات" : "حفظ المنتج";
  paintPreview();
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
      if (i < 0) return null;
      return { label: row.slice(0, i).trim(), value: row.slice(i + 1).trim() };
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

$("#pForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const p = formToProduct();

  const bad = (sel, cond) => {
    $(sel).closest(".f").classList.toggle("bad", !cond);
    return cond;
  };
  let ok = true;
  ok = bad("#pId", !!p.id) && ok;
  ok = bad("#pName", !!p.name) && ok;
  ok = bad("#pImg", !!p.img) && ok;
  /* السعر ممكن يبقى فاضي لو المنتج ليه أنواع بأسعار */
  ok = bad("#pPrice", p.price != null || (p.variants || []).some((v) => v.price != null)) && ok;
  if (!ok) return toast("راجع الخانات المطلوبة");

  /* لو السعر فاضي ناخد أقل سعر بين الأنواع */
  if (p.price == null) p.price = Math.min(...p.variants.filter((v) => v.price != null).map((v) => v.price));
  if (!p.short) p.short = (p.components || []).join(" + ") || p.name;

  const i = PRODUCTS.findIndex((x) => x.id === (editingProduct || p.id));
  if (editingProduct) {
    if (p.id !== editingProduct && PRODUCTS.some((x) => x.id === p.id))
      return toast("الكود ده مستخدم في منتج تاني");
    PRODUCTS[i] = p;
  } else {
    if (i > -1) return toast("الكود ده مستخدم قبل كده");
    PRODUCTS.push(p);
  }

  saveCatalog();
  toast(editingProduct ? "تم حفظ التعديلات" : "تمت إضافة المنتج");
  editingProduct = null;
  productToForm(null);
  renderAll();
});

$("#pCancel").addEventListener("click", () => {
  editingProduct = null;
  productToForm(null);
});

document.addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit-p]");
  if (ed) {
    const p = PRODUCTS.find((x) => x.id === ed.dataset.editP);
    if (!p) return;
    editingProduct = p.id;
    productToForm(p);
    $("#pFormTitle").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const del = e.target.closest("[data-del-p]");
  if (del) {
    const p = PRODUCTS.find((x) => x.id === del.dataset.delP);
    if (!p || !confirm(`تأكيد حذف «${p.name}»؟`)) return;
    PRODUCTS.splice(PRODUCTS.indexOf(p), 1);
    saveCatalog();
    toast("تم حذف المنتج");
    if (editingProduct === p.id) {
      editingProduct = null;
      productToForm(null);
    }
    renderAll();
  }
});

/* ============================================================
   7) الأقسام
   ============================================================ */
let editingCat = null;

function renderCats() {
  $("#catsTable").innerHTML = CATEGORIES.length
    ? `<table>
        <thead><tr><th></th><th>الكود</th><th>الاسم</th><th>الوصف</th><th>المنتجات</th><th></th></tr></thead>
        <tbody>
          ${CATEGORIES.map(
            (c) => `<tr>
            <td><img class="thumb-sm" style="height:40px" src="${imgURL(c.img)}" alt="" loading="lazy"></td>
            <td class="mono">${esc(c.id)}</td>
            <td>${esc(c.icon || "")} ${esc(c.name)}</td>
            <td class="muted">${esc(c.desc || "")}</td>
            <td>${PRODUCTS.filter((p) => p.cat === c.id).length}</td>
            <td class="actions">
              <button class="btn line sm" data-edit-c="${esc(c.id)}">تعديل</button>
              <button class="btn danger sm" data-del-c="${esc(c.id)}">حذف</button>
            </td>
          </tr>`,
          ).join("")}
        </tbody>
      </table>`
    : `<p class="empty-row">مفيش أقسام.</p>`;
}

function catToForm(c) {
  $("#cId").value = c?.id || "";
  $("#cName").value = c?.name || "";
  $("#cIcon").value = c?.icon || "";
  $("#cImg").value = c?.img || "";
  $("#cDesc").value = c?.desc || "";
  $("#cFormTitle").textContent = c ? "✏️ تعديل: " + c.name : "➕ إضافة قسم جديد";
}

$("#cForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const c = {
    id: $("#cId").value.trim(),
    name: $("#cName").value.trim(),
    icon: $("#cIcon").value.trim(),
    img: $("#cImg").value.trim(),
    desc: $("#cDesc").value.trim(),
  };
  if (!c.id || !c.name) return toast("الكود والاسم مطلوبين");

  if (editingCat) {
    const i = CATEGORIES.findIndex((x) => x.id === editingCat);
    if (c.id !== editingCat) {
      if (CATEGORIES.some((x) => x.id === c.id)) return toast("الكود ده مستخدم");
      /* نقل منتجات القسم للكود الجديد */
      PRODUCTS.forEach((p) => {
        if (p.cat === editingCat) p.cat = c.id;
      });
    }
    CATEGORIES[i] = c;
  } else {
    if (CATEGORIES.some((x) => x.id === c.id)) return toast("الكود ده مستخدم قبل كده");
    CATEGORIES.push(c);
  }

  saveCatalog();
  toast(editingCat ? "تم حفظ القسم" : "تمت إضافة القسم");
  editingCat = null;
  catToForm(null);
  renderAll();
});

$("#cCancel").addEventListener("click", () => {
  editingCat = null;
  catToForm(null);
});

document.addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit-c]");
  if (ed) {
    const c = CATEGORIES.find((x) => x.id === ed.dataset.editC);
    if (!c) return;
    editingCat = c.id;
    catToForm(c);
    $("#cFormTitle").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
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
    if (editingCat === c.id) {
      editingCat = null;
      catToForm(null);
    }
    renderAll();
  }
});

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
      if (!Array.isArray(d.categories) || !Array.isArray(d.products))
        throw new Error("bad");
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
  if (!confirm("هيرجّع المنتجات والأقسام لآخر نسخة منشورة ويمسح تعديلات المتصفح. تأكيد؟"))
    return;
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
