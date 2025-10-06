// src/Invoices.js
import { getWorkerNameById } from "./Database.js";
/* ===== شعارات من مجلد public ===== */
const WORKSHOP_LOGO = "/القوة الكامنة Logo.png";
const TONIRA_LOGO = "/Tonira logo BG.png";

/* ===== معلومات الشركة (من المستندات) ===== */
const COMPANY_AR = {
  name: "ورشة القوة الكامنة",
  branch: "الفرع الرئيسي",
  cr: "رقم السجل التجاري: 7049144426",
  vat: "الرقم الضريبي: 312887516600003",
  // من إثبات العنوان الوطني:
  addr: "العنوان الوطني: جدة – حي الزهراء – شارع أحمد بن قسني – مبنى 3172 – 23521",
  mobile: "جوال: +9665511559727",
  email: "info@example.com",
};

const COMPANY_EN = {
  name: "Hidden Power Workshop",
  branch: "Head Branch",
  cr: "CR No.: 7049144426",
  vat: "VAT No.: 312887516600003",
  // من إثبات العنوان الوطني:
  addr: "National Address: Jeddah – Az Zahra Dist. – Ahmad Ibn Qasni St. – Bldg 3172 – 23521 – KSA",
  mobile: "Mobile: +9665511559727",
  email: "Email: info@example.com",
};

/* ===== أدوات مساعدة ===== */
function readPaymentMethod(t) {
  return (
    t["payment metd"] ||
    t["payment_method"] ||
    t.payment_method ||
    t.payment ||
    ""
  );
}
const asNum = (v) => Number(v || 0);

// دالة جديدة: تطبع تذكرة مع محاولة جلب اسم الموظف من worker_id
export async function printTicketSmart(t) {
  const workerName =
    t.worker_name ||
    t.workers?.name ||
    (await getWorkerNameById(t.worker_id)) ||
    "—";
  const withName = { ...t, worker_name: workerName };
  printDoc(withName, "ticket");
}

