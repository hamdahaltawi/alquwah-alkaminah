// src/pages/EmployeePage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  supabase,
  fetchRecentTickets,
  updateTicketStatus,
} from "../Database.js";
import { printDoc, printTicketSmart } from "../Invoices";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

/* ===================== Helpers ===================== */
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = CURRENT_YEAR - 70;
const MAX_YEAR = CURRENT_YEAR + 1;

const PHONE_RE = /^05[0-9]{8}$/;
const PLATE_NUM_RE = /^\d{1,4}$/;

const STATUS_ORDER = [
  "NEW",
  "REVIEW",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "READY",
  "DELIVERED",
  "CANCELLED",
];
const STATUS_AR = {
  NEW: "جديد",
  REVIEW: "مراجعة",
  IN_PROGRESS: "قيد العمل",
  WAITING_PARTS: "بانتظار قطع",
  READY: "جاهز",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};
const STATUS_COLORS = {
  NEW: "#a5b4fc",
  REVIEW: "#67e8f9",
  IN_PROGRESS: "#fdba74",
  WAITING_PARTS: "#fde68a",
  READY: "#86efac",
  DELIVERED: "#93c5fd",
  CANCELLED: "#fecaca",
};

function toNum(v) {
  // ناخذ أرقام + نقطة فقط (نتجاهل أي - أو رموز أخرى) ونحوّلها لرقم
  const s = String(v ?? "").replace(/[^0-9.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeYearInput(s) {
  return String(s || "")
    .replace(/\D/g, "")
    .slice(0, 4);
}
function isValidYearStr(s) {
  if (!/^\d{4}$/.test(s)) return false;
  const y = Number(s);
  return y >= MIN_YEAR && y <= MAX_YEAR;
}
function normalizePhone(s) {
  return String(s || "")
    .replace(/\D/g, "")
    .slice(0, 10);
}
function normalizePlateNum(s) {
  return String(s || "")
    .replace(/\D/g, "")
    .slice(0, 4);
}

function netTotal(price, discount) {
  const p = toNum(price);
  const d = Math.min(toNum(discount), p);
  return Math.max(p - d, 0);
}
function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
function isNetworkPay(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "شبكة" || s === "network";
}

async function updateTicketFields(id, patch) {
  const allowed = [
    "customer_name",
    "customer_phone",
    "Service",
    "title",
    "work_notes",
    "price",
    "discount",
    "payment_method",
    "car_info",
    "plate_number",
    "plate_letters_ar",
    "country",
    "make",
    "model",
    "year",
    "color",
    "status",
    "tax",
  ];
  const safe = {};
  for (const k of allowed) if (k in patch) safe[k] = patch[k];
  const { data, error } = await supabase
    .from("tickets")
    .update(safe)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// يقرأ الـID من localStorage مهما كان اسمه أو نوعه (رقم/نص)
function readWorkerId() {
  const raw =
    localStorage.getItem("worker_id") ??
    localStorage.getItem("workerId") ??
    localStorage.getItem("user_id") ??
    localStorage.getItem("userId") ??
    localStorage.getItem("id") ??
    "";

  // إن كان أرقام فقط رجّعه Number، غير كذا رجّعه كنص (لو العمود UUID)
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw || null;
}
//the discount function
const TAX_RATE = 0.15; // 15%
const r2 = (n) => Number((Number(n) || 0).toFixed(2));
function calcTotalIncl(t) {
  return r2(toNum(t.price) + toNum(t.tax));
}
function discountOnTotal(totalIncl, discountInput, isPercent) {
  const total = Math.max(0, toNum(totalIncl));
  let d = Math.max(0, toNum(discountInput));
  if (isPercent) d = (Math.min(d, 100) / 100) * total; // 0..100%
  d = Math.min(d, total); // ما يتجاوز الإجمالي
  const newTotal = r2(total - d);
  return { newTotalIncl: newTotal, discountAmount: r2(d) };
}
// نفصل أساس/ضريبة من إجمالي شامل بعد الخصم
function splitFromTotalIncl(newTotalIncl, paymentMethod) {
  const t = Math.max(0, toNum(newTotalIncl));
  if (isNetworkPay(paymentMethod)) {
    const base = r2(t / (1 + TAX_RATE));
    const tax = r2(base * TAX_RATE);
    return { baseAfterDiscount: base, tax };
  }
  // كاش
  return { baseAfterDiscount: r2(t), tax: 0 };
}
function toEditableTicket(t, asPercent = false) {
  const currentTotal = calcTotalIncl(t); // بعد الخصم
  const prevDiscount = toNum(t.discount); // الخصم المحفوظ (قيمة)
  const baseTotalIncl = r2(currentTotal + prevDiscount); // قبل الخصم

  // أعرض الخصم حسب الوضع المطلوب
  const discountField = asPercent
    ? baseTotalIncl > 0
      ? r2((prevDiscount / baseTotalIncl) * 100)
      : 0 // كنسبة
    : prevDiscount; // كقيمة

  return { ...t, total_incl: baseTotalIncl, discount: discountField };
}

/* ===================== Component ===================== */
export default function EmployeePage() {
  const [workerId, setWorkerId] = useState(readWorkerId());

  // عرض الصفحة: أضفنا dashboard
  const [viewMode, setViewMode] = useState("dashboard"); // dashboard | myTickets | create

  // بيانات عامة
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // نموذج الإنشاء
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [service, setService] = useState("");
  const [workNotes, setWorkNotes] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [carInfo, setCarInfo] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [plateLetters, setPlateLetters] = useState("");
  const [country, setCountry] = useState("SA");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [discountIsPercent, setDiscountIsPercent] = useState(true);
  const [editDiscountIsPercent, setEditDiscountIsPercent] = useState(true);

  // فلاتر تذاكري
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // تفاصيل التذكرة
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!selected) {
      setEdit(null);
      return;
    }
    // أبني فورم التحرير من إجمالي "قبل الخصم"
    setEdit(toEditableTicket(selected, true)); // ابني الحقول كنسبة
    setEditDiscountIsPercent(true); // ابدأ كنسبة
  }, [selected]);

  async function load() {
    if (!workerId) {
      setTickets([]);
      setMsg("لا يوجد معرف موظف – أعد تسجيل الدخول.");
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const list = await fetchRecentTickets({ workerId, limit: 200 });
      setTickets(list || []);
    } catch (e) {
      setMsg(e.message || "تعذر جلب البيانات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateTicket(e) {
    e.preventDefault();
    setMsg("");
    if (!workerId) return setMsg("لا يوجد معرف موظف – أعد تسجيل الدخول.");
    if (!customerName || !customerPhone || !service)
      return setMsg("يرجى تعبئة: اسم العميل + الجوال + الخدمة.");

    try {
      setLoading(true);
      const totalInclInput = toNum(price); // قيمة مدخلة "شامل الضريبة"
      const { newTotalIncl, discountAmount } = discountOnTotal(
        totalInclInput,
        discount,
        discountIsPercent
      );

      const { baseAfterDiscount, tax } = splitFromTotalIncl(
        newTotalIncl,
        paymentMethod
      );

      const payload = {
        worker_id: workerId, // لا تحوّله Number — يمكن يكون UUID
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        title: service.trim(),
        Service: service || null,
        work_notes: workNotes || null,
        price: r2(baseAfterDiscount), // 👈 أساس بعد الخصم
        discount: r2(discountAmount), // حفظه للمرجع فقط (ما نطرحه مرة ثانية)
        tax: r2(tax), // 👈 الضريبة المحسوبة
        payment_method: paymentMethod || null,
        car_info: carInfo || null,
        plate_number: plateNumber || null,
        plate_letters_ar: plateLetters || null,
        country: country || null,
        make: make || null,
        model: model || null,
        year: isValidYearStr(year) ? Number(year) : null,
        color: color || null,
        status: "NEW",
      };

      const { data, error } = await supabase
        .from("tickets")
        .insert([payload])
        .select()
        .single();
      if (error) throw error;

      // reset
      setCustomerName("");
      setCustomerPhone("");
      setService("");
      setWorkNotes("");
      setPrice("");
      setDiscount("");
      setPaymentMethod("");
      setCarInfo("");
      setPlateNumber("");
      setPlateLetters("");
      setCountry("SA");
      setMake("");
      setModel("");
      setYear("");
      setColor("");

      setTickets((prev) => [data, ...(prev || [])]);
      setMsg("✅ تم إنشاء التذكرة بنجاح");
      setViewMode("myTickets");
    } catch (e) {
      setMsg(e.message || "تعذر إنشاء التذكرة");
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;

    const phone = normalizePhone(edit.customer_phone);
    const plateNum = normalizePlateNum(edit.plate_number);
    const yStr = edit.year != null ? String(edit.year) : "";
    const totalInclInput = toNum(edit.total_incl);
    const { newTotalIncl, discountAmount } = discountOnTotal(
      totalInclInput,
      edit.discount,
      editDiscountIsPercent
    );
    const { baseAfterDiscount, tax } = splitFromTotalIncl(
      newTotalIncl,
      edit.payment_method
    );
    const patch = {
      customer_name: (edit.customer_name || "").trim() || null,
      customer_phone: PHONE_RE.test(phone) ? phone : null,
      Service: edit.Service || null,
      title: edit.title || edit.Service || null,
      work_notes: edit.work_notes || null,
      // 👇 نخزّن الأساس بعد الخصم والضريبة المفصولة
      price: r2(baseAfterDiscount),
      tax: r2(tax),

      // 👇 نخزّن قيمة الخصم للمرجع فقط (ما نطرحه مرة ثانية)
      discount: r2(discountAmount),
      payment_method: edit.payment_method || null,
      car_info: edit.car_info || null,
      plate_number: PLATE_NUM_RE.test(plateNum) ? plateNum : null,
      plate_letters_ar: edit.plate_letters_ar || null,
      country: edit.country || null,
      make: edit.make || null,
      model: edit.model || null,
      year: isValidYearStr(yStr) ? Number(yStr) : null,
      color: edit.color || null,
      status: edit.status || selected?.status || "NEW",
    };

    try {
      setSavingEdit(true);
      const updated = await updateTicketFields(edit.id, patch);
      setTickets((prev) =>
        (prev || []).map((t) => (t.id === updated.id ? updated : t))
      );
      setSelected(updated);
      // أعيد البناء لكن بنفس وضع الإدخال الحالي (نسبة/قيمة)
      setEdit(toEditableTicket(updated, editDiscountIsPercent));
      // حافظي على وضع الشيك بوكس كما هو
      setEditDiscountIsPercent(editDiscountIsPercent);

      setMsg("✅ تم حفظ التعديلات");
    } catch (e) {
      setMsg(e.message || "تعذر حفظ التعديلات");
    } finally {
      setSavingEdit(false);
    }
  }

  /* ===== بيانات الدونت والـKPIs ===== */
  const donutData = useMemo(() => {
    const counts = {};
    STATUS_ORDER.forEach((s) => (counts[s] = 0));
    (tickets || []).forEach((t) => {
      const s = String(t.status || "").toUpperCase();
      if (s in counts) counts[s] += 1;
    });
    const rows = STATUS_ORDER.map((s) => ({
      key: s,
      name: STATUS_AR[s],
      value: counts[s],
      color: STATUS_COLORS[s],
    })).filter((r) => r.value > 0);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { rows, total, counts };
  }, [tickets]);

  const today = new Date();
  const kpi = useMemo(() => {
    const openStatuses = new Set([
      "NEW",
      "REVIEW",
      "IN_PROGRESS",
      "WAITING_PARTS",
      "READY",
    ]);
    let openNow = 0;
    let todayCount = 0;
    let todayTotal = 0;
    let todayNetCount = 0;

    (tickets || []).forEach((t) => {
      if (openStatuses.has(String(t.status || "").toUpperCase())) openNow++;

      if (isSameDay(t.created_at, today)) {
        todayCount++;
        const val = calcTotalIncl(t);
        todayTotal += val;
        if (isNetworkPay(t.payment_method)) todayNetCount++;
      }
    });

    return {
      openNow,
      todayCount,
      todayTotal,
      todayNetCount,
    };
  }, [tickets]);

  const currency = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "SAR",
    }).format(Number(n || 0));

  // فلترة تذاكري (أضِف هذا قبل return)
  const filteredTickets = useMemo(() => {
    return (tickets || []).filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;

      if (q) {
        const needle = q.trim().toLowerCase();
        const hay = `${t.title || ""} ${t.Service || ""} ${
          t.customer_name || ""
        } ${t.customer_phone || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }

      if (dateFrom && new Date(t.created_at) < new Date(dateFrom)) return false;

      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(t.created_at) > end) return false;
      }

      return true;
    });
  }, [tickets, q, statusFilter, dateFrom, dateTo]);

  // helper يضمن أرقام ASCII ويقصّها لـ 10 ويحوّل +966 -> 05
  function normalizeSaudiMobile(v) {
    let s = String(v || "").trim();
    if (s.startsWith("+966")) s = "0" + s.slice(4);
    s = s.replace(/[^\d]/g, ""); // ASCII digits only
    if (s.length > 10) s = s.slice(0, 10);
    return s;
  }
  function isValidSaudiMobile(v) {
    return /^05[0-9]{8}$/.test(normalizeSaudiMobile(v));
  }
  function sanitizeYearInput(s) {
    return String(s || "")
      .replace(/[^0-9]/g, "")
      .slice(0, 4);
  }
  function isValidYearStr(s) {
    if (!/^[0-9]{4}$/.test(s)) return false;
    const y = Number(s);
    return y >= MIN_YEAR && y <= MAX_YEAR;
  }

  return (
    <div className="page employee" dir="rtl">
      {/* العنوان */}
      <div className="emp-head">
        <h2 className="emp-title">إدارة العمليات</h2>
      </div>

      {/* شريط بطاقات (زي صفحة المدير) مع 3 بطاقات */}
      <ActionRail viewMode={viewMode} setViewMode={setViewMode} />

      {/* ===== تبويب: لوحة المعلومات ===== */}
      {viewMode === "dashboard" && (
        <div className="card pro mb16">
          <div className="topbar" style={{ justifyContent: "space-between" }}>
            <h3 className="m0">لوحة المعلومات</h3>
          </div>

          {/* KPIs */}
          <div className="kpi-wrap compact" style={{ marginTop: 12 }}>
            <div className="kpi">
              <div className="kpi-icon">📌</div>
              <div className="kpi-meta">
                <div className="kpi-label">تذاكر مفتوحة</div>
                <div className="kpi-value">{kpi.openNow}</div>
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-icon">🗓️</div>
              <div className="kpi-meta">
                <div className="kpi-label">تذاكر اليوم</div>
                <div className="kpi-value">{kpi.todayCount}</div>
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-icon">💵</div>
              <div className="kpi-meta">
                <div className="kpi-label">إجمالي اليوم</div>
                <div className="kpi-value">{currency(kpi.todayTotal)}</div>
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-icon">💳</div>
              <div className="kpi-meta">
                <div className="kpi-label">شبكة اليوم</div>
                <div className="kpi-value">{kpi.todayNetCount}</div>
              </div>
            </div>
          </div>

          {/* دونت توزيع الحالات */}
          <div
            className="card-body donut-wrap"
            style={{ alignItems: "center", paddingTop: 6 }}
          >
            <div
              className="donut-chart-fixed"
              style={{
                width: 340,
                height: 340,
                position: "relative",
                marginInline: "auto",
                filter: "drop-shadow(0 10px 24px rgba(0,0,0,.06))",
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip />
                  <Pie
                    data={donutData.rows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={105}
                    outerRadius={140}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    cornerRadius={6}
                    isAnimationActive={false}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {donutData.rows.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 900 }}>
                  {donutData.total}
                </div>
                <div className="muted">إجمالي</div>
              </div>
            </div>

            <div className="donut-legend" style={{ display: "grid", gap: 8 }}>
              {donutData.rows.length === 0 ? (
                <div className="muted">لا توجد بيانات.</div>
              ) : (
                donutData.rows.map((s) => (
                  <div
                    key={s.key}
                    className="legend-item"
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span
                      className="dot"
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: s.color,
                        border: "1px solid rgba(0,0,0,.12)",
                      }}
                    />
                    <span
                      className="name"
                      style={{ minWidth: 120, fontWeight: 800 }}
                    >
                      {s.name}
                    </span>
                    <span className="val num" style={{ fontWeight: 800 }}>
                      {s.value}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== تبويب: إنشاء تذكرة ===== */}
      {viewMode === "create" && (
        <div className="card pro">
          <h3 className="m0 mb16">إنشاء تذكرة جديدة</h3>
          {msg && (
            <div
              className={`alert ${
                msg.startsWith("✅") ? "success" : "warning"
              } mb16`}
            >
              {msg}
            </div>
          )}

          <form onSubmit={onCreateTicket} className="grid" style={{ gap: 12 }}>
            <div className="form-row">
              <label>
                اسم العميل *
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </label>
              <label>
                جوال العميل *
                <input
                  className="ltr"
                  inputMode="numeric"
                  value={customerPhone}
                  onChange={(e) =>
                    setCustomerPhone(normalizeSaudiMobile(e.target.value))
                  }
                  required
                  pattern="^05[0-9]{8}$" // 👈 بدون \d
                  title="الرقم يجب أن يبدأ بـ 05 ويكون 10 أرقام"
                  onInvalid={(e) =>
                    e.currentTarget.setCustomValidity(
                      "الرقم يجب أن يبدأ بـ 05 ويكون 10 أرقام"
                    )
                  }
                  onInput={(e) => e.currentTarget.setCustomValidity("")}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                الخدمة *
                <input
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  required
                />
              </label>
              <label>
                ملاحظة العامل
                <input
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              {/* السعر */}
              <label>
                السعر
                <input
                  type="number"
                  className="ltr"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>

              {/* الخصم */}
              <label>
                الخصم
                <input
                  type="number"
                  className="ltr"
                  value={discount}
                  onChange={(e) => {
                    if (discountIsPercent) {
                      // نسبة: أرقام فقط + قص إلى 0..100
                      let s = String(e.target.value || "").replace(
                        /[^0-9.]/g,
                        ""
                      );
                      s = s.replace(/^0+(\d)/, "$1");
                      const v = Math.min(toNum(s), 100);
                      setDiscount(String(v));
                    } else {
                      // قيمة: لا تتجاوز السعر المُدخل
                      const p = toNum(price);
                      const v = Math.min(toNum(e.target.value), p);
                      setDiscount(String(v));
                    }
                  }}
                />
              </label>

              {/* الشيك بوكس: هل الخصم نسبة؟ */}
              <label className="row" style={{ alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={discountIsPercent}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const total = toNum(price);
                    const d = toNum(discount || 0);

                    if (checked) {
                      // قيمة -> نسبة
                      const pct =
                        total > 0 ? Math.min(100, (d / total) * 100) : 0;
                      setDiscount(String(r2(pct)));
                    } else {
                      // نسبة -> قيمة
                      const amount = (Math.min(d, 100) / 100) * total;
                      setDiscount(String(r2(amount)));
                    }
                    setDiscountIsPercent(checked);
                  }}
                />
                <span>الخصم كنسبة %</span>
              </label>
            </div>

            <label>
              طريقة الدفع
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">— اختر —</option>
                <option value="cash">نقدًا</option>
                <option value="شبكة">شبكة</option>
              </select>
            </label>

            <div className="form-row">
              <label>
                أرقام اللوحة
                <input
                  className="ltr"
                  inputMode="numeric"
                  value={plateNumber}
                  onChange={(e) =>
                    setPlateNumber(normalizePlateNum(e.target.value))
                  }
                  maxLength={4}
                  pattern="^[0-9]{1,4}$" // 👈 بدّل \d إلى [0-9]
                  title="أدخل من 1 إلى 4 أرقام فقط"
                  onInput={(e) => e.currentTarget.setCustomValidity("")}
                  onInvalid={(e) =>
                    e.currentTarget.setCustomValidity(
                      "أدخل من 1 إلى 4 أرقام فقط"
                    )
                  }
                />
              </label>

              <label>
                أحرف اللوحة
                <input
                  value={plateLetters}
                  onChange={(e) => setPlateLetters(e.target.value)}
                />
              </label>
            </div>

            <label>
              وصف السيارة
              <input
                value={carInfo}
                onChange={(e) => setCarInfo(e.target.value)}
              />
            </label>

            <div className="form-row">
              <label>
                الدولة
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </label>
              <label>
                الشركة
                <input value={make} onChange={(e) => setMake(e.target.value)} />
              </label>
            </div>

            <div className="form-row">
              <label>
                الموديل
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
              <label>
                السنة
                <input
                  type="text"
                  inputMode="numeric"
                  className="ltr"
                  value={year}
                  onChange={(e) => setYear(sanitizeYearInput(e.target.value))}
                  maxLength={4}
                  pattern="^[0-9]{4}$" // 👈 بدّل \d إلى [0-9]
                  title={`أدخل سنة من ${MIN_YEAR} إلى ${MAX_YEAR}`}
                  onInput={(e) => e.currentTarget.setCustomValidity("")}
                  onInvalid={(e) =>
                    e.currentTarget.setCustomValidity(
                      `أدخل سنة من ${MIN_YEAR} إلى ${MAX_YEAR}`
                    )
                  }
                  onBlur={(e) => {
                    // تحقق النطاق الديناميكي بالـ JS
                    const v = e.currentTarget.value;
                    if (v && !isValidYearStr(v)) {
                      e.currentTarget.setCustomValidity(
                        `أدخل سنة من ${MIN_YEAR} إلى ${MAX_YEAR}`
                      );
                    } else {
                      e.currentTarget.setCustomValidity("");
                    }
                  }}
                />
                <small className="muted">
                  المسموح: {MIN_YEAR} إلى {MAX_YEAR}
                </small>
              </label>
            </div>

            <label>
              اللون
              <input value={color} onChange={(e) => setColor(e.target.value)} />
            </label>

            <div className="row" style={{ gap: 10 }}>
              <button
                className="btn btn-lg btn-primary"
                type="submit"
                disabled={loading}
              >
                {loading ? "جاري..." : "حفظ التذكرة"}
              </button>
              <button
                type="button"
                className="btn btn-lg btn-secondary push-left"
                onClick={() => {
                  setCustomerName("");
                  setCustomerPhone("");
                  setService("");
                  setWorkNotes("");
                  setPrice("");
                  setDiscount("");
                  setPaymentMethod("");
                  setCarInfo("");
                  setPlateNumber("");
                  setPlateLetters("");
                  setCountry("SA");
                  setMake("");
                  setModel("");
                  setYear("");
                  setColor("");
                }}
              >
                تفريغ الحقول
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== تبويب: تذاكري ===== */}
      {viewMode === "myTickets" && (
        <div className="card pro">
          <h3 className="m0 mb16">تذاكري</h3>

          {/* فلاتر */}
          <div className="toolbar mb16">
            <div className="toolbar-row">
              <label>
                بحث
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="عنوان/عميل/جوال"
                />
              </label>
              <label>
                حالة
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">الكل</option>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_AR[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                من
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="ltr"
                />
              </label>
              <label>
                إلى
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="ltr"
                />
              </label>
              <div className="row">
                <button className="btn ghost" onClick={load} disabled={loading}>
                  تحديث
                </button>
              </div>
            </div>
          </div>

          {/* الجدول */}
          <div className="table-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="col-id">ID</th>
                    <th className="col-customer">العميل</th>
                    <th className="col-service">الخدمة</th>
                    <th className="col-status">الحالة</th>
                    <th className="col-total">الإجمالي</th>
                    <th className="col-date">تاريخ</th>
                    <th className="col-actions">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7}>جاري التحميل…</td>
                    </tr>
                  ) : filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7}>لا توجد بيانات مطابقة.</td>
                    </tr>
                  ) : (
                    filteredTickets.map((t) => {
                      const total = calcTotalIncl(t);
                      return (
                        <tr key={t.id}>
                          <td className="col-id ltr nowrap">
                            {t.id?.toString().slice(0, 8)}
                          </td>
                          <td className="col-customer">
                            {t.customer_name || "—"}
                          </td>
                          <td className="col-service">
                            {t.Service || t.title || "—"}
                          </td>
                          <td className="col-status">
                            <span className="badge">
                              {STATUS_AR[t.status] || t.status}
                            </span>
                          </td>
                          <td className="col-total num">{currency(total)}</td>
                          <td className="col-date date">
                            {new Date(t.created_at).toLocaleString()}
                          </td>
                          <td className="col-actions">
                            <div
                              className="row"
                              style={{ justifyContent: "center" }}
                            >
                              <button
                                className="btn ghost"
                                onClick={() => setSelected(t)} // احذفي setEdit({ ...t })
                              >
                                تفاصيل
                              </button>
                              <button
                                className="btn"
                                onClick={() =>
                                  printTicketSmart
                                    ? printTicketSmart(t)
                                    : printDoc(t, "ticket")
                                }
                              >
                                طباعة
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* نافذة التفاصيل */}
      {selected && (
        <div
          className="overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.25)",
            zIndex: 30,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="card pro"
            style={{
              position: "absolute",
              top: 24,
              bottom: 24,
              left: 24,
              right: 24,
              maxWidth: 900,
              margin: "auto",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="card-header"
              style={{ justifyContent: "space-between" }}
            >
              <h3 className="m0">تفاصيل التذكرة</h3>
              <button className="btn ghost" onClick={() => setSelected(null)}>
                إغلاق
              </button>
            </div>

            <div className="grid" style={{ gap: 12 }}>
              {edit && (
                <>
                  <div
                    className="toolbar sticky"
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "white",
                      zIndex: 1,
                      paddingBottom: 8,
                      borderBottom: "1px solid #eee",
                      marginBottom: 8,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <button
                      className="btn"
                      disabled={savingEdit}
                      onClick={saveEdit}
                    >
                      {savingEdit ? "جاري..." : "حفظ التعديلات"}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() =>
                        setEdit(
                          toEditableTicket(selected, editDiscountIsPercent)
                        )
                      }
                    >
                      إعادة تعيين
                    </button>

                    <div style={{ flex: 1 }} />
                    <button
                      className="btn ghost"
                      onClick={() => setSelected(null)}
                    >
                      إغلاق
                    </button>
                  </div>

                  {/* الحالة — التعديل هنا فقط */}
                  <label>
                    الحالة
                    <select
                      value={edit.status || "NEW"}
                      onChange={(e) =>
                        setEdit({ ...edit, status: e.target.value })
                      }
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_AR[s]}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* العميل */}
                  <div className="form-row">
                    <label>
                      اسم العميل
                      <input
                        value={edit.customer_name || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, customer_name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      الجوال
                      <input
                        className="ltr"
                        value={edit.customer_phone || ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            customer_phone: normalizePhone(e.target.value),
                          })
                        }
                        placeholder="05xxxxxxxx"
                        pattern="^05\\d{8}$"
                        title="الرقم يجب أن يبدأ بـ 05 ويكون 10 أرقام"
                      />
                    </label>
                  </div>

                  {/* الخدمة + ملاحظة */}
                  <div className="form-row">
                    <label>
                      الخدمة
                      <input
                        value={edit.Service || edit.title || ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            Service: e.target.value,
                            title: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      ملاحظة
                      <input
                        value={edit.work_notes || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, work_notes: e.target.value })
                        }
                      />
                    </label>
                  </div>

                  {/* السعر + الخصم */}
                  {/* السعر + الخصم (تحرير الإجمالي الشامل + خصم عليه مباشرة) */}
                  {/* السعر + الخصم (تحرير الإجمالي الشامل + خصم عليه مباشرة) */}
                  <div className="form-row">
                    {/* الإجمالي (شامل الضريبة) */}
                    <label>
                      الإجمالي (شامل الضريبة)
                      <input
                        type="number"
                        className="ltr"
                        value={edit?.total_incl ?? 0}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            total_incl: toNum(e.target.value),
                          })
                        }
                      />
                    </label>

                    {/* الخصم */}
                    <label>
                      الخصم
                      <input
                        type="number"
                        className="ltr"
                        value={edit?.discount ?? 0}
                        onChange={(e) => {
                          const total = toNum(edit?.total_incl ?? 0);
                          let v = toNum(e.target.value);
                          if (editDiscountIsPercent) {
                            v = Math.min(v, 100); // 0..100 كنسبة
                          } else {
                            v = Math.min(v, total); // لا يتجاوز الإجمالي كقيمة
                          }
                          setEdit({ ...edit, discount: v });
                        }}
                      />
                    </label>

                    {/* وضع الخصم نسبة/قيمة */}
                    <label
                      className="row"
                      style={{ alignItems: "center", gap: 8 }}
                    >
                      <input
                        type="checkbox"
                        checked={editDiscountIsPercent}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const total = toNum(edit?.total_incl || 0);
                          const d = toNum(edit?.discount || 0);

                          if (checked) {
                            // تحويل من "قيمة" إلى "نسبة"
                            const pct =
                              total > 0 ? Math.min(100, (d / total) * 100) : 0;
                            setEdit({ ...edit, discount: r2(pct) });
                          } else {
                            // تحويل من "نسبة" إلى "قيمة"
                            const amount = Math.min(
                              total,
                              (Math.min(d, 100) / 100) * total
                            );
                            setEdit({ ...edit, discount: r2(amount) });
                          }
                          setEditDiscountIsPercent(checked);
                        }}
                      />
                      <span>الخصم كنسبة %</span>
                    </label>
                  </div>

                  {/* معاينة الإجمالي بعد الخصم */}
                  <div
                    className="row"
                    style={{ justifyContent: "flex-end", gap: 8 }}
                  >
                    <span className="muted">الإجمالي بعد الخصم:</span>
                    <b className="num">
                      {(() => {
                        const { newTotalIncl } = discountOnTotal(
                          edit?.total_incl,
                          edit?.discount,
                          editDiscountIsPercent
                        );
                        return currency(newTotalIncl);
                      })()}
                    </b>
                  </div>

                  {/* الدفع + اللوحة */}
                  <div className="form-row">
                    <label>
                      طريقة الدفع
                      <select
                        value={edit.payment_method || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, payment_method: e.target.value })
                        }
                      >
                        <option value="">— اختر —</option>
                        <option value="cash">نقدًا</option>
                        <option value="شبكة">شبكة</option>
                      </select>
                    </label>
                    <label>
                      أرقام اللوحة
                      <input
                        className="ltr"
                        value={edit.plate_number || ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            plate_number: normalizePlateNum(e.target.value),
                          })
                        }
                        maxLength={4}
                        pattern="^\\d{1,4}$"
                        title="أدخل من 1 إلى 4 أرقام فقط"
                      />
                    </label>
                  </div>

                  {/* أحرف اللوحة + وصف السيارة */}
                  <div className="form-row">
                    <label>
                      أحرف اللوحة
                      <input
                        value={edit.plate_letters_ar || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, plate_letters_ar: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      وصف السيارة
                      <input
                        value={edit.car_info || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, car_info: e.target.value })
                        }
                      />
                    </label>
                  </div>

                  {/* الدولة + الشركة */}
                  <div className="form-row">
                    <label>
                      الدولة
                      <input
                        value={edit.country || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, country: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      الشركة
                      <input
                        value={edit.make || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, make: e.target.value })
                        }
                      />
                    </label>
                  </div>

                  {/* الموديل + السنة */}
                  <div className="form-row">
                    <label>
                      الموديل
                      <input
                        value={edit.model || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, model: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      السنة
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="\\d{4}"
                        maxLength={4}
                        placeholder="YYYY"
                        className="ltr"
                        value={edit.year ?? ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            year: sanitizeYearInput(e.target.value),
                          })
                        }
                        onBlur={(e) => {
                          if (!isValidYearStr(e.target.value))
                            setEdit({ ...edit, year: "" });
                        }}
                        title={`أدخل سنة من ${MIN_YEAR} إلى ${MAX_YEAR}`}
                      />
                    </label>
                  </div>

                  {/* اللون */}
                  <label>
                    اللون
                    <input
                      value={edit.color || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, color: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {msg && <div className="alert mb16">{msg}</div>}
    </div>
  );
}

/* ===================== Action Rail ===================== */
function ActionRail({ viewMode, setViewMode }) {
  const ACTIONS = [
    {
      key: "dashboard",
      icon: "📊",
      title: "لوحة المعلومات",
      desc: "عرض الرسم والمؤشرات اليومية",
    },
    {
      key: "myTickets",
      icon: "📂",
      title: "تذاكري",
      desc: "عرض وإدارة تذاكرك الحالية",
    },
    {
      key: "create",
      icon: "📝",
      title: "إنشاء تذكرة",
      desc: "فتح نموذج إنشاء تذكرة جديدة",
    },
  ];
  return (
    <div
      className="actions-rail"
      style={{
        margin: "0 auto 12px",
        padding: 12,
      }}
    >
      <div class="card pro p16 mb16">
        <div className="action-grid" role="tablist" aria-label="إجراءات الموظف">
          {ACTIONS.map((a) => {
            const active = viewMode === a.key;
            return (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`action-tile ${active ? "active" : ""}`}
                onClick={() => setViewMode(a.key)}
              >
                <span className="action-icon" aria-hidden="true">
                  {a.icon}
                </span>
                <span className="action-texts">
                  <span className="action-title">{a.title}</span>
                  <span className="action-desc">{a.desc}</span>
                </span>
                <span className="action-badge">
                  {active ? "المحدد" : "اختيار"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
