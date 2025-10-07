// src/pages/Manager-page.jsx
import { useEffect, useMemo, useState } from "react";

import {
  listWorkers,
  fetchSummary,
  fetchRevByWorker,
  fetchRecentTickets,
  fetchTaxRate,
  fetchTaxTotalForActive3MPeriod,
  initTaxPeriodStartToday,
  supabase,
  fetchAllWorkers,
} from "../Database.js";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ========= Tooltip + Gradients ========= */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  const isMoney =
    p && (p.dataKey === "revenue" || (p.payload && "revenue" in p.payload));
  const value = isMoney
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "SAR",
      }).format(Number(p.value) || 0)
    : String(p.value);
  return (
    <div className="card tooltip-card">
      <div className="muted" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const GradientDefs = () => (
  <defs>
    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--primary)" stopOpacity="1" />
      <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.25" />
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--secondary)" stopOpacity="0.95" />
      <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0.35" />
    </linearGradient>
  </defs>
);

/* ========= تواريخ افتراضية ========= */
function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ========= ألوان الحالات للدونت ========= */
const STATUS_COLORS = {
  NEW: "#c7d2fe",
  REVIEW: "#a5f3fc",
  IN_PROGRESS: "#fed7aa",
  WAITING_PARTS: "#fde68a",
  READY: "#a7f3d0",
  DELIVERED: "#bae6fd",
  CANCELLED: "#fecaca",
};
const STATUS_LABELS = {
  NEW: "NEW",
  REVIEW: "REVIEW",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_PARTS: "WAITING_PARTS",
  READY: "READY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};
const STATUS_ORDER = [
  "NEW",
  "REVIEW",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "READY",
  "DELIVERED",
  "CANCELLED",
];

function statusToBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "NEW":
      return "badge new";
    case "REVIEW":
      return "badge review";
    case "IN_PROGRESS":
      return "badge inprogress";
    case "WAITING_PARTS":
      return "badge waiting";
    case "READY":
      return "badge ready";
    case "DELIVERED":
      return "badge delivered";
    case "CANCELLED":
      return "badge cancelled";
    default:
      return "badge";
  }
}
// src/Database.js
export async function fetchRevMonthly() {
  // ارجعي بيانات بسيطة للـ chart مؤقتاً
  return [
    { month: "Jan", revenue: 0 },
    { month: "Feb", revenue: 0 },
    { month: "Mar", revenue: 0 },
    { month: "Apr", revenue: 0 },
    { month: "May", revenue: 0 },
    { month: "Jun", revenue: 0 },
  ];
}