/* ===== HTML الفاتورة ===== */
export function buildPrintHTML(t, type = "invoice") {
  const pay = readPaymentMethod(t);
  const price = asNum(t.price ?? t.bill);
  const discount = asNum(t.discount);
  const tax = asNum(t.tax);
  const idShort = t.id ? String(t.id).slice(0, 8) : "—";
  const created = new Date(t.created_at || Date.now()).toLocaleString("en-US");
  const letters = t.plate_letters_ar ?? t.plate_letters ?? "";
  const workerDisplay =
    t.worker_name || t.workers?.name || t.worker || t.worker_fullname || "—";

  // العناصر
  const items = Array.isArray(t.items) ? t.items : [];
  const itemsSubtotal = items.reduce(
    (s, it) => s + asNum(it.qty) * asNum(it.price),
    0
  );

  const beforeVAT = items.length
    ? itemsSubtotal
    : Math.max(price - discount - tax, 0);
  const vat15 = tax || +(beforeVAT * 0.15).toFixed(2);
  const extra = 0;
  const netIncl = beforeVAT + vat15 + extra - discount;

  const itemsHTML = items.length
    ? items
        .map((it) => {
          const qty = asNum(it.qty || 1);
          const u = asNum(it.price || 0);
          const tot = +(qty * u).toFixed(2);
          const vat = +(tot * 0.15).toFixed(2);
          const amt = +(tot + vat).toFixed(2);
          return `
            <tr>
              <td class="num">${it.item_no || it.code || `—`}</td>
              <td class="clip">${
                it.name || it.desc || it.description || "—"
              }</td>
              <td class="center">${it.location || "—"}</td>
              <td class="num">${qty}</td>
              <td class="num">SAR ${u.toFixed(2)}</td>
              <td class="num">SAR ${tot.toFixed(2)}</td>
              <td class="num">SAR ${vat.toFixed(2)}</td>
              <td class="num">SAR ${amt.toFixed(2)}</td>
            </tr>`;
        })
        .join("")
    : `
        <tr>
          <td class="num">—</td>
          <td class="clip">${t.Service || t.title || "خدمة"}</td>
          <td class="center">—</td>
          <td class="num">1</td>
          <td class="num">SAR ${beforeVAT.toFixed(2)}</td>
          <td class="num">SAR ${beforeVAT.toFixed(2)}</td>
          <td class="num">SAR ${vat15.toFixed(2)}</td>
          <td class="num">SAR ${(beforeVAT + vat15).toFixed(2)}</td>
        </tr>`;

  const docTitle = type === "ticket" ? " فاتورة" : "فاتورة";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${docTitle} #${idShort}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root{--ink:#111827;--muted:#6b7280;--border:#e5e7eb;--panel:#fff;}
  *{box-sizing:border-box}
  html,body{background:#fff;color:var(--ink);font:14px/1.6 "Cairo",system-ui,-apple-system,Segoe UI,Tahoma}

  /* صفحة الفاتورة: شبكة 3 صفوف (رأس / محتوى / أسفل) */
  .page{
    max-width:860px;
    margin:18px auto;
    padding:0 16px 18px;
    background:#fff;
    display:grid;
    grid-template-rows: auto 1fr auto;
    /* لاحظ: لا نستخدم min-height هنا حتى لا تُجبر صفحة ثانية */
  }

  .center{text-align:center}.muted{color:var(--muted)}
  .num{direction:ltr;text-align:left;font-variant-numeric:tabular-nums}
  .clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .h1{font-weight:700;font-size:18px}

  /* الرأس العلوي بدون حدود */
  .top{padding:10px 0 6px;border-bottom:1px solid #dfe3e8;margin-bottom:8px}
  .company{display:grid;gap:2px;font-size:12px;line-height:1.4}
  .company b{font-weight:700}
  .logoBox{display:flex;flex-direction:column;align-items:center;gap:6px;padding:2px 10px}
  .logoBox img{display:block;height:120px;width:auto;lign-items:center}

  .panel{padding:8px;border:1px solid var(--border);border-radius:10px;background:#fff}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .kv{display:grid;grid-template-columns:140px 1fr;gap:6px}
  .kv div:nth-child(odd){color:#374151}

  .table{width:100%;border-collapse:collapse;margin-top:12px;page-break-inside:auto}
  .table th,.table td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
  .table thead th{border-top:1px solid #e5e7eb}
  .table tr{page-break-inside:avoid;break-inside:avoid}

  /* أسفل الصفحة (الملخص) – امنع انقسامه */
  .bottom{margin-top:100px;break-inside:avoid;page-break-inside:avoid}

  .totals-wide{width:100%;border-collapse:collapse;margin-top:12px}
  .totals-wide td{border:1px solid #e5e7eb;padding:10px 12px;vertical-align:top}
  .totals-wide .lbl{color:#374151;font-weight:600}
  .totals-wide .val{direction:ltr;text-align:left;font-variant-numeric:tabular-nums;margin-top:6px}

  .footer-line{display:flex;justify-content:center;gap:12px;align-items:center;margin-top:10px}
  .foot{display:flex;margin-top:20px;align-items:center;justify-content:center }

  /* إعدادات الطباعة */
  @page{ size: A4; margin: 10mm 10mm 12mm 10mm; }
  @media print{
    .noprint{display:none}
    /* ألغِ أي ارتفاعات إجبارية في الطباعة */
    .page{ margin:0; padding:0 10mm 10mm; min-height:auto; }
    .top{margin-bottom:6mm}
    .panel{page-break-inside:avoid}
    .bottom{page-break-after:auto}
  }
</style>

</head>
<body>
  <div class="page">

    <!-- ===== رأس الفاتورة (بدون حدود) ===== -->
    <div class="top" style="display:flex;align-items:flex-start;gap:12px;justify-content:space-between">
      <div class="company">
        <b>${COMPANY_AR.name}</b>
        <div>${COMPANY_AR.branch}</div>
        <div>${COMPANY_AR.cr}</div>
        <div>${COMPANY_AR.vat}</div>
        <div>${COMPANY_AR.addr}</div>
        <div>${COMPANY_AR.mobile}</div>
        <div>${COMPANY_AR.email}</div>
      </div>

      <div class="logoBox">
        <img src="${WORKSHOP_LOGO}" alt="Logo" onerror="this.style.display='none'"/>
        <div class="h1">${docTitle}</div>
      </div>

      <div class="company" dir="ltr" style="text-align:left">
        <b>${COMPANY_EN.name}</b>
        <div>${COMPANY_EN.branch}</div>
        <div>${COMPANY_EN.cr}</div>
        <div>${COMPANY_EN.vat}</div>
        <div>${COMPANY_EN.addr}</div>
        <div>${COMPANY_EN.mobile}</div>
        <div>${COMPANY_EN.email}</div>
      </div>
    </div>

    <!-- ===== المحتوى الرئيسي (يتمدّد) ===== -->
    <div class="main">
      <!-- بيانات الوثيقة والعميل -->
      <div class="grid2">
        <div class="panel">
          <div class="kv">
            <div>رقم الوثيقة</div><div class="num">#${idShort}</div>
            <div>التاريخ</div><div class="num">${created}</div>
            <div>الحالة</div><div>${t.status || "—"}</div>
            <div>طريقة الدفع</div><div>${pay || "—"}</div>
            <div>اسم العميل</div><div>${t.customer_name || "—"}</div>
            <div>جوال العميل</div><div class="num">${
              t.customer_phone || ""
            }</div>
            <div>الموظف</div><div>${workerDisplay}</div>
          </div>
        </div>

        <div class="panel">
          <div class="kv">
            <div>الخدمة</div><div>${t.Service || t.title || "—"}</div>
            <div>ملاحظات</div><div>${t.work_notes || "—"}</div>
            <div>السيارة</div><div>${t.car_info || "—"}</div>
            <div>اللوحة</div>
            <div class="num">${t.plate_number || "—"} ${
    letters ? "(" + letters + ")" : ""
  }</div>
            <div>الدولة</div><div>${t.country || "—"}</div>
            <div>الشركة</div><div>${t.make || "—"}</div>
            <div>الموديل</div><div>${t.model || "—"}</div>
            <div>السنة</div><div class="num">${t.year ?? "—"}</div>
            <div>اللون</div><div>${t.color || "—"}</div>
          </div>
        </div>
      </div>

      <!-- جدول العناصر (يأخذ الحيّز الأكبر) -->
      <table class="table">
        <thead>
          <tr>
            <th style="width:110px">رقم الصنف<br/><span class="muted">Item No.</span></th>
            <th>الوصف<br/><span class="muted">Description</span></th>
            <th style="width:120px">الموقع<br/><span class="muted">Location</span></th>
            <th style="width:80px">الكمية<br/><span class="muted">Qty</span></th>
            <th style="width:120px">سعر الوحدة<br/><span class="muted">U. Price</span></th>
            <th style="width:120px">الإجمالي<br/><span class="muted">Total</span></th>
            <th style="width:110px">الضريبة<br/><span class="muted">Tax</span></th>
            <th style="width:120px">المبلغ<br/><span class="muted">Amount</span></th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
    </div> <!-- /main -->

    <!-- ===== الجزء السفلي المثبّت أسفل الصفحة ===== -->
    <div class="bottom">
      <table class="totals-wide">
        <tr>
          <td>
            <div class="lbl">إجمالي قبل الضريبة</div>
            <div class="val">SAR ${beforeVAT.toFixed(2)}</div>
          </td>
          <td>
            <div class="lbl">الضريبة (15%)</div>
            <div class="val">SAR ${vat15.toFixed(2)}</div>
          </td>
          <td>
            <div class="lbl">خصم</div>
            <div class="val">SAR ${discount.toFixed(2)}</div>
          </td>
          <td>
            <div class="lbl">رسوم إضافية</div>
            <div class="val">SAR ${extra.toFixed(2)}</div>
          </td>
          <td>
            <div class="lbl" style="font-weight:800">الصافي (شامل)</div>
            <div class="val" style="font-weight:800">SAR ${netIncl.toFixed(
              2
            )}</div>
          </td>
        </tr>
      </table>

      <div class="footer-line">
        تم الصنع بواسطة
        <img src="${TONIRA_LOGO}" alt="TONIRA" style="height:90px" onerror="this.style.display='none'"/>

        </div>
        <div class="foot">شكراً لتعاملكم معنا </div>

      <div class="noprint" style="text-align:center;margin-top:10px">
        <button onclick="window.print()" style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;cursor:pointer">طباعة</button>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ===== الطباعة عبر iframe ===== */
export function printDoc(t, type = "invoice") {
  const html = buildPrintHTML(t, type);
  try {
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      position: "fixed",
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      border: 0,
      visibility: "hidden",
    });
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        win.focus();
        setTimeout(() => {
          win.print();
          setTimeout(() => document.body.removeChild(iframe), 800);
        }, 50);
      } catch {
        document.body.removeChild(iframe);
        fallbackWindowOpen(html);
      }
    };
  } catch {
    fallbackWindowOpen(html);
  }
}

function fallbackWindowOpen(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    alert(
      "المتصفح منع فتح نافذة الطباعة. فعّلي النوافذ المنبثقة ثم أعيدي المحاولة."
    );
    URL.revokeObjectURL(url);
    return;
  }
  const done = () => URL.revokeObjectURL(url);
  w.addEventListener("load", () => {
    try {
      w.focus();
      w.print();
    } finally {
      setTimeout(done, 1500);
    }
  });
}