export default function ManagerPage() {
  const [from, setFrom] = useState(""); // لا فلتر افتراضي
  const [to, setTo] = useState(""); // لا فلتر افتراضي
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState("");

  const [summary, setSummary] = useState(null);
  const [revMonthly, setRevMonthly] = useState([]);
  const [revByWorker, setRevByWorker] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [taxRate, setTaxRate] = useState(0.15);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [taxKpi, setTaxKpi] = useState({ tax_total: 0, days_left: 0 });

  const normalizedWorkerId = workerId || undefined;

  // يحول YYYY-MM-DD إلى بداية/نهاية اليوم بتوقيت UTC
  const dayStartISO = (dStr) => {
    if (!dStr) return undefined;
    const d = new Date(dStr);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };
  const dayEndISO = (dStr) => {
    if (!dStr) return undefined;
    const d = new Date(dStr);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  /* ===== أول تحميل ===== */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const f = dayStartISO(from);
        const t = dayEndISO(to);

        // ✅ رتّب القيم وتخلّص من listWorkers()
        const [w, s, m, b, tt, taxVal, kpi] = await Promise.all([
          fetchAllWorkers(), // ✅ فقط هذه لجلب العمال
          fetchSummary({ from: f, to: t, workerId: normalizedWorkerId }),
          fetchRevMonthly(),
          fetchRevByWorker({ from: f, to: t }),
          fetchRecentTickets({
            from: f,
            to: t,
            workerId: normalizedWorkerId,
            limit: 100,
          }),
          fetchTaxRate(),
          fetchTaxTotalForActive3MPeriod(),
        ]);
        if (!on) return;

        setWorkers(w || []);
        setSummary(s || null);
        setRevMonthly(m || []);
        setRevByWorker(b || []);
        setRecentTickets(tt || []);
        setTaxRate(taxVal ?? 0.15);
        setTaxKpi(kpi || { tax_total: 0, days_left: 0 });
      } catch (e) {
        if (on) setErr(e.message || "تعذر تحميل البيانات");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===== realtime ===== */
  useEffect(() => {
    let debounce;
    const channel = supabase
      .channel("tickets-realtime-manager")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => reload(), 300);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, workerId]);

  /* ===== تغيّر الفلاتر ===== */
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const f = dayStartISO(from);
        const t = dayEndISO(to);
        const [s, b, tt] = await Promise.all([
          fetchSummary({ from: f, to: t, workerId: normalizedWorkerId }),
          fetchRevByWorker({ from: f, to: t }),
          fetchRecentTickets({
            from: f,
            to: t,
            workerId: normalizedWorkerId,
            limit: 100,
          }),
        ]);
        if (!on) return;
        setSummary(s || null);
        setRevByWorker(b || []);
        setRecentTickets(tt || []);
      } catch (e) {
        if (on) setErr(e.message || "تعذر تحميل البيانات");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [from, to, workerId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ===== حفظ تذكرة (كما هو) ===== */
  const saveTicket = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("tickets").insert([
        {
          title,
          customer_name,
          customer_phone,
          worker_id: userId,
          status: "NEW",
          price,
          discount,
          tax,
        },
      ]);
      if (error) throw error;

      setMsg("✅ تم حفظ التذكرة بنجاح");
      if (window.localStorage.getItem("role") === "manager") {
        window.location.reload();
      }
    } catch (e) {
      setMsg("❌ خطأ: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const currency = (n) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "SAR",
        }).format(n);

  async function handleResetTaxKpi() {
    await resetTaxKpi();
    const k = await fetchTaxKpi();
    setTaxKpi(k || { tax_total: 0, days_left: 0 });
  }

  function quickRange(type) {
    const now = new Date();
    if (type === "month") {
      setFrom(fmtDateInput(monthStart(now)));
      setTo(fmtDateInput(now));
    } else if (type === "30") {
      const d = new Date(now);
      d.setDate(now.getDate() - 30);
      setFrom(fmtDateInput(d));
      setTo(fmtDateInput(now));
    } else if (type === "quarter") {
      const m = now.getMonth();
      const qStart = m - (m % 3);
      setFrom(fmtDateInput(new Date(now.getFullYear(), qStart, 1)));
      setTo(fmtDateInput(now));
    } else if (type === "year") {
      setFrom(fmtDateInput(new Date(now.getFullYear(), 0, 1)));
      setTo(fmtDateInput(now));
    }
  }

  // بيانات الرسوم
  const monthlyData = useMemo(
    () =>
      (revMonthly || []).map((r) => {
        const [yy, mm] = String(r.month || "").split("-");
        return { name: `${mm}/${yy?.slice(-2)}`, revenue: r.revenue ?? 0 };
      }),
    [revMonthly]
  );

  const byWorkerData = useMemo(
    () =>
      (revByWorker || []).map((r) => ({
        name: r.worker_name || `#${r.worker_id}`,
        revenue: r.revenue ?? 0,
      })),
    [revByWorker]
  );

  const statusData = useMemo(() => {
    const counts = {};
    (recentTickets || []).forEach((t) => {
      const s = String(t.status || "").toUpperCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    const rows = STATUS_ORDER.filter((k) => counts[k]).map((k) => ({
      key: k,
      name: STATUS_LABELS[k],
      value: counts[k],
      color: STATUS_COLORS[k],
    }));
    const total = rows.reduce((a, b) => a + b.value, 0);
    return { rows, total };
  }, [recentTickets]);

  async function reload() {
    setLoading(true);
    setErr("");
    try {
      const f = dayStartISO(from);
      const t = dayEndISO(to);

      // ✅ نفس الترتيب، وخُذ العمال في wList
      const [s, m, b, tt, wList, taxVal] = await Promise.all([
        fetchSummary({ from: f, to: t, workerId: normalizedWorkerId }),

        fetchRevByWorker({ from: f, to: t }),
        fetchRecentTickets({
          from: f,
          to: t,
          workerId: normalizedWorkerId,
          limit: 100,
        }),
        fetchAllWorkers(), // ✅ بدون listWorkers
        fetchTaxRate(),
      ]);

      setSummary(s || null);
      setRevMonthly(m || []);
      setRevByWorker(b || []);
      setRecentTickets(tt || []);
      setWorkers(wList || []); // ✅ لا تستخدم متغير غير معرّف
      setTaxRate(taxVal ?? 0.15);

      const k = await fetchTaxTotalForActive3MPeriod();
      setTaxKpi(k || { tax_total: 0, days_left: 0 });
    } catch (e) {
      setErr(e.message || "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }

  // ==== Preset filter (بدل الأزرار) ====
  const [preset, setPreset] = useState("last_30");

  // YYYY-MM-DD
  const fmtYMD = (d) => {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  };

  const rangeFromPreset = (p) => {
    const today = new Date();
    let start, end;

    switch (p) {
      case "this_month":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;
      case "last_30":
        start = new Date(today);
        start.setDate(start.getDate() - 29);
        end = today;
        break;
      case "this_quarter": {
        const q = Math.floor(today.getMonth() / 3); // 0..3
        start = new Date(today.getFullYear(), q * 3, 1);
        end = today;
        break;
      }
      case "this_year":
        start = new Date(today.getFullYear(), 0, 1);
        end = today;
        break;
      default:
        return null;
    }
    return { from: fmtYMD(start), to: fmtYMD(end) };
  };

  const applyPreset = (val) => {
    setPreset(val);
    const r = rangeFromPreset(val);
    if (!r) return;
    setFrom(r.from);
    setTo(r.to);
  };

  return (
    <div className="page dashboard pro">
      <div className="dash-head">
        <div>
          <h2 className="dash-title">لوحة المدير</h2>
          <p className="dash-subtitle">مؤشرات الأداء خلال الفترة المحددة</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={reload} disabled={loading}>
            تحديث
          </button>
        </div>
      </div>

      <div className="layout-grid">
        {/* Toolbar */}
        <div className="lg-toolbar toolbar glass">
          <div className="toolbar-row">
            <label>
              من
              <input
                className="ltr date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              إلى
              <input
                className="ltr date"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              الموظف
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
              >
                <option value="">الكل</option>
                {(workers || []).map((w) => {
                  const base =
                    (typeof w.name === "string" && w.name.trim()) ||
                    (w.badgeNumber != null ? `Badge #${w.badgeNumber}` : "") ||
                    (w.phone ? String(w.phone) : "") ||
                    `#${w.id}`;
                  const label = w.active === false ? `${base} (موقّف)` : base;
                  return (
                    <option key={w.id} value={String(w.id)}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              الفترة
              <select
                className="ltr"
                value={preset}
                onChange={(e) => applyPreset(e.target.value)}
              >
                <option value="this_month">هذا الشهر</option>
                <option value="last_30">آخر 30 يوم</option>
                <option value="this_quarter">هذا الربع</option>
                <option value="this_year">هذه السنة</option>
              </select>
            </label>
          </div>
        </div>

        {/* KPIs */}
        <div className="lg-kpis kpi-wrap">
          {/* KPI الإيراد */}
          <div className="kpi glass">
            <div className="kpi-icon">﷼</div>
            <div className="kpi-meta">
              <span className="kpi-label">الإيراد</span>
              <span className="kpi-value num">
                {currency(summary?.revenue)}
              </span>
            </div>
          </div>

          {/* KPI الضريبة */}
          <div className="kpi glass">
            <div className="kpi-icon">🧮</div>
            <div className="kpi-meta">
              <span className="kpi-label">الضريبة </span>
              <span className="kpi-value num">
                {currency(taxKpi.tax_total || 0)}
              </span>
              <div className="muted">يتبقى {taxKpi.days_left ?? 0} يوم</div>
            </div>
            <div className="row">
              <button
                className="btn-gray-sm"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await initTaxPeriodStartToday();
                    if (res?.error) throw res.error;

                    const k = await fetchTaxTotalForActive3MPeriod();
                    if (k?.error) throw k.error;

                    setTaxKpi(k || { tax_total: 0, days_left: 0 });
                  } catch (e) {
                    console.error(e);
                    const msg =
                      e?.message ??
                      (typeof e === "string" ? e : JSON.stringify(e));
                    alert(msg);
                    setErr(msg);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                اليوم
              </button>
            </div>
          </div>

          {/* KPI عدد التذاكر */}
          <div className="kpi glass">
            <div className="kpi-icon">🧾</div>
            <div className="kpi-meta">
              <span className="kpi-label">عدد التذاكر</span>
              <span className="kpi-value num">{summary?.tickets ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* Line chart */}
        <div className="lg-line card chart-card glass">
          <div className="card-header">
            <h3>الإيراد الشهري (آخر 12 شهر)</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip content={<ChartTooltip />} />
                <GradientDefs />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar chart */}
        <div className="lg-bar card chart-card glass">
          <div className="card-header">
            <h3>إيراد حسب الموظف</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer>
              <BarChart data={byWorkerData} barCategoryGap={18}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <GradientDefs />
                <Bar
                  dataKey="revenue"
                  radius={[10, 10, 0, 0]}
                  fill="url(#barGrad)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut */}
        <div className="lg-donut card chart-card glass">
          <div className="card-header">
            <h3>توزيع الحالات</h3>
          </div>
          <div className="card-body donut-wrap" style={{ height: 340 }}>
            <div className="donut-chart-fixed">
              <PieChart width={260} height={260}>
                <Tooltip content={<ChartTooltip />} />
                <Pie
                  data={statusData.rows}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={110}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {statusData.rows.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="donut-center">
                <div className="donut-total num">{statusData.total}</div>
                <div className="donut-label">إجمالي</div>
              </div>
            </div>
            <div className="donut-legend">
              {statusData.rows.map((s) => (
                <div className="legend-item" key={s.key}>
                  <span className="dot" style={{ background: s.color }} />
                  <span className="name">{s.name}</span>
                  <span className="val num">{s.value}</span>
                </div>
              ))}
              {statusData.total === 0 && (
                <div className="muted">لا توجد بيانات.</div>
              )}
            </div>
          </div>
        </div>
        {/* ===== أحدث التذاكر ===== */}
      </div>
    </div>
  );
}
